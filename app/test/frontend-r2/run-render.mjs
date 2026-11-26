import * as esbuild from "esbuild";
await esbuild.build({entryPoints:["test/frontend-r2/render.jsx"],outfile:".local/render-r2.bundle.mjs",bundle:true,platform:"node",format:"esm",packages:"external",jsx:"automatic",
 loader:{".css":"empty",".png":"dataurl",".svg":"dataurl",".jpg":"dataurl"},
 plugins:[{name:"skip-lazy-pdf-renderer",setup(build){build.onResolve({filter:/ui\/pdfReader$/},()=>({path:"unused-pdf-renderer",external:true}));}}],
 define:{"import.meta.env":JSON.stringify({VITE_API_BASE_URL:"http://127.0.0.1:3001/api/v1",VITE_AUTH_MODE:"local"})},
 banner:{js:'globalThis.sessionStorage={values:new Map(),getItem(key){return this.values.get(key)??null;},setItem(key,value){this.values.set(key,value);},removeItem(key){this.values.delete(key);}}; globalThis.localStorage=globalThis.sessionStorage; globalThis.window={addEventListener(){},matchMedia(){return {matches:false};},location:{href:"http://127.0.0.1:5173/"}};'},
});
await import("../../.local/render-r2.bundle.mjs");
