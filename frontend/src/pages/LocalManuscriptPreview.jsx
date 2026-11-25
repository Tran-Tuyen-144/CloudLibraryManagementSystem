import {useEffect,useRef,useState} from "react";
import {privateFilePath} from "../api/localUploads.js";
import ReaderPage from "./ReaderPage";
export default function LocalManuscriptPreview({book,user,onBack,api}){
 const path=privateFilePath(book.pdfUrl);const apiRef=useRef(api);const [url,setUrl]=useState("");const [error,setError]=useState("");
 useEffect(()=>{apiRef.current=api;},[api]);
 useEffect(()=>{if(!path)return;const c=new AbortController();let blobUrl;apiRef.current(path,{responseType:"blob",signal:c.signal,timeoutMs:60000}).then(blob=>{if(c.signal.aborted)return;if(blob.type.split(";")[0]!=="application/pdf")throw new Error("Invalid PDF");blobUrl=URL.createObjectURL(blob);setUrl(blobUrl);}).catch(e=>{if(!c.signal.aborted)setError(e.message);});return()=>{c.abort();if(blobUrl)URL.revokeObjectURL(blobUrl);};},[path]);
 if(path&&!url)return <section className="online-reader"><h2>{book.title}</h2><p role="status">{error||"Đang tải PDF riêng tư…"}</p><button className="online-reader-button" onClick={onBack}>Quay lại</button></section>;
 return <ReaderPage preview book={book} privatePdf={url} user={user} onBack={onBack}/>;
}
