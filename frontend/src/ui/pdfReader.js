import {
  getDocument,
  GlobalWorkerOptions,
} from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

const assets = import.meta.glob(
  [
    "/node_modules/pdfjs-dist/cmaps/*.bcmap",
    "/node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}",
    "/node_modules/pdfjs-dist/wasm/*.{wasm,js}",
  ],
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);

class BundledBinaryDataFactory {
  async fetch({ kind, filename }) {
    const folder = {
      cMapUrl: "cmaps",
      standardFontDataUrl: "standard_fonts",
      wasmUrl: "wasm",
    }[kind];

    const url = assets[`/node_modules/pdfjs-dist/${folder}/${filename}`];

    if (!url) {
      throw new Error("Missing PDF rendering resource");
    }

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error("Unable to load PDF rendering resource");
    }

    return new Uint8Array(await response.arrayBuffer());
  }
}

export function openPdf(url) {
  return getDocument({
    url,
    isEvalSupported: false,
    useWorkerFetch: false,
    BinaryDataFactory: BundledBinaryDataFactory,
  });
}