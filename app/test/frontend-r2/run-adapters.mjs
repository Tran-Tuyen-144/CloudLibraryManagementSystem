import * as esbuild from "esbuild";
const output = ".local/frontend-adapters.bundle.mjs";
await esbuild.build({
  entryPoints: ["test/frontend-r2/adapters.mjs"],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  define: {
    "import.meta.env": JSON.stringify({
      VITE_API_BASE_URL: "http://127.0.0.1:3001/api/v1",
      VITE_AUTH_MODE: "local",
    }),
  },
  banner: {
    js: "globalThis.sessionStorage = { values: new Map(), getItem(key) { return this.values.get(key) ?? null; }, setItem(key, value) { this.values.set(key, value); }, removeItem(key) { this.values.delete(key); } }; globalThis.localStorage = { values: new Map(), getItem(key) { return this.values.get(key) ?? null; }, setItem(key, value) { this.values.set(key, value); }, removeItem(key) { this.values.delete(key); } };",
  },
});
await import("../../" + output);
