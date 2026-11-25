import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {chromium} from "@playwright/test";
const url="http://127.0.0.1:5173/", base="http://127.0.0.1:3001/api/v1";
async function api(path,token,body){const response=await fetch(base+path,{method:body===undefined?"GET":"POST",headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(body!==undefined?{"Content-Type":"application/json","Idempotency-Key":randomUUID()}: {})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.ok(response.ok,`${path}: ${response.status} ${data.error?.code||""}`);return data;}
const admin=(await api("/auth/login",null,{email:"admin@cloudlibrary.demo",password:"AdminDemo123!"})).accessToken;
const snapshot=async token=>(await api("/snapshot",token)).data;
const command=(token,command,input)=>api("/commands",token,{command,input});
const title=`Step17 inventory test ${randomUUID().slice(0,8)}`;
const initial=await snapshot(admin);
const category=initial.categories[0].name;
const book=(await command(admin,"book.save",{title,author:"Integration test",category,availableCopies:1})).record;
const copy=(await snapshot(admin)).bookCopies.find(row=>row.bookId===book.id);
assert.ok(copy);
await command(admin,"copy.update",{id:copy.id,status:"maintenance"});
const email=`inventory-${randomUUID()}@example.invalid`, password=`Local-${randomUUID()}`;
const reader=(await api("/auth/register",null,{email,password,fullName:"Inventory UI test"})).accessToken;
const browser=await chromium.launch({channel:"msedge",headless:true});
const ctx=await browser.newContext({viewport:{width:1440,height:980}});const page=await ctx.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));page.on("dialog",d=>d.accept());
async function login(email,password){await page.locator(".header-login-button").click();await page.locator('input[name=email]').fill(email);await page.locator('input[name=password]').fill(password);await page.locator('.access-submit').click();await page.locator('.header-logout-button, .management-account button').first().waitFor({timeout:30000});}
async function logout(){await page.locator('.header-logout-button, .management-account button').first().click();await page.locator('.header-login-button').waitFor({timeout:30000});}
const nav=label=>page.locator('.sidebar-nav').getByRole('button',{name:label,exact:true});
async function refresh(){await page.getByRole('button',{name:'Tải lại dữ liệu',exact:true}).click();}
try{
 await page.goto(url);await login(email,password);await nav('Sách đang mượn').click();
 const form=page.getByTestId('reservation-create');await form.locator('select').locator(`option[value="${book.id}"]`).waitFor({state:'attached',timeout:30000});await form.locator('select').selectOption(book.id);await form.locator('button[type=submit]').click();
 let row=page.getByTestId('reservation-history').locator('.loan-record').filter({hasText:title});await row.waitFor();assert.ok((await snapshot(reader)).reservations.some(r=>r.bookId===book.id&&r.status==='waiting'));
 await row.getByRole('button',{name:'Hủy yêu cầu',exact:true}).click();await row.waitFor({state:'detached'});assert.ok((await snapshot(reader)).reservations.some(r=>r.bookId===book.id&&r.status==='cancelled'));
 await form.locator('select').selectOption(book.id);await form.locator('button[type=submit]').click();await row.waitFor();console.log('PASS reservation create/cancel via original reader panel');
 await logout();await login('admin@cloudlibrary.demo','AdminDemo123!');await page.locator('.management-nav').getByRole('button',{name:'Kho sách',exact:true}).click();const panel=page.getByTestId('copy-inventory');await panel.locator('input').fill(copy.code);const copyRow=panel.locator('.loan-record').filter({hasText:copy.code});await copyRow.getByRole('button',{name:'Đưa vào phục vụ',exact:true}).click();await copyRow.locator('.loan-status.is-held').waitFor({timeout:30000});
 assert.equal((await snapshot(admin)).reservations.find(r=>r.bookId===book.id&&r.status==='ready')?.readerEmail,email);console.log('PASS admin copy maintenance and backend queue promotion');
 await logout();await login(email,password);await nav('Sách đang mượn').click();const loanForm=page.getByTestId('loan-create');await loanForm.locator('select').locator(`option[value="${book.id}"]`).waitFor({state:'attached'});await loanForm.locator('select').selectOption(book.id);await loanForm.locator('button[type=submit]').click();await page.getByTestId('loan-history').locator('[data-request-id]').filter({hasText:title}).waitFor();
 const loan=(await snapshot(reader)).requestsByEmail[email].find(r=>r.bookId===book.id);assert.ok(loan);
 let v=await command(admin,'loan.action',{id:loan.id,version:loan.version,action:'approve'});await command(admin,'loan.action',{id:loan.id,version:v.record.version,action:'handover'});await refresh();
 const extras=page.getByTestId('loan-extras');const extraRow=extras.locator('.loan-record').filter({hasText:title});await extraRow.getByRole('button',{name:'Xin gia hạn',exact:true}).click();await extraRow.getByText('Đang chờ thủ thư duyệt',{exact:true}).waitFor();
 await logout();await login('librarian@cloudlibrary.demo','LibraryDemo123!');const staffRow=page.getByTestId('loan-extras').locator('.loan-record').filter({hasText:title});await staffRow.getByRole('button',{name:'Duyệt gia hạn',exact:true}).click();await staffRow.waitFor({state:'detached'});assert.equal((await snapshot(reader)).requestsByEmail[email].find(r=>r.id===loan.id).renewalStatus,'approved');console.log('PASS renewal request and staff approval through original panels');
 await logout();await login(email,password);await page.locator('.notification-bell').click();const dialog=page.locator('.notification-dialog');await dialog.locator('.notification-entry').first().waitFor();await dialog.getByRole('button',{name:'Đánh dấu tất cả đã đọc',exact:true}).click();await dialog.locator('.notification-list .is-unread').first().waitFor({state:'detached'});assert.ok((await snapshot(reader)).notifications.every(n=>n.read));console.log('PASS backend notification read in original header');
 assert.deepEqual(errors,[]);
 const completed=(await snapshot(reader)).requestsByEmail[email].find(r=>r.id===loan.id);
 await command(admin,'loan.action',{id:loan.id,version:completed.version,action:'return'});
 await command(admin,'book.archive',{id:book.id,archived:true});
}finally{await browser.close();await api('/auth/logout',reader,{}).catch(()=>{});await api('/auth/logout',admin,{}).catch(()=>{});}
// Test history stays in isolated in-memory DB; the test book is archived on success. No real payment or date manipulation.
