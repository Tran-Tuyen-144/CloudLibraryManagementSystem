import { createHash } from "node:crypto";
import {
  BedrockAgentClient,
  StartIngestionJobCommand,
  GetIngestionJobCommand,
} from "@aws-sdk/client-bedrock-agent";
import { config } from "./config.mjs";
import { isPublicBook } from "./library.mjs";

const hash = (text) => createHash("sha256").update(text).digest("hex");

export function knowledgeDocuments(state) {
  const sources = state.knowledgeSources
    .filter((s) => s.approved)
    .map((s) => ({
      id: `source-${s.id}`,
      text: `${s.title}\n\n${s.content}`,
      metadata: { sourceId: s.id, title: s.title, version: s.version },
    }));
  sources.push({
    id: "loan-policy",
    text: JSON.stringify(state.settings),
    metadata: {
      sourceId: "loan-policy",
      title: "Quy định mượn trả hiện hành",
      version: state.settings.version || 1,
    },
  });
  for (const book of state.books.filter(isPublicBook)) {
    sources.push({
      id: `book-${book.id}`,
      text: [book.title, book.author, book.category, book.description]
        .filter(Boolean)
        .join("\n"),
      metadata: {
        bookId: book.id,
        title: book.title,
        revision: String(book.publishedRevisionId || book.version || 1),
      },
    });
  }
  // Only public metadata and approved sources are indexed. Full chapters, accounts,
  // draft manuscripts and live loan/inventory data never enter the vector store.
  return sources.sort((a, b) => a.id.localeCompare(b.id));
}

export async function syncKnowledgeLibrary(
  repo,
  options = config,
  services = {},
) {
  if (
    options.mode !== "aws" ||
    !options.knowledgeBaseId ||
    !options.dataSourceId
  )
    return { status: "disabled" };
  const documents = knowledgeDocuments(await repo.read());
  const manifest = Object.fromEntries(
    documents.map((d) => [d.id, hash(JSON.stringify(d))]),
  );
  const previous = await repo.getSecret(
    `KNOWLEDGE#${repo.namespace}`,
    "MANIFEST",
  );
  const client = new BedrockAgentClient({ region: options.region });
  const unchanged =
    JSON.stringify(previous?.documents) === JSON.stringify(manifest);
  if (unchanged && previous.jobId) {
    const job = await (services.get
      ? services.get(previous.jobId)
      : client.send(
          new GetIngestionJobCommand({
            knowledgeBaseId: options.knowledgeBaseId,
            dataSourceId: options.dataSourceId,
            ingestionJobId: previous.jobId,
          }),
        ));
    if (job.ingestionJob?.status !== "FAILED")
      return {
        status: job.ingestionJob?.status || "pending",
        jobId: previous.jobId,
      };
  }
  for (const doc of documents) {
    if (previous?.documents?.[doc.id] === manifest[doc.id]) continue;
    const key = `knowledge/${hash(doc.id)}.txt`;
    await repo.storage.put(key, doc.text, "text/plain; charset=utf-8");
    await repo.storage.put(
      key + ".metadata.json",
      JSON.stringify({ metadataAttributes: doc.metadata }),
    );
  }
  for (const id of Object.keys(previous?.documents || {})) {
    if (manifest[id]) continue;
    const key = `knowledge/${hash(id)}.txt`;
    await repo.storage.remove(key);
    await repo.storage.remove(key + ".metadata.json");
  }
  // Commit the manifest only after Bedrock accepts the ingestion job. A busy or
  // unavailable service leaves it pending, so the next scheduled run retries.
  const attempt = (previous?.attempt || 0) + 1;
  const input = {
    knowledgeBaseId: options.knowledgeBaseId,
    dataSourceId: options.dataSourceId,
    clientToken: hash(JSON.stringify(manifest) + attempt),
  };
  const result = await (services.start
    ? services.start(input)
    : client.send(new StartIngestionJobCommand(input)));
  await repo.putSecret(`KNOWLEDGE#${repo.namespace}`, "MANIFEST", {
    documents: manifest,
    attempt,
    jobId: result.ingestionJob?.ingestionJobId,
    submittedAt: new Date().toISOString(),
  });
  return {
    status: "submitted",
    documents: documents.length,
    jobId: result.ingestionJob?.ingestionJobId,
  };
}
