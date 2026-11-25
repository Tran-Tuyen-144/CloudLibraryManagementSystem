import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
const url='http://127.0.0.1:5173/',base='http://127.0.0.1:3001/api/v1';
async function api(path,token,body,method=body===undefined?'GET':'POST'){
 const res=await fetch(base+path,{method,headers:{...(token?{Authorization:`Bearer ${token}`} : {}),...(method!=='GET'?{'Idempotency-Key':randomUUID()}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const data=await res.json();assert.ok(res.ok,`${path} HTTP ${res.status}: ${data.error?.code||''}`);return data;
}
const email=`reader-more-${randomUUID()}@example.invalid`,password=`Local-${randomUUID()}`;
const reader=(await api('/auth/register',null,{email,password,fullName:'Reading test'})).accessToken;
const admin=(await api('/auth/login',null,{email:'admin@cloudlibrary.demo',password:'AdminDemo123!'})).accessToken;
const browser=await chromium.launch({channel:'msedge',headless:true});const context=await browser.newContext({viewport:{width:1440,height:980}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const nav=label=>page.locator('.sidebar-nav').getByRole('button',{name:label,exact:true});
async function login(email,password){await page.locator('.header-login-button').click();await page.locator('input[name=email]').fill(email);await page.locator('input[name=password]').fill(password);await page.locator('.access-submit').click();await page.locator('.header-logout-button, .management-account button').first().waitFor({timeout:30000});}
async function logout(){await page.locator('.header-logout-button, .management-account button').first().click();await page.locator('.header-login-button').waitFor({timeout:30000});}
async function eventually(fn,label){for(let i=0;i<50;i++){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error(label);}
let categoryId;
try{
 await page.goto(url);await login(email,password);await nav('Danh mục sách').click();
 await page.locator('.catalog-card').filter({hasText:'Hướng dẫn sử dụng Cloud Library'}).click();await page.locator('.book-modal').getByRole('button',{name:'Đọc online',exact:true}).click();
 await page.locator('.online-reader-modes').waitFor({timeout:30000});await page.locator('.online-reader-modes').getByRole('button',{name:'Đọc chữ',exact:true}).click();
 await page.locator('.online-reader-navigation select').selectOption('guide-2');
 await eventually(async()=>{const p=(await api('/me/progress/library-guide',reader)).data;return p?.chapterId==='guide-2'&&p.mode==='text'&&p.revisionId==='library-guide-v1';},'Reader progress was not saved to DB');
 await page.locator('.online-reader-actions').getByRole('button',{name:'Về danh mục',exact:true}).click();await nav('Khám phá').click();await page.locator('.reading-history-card').filter({hasText:'Hướng dẫn sử dụng Cloud Library'}).waitFor({timeout:30000});
 console.log('PASS original reader, chapter navigation, backend bookmark and continue-reading card');
 await nav('Trợ lý AI').click();await page.locator('.assistant-composer textarea').fill('Hướng dẫn sử dụng thư viện');await page.locator('.assistant-composer button[type=submit]').click();await page.locator('.assistant-message.is-assistant').first().waitFor({timeout:30000});await eventually(async()=>{const {items}=await api('/chat/sessions',reader);return items.some(s=>s.messages.some(m=>m.role==='assistant'&&m.text));},'Local chat reply not persisted');
 await nav('Khám phá').click();await nav('Trợ lý AI').click();await page.locator('.assistant-thread').first().waitFor();await page.locator('.assistant-thread').first().click();await page.locator('.assistant-message.is-assistant').first().waitFor();console.log('PASS local rule-based assistant and server chat history');
 await nav('Đăng ký tác giả').click();await page.locator('input[name=fullName]').fill('Reading test');await page.locator('input[name=penName]').fill('Local Test '+randomUUID().slice(0,8));await page.locator('input[name=phone]').fill('0901234567');await page.locator('textarea[name=bio]').fill('Hồ sơ tác giả thử nghiệm, nội dung mẫu để kiểm tra quyền truy cập.');await page.locator('input[name=portfolioUrl]').fill('https://example.invalid/portfolio');await page.locator('input[name=confirmation]').check();await page.locator('.reader-panel form button[type=submit]').click();
 await eventually(async()=>{const snapshot=(await api('/snapshot',reader)).data;return snapshot.authorApplications.some(a=>a.status==='pending');},'Author application not persisted');console.log('PASS original author application');
 await logout();await login('admin@cloudlibrary.demo','AdminDemo123!');
 await page.locator('.management-nav').getByRole('button',{name:'Thể loại',exact:true}).click();const name='Test category '+randomUUID().slice(0,8);await page.locator('.categories-page form input').fill(name);await page.locator('.categories-page form button[type=submit]').click();await eventually(async()=>{const c=(await api('/snapshot',admin)).data.categories.find(c=>c.name===name);categoryId=c?.id;return Boolean(c);},'Category not persisted');
 console.log('PASS category create through original admin UI');
 assert.deepEqual(errors,[]);
}finally{
 await browser.close();
 if(categoryId){const cat=(await api('/snapshot',admin)).data.categories.find(c=>c.id===categoryId);if(cat)await api('/commands',admin,{command:'category.delete',input:{id:cat.id,expectedName:cat.name,replacementId:''}}).catch(()=>{});}
 await api('/auth/logout',reader,{}).catch(()=>{});await api('/auth/logout',admin,{}).catch(()=>{});
}
