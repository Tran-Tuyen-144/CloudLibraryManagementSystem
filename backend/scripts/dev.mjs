import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
const children = [];
const launch = (command, args) => {
  const child = spawn(command, args, { stdio: "inherit", windowsHide: true });
  children.push(child);
  child.on("exit", (code) => {
    if (code && !stopping) {
      console.error(`Một dịch vụ dừng với mã ${code}.`);
      shutdown(code);
    }
  });
  return child;
};
let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach((child) => child.kill());
  setTimeout(() => process.exit(code), 500);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());
const portOpen = (port) =>
  new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
async function waitFor(port) {
  for (let i = 0; i < 120; i++) {
    if (await portOpen(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Dịch vụ cổng ${port} chưa khởi động.`);
}
try {
  await access(".local/runtime/dynamodb/DynamoDBLocal.jar");
  if (!(await portOpen(8010))) {
    const root = path.resolve(".local/runtime/dynamodb");
    launch("java", [
      `-Djava.library.path=${path.join(root, "DynamoDBLocal_lib")}`,
      "-jar",
      path.join(root, "DynamoDBLocal.jar"),
      "-sharedDb",
      "-dbPath",
      path.resolve(".local/dynamodb"),
      "-port",
      "8010",
    ]);
  }
  await waitFor(8010);
  launch(process.execPath, ["--watch", "server/index.mjs"]);
  await waitFor(Number(process.env.API_PORT || 3001));
  launch(process.execPath, [
    "node_modules/vite/bin/vite.js",
    "--host",
    "127.0.0.1",
    "--port",
    "5173",
    "--strictPort",
  ]);
} catch (error) {
  console.error(error.message);
  console.error("Chạy npm run setup:local trước lần sử dụng đầu tiên.");
  shutdown(1);
}
