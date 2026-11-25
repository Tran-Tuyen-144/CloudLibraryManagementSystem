export async function uploadLocal(api,file,purpose){
  if(!file || !Number.isFinite(file.size)||file.size<=0||file.size>20*1024*1024)throw new Error("File must be 1–20 MB or smaller");
  if(purpose==="content"&&file.type!=="application/pdf")throw new Error("PDF required");
  const body=new FormData();body.append("file",file);body.append("purpose",purpose);
  const upload=await api("/uploads",{method:"POST",body,timeoutMs:60000});
  if(!upload?.complete||typeof upload.id!=="string"||! /^[A-Za-z0-9-]+$/.test(upload.id))throw new Error("Upload incomplete");
  const complete=await api(`/uploads/${encodeURIComponent(upload.id)}/complete`,{method:"POST",timeoutMs:60000});
  if(!complete?.complete||complete.id!==upload.id)throw new Error("Upload incomplete");
  return complete;
}
export function privateFilePath(value){
  try{const url=new URL(value,globalThis.location?.origin||"http://127.0.0.1:5173");if(url.origin!==(globalThis.location?.origin||"http://127.0.0.1:5173")||url.search||url.hash||!/^\/api\/v1\/files\/[A-Za-z0-9-]+$/.test(url.pathname))return null;return url.pathname.slice(7);}catch{return null;}
}
