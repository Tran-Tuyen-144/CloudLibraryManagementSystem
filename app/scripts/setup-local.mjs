import { mkdir, access, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
const root = path.resolve(".local/runtime/dynamodb");
await mkdir(root, { recursive: true });
await mkdir(".local/dynamodb", { recursive: true });
try {
  await access(path.join(root, "DynamoDBLocal.jar"));
  console.log("DynamoDB Local đã sẵn sàng.");
} catch {
  console.log("Đang tải DynamoDB Local từ AWS…");
  const response = await fetch(
    "https://s3.us-west-2.amazonaws.com/dynamodb-local/dynamodb_local_latest.tar.gz",
  );
  if (!response.ok) throw new Error("Không tải được DynamoDB Local.");
  const archive = path.join(root, "dynamodb-local.tar.gz");
  await writeFile(archive, Buffer.from(await response.arrayBuffer()));
  const result = spawnSync("tar", ["-xzf", archive, "-C", root], {
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.status !== 0)
    throw new Error("Chưa giải nén được DynamoDB Local.");
  console.log("DynamoDB Local đã được chuẩn bị.");
}
