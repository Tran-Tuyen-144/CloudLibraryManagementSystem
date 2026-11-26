// Bundled for the local integration check so the actual Vite runtime and service
// modules execute against the local API, with no AWS credentials or mocks of fetch.
import assert from "node:assert/strict";
import { readerActivityNotifications } from "../../src/data/readerActivityNotifications.js";
import { markNotificationsRead } from "../../src/ui/notificationStore.js";
import { readFile } from "node:fs/promises";
import { request, uploadFile } from "../../src/api/runtime.js";
import {
  authenticate,
  runLibraryCommand,
  getLibrarySnapshot,
  refreshLibrary,
} from "../../src/ui/libraryStore.js";
import { bookCopiesService } from "../../src/services/bookCopiesService.js";
import { loanExtrasService } from "../../src/services/loanExtrasService.js";
import { reservationService } from "../../src/services/reservationService.js";

const pass = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result;
};
const as = async (name) =>
  pass(
    await authenticate({
      email: `${name}@cloudlibrary.demo`,
      password: {
        admin: "AdminDemo123!",
        reader: "ReaderDemo123!",
        author: "AuthorDemo123!",
      }[name],
    }),
  );
const run = async (name, input) => pass(await runLibraryCommand(name, input));

const health = await request("/health", { auth: false });
assert.equal(
  health.capabilities.mode,
  "local",
  "Only run this integration check against local test data.",
);
await as("admin");
const title = "Sách tích hợp adapters " + Date.now();
await run("book.save", {
  title,
  author: "Cloud Library",
  category: "Lập trình",
  availableCopies: 1,
});
let data = getLibrarySnapshot();
const book = data.books.find((row) => row.title === title);
const copy = data.bookCopies.find((row) => row.bookId === book.id);
pass(await bookCopiesService.update({ id: copy.id, status: "maintenance" }));
assert.equal(
  getLibrarySnapshot().bookCopies.find((row) => row.id === copy.id).status,
  "maintenance",
);
await refreshLibrary();
assert.equal(
  getLibrarySnapshot().bookCopies.find((row) => row.id === copy.id).status,
  "maintenance",
);
pass(await bookCopiesService.update({ id: copy.id, status: "available" }));
console.log("PASS new copy service updates the real API and reloaded snapshot");

await as("reader");
await run("favorite.toggle", { id: book.id, ensureSaved: true });
await refreshLibrary();
assert.ok(
  getLibrarySnapshot().favoriteIdsByEmail["reader@cloudlibrary.demo"].includes(
    book.id,
  ),
);
await run("loan.create", { bookId: book.id });
let loan = getLibrarySnapshot().requestsByEmail[
  "reader@cloudlibrary.demo"
].find((row) => row.bookId === book.id);
await as("admin");
await run("loan.action", {
  id: loan.id,
  version: loan.version,
  action: "approve",
});
loan = getLibrarySnapshot().requestsByEmail["reader@cloudlibrary.demo"].find(
  (row) => row.id === loan.id,
);
await run("loan.action", {
  id: loan.id,
  version: loan.version,
  action: "handover",
});
await as("reader");
loan = getLibrarySnapshot().requestsByEmail["reader@cloudlibrary.demo"].find(
  (row) => row.id === loan.id,
);
pass(await loanExtrasService.requestRenewal({ loan }));
await refreshLibrary();
loan = getLibrarySnapshot().requestsByEmail["reader@cloudlibrary.demo"].find(
  (row) => row.id === loan.id,
);
assert.equal(loan.renewalStatus, "pending");
await as("admin");
pass(await loanExtrasService.decideRenewal({ loan, approve: true }));
loan = getLibrarySnapshot().requestsByEmail["reader@cloudlibrary.demo"].find(
  (row) => row.id === loan.id,
);
assert.equal(loan.renewalStatus, "approved");
assert.equal(loan.renewalCount, 1);
console.log(
  "PASS favorites persist and new renewal services use versioned API commands",
);

await as("author");
pass(await reservationService.create({ book }));
await refreshLibrary();
let reservation = getLibrarySnapshot().reservations.find(
  (row) => row.bookId === book.id,
);
assert.equal(reservation.status, "waiting");
assert.equal(reservationService.getPosition([], reservation), 1);
await as("admin");
await run("loan.action", {
  id: loan.id,
  version: loan.version,
  action: "return",
});
await as("author");
reservation = getLibrarySnapshot().reservations.find(
  (row) => row.bookId === book.id,
);
assert.equal(reservation.status, "ready");
pass(await reservationService.requestPickup({ bookId: book.id }));
assert.ok(
  getLibrarySnapshot().requestsByEmail["author@cloudlibrary.demo"].some(
    (row) => row.bookId === book.id && row.status === "pending",
  ),
);
console.log(
  "PASS new reservation service stores queue, receives returned copy and requests pickup",
);

