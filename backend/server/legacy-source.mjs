import path from "node:path";
import { readFile, readdir, realpath } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { config } from "./config.mjs";

export const legacyRoot = path.resolve(
  process.env.LEGACY_DB_ROOT || "../cloud-library-db",
);
export let legacyStatus = { status: "notChecked" };
export function legacyTextBook(id, text) {
  const parts = [];
  let buffer = "";
  for (const paragraph of text.replace(/\r/g, "").split("\n\n")) {
    if (buffer.length + paragraph.length > 30000 && buffer) {
      parts.push(buffer);
      buffer = "";
    }
    buffer += paragraph + "\n\n";
  }
  if (buffer.trim()) parts.push(buffer);
  return {
    id: "legacy-" + id,
    title: text.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || id,
    author: text.match(/^Author:\s*(.+)$/m)?.[1]?.trim() || "Chưa rõ tác giả",
    category: "Tài liệu từ cloud-library-db",
    description:
      "Tài liệu đọc từ thư mục cloud-library-db. Nguồn và điều kiện sử dụng được giữ trong nội dung gốc.",
    chapters: parts.map((content, i) => ({
      id: id + "-" + i,
      title: "Phần " + (i + 1),
      content,
    })),
    visibility: "published",
    availableCopies: 0,
    totalCopies: 0,
    publishedRevisionId:
      "legacy-" + createHash("sha256").update(text).digest("hex").slice(0, 24),
    publishedAt: new Date().toISOString(),
    legacySourceId: id,
  };
}
export async function syncLegacySource(repo) {
  if (config.mode !== "local") return;
  const report = {
    status: "checking",
    folder: legacyRoot,
    endpoint: process.env.LEGACY_DYNAMODB_ENDPOINT || "http://127.0.0.1:8001",
    files: 0,
    sourceBooks: 0,
    imported: 0,
    privatePdfs: [],
    database: "unavailable",
  };
  try {
    await realpath(legacyRoot);
  } catch {
    legacyStatus = { ...report, status: "folderMissing" };
    return legacyStatus;
  }
  const books = [];
  const dir = path.join(legacyRoot, "storage", "ebooks");
  for (const name of await readdir(dir).catch(() => [])) {
    if (!/^BOOK_PG_\d+\.txt$/.test(name)) continue;
    const text = await readFile(path.join(dir, name), "utf8");
    books.push(legacyTextBook(name.slice(0, -4), text));
    report.files++;
  }
  const client = new DynamoDBClient({
    region: "ap-southeast-1",
    endpoint: report.endpoint,
    credentials: { accessKeyId: "localdev", secretAccessKey: "localdev" },
    maxAttempts: 1,
  });
  try {
    let cursor;
    const rows = [];
    do {
      const result = await DynamoDBDocumentClient.from(client).send(
        new ScanCommand({
          TableName: "Books",
          ConsistentRead: true,
          ExclusiveStartKey: cursor,
        }),
        { abortSignal: AbortSignal.timeout(4000) },
      );
      rows.push(...(result.Items || []));
      cursor = result.LastEvaluatedKey;
      if (rows.length > 5000) throw new Error("sourceLimit");
    } while (cursor);
    report.database = "connected";
    report.sourceBooks = rows.length;
    for (const row of rows) {
      if (row.status !== "ACTIVE" || !row.bookId) continue;
      if (
        (row.authorAccountId || row.review || row.submission) &&
        row.review?.status !== "APPROVED"
      )
        continue;
      const existing = books.find((b) => b.legacySourceId === row.bookId);
      if (existing)
        Object.assign(existing, {
          title: row.title || existing.title,
          author: row.author || existing.author,
          description: row.description || existing.description,
        });
      else if (row.source !== "AUTHOR_UPLOAD")
        books.push({
          id: "legacy-" + row.bookId,
          legacySourceId: row.bookId,
          title: row.title,
          author: row.author || "Chưa rõ tác giả",
          category: "Tài liệu từ cloud-library-db",
          description: row.description || "",
          cover: row.coverUrl || "",
          visibility: "published",
          chapters: [],
          availableCopies: 0,
          totalCopies: 0,
          legacyPhysicalInventoryPending: true,
        });
    }
  } catch (error) {
    report.databaseError = error.code || error.name;
  } finally {
    client.destroy();
  }
  const before = await repo.read();
  const admin = before.accounts.find(
    (a) => a.role === "admin" && a.status === "active",
  );
  const pdfRoot = path.join(legacyRoot, "storage", "private-pdfs");
  if (admin)
    for (const folder of await readdir(pdfRoot, { withFileTypes: true }).catch(
      () => [],
    )) {
      if (!folder.isDirectory() || !/^[A-Za-z0-9_-]+$/.test(folder.name))
        continue;
      for (const name of await readdir(path.join(pdfRoot, folder.name))) {
        if (!/^[a-f0-9]{64}\.pdf$/.test(name)) continue;
        const source = await realpath(path.join(pdfRoot, folder.name, name));
        if (!source.startsWith((await realpath(pdfRoot)) + path.sep)) continue;
        const bytes = await readFile(source);
        if (
          bytes.length > 20 * 1024 * 1024 ||
          bytes.subarray(0, 5).toString() !== "%PDF-"
        )
          continue;
        const hash = createHash("sha256").update(bytes).digest("hex");
        if (name !== hash + ".pdf") continue;
        const id = "legacy-pdf-" + hash.slice(0, 32),
          key = "legacy-pdfs/" + hash + ".pdf";
        if (!(await repo.getSecret("UPLOAD", id))) {
          await repo.storage.put(key, bytes, "application/pdf");
          await repo.putSecret("UPLOAD", id, {
            ownerId: admin.id,
            key,
            contentType: "application/pdf",
            purpose: "evidence",
            size: bytes.length,
            complete: true,
            createdAt: new Date().toISOString(),
            legacySource: true,
          });
        }
        report.privatePdfs.push({
          source: folder.name,
          id,
          url: "/api/v1/files/" + id,
        });
      }
    }
  const changed = books.filter((book) => {
    const previous = before.books.find((b) => b.id === book.id);
    return (
      !previous ||
      previous.publishedRevisionId !== book.publishedRevisionId ||
      previous.title !== book.title ||
      previous.description !== book.description
    );
  });
  for (const book of changed) {
    await repo.mutate(
      "legacy-connector",
      randomUUID(),
      { action: "legacy.catalog.sync", id: book.id },
      (state) => {
        const old = state.books.find((b) => b.id === book.id);
        if (!state.categories.some((c) => c.name === book.category))
          state.categories.push({
            id: "legacy-category",
            name: book.category,
            aliases: [],
          });
        state.books = [
          ...state.books.filter((b) => b.id !== book.id),
          {
            ...book,
            publishedAt:
              old?.publishedAt || book.publishedAt || new Date().toISOString(),
            viewCount: old?.viewCount || 0,
            archived: old?.archived || false,
          },
        ];
        return { state };
      },
    );
  }
  legacyStatus = {
    ...report,
    status:
      report.database === "connected"
        ? "connected"
        : "filesConnectedDatabaseUnavailable",
    imported: changed.length,
    lastCheckedAt: new Date().toISOString(),
  };
  return legacyStatus;
}
