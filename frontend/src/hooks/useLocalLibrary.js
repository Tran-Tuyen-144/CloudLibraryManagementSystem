import { useCallback, useEffect, useRef, useState } from "react";
import { createApiClient } from "../api/client.js";
import { fetchCatalogPage, mergeCatalogBooks } from "../api/catalog.js";
import { loginLocal, loadMine, changeFavorite, cancelLoan, logoutLocal } from "../api/localIntegration.js";

import { publishLocalSnapshot } from "../ui/libraryStore.js";
import { commandSpec, projectAccountSnapshot } from "../api/loanInventoryLocal.js";

const empty = () => ({ favoriteIds: [], loans: [], managed: [], reservations: [], copies: [], notifications: [], settings: null });
async function loadFor(next) {
  const [mine, response] = await Promise.all([loadMine(next.accessToken),request(next.accessToken)("/snapshot")]);
  return {...mine,...projectAccountSnapshot(response.data,next.user), snapshot:response.data};
}
const fail = (error) => ({ ok: false, error: error?.code || "serverError", message: error?.message || "API request failed" });
const request = token => createApiClient({baseUrl: "/api/v1", getAccessToken: () => token});

export default function useLocalLibrary() {
  const [user, setUser] = useState(null);
  const [mine, setMine] = useState(empty);
  const [catalog, setCatalog] = useState({books: [], loading: true, error: ""});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const session = useRef(null);
  const mineRef = useRef(empty());
  const locked = useRef(false);
  const publishMine = data => { mineRef.current = data; setMine(data); publishLocalSnapshot(data.snapshot); };
  const clear = () => { session.current = null; setUser(null); publishMine(empty()); };
  const refreshCatalog = useCallback(() => setReload(n => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        let items = [], cursor = null;
        const seen = new Set();
        do {
          const page = await fetchCatalogPage({cursor}, {signal: controller.signal});
          items = mergeCatalogBooks(items, page.items);
          cursor = page.nextCursor;
          if (cursor && seen.has(cursor)) throw new Error("Repeated catalog cursor");
          if (cursor) seen.add(cursor);
          if (seen.size > 250) throw new Error("Catalog pagination limit exceeded");
        } while (cursor);
        if (!controller.signal.aborted) setCatalog({books: items, loading: false, error: ""});
      } catch (e) {
        if (!controller.signal.aborted) setCatalog({books: [], loading: false, error: e.message});
      }
    }
    void load();
    return () => controller.abort();
  }, [reload]);

  async function run(task) {
    if (locked.current) return {ok:false,error:"busy"};
    locked.current = true; setBusy(true); setNotice("");
    try { return await task(); }
    catch (e) {
      if (e.status === 401 && session.current) clear();
      setNotice(e.message || "API request failed"); return fail(e);
    } finally { locked.current = false; setBusy(false); }
  }
  async function signInDemo(values) {
    return run(async () => {
      if (values.mode === "register" && values.password.length < 10) return {ok:false,error:"shortPassword"};
      const next = await loginLocal(values, values.mode === "register");
      try {
        const data = await loadFor(next);
        if (values.signal?.aborted) { await logoutLocal(next.accessToken); return {ok:false,error:"cancelled"}; }
        session.current = next; publishMine(data); setUser(next.user);
        return {ok:true,user:next.user};
      } catch(e) { await logoutLocal(next.accessToken).catch(() => {}); throw e; }
    });
  }
  function signOutDemo() {
    return run(async () => {
      const token = session.current?.accessToken;
      clear();
      if (token) await logoutLocal(token);
      return {ok:true};
    });
  }
  function change(task, refresh = false) {
    return run(async () => {
      const token = session.current?.accessToken;
      if (!token) return {ok:false,error:"loginRequired"};
      await task(token);
      publishMine(await loadFor(session.current));
      if (refresh) refreshCatalog();
      return {ok:true};
    });
  }
  function featureRequest(path, options = {}) {
    const token = session.current?.user.id === user?.id ? session.current?.accessToken : null;
    if (!token) return Promise.reject(new Error("Vui lòng đăng nhập lại."));
    return request(token)(path, { ...options, ...(options.method && options.method !== "GET" ? {idempotencyKey:crypto.randomUUID()} : {}) });
  }
  function featureCommand(command, input) {
    if (!user || session.current?.user.id !== user.id) return Promise.resolve({ok:false,error:"loginRequired"});
    return change(token => request(token)("/commands", {method:"POST",body:{command,input},idempotencyKey:crypto.randomUUID()}),true);
  }
  function runCommand(command, input) {
    return change(token => request(token)("/commands",{method:"POST",body:commandSpec(command,input),idempotencyKey:crypto.randomUUID()}), command !== "notification.read");
  }
  function toggleFavorite(id, ensureSaved = false) {
    const saved = mineRef.current.favoriteIds.includes(id);
    if (ensureSaved && saved) return Promise.resolve({ok:true});
    return change(token => changeFavorite(token, id, ensureSaved || !saved));
  }
  function createRequest(book, note = "") {
    if (!book?.id) return Promise.resolve({ok:false,error:"invalidBook"});
    return change(token => request(token)("/loans", {method:"POST", body:{bookId:book.id,note}, idempotencyKey:crypto.randomUUID()}), true);
  }
  function cancelRequest(id) {
    const row = mineRef.current.loans.find(item => item.id === id);
    if (!row) return Promise.resolve({ok:false,error:"staleRequest"});
    return change(token => cancelLoan(token,row), true);
  }
  function processRequest(values) {
    const row = mineRef.current.managed.find(item => item.id === values.id);
    if (!row || !["approve","reject","handover","return","cancel"].includes(values.action)) return Promise.resolve({ok:false,error:"staleRequest"});
    return change(token => request(token)(`/management/loans/${encodeURIComponent(row.id)}/${values.action}`, {method:"POST",body:{version:row.version,reason:values.reason},idempotencyKey:crypto.randomUUID()}), true);
  }
  function refreshMine() {
    return run(async () => {
      if (!session.current) return {ok:false,error:"loginRequired"};
      const current = session.current;
      const next = (await request(current.accessToken)("/me")).data;
      if (next?.id !== current.user.id) throw new Error("Invalid account response");
      const updated = {...current,user:next};
      const data = await loadFor(updated);
      session.current = updated; setUser(next); publishMine(data); refreshCatalog(); return {ok:true};
    });
  }
  function updateDemoProfile(values) {
    return run(async () => {
      const token = session.current?.accessToken;
      if (!token) return {ok:false,error:"loginRequired"};
      const api = request(token);
      await api("/me", {method:"PATCH",body:values,idempotencyKey:crypto.randomUUID()});
      const next = (await api("/me")).data;
      if (!next?.id || next.id !== session.current.user.id) throw new Error("Invalid profile response");
      session.current = {...session.current,user:next}; setUser(next); publishMine(await loadFor(session.current));
      return {ok:true};
    });
  }
  return { user, signInDemo, signOutDemo, updateDemoProfile, favoriteIds:mine.favoriteIds,
    toggleFavorite, books:catalog.books, allBooks:catalog.books, requests:mine.loans,
    allRequests:mine.managed, createRequest, cancelRequest, processRequest, createDemoRequests:undefined,
    loading:catalog.loading, error:catalog.error, notice, busy, refreshCatalog, refreshMine,
    featureRequest, featureCommand, localPanels:{snapshot:mine.snapshot,featureRequest,featureCommand,reservations:mine.reservations,copies:mine.copies,notifications:mine.notifications,settings:mine.settings,command:runCommand,refresh:refreshMine} };
}
