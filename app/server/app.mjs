import express from "express";
import { standardCatalog } from "./standard-ebooks.mjs";
import { legacyStatus, syncLegacySource } from "./legacy-source.mjs";
import {
  validateDraftUpload,
  validateApplicationEvidence,
} from "./uploads.mjs";
import { installRestRoutes } from "./rest.mjs";
import multer from "multer";
import { randomUUID, createHash } from "node:crypto";
import { QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import { config, publicCapabilities } from "./config.mjs";
import { createAuth, passwordHash, syncCognitoRole } from "./auth.mjs";
import { ServiceError, ensure, businessDay, nowIso } from "./errors.mjs";
import {
  executeLibraryCommand,
  projectState,
  requireActor,
  catalog,
  isPublicBook,
  publicCatalogBook,
} from "./library.mjs";
import { answerQuestion } from "./ai.mjs";
import { runReminders } from "./workers.mjs";
import { startAudio, synthesize } from "./audio.mjs";

const mimeTypes = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/webm",
  "audio/wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
]);
function validateFile(buffer, type) {
  const head = buffer.subarray(0, 32);
  const valid =
    type === "application/pdf"
      ? head.toString("ascii").startsWith("%PDF-")
      : type === "image/png"
        ? head
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : type === "image/jpeg"
          ? head[0] === 255 && head[1] === 216 && head[2] === 255
          : type === "image/webp"
            ? head.toString("ascii", 0, 4) === "RIFF" &&
              head.toString("ascii", 8, 12) === "WEBP"
            : type === "audio/webm"
              ? head.subarray(0, 4).equals(Buffer.from([26, 69, 223, 163]))
              : type === "audio/wav"
                ? head.toString("ascii", 0, 4) === "RIFF" &&
                  head.toString("ascii", 8, 12) === "WAVE"
                : type === "audio/ogg"
                  ? head.toString("ascii", 0, 4) === "OggS"
                  : type === "audio/mp4"
                    ? head.toString("ascii", 4, 8) === "ftyp"
                    : type === "audio/mpeg"
                      ? head.toString("ascii", 0, 3) === "ID3" ||
                        (head[0] === 255 && (head[1] & 224) === 224)
                      : false;
  ensure(valid, "invalidFile", "Nội dung tệp không khớp định dạng đã chọn.");
}
const idempotency = (req) => req.get("Idempotency-Key") || randomUUID();
const bearer = (req) => req.get("authorization")?.slice(7);
const refreshCookie = (req) =>
  String(req.headers.cookie || "")
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith("cl_refresh="))
    ?.slice(11);
