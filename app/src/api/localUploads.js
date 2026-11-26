import { uploadFile } from "./runtime.js";
export async function uploadLocal(_api, file, purpose) {
  return uploadFile(file, purpose);
}
