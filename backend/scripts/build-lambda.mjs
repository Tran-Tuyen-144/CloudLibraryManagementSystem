import { build } from "esbuild";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
await mkdir(".local/lambda/fixtures", { recursive: true });
await build({
  entryPoints: ["server/lambda.mjs"],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node24",
  outfile: ".local/lambda/index.js",
  sourcemap: true,
  logLevel: "info",
  minify: false,
});
await copyFile(
  "server/fixtures/cloud-library-guide.pdf",
  ".local/lambda/fixtures/cloud-library-guide.pdf",
);
await writeFile(
  ".local/lambda/package.json",
  JSON.stringify({
    type: "commonjs",
    name: "cloud-library-lambda",
    version: "1.0.0",
  }),
);