export function createApp(repo, options = config) {
  const app = express();
  const auth = createAuth(repo, options);
  app.disable("x-powered-by");
  app.set("trust proxy", false);
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set({
      "X-Request-Id": req.requestId,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Cache-Control": "no-store",
    });
    if (req.get("origin") && req.get("origin") !== options.origin)
      return res.status(403).json({
        error: {
          code: "originDenied",
          message: "Nguồn truy cập không được cho phép.",
        },
      });
    if (req.get("origin"))
      res.set({
        "Access-Control-Allow-Origin": options.origin,
        Vary: "Origin",
        "Access-Control-Allow-Credentials": "true",
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, Idempotency-Key",
        "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      });
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  const wrap = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res)).catch(next);
  async function actorFor(req, optional = false) {
    if (
      !req.headers.authorization &&
      req.method === "GET" &&
      (/^\/api\/v1\/files\//.test(req.path) ||
        /^\/api\/v1\/books\/[^/]+\/content$/.test(req.path))
    ) {
      const cookie = String(req.headers.cookie || "")
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith("cl_access="));
      if (cookie) req.headers.authorization = "Bearer " + cookie.slice(10);
    }
    return auth.authenticate(req, optional);
  }
  async function rateLimit(key, limit = 30) {
    const minute = Math.floor(Date.now() / 60000);
    try {
      await repo.db.send(
        new UpdateCommand({
          TableName: repo.table,
          Key: { PK: "RATE#" + repo.namespace, SK: `${key}#${minute}` },
          UpdateExpression: "SET expiresAt = :ttl ADD #n :one",
          ConditionExpression: "attribute_not_exists(#n) OR #n < :limit",
          ExpressionAttributeNames: { "#n": "count" },
          ExpressionAttributeValues: {
            ":ttl": Math.floor(Date.now() / 1000) + 120,
            ":one": 1,
            ":limit": limit,
          },
        }),
      );
    } catch (error) {
      if (error.name === "ConditionalCheckFailedException")
        throw new ServiceError(
          "rateLimited",
          "Bạn thao tác quá nhanh. Hãy thử lại sau một phút.",
          429,
        );
      throw error;
    }
  }
  const identityKey = (req) =>
    createHash("sha256")
      .update(req.ip || "local")
      .digest("hex")
      .slice(0, 20);
  const authResponse = (res, result) => {
    if (result.accessToken)
      res.cookie("cl_access", result.accessToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: options.mode === "aws",
        maxAge: (result.expiresIn || 3600) * 1000,
        path: "/",
      });
    if (result.refreshToken)
      res.cookie("cl_refresh", result.refreshToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: options.mode === "aws",
        maxAge: 2592000000,
        path: "/api/v1/auth",
      });
    const { refreshToken: _refreshToken, ...safe } = result;
    res.json(safe);
  };
  app.get(
    "/api/v1/health",
    wrap(async (req, res) => {
      const state = await repo.read();
      res.json({
        ok: true,
        database: "DynamoDB",
        version: state.version,
        capabilities: publicCapabilities(options),
      });
    }),
  );
  app.get(
    "/api/v1/sources/standard-ebooks",
    wrap(async (req, res) => res.json(standardCatalog(await repo.read(), req.query))),
  );
  for (const action of [
    "login",
    "register",
    "confirm",
    "forgot",
    "reset",
    "exchange",
  ])
    app.post(
      `/api/v1/auth/${action}`,
      wrap(async (req, res) => {
        await rateLimit(`auth:${req.path}:${identityKey(req)}`, 15);
        authResponse(res, await auth[action](req.body));
      }),
    );
  app.post(
    "/api/v1/auth/logout",
    wrap(async (req, res) => {
      res.clearCookie("cl_access", { path: "/" });
      res.clearCookie("cl_refresh", { path: "/api/v1/auth" });
      res.json(await auth.logout(bearer(req), refreshCookie(req)));
    }),
  );
  app.post(
    "/api/v1/auth/refresh",
    wrap(async (req, res) => {
      const token = String(req.headers.cookie || "")
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith("cl_refresh="))
        ?.slice(11);
      authResponse(res, await auth.refresh(token));
    }),
  );
  app.post(
    "/api/v1/auth/password",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      res.json(await auth.changePassword(actor, req.body, bearer(req)));
    }),
  );
  app.get(
    "/api/v1/snapshot",
    wrap(async (req, res) => {
      const actor = await actorFor(req, true);
      const state = await repo.read();
      res.json({
        data: projectState(state, actor),
        capabilities: publicCapabilities(options),
      });
    }),
  );
  app.get(
    "/api/v1/me",
    wrap(async (req, res) => res.json({ data: await actorFor(req) })),
  );
  app.get(
    "/api/v1/books",
    wrap(async (req, res) => res.json(catalog(await repo.read(), req.query))),
  );
  app.get(
    "/api/v1/categories",
    wrap(async (req, res) =>
      res.json({ items: (await repo.read()).categories }),
    ),
  );
  app.get(
    "/api/v1/books/:id",
    wrap(async (req, res) => {
      const state = await repo.read();
      const book = state.books.find(
        (b) => b.id === req.params.id && isPublicBook(b),
      );
      ensure(book, "notFound", "Không tìm thấy tác phẩm.", 404);
      res.json({
        data: publicCatalogBook(state, book),
      });
    }),
  );
  app.post(
    "/api/v1/commands",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      await rateLimit(actor.id, 100);
      const { command, input = {} } = req.body;
      ensure(
        typeof command === "string" &&
          input &&
          typeof input === "object" &&
          !Array.isArray(input),
        "invalidCommand",
        "Dữ liệu thao tác không hợp lệ.",
      );
      if (
        command === "account.save" &&
        input.create &&
        options.mode === "local"
      )
        ensure(
          input.password,
          "invalidPassword",
          "Tạo tài khoản cần mật khẩu ít nhất 10 ký tự.",
        );
      if (command === "account.save" && input.password)
        passwordHash(input.password);
      if (command === "application.submit")
        await validateApplicationEvidence(repo, actor, input);
      if (command === "draft.save" && input.pdfUploadId) {
        const upload = await repo.getSecret("UPLOAD", input.pdfUploadId);
        ensure(
          upload?.ownerId === actor.id &&
            upload.complete &&
            upload.contentType === "application/pdf",
          "invalidFile",
          "Tệp PDF chưa được xác nhận.",
        );
        input.pdfKey = upload.key;
        input.pdfUrl = `${options.origin}/api/v1/files/${input.pdfUploadId}`;
      }
      if (command === "draft.save" && input.pdfKey)
        ensure(
          input.pdfUploadId,
          "invalidFile",
          "Tệp PDF cần có mã tải lên hợp lệ.",
        );
      if (command === "draft.save" && input.pdfUrl) {
        const url = new URL(input.pdfUrl);
        const match = url.pathname.match(/^\/api\/v1\/files\/([A-Za-z0-9-]+)$/);
        if (match) {
          const upload = await repo.getSecret("UPLOAD", match[1]);
          ensure(
            upload?.ownerId === actor.id &&
              upload.complete &&
              upload.contentType === "application/pdf",
            "invalidFile",
            "Bạn không sở hữu tệp PDF này.",
          );
          input.pdfKey = upload.key;
          input.pdfUploadId = match[1];
        }
      }
      if (command === "draft.save")
        await validateDraftUpload(repo, actor, input);
      const requestKey = idempotency(req);
      const result = await repo.mutate(
        actor.id,
        requestKey,
        { command, input },
        (state) => executeLibraryCommand(state, actor.id, command, input),
      );
      if (command === "account.save") {
        if (options.mode === "local" && input.password) {
          const pk = `AUTH#${result.result.account.email}`;
          if (
            (await repo.getSecret(pk, "CREDENTIAL"))?.sourceRequest !==
            requestKey
          )
            await repo.putSecret(pk, "CREDENTIAL", {
              ...passwordHash(input.password),
              sourceRequest: requestKey,
            });
        }
        if (!result.replayed) {
          if (options.mode === "aws" && input.create) {
            const client = new CognitoIdentityProviderClient({
              region: options.region,
            });
            const created = await client.send(
              new AdminCreateUserCommand({
                UserPoolId: options.poolId,
                Username: input.email,
                UserAttributes: [
                  { Name: "email", Value: input.email },
                  { Name: "email_verified", Value: "true" },
                  { Name: "name", Value: input.fullName },
                ],
                MessageAction: "SUPPRESS",
              }),
            );
            if (input.password)
              await client.send(
                new AdminSetUserPasswordCommand({
                  UserPoolId: options.poolId,
                  Username: created.User.Username,
                  Password: input.password,
                  Permanent: true,
                }),
              );
            const sub = created.User.Attributes.find(
              (a) => a.Name === "sub",
            )?.Value;
            if (sub)
              await repo.mutate(
                actor.id,
                randomUUID(),
                { command: "account.link", sub },
                (state) => {
                  state.accounts.find(
                    (a) => a.email === input.email,
                  ).cognitoSub = sub;
                  return { state };
                },
              );
          }
        }
      }
      const fresh = await repo.read();
      let warning;
      if (["account.save", "application.review"].includes(command)) {
        const email =
          command === "account.save"
            ? String(input.email).trim().toLowerCase()
            : fresh.authorApplications.find((a) => a.id === input.id)
                ?.readerEmail;
        try {
          await syncCognitoRole(
            fresh.accounts.find((a) => a.email === email),
            options,
          );
        } catch {
          warning =
            "Đã lưu quyền trong thư viện. Nhóm Cognito sẽ được đồng bộ lại khi đăng nhập.";
        }
      }
      const updated = fresh.accounts.find((a) => a.id === actor.id);
      res.json({
        ...result.result,
        ok: true,
        data: projectState(
          fresh,
          updated?.status === "active" ? updated : null,
        ),
        replayed: Boolean(result.replayed),
        ...(warning ? { warning } : {}),
      });
    }),
  );
  const readAccess = wrap(async (req, res) => {
    const actor = await actorFor(req);
    const state = await repo.read();
    requireActor(state, actor.id);
    const book = state.books.find(
      (b) => b.id === req.params.id && isPublicBook(b),
    );
    ensure(book, "notFound", "Tác phẩm không còn công khai.", 404);
    const pdfUrl = book.pdfKey
      ? (await repo.storage.signedRead(book.pdfKey, "application/pdf")) ||
        `${options.origin}/api/v1/books/${encodeURIComponent(book.id)}/content`
      : book.pdfUrl
        ? `${options.origin}/api/v1/books/${encodeURIComponent(book.id)}/content`
        : "";
    res.json({
      data: {
        ...publicCatalogBook(state, book),
        pdfUrl,
        revisionId: book.publishedRevisionId || book.revisionId || "initial",
        chapters: book.chapters || [],
      },
    });
  });
  app.post("/api/v1/books/:id/read-access", readAccess);
  app.get("/api/v1/books/:id/read-access", readAccess);
  app.get(
    "/api/v1/books/:id/content",
    wrap(async (req, res) => {
      await actorFor(req);
      const book = (await repo.read()).books.find(
        (b) => b.id === req.params.id && isPublicBook(b),
      );
      ensure(book, "notFound", "Tác phẩm không còn công khai.", 404);
      if (book.pdfKey) {
        const url = await repo.storage.signedRead(
          book.pdfKey,
          "application/pdf",
        );
        if (url) return res.redirect(url);
        const bytes = await repo.storage.get(book.pdfKey);
        return sendRange(req, res, bytes, "application/pdf");
      }
      ensure(book.pdfUrl, "notFound", "Tác phẩm không có PDF.", 404);
      // Uploaded files are always served through the controlled file route. External links remain redirects; never fetch arbitrary URLs on the server.
      const url = new URL(book.pdfUrl);
      ensure(["https:", "http:"].includes(url.protocol), "invalidFile");
      return res.redirect(url.href);
    }),
  );
  app.post(
    "/api/v1/books/:id/views",
    wrap(async (req, res) => {
      const actor = await actorFor(req, true);
      let guest = String(req.headers.cookie || "")
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith("cl_viewer="))
        ?.slice(10);
      const issuedGuest =
        guest && /^[A-Za-z0-9_-]{32}$/.test(guest)
          ? await repo.getSecret("VIEWER", guest)
          : null;
      if (!issuedGuest || issuedGuest.expiresAt <= Date.now() / 1000) {
        guest = randomUUID().replace(/-/g, "");
        await repo.putSecret("VIEWER", guest, {
          expiresAt: Math.floor(Date.now() / 1000) + 31536000,
        });
        res.cookie("cl_viewer", guest, {
          httpOnly: true,
          sameSite: "lax",
          secure: options.mode === "aws",
          maxAge: 31536000000,
        });
      }
      const viewer = actor?.id || guest;
      const day = businessDay();
      const result = await repo.mutate(
        `view-${viewer}`,
        `view_${createHash("sha256").update(req.params.id).digest("hex").slice(0, 32)}_${day.replace(/-/g, "")}`,
        { id: req.params.id, day },
        (state) => {
          const book = state.books.find(
            (b) => b.id === req.params.id && isPublicBook(b),
          );
          ensure(book, "notFound", "Không tìm thấy sách.", 404);
          book.viewCount = (book.viewCount || 0) + 1;
          const historyKey = actor?.email || `guest:${guest}`;
          (state.bookViewHistory[historyKey] ||= {})[book.id] = Date.now();
          return { state, result: { viewCount: book.viewCount } };
        },
      );
      res.json({ ...result.result, replayed: Boolean(result.replayed) });
    }),
  );
  app.get(
    "/api/v1/me/progress/:id",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      const state = await repo.read();
      res.json({
        data: state.readingData[actor.email]?.[req.params.id] || null,
        settings: state.readerSettings[actor.email] || null,
      });
    }),
  );
  app.put(
    "/api/v1/me/progress/:id",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      const result = await repo.mutate(
        actor.id,
        idempotency(req),
        { action: "progress", id: req.params.id, input: req.body },
        (state) => {
          requireActor(state, actor.id);
          const book = state.books.find(
            (b) => b.id === req.params.id && isPublicBook(b),
          );
          ensure(book, "notFound", "Tác phẩm không còn công khai.", 404);
          const revisionId =
            book.publishedRevisionId || book.revisionId || "initial";
          ensure(
            req.body.revisionId === revisionId,
            "contentChanged",
            "Nội dung đã có phiên bản mới. Hãy mở lại tác phẩm.",
            409,
          );
          const value = req.body;
          ensure(
            ["pdf", "text"].includes(value.mode),
            "invalidProgress",
            "Định dạng đọc không hợp lệ.",
          );
          ensure(
            Number.isInteger(value.page) &&
              value.page >= 1 &&
              value.page <= 100000 &&
              Number.isFinite(value.textScroll) &&
              value.textScroll >= 0 &&
              value.textScroll <= 1,
            "invalidProgress",
            "Vị trí đọc không hợp lệ.",
          );
          if (value.mode === "text" && book.chapters?.length)
            ensure(
              book.chapters.some((c) => c.id === value.chapterId),
              "invalidProgress",
              "Chương không thuộc phiên bản hiện tại.",
            );
          const progress = {
            turning: ["buttons", "swipe", "scroll"].includes(value.turning)
              ? value.turning
              : "buttons",
            mode: value.mode,
            page: value.page,
            chapterId: value.chapterId || null,
            textScroll: value.textScroll,
            revisionId,
            updatedAt: nowIso(),
          };
          (state.readingData[actor.email] ||= {})[book.id] = progress;
          const history = state.readingHistory[actor.email] || [];
          state.readingHistory[actor.email] = [
            {
              id: randomUUID(),
              bookId: book.id,
              revisionId,
              openedAt: nowIso(),
              ...progress,
            },
            ...history.filter((h) => h.bookId !== book.id),
          ].slice(0, 80);
          return { state, result: { progress } };
        },
      );
      res.json(result.result);
    }),
  );
  app.delete(
    "/api/v1/me/progress/:id",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      await repo.mutate(
        actor.id,
        idempotency(req),
        { action: "progress.delete", id: req.params.id },
        (state) => {
          delete state.readingData[actor.email]?.[req.params.id];
          return { state };
        },
      );
      res.json({ ok: true });
    }),
  );
  app.get(
    "/api/v1/me/history",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      res.json({
        items: (await repo.read()).readingHistory[actor.email] || [],
      });
    }),
  );
  app.delete(
    "/api/v1/me/history",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      await repo.mutate(
        actor.id,
        idempotency(req),
        { action: "history.delete" },
        (state) => {
          state.readingHistory[actor.email] = [];
          return { state };
        },
      );
      res.json({ ok: true });
    }),
  );
  app.put(
    "/api/v1/me/reader-settings",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      const { normalizeReaderSettings } =
        await import("../src/data/readerContent.js");
      await repo.mutate(
        actor.id,
        idempotency(req),
        { action: "reader-settings", input: req.body },
        (state) => {
          state.readerSettings[actor.email] = normalizeReaderSettings(req.body);
          return { state };
        },
      );
      res.json({ ok: true });
    }),
  );
  const uploadMiddleware = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024, files: 1 },
  }).single("file");
  app.post(
    "/api/v1/uploads",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      await rateLimit(`upload:${actor.id}`, 20);
      await new Promise((resolve, reject) =>
        uploadMiddleware(req, res, (error) =>
          error ? reject(error) : resolve(),
        ),
      );
      const file = req.file;
      const type = file?.mimetype || req.body.contentType;
      const purpose = req.body.purpose || "content";
      ensure(
        mimeTypes.has(type),
        "invalidFile",
        "Định dạng tệp chưa được hỗ trợ.",
      );
      ensure(
        ["content", "cover", "evidence", "audio"].includes(purpose),
        "invalidFile",
      );
      ensure(
        purpose === "audio" ||
          purpose === "evidence" ||
          ["author", "admin"].includes(actor.role),
        "forbidden",
        "Bạn chưa có quyền tải nội dung tác phẩm.",
        403,
      );
      const size = file?.size || Number(req.body.size);
      ensure(
        size > 0 && size <= 20 * 1024 * 1024,
        "fileTooLarge",
        "Mỗi tệp tối đa 20 MB.",
      );
      const id = randomUUID();
      const key = `uploads/${actor.id}/${id}`;
      const record = {
        ownerId: actor.id,
        key,
        contentType: type,
        size,
        purpose,
        createdAt: nowIso(),
        complete: Boolean(file),
      };
      if (file) {
        validateFile(file.buffer, type);
        await repo.storage.put(key, file.buffer, type);
      }
      await repo.putSecret("UPLOAD", id, record);
      res.json({
        id,
        key,
        url: `${options.origin}/api/v1/files/${id}`,
        complete: Boolean(file),
        ...(file ? {} : { uploadUrl: await repo.storage.uploadUrl(key, type) }),
      });
    }),
  );
  app.post(
    "/api/v1/uploads/:id/complete",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      const upload = await repo.getSecret("UPLOAD", req.params.id);
      ensure(
        upload?.ownerId === actor.id,
        "forbidden",
        "Bạn không sở hữu tệp này.",
        403,
      );
      const bytes = await repo.storage.get(upload.key);
      ensure(
        bytes.length === upload.size && bytes.length <= 20 * 1024 * 1024,
        "invalidFile",
        "Dung lượng tệp không khớp.",
      );
      validateFile(bytes, upload.contentType);
      const immutableKey = `assets/${actor.id}/${createHash("sha256").update(bytes).digest("hex")}`;
      await repo.storage.put(immutableKey, bytes, upload.contentType);
      await repo.putSecret("UPLOAD", req.params.id, {
        ...upload,
        originalKey: upload.originalKey || upload.key,
        key: immutableKey,
        complete: true,
      });
      res.json({
        ok: true,
        id: req.params.id,
        key: immutableKey,
        url: `${options.origin}/api/v1/files/${req.params.id}`,
        complete: true,
      });
    }),
  );
  app.get(
    "/api/v1/files/:id",
    wrap(async (req, res) => {
      const actor = await actorFor(req, true);
      const upload = await repo.getSecret("UPLOAD", req.params.id);
      ensure(upload?.complete, "notFound", "Tệp chưa sẵn sàng.", 404);
      const state = await repo.read();
      const published = state.books.some(
        (b) =>
          isPublicBook(b) &&
          (b.pdfKey === upload.key ||
            b.pdfUrl?.endsWith("/files/" + req.params.id) ||
            b.cover?.endsWith("/files/" + req.params.id)),
      );
      ensure(
        (published && upload.purpose === "cover") ||
          (actor &&
            (upload.ownerId === actor.id ||
              actor.role === "admin" ||
              (published && upload.purpose !== "evidence"))),
        "forbidden",
        "Bạn không có quyền đọc tệp này.",
        actor ? 403 : 401,
      );
      const url = await repo.storage.signedRead(upload.key, upload.contentType);
      if (url) return res.redirect(url);
      sendRange(
        req,
        res,
        await repo.storage.get(upload.key),
        upload.contentType,
      );
    }),
  );
  app.get(
    "/api/v1/chat/sessions",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      res.json({
        items: (await repo.read()).chatSessions.filter(
          (c) => c.userId === actor.id,
        ),
      });
    }),
  );
  app.post(
    "/api/v1/chat/sessions/:id/messages",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      await rateLimit(`chat:${actor.id}`, 10);
      const content = String(req.body.content || "");
      ensure(
        content.trim() && content.length <= 2000,
        "invalidQuestion",
        "Câu hỏi tối đa 2.000 ký tự.",
      );
      const saved = await repo.mutate(
        actor.id,
        idempotency(req),
        { action: "chat.question", id: req.params.id, content },
        (state) => {
          let chat = state.chatSessions.find((c) => c.id === req.params.id);
          if (!chat) {
            chat = {
              id: req.params.id,
              userId: actor.id,
              title: content.slice(0, 50),
              messages: [],
              createdAt: nowIso(),
            };
            state.chatSessions.push(chat);
          }
          ensure(
            chat.userId === actor.id,
            "notFound",
            "Không tìm thấy hội thoại.",
            404,
          );
          ensure(
            chat.messages.length < 80,
            "conversationLimit",
            "Phiên đã đủ 40 lượt hỏi đáp. Hãy tạo phiên mới.",
          );
          const message = {
            id: randomUUID(),
            role: "user",
            text: content,
            createdAt: nowIso(),
            status: "pending",
            requestId: req.requestId,
          };
          chat.messages.push(message);
          chat.updatedAt = nowIso();
          return { state, result: { messageId: message.id } };
        },
      );
      if (saved.replayed) {
        const chat = saved.state.chatSessions.find(
          (c) => c.id === req.params.id,
        );
        const answer = chat.messages.find(
          (m) => m.replyTo === saved.result.messageId,
        );
        if (answer) return res.json(answer);
        throw new ServiceError(
          "requestInProgress",
          "Câu hỏi đang được xử lý. Hãy tải lại hội thoại.",
          409,
        );
      }
      try {
        const chat = saved.state.chatSessions.find(
          (c) => c.id === req.params.id,
        );
        const answer = await answerQuestion(
          saved.state,
          content,
          chat.messages.slice(0, -1),
          { ...options, actorId: actor.id },
        );
        const result = await repo.mutate(
          actor.id,
          `answer_${saved.result.messageId}`,
          { action: "chat.answer", messageId: saved.result.messageId },
          (state) => {
            const session = state.chatSessions.find(
              (c) => c.id === req.params.id && c.userId === actor.id,
            );
            ensure(session, "notFound", "Hội thoại đã bị xóa.", 404);
            session.messages.find(
              (m) => m.id === saved.result.messageId,
            ).status = "completed";
            const reply = {
              id: randomUUID(),
              role: "assistant",
              ...answer,
              replyTo: saved.result.messageId,
              createdAt: nowIso(),
              status: "completed",
            };
            session.messages.push(reply);
            return { state, result: reply };
          },
        );
        res.json(result.result);
      } catch (error) {
        await repo.mutate(
          actor.id,
          `failed_${saved.result.messageId}`,
          { action: "chat.failed", messageId: saved.result.messageId },
          (state) => {
            const message = state.chatSessions
              .find((c) => c.id === req.params.id && c.userId === actor.id)
              ?.messages.find((m) => m.id === saved.result.messageId);
            if (message) message.status = "failed";
            return { state };
          },
        );
        throw error;
      }
    }),
  );
  app.delete(
    "/api/v1/chat/sessions/:id",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      await repo.mutate(
        actor.id,
        idempotency(req),
        { action: "chat.delete", id: req.params.id },
        (state) => {
          const chat = state.chatSessions.find((c) => c.id === req.params.id);
          ensure(
            chat?.userId === actor.id,
            "notFound",
            "Không tìm thấy hội thoại.",
            404,
          );
          state.chatSessions = state.chatSessions.filter(
            (c) => c.id !== chat.id,
          );
          return { state };
        },
      );
      res.json({ ok: true });
    }),
  );
  app.post(
    "/api/v1/audio/jobs",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      await rateLimit(`audio:${actor.id}`, 10);
      res.json(
        await startAudio(repo, actor, req.body, options, idempotency(req)),
      );
    }),
  );
  app.get(
    "/api/v1/audio/jobs/:id",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      const job = (await repo.read()).audioJobs.find(
        (j) =>
          j.id === req.params.id &&
          (j.userId === actor.id || actor.role === "admin"),
      );
      ensure(job, "notFound", "Không tìm thấy tác vụ.", 404);
      res.json({
        data: job,
        url: job.outputKey
          ? await repo.storage.signedRead(job.outputKey, "audio/mpeg")
          : null,
      });
    }),
  );
  app.post(
    "/api/v1/audio/speech",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      await rateLimit(`speech:${actor.id}`, 10);
      const key = await synthesize(
        String(req.body.text || ""),
        req.body.language,
        repo.storage,
        options,
      );
      res.json({ url: await repo.storage.signedRead(key, "audio/mpeg") });
    }),
  );
  app.post(
    "/api/v1/management/reminders/run",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      ensure(
        actor.role === "admin",
        "forbidden",
        "Chỉ quản trị viên được chạy kiểm tra.",
        403,
      );
      res.json(await runReminders(repo, options));
    }),
  );
  app.get(
    "/api/v1/management/outbox",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      ensure(
        actor.role === "admin" && options.mode === "local",
        "forbidden",
        "Chỉ dành cho quản trị bản chạy local.",
        403,
      );
      const result = await repo.db.send(
        new QueryCommand({
          TableName: repo.table,
          KeyConditionExpression: "PK = :pk",
          ExpressionAttributeValues: { ":pk": "OUTBOX" },
        }),
      );
      res.json({ items: result.Items || [] });
    }),
  );
  app.get(
    "/api/v1/management/data-source",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      ensure(
        actor.role === "admin",
        "forbidden",
        "Chỉ quản trị viên được xem nguồn dữ liệu.",
        403,
      );
      res.json({ data: legacyStatus });
    }),
  );
  app.post(
    "/api/v1/management/data-source/sync",
    wrap(async (req, res) => {
      const actor = await actorFor(req);
      ensure(
        actor.role === "admin" && options.mode === "local",
        "forbidden",
        "Chỉ quản trị viên bản local được đồng bộ.",
        403,
      );
      res.json({ data: await syncLegacySource(repo) });
    }),
  );
  installRestRoutes(app, repo, actorFor);
  app.use("/api", (_req, _res, next) =>
    next(new ServiceError("notFound", "Không tìm thấy API.", 404)),
  );
  app.use((error, req, res, _next) => {
    const cognitoErrors = {
      UserNotConfirmedException: [
        403,
        "emailUnverified",
        "Vui lòng xác minh email trước khi đăng nhập.",
      ],
      CodeMismatchException: [422, "invalidCode", "Mã xác minh chưa đúng."],
      ExpiredCodeException: [422, "invalidCode", "Mã xác minh đã hết hạn."],
      InvalidPasswordException: [
        422,
        "invalidPassword",
        "Mật khẩu cần ít nhất 10 ký tự, có chữ hoa, chữ thường, số và ký hiệu.",
      ],
      TooManyRequestsException: [
        429,
        "rateLimited",
        "Có quá nhiều yêu cầu. Vui lòng thử lại sau.",
      ],
      UsernameExistsException: [409, "accountExists", "Email đã tồn tại."],
      NotAuthorizedException: [
        401,
        "invalidCredentials",
        "Email, mật khẩu hoặc phiên đăng nhập chưa đúng.",
      ],
    };
    if (!(error instanceof ServiceError) && cognitoErrors[error.name]) {
      const [status, code, message] = cognitoErrors[error.name];
      error = new ServiceError(code, message, status);
    }
    const status =
      error.status || (error.code === "LIMIT_FILE_SIZE" ? 422 : 500);
    const code =
      error.code ||
      (error.name === "NotAuthorizedException"
        ? "invalidCredentials"
        : error.name === "UsernameExistsException"
          ? "accountExists"
          : "serverError");
    const message =
      error instanceof ServiceError
        ? error.message
        : code === "invalidCredentials"
          ? "Email hoặc mật khẩu chưa đúng."
          : code === "accountExists"
            ? "Email đã tồn tại."
            : error.code === "LIMIT_FILE_SIZE"
              ? "Tệp vượt quá 20 MB."
              : "Chưa xử lý được yêu cầu. Hãy thử lại.";
    console.error(
      JSON.stringify({
        requestId: req.requestId,
        path: req.path,
        status,
        errorName: error.name,
        code,
      }),
    );
    res.status(["invalidCredentials"].includes(code) ? 401 : status).json({
      error: {
        code,
        message,
        fieldErrors: error.fields,
        requestId: req.requestId,
      },
    });
  });
  return app;
}
function sendRange(req, res, buffer, mime) {
  res.set({
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
  });
  const range = req.get("range");
  if (!range) return res.send(buffer);
  const match = range.match(/^bytes=(\d+)-(\d*)$/);
  if (!match)
    return res
      .status(416)
      .set("Content-Range", `bytes */${buffer.length}`)
      .end();
  const start = Number(match[1]);
  const end = match[2]
    ? Math.min(Number(match[2]), buffer.length - 1)
    : buffer.length - 1;
  if (start > end || start >= buffer.length)
    return res
      .status(416)
      .set("Content-Range", `bytes */${buffer.length}`)
      .end();
  res
    .status(206)
    .set({
      "Content-Range": `bytes ${start}-${end}/${buffer.length}`,
      "Content-Length": end - start + 1,
    })
    .send(buffer.subarray(start, end + 1));
}
