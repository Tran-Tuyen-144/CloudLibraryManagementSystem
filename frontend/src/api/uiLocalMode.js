// Activated only by the local Vite sandbox. Demo stays available for comparison.
export const localMode = import.meta.env?.VITE_AUTH_MODE === "local" &&
  new URLSearchParams(globalThis.location?.search || "").get("demo") !== "1";
