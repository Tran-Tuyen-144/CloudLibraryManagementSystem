import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
const url='http://127.0.0.1:5173/';
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors=[];
try {
  const ctx=await browser.newContext({viewport:{width:1440,height:980}});
  const page=await ctx.newPage(); page.on('pageerror',e=>errors.push(e.message));
  const email=`ui-${randomUUID()}@example.invalid`, password=`LocalTest-${randomUUID()}`;
  async function auth(email,password,register=false) {
    await page.locator('.header-login-button').click();
    if(register) {
      await page.locator('.access-switch button').click();
      await page.locator('input[name=fullName]').fill('UI integration test');
      await page.locator('input[name=confirmPassword]').fill(password);
    }
    await page.locator('input[name=email]').fill(email);
    await page.locator('input[name=password]').fill(password);
    await page.locator('.access-submit').click();
    await page.locator('.header-logout-button, .management-account button').first().waitFor({timeout:30000});
  }
  async function logout() {
    await page.locator('.header-logout-button, .management-account button').first().click();
    await page.locator('.header-login-button').waitFor({timeout:30000});
  }
  const nav=label=>page.locator('.sidebar-nav').getByRole('button',{name:label,exact:true});
  await page.goto(url);
  await page.locator('.sidebar-nav').waitFor();
  await nav('Danh mục sách').click();
  await page.locator('.catalog-card').first().waitFor({timeout:30000});
  assert.equal(await page.locator('.sidebar-nav .sidebar-button').count()>1,true);
  console.log('PASS original root layout and real catalog');
  await auth(email,password,true);
  await nav('Danh mục sách').click();
  await page.locator('.catalog-card-favorite').first().click();
  await page.locator('.catalog-card-favorite[aria-pressed=true]').first().waitFor();
  await nav('Sách yêu thích').click();
  await page.locator('.catalog-card').first().waitFor();
  await logout(); await auth(email,password); await nav('Sách yêu thích').click();
  await page.locator('.catalog-card-favorite[aria-pressed=true]').first().waitFor();
  await page.locator('.catalog-card-favorite[aria-pressed=true]').first().click();
  await page.locator('.catalog-empty').waitFor();
  console.log('PASS original auth, persistent favorites and removal');
  await nav('Hồ sơ của tôi').click();
  await page.locator('input[name=fullName]').fill('UI Profile Updated');
  await page.locator('.reader-profile-form button[type=submit]').click();
  await page.locator('.header-account-name').filter({hasText:'UI Profile Updated'}).waitFor();
  console.log('PASS profile update');
  await nav('Sách đang mượn').click();
  const select=page.getByTestId('loan-create').locator('select'); await select.waitFor();
  const ids=await select.locator('option').evaluateAll(rows=>rows.map(o=>o.value).filter(Boolean));
  assert.ok(ids.length>0,'No available book in local test catalog');
  await select.selectOption(ids[0]); await page.getByTestId('loan-create').locator('button[type=submit]').click();
  await page.locator('[data-request-id] .loan-status.is-pending').first().waitFor();
  await page.locator('[data-request-id] .loan-button').first().click();
  await page.getByTestId('loan-history').locator('.loan-tabs button').last().click();
  await page.locator('[data-request-id] .loan-status.is-cancelled').first().waitFor();
  console.log('PASS original reader loan creation and cancellation');
  await select.selectOption(ids[0]); await page.getByTestId('loan-create').locator('button[type=submit]').click();
  await page.locator('[data-request-id] .loan-status.is-pending').first().waitFor();
  await logout(); await auth('librarian@cloudlibrary.demo','LibraryDemo123!');
  const staffRecord=()=>page.getByTestId('staff-loans').locator('.loan-record').filter({hasText:email});
  await staffRecord().filter({has:page.locator('.loan-status.is-pending')}).locator('.loan-button.is-primary').click();
  await page.getByTestId('staff-loans').locator('.loan-tabs button').nth(1).click();
  await staffRecord().filter({has:page.locator('.loan-status.is-approved')}).locator('.loan-button.is-primary').click();
  await page.locator('.loan-dialog button[type=submit]').click();
  await page.locator('.loan-dialog').waitFor({state:'detached'});
  await page.getByTestId('staff-loans').locator('.loan-tabs button').nth(2).click();
  await staffRecord().filter({has:page.locator('.loan-status.is-borrowed')}).locator('.loan-button.is-primary').click();
  await page.locator('.loan-dialog button[type=submit]').click();
  await page.locator('.loan-dialog').waitFor({state:'detached'});
  await page.getByTestId('staff-loans').locator('.loan-tabs button').last().click();
  await staffRecord().filter({has:page.locator('.loan-status.is-returned')}).waitFor();
  await logout(); await auth(email,password); await nav('Sách đang mượn').click();
  await page.getByTestId('loan-history').locator('.loan-tabs button').last().click();
  await page.locator('[data-request-id] .loan-status.is-returned').first().waitFor();
  console.log('PASS staff approve/handover/return and reader synchronization');
  await logout();
  await page.goto(url+'?demo=1'); await page.locator('.sidebar-nav').waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS demo comparison route loads; no uncaught browser exceptions');
} finally { await browser.close(); }
