import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "./config.mjs";
import { ensure } from "./errors.mjs";

export function createStorage(options = config) {
  const s3 =
    options.mode === "aws" ? new S3Client({ region: options.region }) : null;
  const root = path.join(options.localDir, "content");
  const keyPath = (key) => {
    ensure(
      typeof key === "string" &&
        /^[A-Za-z0-9_./-]+$/.test(key) &&
        !key.split("/").includes("..") &&
        !key.startsWith("/"),
      "invalidFile",
      "Mã tệp không hợp lệ.",
    );
    const resolved = path.resolve(root, key);
    ensure(resolved.startsWith(root + path.sep), "invalidFile");
    return resolved;
  };
  return {
    async put(key, body, contentType = "application/json") {
      if (s3)
        await s3.send(
          new PutObjectCommand({
            Bucket: options.bucket,
            Key: key,
            Body: body,
            ContentType: contentType,
            ServerSideEncryption: "AES256",
          }),
        );
      else {
        const target = keyPath(key);
        await mkdir(path.dirname(target), { recursive: true });
        const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body);
        try {
          const existing = await readFile(target);
          ensure(
            existing.equals(bytes),
            "immutableFile",
            "Nội dung đã được lưu bằng một phiên bản khác.",
            409,
          );
          return key;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        const tmp = target + "." + randomUUID();
        await writeFile(tmp, bytes);
        try {
          await rename(tmp, target);
        } catch (error) {
          const existing = await readFile(target).catch(() => null);
          await unlink(tmp).catch(() => {});
          if (!existing?.equals(bytes)) throw error;
        }
      }
      return key;
    },
    async get(key) {
      if (s3) {
        const result = await s3.send(
          new GetObjectCommand({ Bucket: options.bucket, Key: key }),
        );
        return Buffer.from(await result.Body.transformToByteArray());
      }
      return readFile(keyPath(key));
    },
    async remove(key) {
      if (s3)
        await s3.send(
          new DeleteObjectCommand({ Bucket: options.bucket, Key: key }),
        );
      else
        await unlink(keyPath(key)).catch((error) => {
          if (error.code !== "ENOENT") throw error;
        });
    },
    async head(key) {
      if (s3)
        return s3.send(
          new HeadObjectCommand({ Bucket: options.bucket, Key: key }),
        );
      const buffer = await readFile(keyPath(key));
      return { ContentLength: buffer.length };
    },
    async signedRead(key, mime) {
      if (!s3) return null;
      return getSignedUrl(
        s3,
        new GetObjectCommand({
          Bucket: options.bucket,
          Key: key,
          ...(mime ? { ResponseContentType: mime } : {}),
        }),
        { expiresIn: 300 },
      );
    },
    async uploadUrl(key, contentType) {
      ensure(s3, "localUpload", "Tải tệp qua API local.");
      return getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: options.bucket,
          Key: key,
          ContentType: contentType,
          ServerSideEncryption: "AES256",
        }),
        { expiresIn: 300 },
      );
    },
    async pack(value) {
      if (
        !Array.isArray(value.chapters) ||
        !value.chapters.some((c) => typeof c.content === "string")
      )
        return value;
      const text = JSON.stringify(value.chapters);
      const digest = createHash("sha256").update(text).digest("hex");
      const chaptersKey = `chapters/${digest}.json`;
      await this.put(chaptersKey, text);
      const copy = {
        ...value,
        chaptersKey,
        chapters: value.chapters.map(
          ({ content: _content, ...chapter }) => chapter,
        ),
      };
      return copy;
    },
    async unpack(value) {
      if (!value.chaptersKey) return value;
      return {
        ...value,
        chapters: JSON.parse(
          (await this.get(value.chaptersKey)).toString("utf8"),
        ),
      };
    },
  };
}
