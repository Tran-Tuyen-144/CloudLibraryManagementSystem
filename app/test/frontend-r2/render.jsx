import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import App from "../../src/App.jsx";
import AuthPage from "../../src/pages/AuthPage.jsx";
import AuthorDraftForm from "../../src/pages/AuthorDraftForm.jsx";
import ManuscriptReviewPage from "../../src/pages/ManuscriptReviewPage.jsx";
import AuthorApplicationsPage from "../../src/pages/AuthorApplicationsPage.jsx";
import CategoriesManagementPage from "../../src/pages/CategoriesManagementPage.jsx";
import ManagementModules from "../../src/pages/ManagementModules.jsx";
import PermissionPage from "../../src/pages/PermissionPage.jsx";
import ProfilePage from "../../src/pages/ProfilePage.jsx";
import { featureRequest } from "../../src/hooks/useServerLibrary.js";
import ReaderPage from "../../src/pages/ReaderPage.jsx";
import { authenticate, getLibrarySnapshot, runLibraryCommand } from "../../src/ui/libraryStore.js";
import { request } from "../../src/api/runtime.js";

const passwords = { admin: "AdminDemo123!", reader: "ReaderDemo123!", author: "AuthorDemo123!", librarian: "LibraryDemo123!" };
const noop=()=>{};
async function as(name) {
  const result=await authenticate({email:`${name}@cloudlibrary.demo`,password:passwords[name]});
  assert.equal(result.ok,true,JSON.stringify(result));
  return result.user;
}
function absent(html, phrase) { assert.equal(html.includes(phrase),false,`Old UI still rendered: ${phrase}`); }
let user=await as("reader");
let html=renderToStaticMarkup(<App/>);
absent(html,"Nghe &amp; hỏi");absent(html,"Đặt trước &amp; gia hạn");
absent(html,"api-book-discovery");
assert.ok(html.includes("book-carousel"));
await writeFile(".local/render-reader.html",html);
console.log("PASS reader uses new carousel and sidebar without removed service/voice routes");
const auth=renderToStaticMarkup(<AuthPage onAuthenticate={noop} onBack={noop}/>);
absent(auth,"Đăng nhập qua Cognito");
const liveAuth=renderToStaticMarkup(<AuthPage live onAuthenticate={noop} onBack={noop}/>);
assert.ok(liveAuth.includes("Quên mật khẩu"));
console.log("PASS sign-in renders the supplied new form with new password recovery control");
user=await as("author");
let result=await runLibraryCommand("draft.save",{title:"Bản thảo kiểm tra giao diện R2",category:"Lập trình",description:"Kiểm tra các nút duyệt của frontend mới không khôi phục thao tác cũ.",chapters:[{id:"one",title:"Một",content:"Nội dung kiểm tra giao diện."}]});
assert.equal(result.ok,true);
let pending=result.record;
result=await runLibraryCommand("draft.submit",{id:pending.id,expectedRevision:pending.revision,rightsConfirmed:true});
assert.equal(result.ok,true);
user=await as("admin");html=renderToStaticMarkup(<App/>);
absent(html,"Dịch vụ thư viện");absent(html,"Mở giao diện độc giả");
await writeFile(".local/render-admin.html",html);
for(const [Component,title,props] of [
 [ManuscriptReviewPage,"Duyệt xuất bản tác phẩm",{}],
 [AuthorApplicationsPage,"Duyệt đăng ký tác giả",{}],
 [CategoriesManagementPage,"Quản lý thể loại",{}],
 [ManagementModules,"Kho sách",{kind:"books"}],
 [PermissionPage,"Quyền tài khoản",{user}],
]) {
 const result=renderToStaticMarkup(<Component {...props}/>);
 assert.equal(new RegExp(`<h2[^>]*>${title}</h2>`).test(result),false,`Duplicate old heading: ${title}`);
}
console.log("PASS admin keeps new navigation, two review actions and no old duplicate subheadings");
const review=renderToStaticMarkup(<ManuscriptReviewPage/>);
assert.ok(review.includes('value="publish"')); assert.ok(review.includes('value="reject"')); assert.equal(/<button[^>]*value="changes_requested"/.test(review), false);
absent(review,"Từ chối xuất bản");absent(review,"Yêu cầu chỉnh sửa");
user=await as("author");
const draft=renderToStaticMarkup(<AuthorDraftForm draft={{ cover: "https://example.org/cover.jpg", coverFraming: {x:25,y:75,zoom:1.5} }} user={user} authorName="Author" onSave={noop} onCancel={noop} language="vi" local={{featureRequest}}/>);
absent(draft,"Tải ảnh bìa");assert.ok(draft.includes('name="pdfFile"'));assert.ok(draft.includes("Liên kết ảnh bìa")); assert.ok(draft.includes("author-cover-framing"));
await writeFile(".local/render-draft.html",draft);
console.log("PASS new Tuyền draft editor keeps cover links, framing and new PDF file input");
user=await as("reader");
const source=getLibrarySnapshot().books.find((book)=>book.hasChapters);
const access=await request(`/books/${encodeURIComponent(source.id)}/read-access`,{method:"POST"});
const reader=renderToStaticMarkup(<ReaderPage book={access.data} user={user} onBack={noop}/>);
assert.ok(reader.includes('class="reader-audio"'));
console.log("PASS online reader renders the new in-page audio player");
const profile = renderToStaticMarkup(<ProfilePage live local={{featureRequest}} user={user} favoriteCount={0} onBrowseFavorites={noop} onUpdateProfile={noop}/>);
assert.ok(profile.includes('name="currentPassword"')); assert.ok(profile.includes('name="confirmPassword"'));
const appHtml=renderToStaticMarkup(<App/>);
assert.ok(appHtml.includes('data-live="true"')); assert.ok(appHtml.includes('local-refresh-button'));
console.log("PASS new profile password fields and live data refresh control are present");
