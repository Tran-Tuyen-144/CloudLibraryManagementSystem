import { useCallback, useEffect, useRef, useState } from "react";
import { loadReading, readingPayload, readPath } from "../api/readingLocal.js";
import { useUiSettings } from "../ui/settings.js";
import ReaderPage from "./ReaderPage";

export default function LocalReaderPage({book,user,onBack,api}) {
  const {language}=useUiSettings();
  const [loaded,setLoaded]=useState(null);
  const [error,setError]=useState("");
  const [saveState,setSaveState]=useState("");
  const [attempt,setAttempt]=useState(0);
  const latest=useRef(api); // updated via effect; requests remain bound to current authenticated account
  const writes=useRef(Promise.resolve());
  const pending=useRef(null);
  const timer=useRef(null);
  useEffect(()=>{latest.current=api;},[api]);
  useEffect(()=>{
    const controller=new AbortController(); let url;
    loadReading(latest.current,book.id,controller.signal).then(async value=>{
      if(controller.signal.aborted)return;
      if(value.pdf) url=URL.createObjectURL(value.pdf);
      setLoaded({...value,book:{...value.book,localPdfUrl:url||""}});
      await latest.current(`${readPath(book.id)}/views`,{method:"POST",signal:controller.signal});
    }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return ()=>{controller.abort(); if(url)URL.revokeObjectURL(url);};
  },[book.id,attempt]);
  const enqueue=useCallback((action)=>{
    setSaveState("saving");
    const task=writes.current.catch(()=>{}).then(action);
    writes.current=task;
    task.then(()=>setSaveState("saved"),()=>setSaveState("failed"));
    return task;
  },[]);
  const flush=useCallback(()=>{
    clearTimeout(timer.current);
    const change=pending.current; pending.current=null;
    if(change) return enqueue(change);
    return writes.current;
  },[enqueue]);
  const saveProgress=useCallback((record,turning)=>{
    const data=readingPayload(loaded.book,record,turning);
    const apiForWrite=latest.current;
    pending.current=()=>apiForWrite(`/me/progress/${encodeURIComponent(book.id)}`,{method:"PUT",body:data});
    setSaveState("saving"); clearTimeout(timer.current);timer.current=setTimeout(()=>{void flush().catch(()=>{});},350);
  },[book.id,loaded,flush]);
  function removeProgress() {
    clearTimeout(timer.current);pending.current=null;
    return enqueue(()=>latest.current(`/me/progress/${encodeURIComponent(book.id)}`,{method:"DELETE"}));
  }
  async function back(){try{await flush();onBack();}catch{setSaveState("failed");if(window.confirm(language==="en"?"Save failed. Leave anyway?":"Lưu thất bại. Vẫn rời trang?"))onBack();}}
  useEffect(()=>()=>{clearTimeout(timer.current);const change=pending.current;pending.current=null;if(change)void writes.current.catch(()=>{}).then(change).catch(()=>{});},[]);
  const words=language==="en"?{saving:"Saving to server…",saved:"Saved to server",failed:"Server save failed — reopen or retry before leaving.",loading:"Loading protected content…",back:"Back",retry:"Retry"}:{saving:"Đang lưu lên Backend…",saved:"Đã lưu lên Backend",failed:"Lưu Backend thất bại — thử lại trước khi rời trang.",loading:"Đang tải nội dung được bảo vệ…",back:"Quay lại",retry:"Thử lại"};
  if(!loaded)return <section className="online-reader"><h2>{book.title}</h2><p role="status">{error||words.loading}</p>{error&&<button className="online-reader-button" onClick={()=>{setError("");setAttempt(n=>n+1);}}>{words.retry}</button>}<button className="online-reader-button" onClick={onBack}>{words.back}</button></section>;
  return <><p className="reader-status" role="status">{words[saveState]||error||""}</p><ReaderPage key={loaded.book.revisionId} book={loaded.book} user={user} onBack={back} local={{progress:loaded.progress,settings:loaded.settings,saveProgress,removeProgress,saveSettings:settings=>enqueue(()=>latest.current("/me/reader-settings",{method:"PUT",body:settings}))}} /></>;
}
