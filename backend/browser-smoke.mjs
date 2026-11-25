import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from '@playwright/test';
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:980}});
 const errors=[]; page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5173/api-local.html');
 await page.locator('.catalog-card').first().waitFor({timeout:60000});
 await page.getByTestId('local-switch-auth').click();
 const email=`browser-${randomUUID()}@example.invalid`, password='LocalBrowser-'+randomUUID();
 await page.locator('input[name=fullName]').fill('Browser Test'); await page.locator('input[name=email]').fill(email); await page.locator('input[name=password]').fill(password); await page.getByTestId('local-auth').click();
 await page.getByTestId('local-user').waitFor({timeout:60000});
 const favorite=page.locator('.catalog-card-favorite').first(); await favorite.waitFor(); await favorite.click();
 await page.waitForFunction(()=>document.querySelector('[data-testid=local-favorite-count]')?.textContent==='1',null,{timeout:60000});
 await page.getByTestId('local-logout').click(); await page.getByTestId('local-auth').waitFor({timeout:60000});
 // Switch from registration to login if the page still has the name field.
 if(await page.locator('input[name=fullName]').count()) await page.getByTestId('local-switch-auth').click();
 await page.locator('input[name=email]').fill(email); await page.locator('input[name=password]').fill(password); await page.getByTestId('local-auth').click();
 await page.getByTestId('local-user').waitFor({timeout:60000});
 await page.waitForFunction(()=>document.querySelector('[data-testid=local-favorite-count]')?.textContent==='1',null,{timeout:60000});
 await page.locator('.catalog-card-favorite[aria-pressed=true]').first().click();
 await page.waitForFunction(()=>document.querySelector('[data-testid=local-favorite-count]')?.textContent==='0',null,{timeout:60000});
 const available=page.locator('.catalog-card').filter({has:page.locator('.catalog-availability.is-available')}).first();
 await available.click(); await page.locator('dialog .borrow-button').click();
 await page.locator('.local-loan-row').filter({hasText:'pending'}).waitFor({timeout:60000});
 await page.locator('.local-loan-row').filter({hasText:'pending'}).locator('button').click();
 await page.locator('.local-loan-row').filter({hasText:'cancelled'}).waitFor({timeout:60000});
 await page.screenshot({path:'browser-api-local.png',fullPage:true});
 await page.getByTestId('local-logout').click(); await page.getByTestId('local-auth').waitFor({timeout:60000});
 await page.goto('http://127.0.0.1:5173/'); await page.locator('.app-layout').first().waitFor({timeout:60000});
 assert.deepEqual(errors,[]); console.log('PASS browser: real catalog, register/login/logout, persistent favorite, loan create/cancel, demo root loads');
} finally { await browser.close(); }