const image = new File([await readFile("src/assets/hero.png")], "cover.png", {
  type: "image/png",
});
const uploaded = await uploadFile(image, "cover");
const framing = { x: 23, y: 67, zoom: 1.45 };
await run("draft.save", {
  title: "Bìa bản gộp " + Date.now(),
  category: "Lập trình",
  description:
    "Bản thảo kiểm tra upload và lưu khung ảnh trong phiên tích hợp.",
  cover: uploaded.url,
  coverFraming: framing,
  chapters: [
    {
      id: "chapter-1",
      title: "Myan",
      content: "Myan nằm bên cửa sổ và đợi nắng lên.",
    },
  ],
});
let draft = getLibrarySnapshot().authorManuscripts.find(
  (row) => row.cover === uploaded.url,
);
assert.deepEqual(draft.coverFraming, framing);
await run("draft.submit", {
  id: draft.id,
  expectedRevision: draft.revision,
  rightsConfirmed: true,
});
await as("admin");
draft = getLibrarySnapshot().authorManuscripts.find(
  (row) => row.id === draft.id,
);
await run("draft.review", {
  id: draft.id,
  expectedRevision: draft.revision,
  decision: "publish",
});
await refreshLibrary();
const published = getLibrarySnapshot().books.find(
  (row) => row.manuscriptId === draft.id,
);
assert.deepEqual(published.coverFraming, framing);
assert.equal(published.cover, uploaded.url);
console.log(
  "PASS original API draft, upload and publication contracts remain unchanged",
);
const guest = await request("/snapshot", { auth: false });
assert.equal(
  guest.data.books.find((row) => row.id === published.id).cover,
  uploaded.url,
);
assert.deepEqual(
  guest.data.books.find((row) => row.id === published.id).chapters,
  [],
);
const coverResponse = await fetch(`http://127.0.0.1:3001/api/v1/files/${uploaded.id}`);
assert.equal(coverResponse.status, 200, "Published cover URL remains compatible with original file authorization.");
console.log("PASS public metadata keeps full text protected and original cover links still load");

await as("reader");
let notifications = readerActivityNotifications(
  getLibrarySnapshot(),
  getLibrarySnapshot().accounts.find(
    (row) => row.email === "reader@cloudlibrary.demo",
  ),
  getLibrarySnapshot().reservations,
);
const renewalNotice = notifications.find(
  (row) => row.type === "renewalRequested" && row.requestId === loan.id,
);
assert.ok(renewalNotice);
pass(await markNotificationsRead(renewalNotice.id));
await refreshLibrary();
assert.ok(
  getLibrarySnapshot().notificationReads["reader@cloudlibrary.demo"].includes(
    renewalNotice.id,
  ),
);
console.log(
  "PASS new activity notifications retain server read state after refreshing",
);

// New UI integration points exercise real HTTP, including authenticated binary reads.
await as("admin");
const { libraryReport, reportRange } = await import("../../src/data/libraryReports.js");
const filters = reportRange(7);
const freshStats = libraryReport((await request("/snapshot")).data, filters);
assert.equal(freshStats.allowed,true);
assert.equal(freshStats.error, "");
assert.equal(freshStats.from, filters.from);
assert.equal(freshStats.to, filters.to);
const firstSource = await request("/sources/standard-ebooks", {query:{q:"Jane",page:1},auth:false});
assert.ok(firstSource.data.length > 0);
console.log("PASS new statistics uses fresh authorized data and query parameters reach the source API");
const evidenceUser = `merge-${Date.now()}@example.org`;
pass(await authenticate({mode:"register",email:evidenceUser,password:"EvidenceTest123!",fullName:"Tác giả kiểm tra"}));
const { uploadLocal } = await import("../../src/api/localUploads.js");
const evidence = await uploadLocal(request, image, "evidence");
await run("application.submit", {
  fullName:"Tác giả kiểm tra",penName:"Myan Test",phone:"0123456789",
  bio:"Nội dung giới thiệu tác giả kiểm tra tích hợp frontend mới.",
  portfolioUrl:"",evidenceUploadId:evidence.id,confirmation:true,
});
const application = getLibrarySnapshot().authorApplications.find(row=>row.readerEmail===evidenceUser);
assert.equal(application.status,"pending");
assert.equal(application.evidenceUploadId,evidence.id);
await as("admin");
const blob = await request(`/files/${encodeURIComponent(evidence.id)}`, {responseType:"blob",timeoutMs:60000});
assert.equal(blob.type,"image/png");
assert.equal(blob.size,image.size);
console.log("PASS new evidence upload and admin download use unchanged API with protected binary content");
await run("application.review",{id:application.id,expectedSubmittedAt:application.submittedAt,decision:"approve"});
pass(await authenticate({email:evidenceUser,password:"EvidenceTest123!"}));
const pdf = new File(["%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"],"manuscript.pdf",{type:"application/pdf"});
const uploadedPdf=await uploadLocal(request,pdf,"content");
const pdfDraft=await run("draft.save",{title:"PDF từ giao diện Tuyền",category:"Lập trình",description:"Kiểm tra upload PDF bằng chức năng mới của giao diện.",pdfUrl:uploadedPdf.url,pdfUploadId:uploadedPdf.id,chapters:[]});
assert.equal(pdfDraft.record.pdfUploadId,uploadedPdf.id);
const pdfBlob=await request(`/files/${encodeURIComponent(uploadedPdf.id)}`,{responseType:"blob"});
assert.equal(pdfBlob.type,"application/pdf");
console.log("PASS new manuscript PDF file input can upload, save and retrieve its private file");
await request("/auth/password",{method:"POST",body:{currentPassword:"EvidenceTest123!",password:"ChangedTest123!"}});
pass(await authenticate({email:evidenceUser,password:"ChangedTest123!"}));
console.log("PASS profile password update accepts the new frontend fields and signs in with the new password");
