import assert from 'node:assert/strict';
import test from 'node:test';
import {loadReading,readingPayload,readPath} from '../frontend/src/api/readingLocal.js';
import {uploadLocal,privateFilePath} from '../frontend/src/api/localUploads.js';
import {createApiClient} from '../frontend/src/api/client.js';
const book={id:'a',title:'Book',revisionId:'r1',chapters:[{id:'c1',content:'hello',title:'One'}]};
test('read access uses protected route and revision-bound position',async()=>{
 const calls=[];const api=async(path)=>{calls.push(path);return path.endsWith('read-access')?{data:book}:{data:{revisionId:'old',page:20},settings:{turning:'swipe'}}};
 const data=await loadReading(api,'a');assert.deepEqual(data.progress,{});assert.equal(data.settings.turning,'swipe');assert.equal(data.pdf,null);assert.deepEqual(calls,['/books/a/read-access','/me/progress/a']);
 assert.deepEqual(readingPayload(book,{chapterId:'c1',mode:'text',page:1,textScroll:.4},'swipe'),{mode:'text',page:1,chapterId:'c1',textScroll:.4,updatedAt:null,revisionId:'r1',turning:'swipe'});
 assert.throws(()=>readPath('..'));
});
test('PDF uses authenticated binary route; foreign and mismatched links rejected',async()=>{
 const api=async(path)=>path.endsWith('read-access')?{data:{...book,pdfUrl:'http://127.0.0.1:5173/api/v1/books/a/content'}}:path.endsWith('content')?new Blob(['%PDF-1.7'],{type:'application/pdf'}):{data:null};
 assert.equal((await loadReading(api,'a')).pdf.type,'application/pdf');
 await assert.rejects(loadReading(async path=>path.endsWith('read-access')?{data:{...book,pdfUrl:'https://other.invalid/api/v1/books/a/content'}}:{data:null},'a'),/Invalid local PDF endpoint/);
});
test('multipart preserves browser boundary and authorization; completion is verified',async()=>{
 const requests=[];const api=createApiClient({getAccessToken:()=> 'local-token',fetchImpl:async(url,options)=>{requests.push({url,options});return new Response(JSON.stringify({id:'abc-123',complete:true,url:'http://127.0.0.1:5173/api/v1/files/abc-123'}),{status:200});}});
 const file=new File(['%PDF-1.7'],'test.pdf',{type:'application/pdf'});
 assert.equal((await uploadLocal(api,file,'content')).id,'abc-123');assert.equal(requests.length,2);assert.ok(requests[0].options.body instanceof FormData);assert.equal(requests[0].options.headers.has('Content-Type'),false);assert.equal(requests[0].options.headers.get('Authorization'),'Bearer local-token');assert.equal(requests[0].options.body.get('purpose'),'content');assert.match(requests[1].url,/uploads\/abc-123\/complete$/);
 assert.equal(privateFilePath('http://127.0.0.1:5173/api/v1/files/abc-123'),'/files/abc-123');assert.equal(privateFilePath('https://other.invalid/api/v1/files/abc-123'),null);await assert.rejects(uploadLocal(api,new File(['x'],'x.txt',{type:'text/plain'}),'content'));
});
