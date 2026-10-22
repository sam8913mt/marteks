// آزمایش سرتاسری رابط پنل با Chrome (puppeteer) + منطق واقعی Edge Function روی Supabase ساختگی.
// اجرا: NODE_PATH=<مسیر puppeteer> node _private/tests/admin-ui.e2e.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/admin-users/handler.ts';
import { mkWorld, mkDeps, ADMIN_ID, USER_ID } from './fake-supabase.mjs';

const require = createRequire('/home/claude/.npm-global/lib/node_modules/@mermaid-js/mermaid-cli/');
const puppeteer = require('puppeteer');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SB = 'https://xpkckkosnnixshbarieo.supabase.co';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:' + server.address().port;

const world = mkWorld();
world.now = Date.now();
world.authUsers[1].created_at = new Date().toISOString();
const deps = mkDeps(world, { ALLOWED_ORIGINS: ORIGIN });
deps.now = () => Date.now();
const handler = createHandler(deps);

let loginToken = 'admin-token';
const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const results = [];
const ok = (name) => { results.push(name); console.log('✓', name); };

async function newPage(w = 1280, h = 900) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_FAILED|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.setRequestInterception(true);
  page.on('request', async (req) => {
    const u = new URL(req.url());
    if (u.origin === ORIGIN) return req.continue();
    if (u.origin !== SB) return req.abort();           // فونت‌ها و ... بیرون نمی‌روند
    const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
    const json = (status, body, extra = {}) => req.respond({ status, contentType: 'application/json', headers: { ...cors, ...extra }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS' && !u.pathname.startsWith('/functions/')) return req.respond({ status: 204, headers: cors });
    if (u.pathname === '/auth/v1/token') return json(200, { access_token: loginToken, refresh_token: 'rt', expires_in: 3600, token_type: 'bearer' });
    if (u.pathname === '/rest/v1/rpc/is_admin') return json(200, true);
    if (u.pathname.startsWith('/rest/v1/')) return json(200, []);
    if (u.pathname === '/functions/v1/admin-users') {
      const headers = req.headers();
      const r = await handler(new Request(req.url(), { method: req.method(), headers, body: req.method() === 'POST' ? req.postData() : undefined }));
      const h = {}; r.headers.forEach((v, k) => { h[k] = v; });
      return req.respond({ status: r.status, headers: h, body: r.status === 204 ? '' : await r.text() });
    }
    return json(404, { message: 'nf' });
  });
  page.errors = errors;
  return page;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function login(page) {
  await page.goto(ORIGIN + '/admin.html', { waitUntil: 'domcontentloaded' });
  await page.type('#adEmail', 'admin@x.ir'); await page.type('#adPass', 'secret123');
  await page.click('#adLoginBtn');
  await page.waitForSelector('#adApp:not([hidden])', { timeout: 5000 });
}
const rows = (page) => page.$$eval('#userBox tbody tr', (trs) => trs.map((t) => t.innerText.replace(/\s+/g, ' ').trim()));
const waitRows = async (page, n) => { await page.waitForFunction((n) => document.querySelectorAll('#userBox tbody tr').length === n, { timeout: 5000 }, n); };

try {
  /* ---- مدیر ---- */
  const page = await newPage();
  await login(page);
  ok('ورود مدیر');

  await page.click('button[data-tab="users"]');
  await waitRows(page, 4);
  const stats = await page.$eval('#userStats', (e) => e.innerText.replace(/\s+/g, ' '));
  assert.match(stats, /۴ کل کاربران/); assert.match(stats, /۳ ایمیل تأییدشده/); assert.match(stats, /۱ ایمیل تأییدنشده/); assert.match(stats, /۱ ثبت‌نام امروز/); assert.match(stats, /۱ حساب غیرفعال/);
  const r0 = await rows(page);
  assert.ok(r0.some((r) => r.includes('علی رضایی') && r.includes('ali@x.ir') && r.includes('تأییدشده')));
  assert.ok(r0.some((r) => r.includes('sara@x.ir') && r.includes('تأییدنشده') && r.includes('بدون پروفایل')));
  assert.ok(r0.some((r) => r.includes('off@x.ir') && r.includes('غیرفعال')));
  ok('جدول و کارت‌های آماری از Edge Function (داده واقعی، نه نمونه)');

  assert.ok((await page.content()).indexOf('service') === -1 || true);
  const html = await page.content();
  assert.ok(!/service_role|sb_secret/i.test(html) );
  ok('کلید محرمانه‌ای در صفحه نیست');

  await page.type('#userSearch', 'رضایی'); await waitRows(page, 1);
  await page.$eval('#userSearch', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await waitRows(page, 4);
  await page.select('#userVerified', 'unverified'); await waitRows(page, 1);
  await page.select('#userVerified', 'all'); await waitRows(page, 4);
  await page.select('#userStatus', 'disabled'); await waitRows(page, 1);
  await page.select('#userStatus', 'all'); await waitRows(page, 4);
  await page.select('#userSort', 'oldest'); await sleep(300);
  assert.ok((await rows(page))[0].includes('admin@x.ir'));
  await page.select('#userSort', 'newest');
  await page.select('#userPageSize', '10'); await waitRows(page, 4);
  await page.type('#userSearch', 'zzzz'); await page.waitForSelector('#userBox .ad-empty');
  assert.match(await page.$eval('#userBox', (e) => e.innerText), /پیدا نشد/);
  await page.$eval('#userSearch', (e) => { e.value = ''; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await waitRows(page, 4);
  ok('جست‌وجو، فیلتر، مرتب‌سازی، پیام «نتیجه‌ای نیست»');

  for (const w of [1280, 1100, 1024]) {
    await page.setViewport({ width: w, height: 900 }); await sleep(120);
    const o = await page.evaluate(() => { const e = document.querySelector('.ad-table-wrap'); return e.scrollWidth - e.clientWidth; });
    assert.ok(o <= 1, 'جدول در عرض ' + w + ' بیرون می‌زند: ' + o);
  }
  await page.setViewport({ width: 1280, height: 900 });
  await page.screenshot({ path: '/tmp/shot-desktop.png' });
  ok('جدول دسکتاپ در عرض‌های ۱۰۲۴ تا ۱۲۸۰ بدون اسکرول افقی');

  // جزئیات
  await page.click('button.ad-link[data-uview="' + USER_ID + '"]');
  await page.waitForSelector('#userDialog[open] .ad-dl');
  const dtext = await page.$eval('#userDialogBody', (e) => e.innerText);
  assert.ok(dtext.includes(USER_ID) && dtext.includes('ali@x.ir') && dtext.includes('09121111111'));
  assert.ok(!/password|رمز عبور:|token\b/i.test(dtext.replace('رمز عبور، توکن نشست و کدهای تأیید در هیچ‌جا نمایش داده نمی‌شوند.', '')));
  ok('جزئیات کاربر، بدون اطلاعات حساس');
  await page.screenshot({ path: '/tmp/shot-detail.png' });

  // ویرایش
  await page.click('#userDialogBody [data-uedit]');
  await page.waitForSelector('#ueFirst');
  await page.$eval('#ueFirst', (e) => { e.value = ''; });
  await page.type('#ueFirst', 'علیرضا');
  await page.$eval('#uePhone', (e) => { e.value = ''; });
  await page.type('#uePhone', '09000000000');          // شمارهٔ مدیر → تکراری
  await page.click('#ueSave');
  await page.waitForFunction(() => !document.querySelector('.ad-form-err').hidden);
  assert.match(await page.$eval('.ad-form-err', (e) => e.innerText), /قبلاً/);
  await page.$eval('#uePhone', (e) => { e.value = ''; });
  await page.type('#uePhone', '۰۹۱۲۳۳۳۳۳۳۳');
  await page.click('#ueSave');
  await page.waitForFunction(() => !document.querySelector('#userDialog').open);
  await page.waitForFunction(() => document.querySelector('#userBox').innerText.includes('علیرضا'));
  assert.equal(world.profiles[1].phone, '09123333333');
  ok('ویرایش پروفایل (خطای شمارهٔ تکراری، ذخیرهٔ موفق، به‌روزرسانی جدول)');

  // غیرفعال‌سازی
  await page.click('button[data-utoggle="' + USER_ID + '"]');
  await page.waitForSelector('#utGo'); await page.click('#utGo');
  await page.waitForFunction(() => !document.querySelector('#userDialog').open);
  await page.waitForFunction((id) => { const b = document.querySelector('button[data-utoggle="' + id + '"]'); return b && b.dataset.to === 'enable'; }, {}, USER_ID);
  assert.ok(world.authUsers[1].banned_until); assert.deepEqual(world.revoked, [USER_ID]);
  ok('غیرفعال‌سازی واقعی (ban در Auth + قطع نشست‌ها)');
  await page.click('button[data-utoggle="' + USER_ID + '"]');
  await page.waitForSelector('#utGo'); await page.click('#utGo');
  await page.waitForFunction((id) => { const b = document.querySelector('button[data-utoggle="' + id + '"]'); return b && b.dataset.to === 'disable'; }, {}, USER_ID);
  assert.equal(world.authUsers[1].banned_until, null);
  ok('فعال‌سازی مجدد');

  // حذف
  await page.click('button[data-udel="' + USER_ID + '"]');
  await page.waitForSelector('#udMail');
  assert.equal(await page.$eval('#udGo', (e) => e.disabled), true);
  await page.type('#udMail', 'wrong@x.ir');
  assert.equal(await page.$eval('#udGo', (e) => e.disabled), true);
  await page.$eval('#udMail', (e) => { e.value = ''; });
  await page.type('#udMail', 'ALI@x.ir');
  assert.equal(await page.$eval('#udGo', (e) => e.disabled), false);
  await page.screenshot({ path: '/tmp/shot-delete.png' });
  await page.click('#udGo');
  await page.waitForFunction(() => !document.querySelector('#userDialog').open);
  await waitRows(page, 3);
  assert.equal(world.authUsers.length, 3); assert.ok(!world.profiles.some((p) => p.id === USER_ID));
  ok('حذف با تأیید دوباره (تایپ ایمیل)، بدون پروفایل یتیم');

  // تاریخچه
  await page.click('#userAuditBtn');
  await page.waitForSelector('#userDialog[open] .ad-hist');
  const hist = await page.$eval('#userDialogBody', (e) => e.innerText);
  for (const w of ['ویرایش پروفایل', 'غیرفعال‌سازی حساب', 'فعال‌سازی حساب', 'حذف حساب']) assert.ok(hist.includes(w), w);
  assert.ok(hist.includes('admin@x.ir'));
  await page.screenshot({ path: '/tmp/shot-audit.png' });
  await page.click('#userDialogClose');
  ok('تاریخچهٔ مدیریتی (چه کسی، چه کاری)');

  // CSV
  const dl = [];
  await page.evaluate(() => { window.confirm = () => true; window.__blobs = []; const o = URL.createObjectURL; URL.createObjectURL = (b) => { window.__blobs.push(b); return o.call(URL, b); }; });
  await page.click('#userExport');
  await page.waitForFunction(() => window.__blobs.length === 1);
  const bytes = await page.evaluate(async () => Array.from(new Uint8Array(await window.__blobs[0].arrayBuffer()).slice(0, 3)));
  assert.deepEqual(bytes, [0xEF, 0xBB, 0xBF]);   // UTF-8 BOM برای باز شدن درست فارسی در Excel
  const csvText = await page.evaluate(() => window.__blobs[0].text());
  assert.ok(csvText.startsWith('"first_name"')); assert.ok(csvText.includes('sara@x.ir')); assert.ok(!/password|token/i.test(csvText));
  assert.equal(world.audit.at(-1).action, 'export_users');
  ok('خروجی CSV و ثبت آن در گزارش');

  // سایر تب‌ها هنوز کار می‌کنند
  for (const tab of ['orders', 'chats', 'projects', 'team', 'testimonials', 'comments']) {
    await page.click('button[data-tab="' + tab + '"]'); await sleep(150);
    assert.equal(await page.$eval('#pane' + tab[0].toUpperCase() + tab.slice(1), (e) => e.hidden), false, tab);
  }
  assert.equal(await page.$eval('#paneUsers', (e) => e.hidden), true);
  ok('تب‌های قبلی (سفارش‌ها، گفتگوها، پروژه‌ها، تیم، مشتریان، نظرات) سالم‌اند');
  assert.deepEqual(page.errors, [], page.errors.join('\n'));
  ok('بدون خطای JavaScript');

  // خروج → پاک شدن داده کاربران از صفحه
  await page.click('#adLogout');
  await page.waitForSelector('#adLogin:not([hidden])');
  assert.equal(await page.$eval('#userBox', (e) => e.innerHTML), '');
  ok('خروج، داده کاربران را از صفحه پاک می‌کند');
  await page.close();

  /* ---- موبایل ---- */
  const m = await newPage(390, 800);
  await login(m);
  await m.click('button[data-tab="users"]'); await waitRows(m, 3);
  const over = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 1, 'افقی اسکرول شد: ' + over);
  await m.screenshot({ path: '/tmp/shot-mobile.png', fullPage: false });
  ok('نمایش موبایل بدون اسکرول افقی');
  await m.close();

  /* ---- کاربر عادی (توکن غیرمدیر) ---- */
  loginToken = 'user-token';
  const u = await newPage();
  await login(u);                       // is_admin کلاینت mock = true؛ سرور باید رد کند
  await u.click('button[data-tab="users"]');
  await u.waitForSelector('#userBox .ad-err', { timeout: 5000 });
  assert.match(await u.$eval('#userBox', (e) => e.innerText), /اجازه/);
  assert.equal(await u.$$eval('#userBox tbody tr', (e) => e.length), 0);
  ok('کاربر غیرمدیر: سرور رد می‌کند و هیچ داده‌ای نمایش داده نمی‌شود');
  await u.close();
} catch (e) {
  console.error('✗ FAILED:', e && e.stack || e);
  process.exitCode = 1;
} finally {
  await browser.close(); server.close();
  console.log('\n' + results.length + ' بررسی موفق');
}
