// آزمایش منطق Edge Function با یک Supabase ساختگی (بدون شبکه).
// اجرا:  node --test _private/tests/admin-users.test.mjs      (Node 22.18+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../supabase/functions/admin-users/handler.ts';
import { ORIGIN, ADMIN_ID, USER_ID, mkWorld, mkDeps } from './fake-supabase.mjs';

function call(handler, body, { token = 'admin-token', origin = ORIGIN, method = 'POST', raw } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  if (origin) headers.origin = origin;
  return handler(new Request('https://p.supabase.co/functions/v1/admin-users', { method, headers, body: method === 'POST' ? (raw ?? JSON.stringify(body)) : undefined }))
    .then(async (r) => ({ status: r.status, headers: r.headers, json: r.status === 204 ? null : await r.json() }));
}

test('بدون توکن / توکن نامعتبر → 401', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  assert.equal((await call(h, { action: 'list' }, { token: null })).status, 401);
  assert.equal((await call(h, { action: 'list' }, { token: 'nope' })).status, 401);
});

test('کاربر عادی به هیچ عملیاتی دسترسی ندارد (403) و چیزی تغییر نمی‌کند', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  for (const body of [
    { action: 'list' }, { action: 'get', id: ADMIN_ID }, { action: 'audit' }, { action: 'export' },
    { action: 'update_profile', id: ADMIN_ID, first_name: 'هک', last_name: 'شده', phone: '' },
    { action: 'set_disabled', id: ADMIN_ID, disabled: true },
    { action: 'delete', id: ADMIN_ID, confirm_email: 'admin@x.ir' },
  ]) {
    const r = await call(h, body, { token: 'user-token' });
    assert.equal(r.status, 403, JSON.stringify(body));
  }
  assert.equal(w.authUsers.length, 4); assert.equal(w.audit.length, 0); assert.equal(w.profiles[0].first_name, 'مدیر');
});

test('Origin غیرمجاز رد می‌شود و CORS برای origin مجاز تنظیم می‌شود', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  assert.equal((await call(h, { action: 'list' }, { origin: 'https://evil.example' })).status, 403);
  const ok = await call(h, { action: 'list' });
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const pre = await call(h, null, { method: 'OPTIONS', token: null });
  assert.equal(pre.status, 204);
  const pre2 = await call(h, null, { method: 'OPTIONS', token: null, origin: 'https://evil.example' });
  assert.equal(pre2.headers.get('access-control-allow-origin'), null);
});

test('فهرست: ادغام Auth و profiles، آمار، وضعیت تأیید و غیرفعال', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  const r = await call(h, { action: 'list', pageSize: 100 });
  assert.equal(r.status, 200);
  assert.equal(r.json.users.length, 4);
  assert.deepEqual(r.json.stats, { total: 4, verified: 3, unverified: 1, no_email: 0, app_accounts: 0, today: 1, today_verified: 1, disabled: 1 });
  const sara = r.json.users.find((u) => u.email === 'sara@x.ir');
  assert.equal(sara.email_confirmed, false); assert.equal(sara.has_profile, false);
  assert.equal(sara.first_name, 'سارا'); assert.equal(sara.phone, '09123456789');
  const ali = r.json.users.find((u) => u.email === 'ali@x.ir');
  assert.equal(ali.first_name, 'علی');   // پروفایل بر metadata (قابل‌ویرایش توسط کاربر) برتری دارد
  assert.equal(r.json.users.find((u) => u.email === 'off@x.ir').disabled, true);
  const keys = Object.keys(ali).join(',');
  assert.ok(!/password|token|raw_user|app_metadata/i.test(keys));
});

test('جست‌وجو (ارقام فارسی، ی/ک عربی)، فیلتر، مرتب‌سازی و صفحه‌بندی', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  assert.equal((await call(h, { action: 'list', q: '۰۹۱۲۱۱۱۱۱۱۱' })).json.users[0].email, 'ali@x.ir');
  assert.equal((await call(h, { action: 'list', q: 'رضايي' })).json.total_filtered, 1);
  assert.equal((await call(h, { action: 'list', q: 'SARA@' })).json.users[0].email, 'sara@x.ir');
  assert.equal((await call(h, { action: 'list', verified: 'unverified' })).json.total_filtered, 1);
  assert.equal((await call(h, { action: 'list', status: 'disabled' })).json.users[0].email, 'off@x.ir');
  assert.equal((await call(h, { action: 'list', sort: 'oldest' })).json.users[0].email, 'admin@x.ir');
  assert.equal((await call(h, { action: 'list', sort: 'newest' })).json.users[0].email, 'ali@x.ir');
  const p = await call(h, { action: 'list', pageSize: 10, page: 99 });
  assert.equal(p.json.page, 1);
  const none = await call(h, { action: 'list', q: 'zzzz' });
  assert.equal(none.json.users.length, 0);
});

test('جزئیات: بدون داده حساس', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  const r = await call(h, { action: 'get', id: USER_ID });
  assert.equal(r.status, 200); assert.equal(r.json.user.email, 'ali@x.ir');
  assert.ok(!('encrypted_password' in r.json.user));
  assert.equal((await call(h, { action: 'get', id: 'not-a-uuid' })).status, 400);
  assert.equal((await call(h, { action: 'get', id: '00000000-0000-4000-8000-0000000000ff' })).status, 404);
});

test('ویرایش پروفایل: اعتبارسنجی، یکتایی شماره، گزارش', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  assert.equal((await call(h, { action: 'update_profile', id: USER_ID, first_name: '<', last_name: 'رضایی', phone: '' })).status, 400);
  assert.equal((await call(h, { action: 'update_profile', id: USER_ID, first_name: 'علی', last_name: 'رضایی', phone: '123' })).status, 400);
  assert.equal((await call(h, { action: 'update_profile', id: USER_ID, first_name: 'علی', last_name: 'رضایی', phone: '09000000000' })).status, 409);
  const r = await call(h, { action: 'update_profile', id: USER_ID, first_name: 'علیرضا', last_name: 'رضایی', phone: '۰۹۱۲۲۲۲۲۲۲۲' });
  assert.equal(r.status, 200); assert.deepEqual(r.json.changed, ['first_name', 'phone']);
  assert.equal(w.profiles[1].phone, '09122222222');
  assert.equal(w.audit.at(-1).action, 'update_profile'); assert.equal(w.audit.at(-1).admin_email, 'admin@x.ir');
  const same = await call(h, { action: 'update_profile', id: USER_ID, first_name: 'علیرضا', last_name: 'رضایی', phone: '09122222222' });
  assert.equal(same.json.unchanged, true);
  assert.equal((await call(h, { action: 'update_profile', id: '00000000-0000-4000-8000-000000000003', first_name: 'سارا', last_name: 'احمدی', phone: '' })).status, 404); // بدون پروفایل
  // ایمیل از این مسیر قابل تغییر نیست
  await call(h, { action: 'update_profile', id: USER_ID, first_name: 'علیرضا', last_name: 'رضایی', phone: '', email: 'x@y.z' });
  assert.equal(w.authUsers[1].email, 'ali@x.ir');
});

test('غیرفعال/فعال‌سازی واقعی + قطع نشست‌ها + جلوگیری از خودغیرفعالی', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  assert.equal((await call(h, { action: 'set_disabled', id: ADMIN_ID, disabled: true })).status, 400);
  assert.equal((await call(h, { action: 'set_disabled', id: USER_ID, disabled: 'yes' })).status, 400);
  const d = await call(h, { action: 'set_disabled', id: USER_ID, disabled: true });
  assert.equal(d.status, 200); assert.equal(d.json.disabled, true); assert.equal(d.json.sessions_revoked, true);
  assert.deepEqual(w.revoked, [USER_ID]); assert.ok(w.authUsers[1].banned_until);
  const list = await call(h, { action: 'list', status: 'disabled', fresh: true });
  assert.equal(list.json.total_filtered, 2);
  const e = await call(h, { action: 'set_disabled', id: USER_ID, disabled: false });
  assert.equal(e.json.disabled, false); assert.equal(w.authUsers[1].banned_until, null);
  assert.deepEqual(w.audit.map((a) => a.action), ['disable_user', 'enable_user']);
});

test('حذف: نیاز به تأیید ایمیل، حذف کامل، بدون پروفایل یتیم، گزارش باقی می‌ماند', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  assert.equal((await call(h, { action: 'delete', id: ADMIN_ID, confirm_email: 'admin@x.ir' })).status, 400);
  assert.equal((await call(h, { action: 'delete', id: USER_ID, confirm_email: 'wrong@x.ir' })).status, 400);
  assert.equal(w.authUsers.length, 4);
  const r = await call(h, { action: 'delete', id: USER_ID, confirm_email: ' ALI@x.ir ' });
  assert.equal(r.status, 200); assert.equal(w.authUsers.length, 3);
  assert.ok(!w.profiles.some((p) => p.id === USER_ID));     // (در Postgres با CASCADE؛ تابع دوباره بررسی می‌کند)
  assert.equal(w.audit.at(-1).action, 'delete_user'); assert.equal(w.audit.at(-1).target_email, 'ali@x.ir');
  assert.equal((await call(h, { action: 'delete', id: USER_ID, confirm_email: 'ali@x.ir' })).status, 404);
});

test('خروجی CSV: گزارش می‌شود و بدون ثبت گزارش صادر نمی‌شود', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  const r = await call(h, { action: 'export', verified: 'verified' });
  assert.equal(r.status, 200); assert.equal(r.json.users.length, 3);
  assert.ok(!('id' in r.json.users[0]));
  assert.equal(w.audit.at(-1).action, 'export_users'); assert.equal(w.audit.at(-1).details.count, 3);
  w.failAudit = true;
  assert.equal((await call(h, { action: 'export' })).status, 500);
});

test('محدودیت عملیات حساس (۶۰ عملیات در ۱۰ دقیقه)', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  for (let i = 0; i < 60; i++) w.audit.push({ id: i, admin_id: ADMIN_ID, action: 'update_profile', created_at: new Date(w.now - 1000).toISOString() });
  const r = await call(h, { action: 'set_disabled', id: USER_ID, disabled: true });
  assert.equal(r.status, 429);
});

test('ورودی نامعتبر و عملیات ناشناخته', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  assert.equal((await call(h, null, { raw: '{bad' })).status, 400);
  assert.equal((await call(h, { action: 'drop_tables' })).status, 400);
  const miss = createHandler(mkDeps(w, { SUPABASE_SERVICE_ROLE_KEY: '' }));
  const m = await call(miss, { action: 'list' });
  assert.equal(m.status, 500); assert.ok(!JSON.stringify(m.json).includes('service'));
});

test('پاسخ‌ها هیچ‌وقت کلید محرمانه را نشان نمی‌دهند', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));
  for (const b of [{ action: 'list' }, { action: 'get', id: USER_ID }, { action: 'audit' }]) {
    const r = await call(h, b);
    assert.ok(!JSON.stringify(r.json).includes('"service"'));
  }
});

/* ---------------- کاربران ثبت‌نام‌شده با شمارهٔ موبایل (اپ Merteks AI و Auth بدون ایمیل) ---------------- */
const PHONE_AUTH_ID = '00000000-0000-4000-8000-000000000005';
function mkPhoneWorld() {
  const w = mkWorld();
  // کاربری که در خود Supabase Auth فقط با شماره ثبت شده (بدون ایمیل و بدون پروفایل)
  w.authUsers.push({ id: PHONE_AUTH_ID, email: '', phone: '989301112233', created_at: '2026-10-15T05:00:00Z', email_confirmed_at: null, last_sign_in_at: '2026-10-20T05:00:00Z', banned_until: null, user_metadata: {}, app_metadata: { providers: ['phone'] } });
  w.aiAccounts = [
    { name: 'رضا', phone: '09351234567', created_at: '2026-10-22T07:00:00Z', last_seen: '2026-10-22T09:00:00Z', device: 'اپ اندروید 412x915', banned_until: null, ban_reason: null, tokens_today: 10 },
    { name: 'علی اپ', phone: '09121111111', created_at: '2026-10-21T07:00:00Z', last_seen: '2026-10-22T08:00:00Z', device: 'وب', banned_until: null, ban_reason: null },
    { name: '', phone: '۰۹۳۹۹۹۹۹۹۹۹', created_at: '2026-10-01T07:00:00Z', last_seen: null, device: null, banned_until: 'infinity', ban_reason: 'استفادهٔ نامناسب' },
    { name: 'رضا تکراری', phone: '09351234567', created_at: '2026-10-22T07:00:00Z', last_seen: null, banned_until: null },
  ];
  return w;
}

test('موبایل: کاربران اپ و Auth بدون ایمیل در فهرست می‌آیند، بدون تکرار', async () => {
  const w = mkPhoneWorld(), h = createHandler(mkDeps(w));
  const r = await call(h, { action: 'list', pageSize: 100 });
  assert.equal(r.status, 200);
  assert.equal(r.json.app_accounts, 'ok');
  assert.equal(r.json.users.length, 7);                       // ۵ کاربر Auth + ۲ حساب فقط-اپ (علی ادغام شد، رضای تکراری حذف شد)
  assert.deepEqual(r.json.stats, { total: 7, verified: 3, unverified: 1, no_email: 3, app_accounts: 3, today: 2, today_verified: 1, disabled: 2 });
  const ids = r.json.users.map((u) => u.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(r.json.users.filter((u) => u.phone === '09121111111').length, 1);
  assert.equal(r.json.users.filter((u) => u.phone === '09351234567').length, 1);

  const ali = r.json.users.find((u) => u.email === 'ali@x.ir');
  assert.equal(ali.source, 'auth+app'); assert.equal(ali.first_name, 'علی'); assert.equal(ali.app.device, 'وب');
  const reza = r.json.users.find((u) => u.phone === '09351234567');
  assert.equal(reza.id, 'app:09351234567'); assert.equal(reza.source, 'app'); assert.equal(reza.email, '');
  assert.equal(reza.first_name, 'رضا'); assert.equal(reza.created_at, '2026-10-22T07:00:00Z'); assert.equal(reza.disabled, false);
  const noName = r.json.users.find((u) => u.phone === '09399999999');   // ارقام فارسی نرمال شد
  assert.equal(noName.first_name, ''); assert.equal(noName.disabled, true); assert.equal(noName.app.ban_reason, 'استفادهٔ نامناسب');
  const authPhone = r.json.users.find((u) => u.id === PHONE_AUTH_ID);
  assert.equal(authPhone.email, ''); assert.equal(authPhone.phone, '09301112233'); assert.equal(authPhone.email_confirmed, false);
  // کاربران ایمیلی دقیقاً مثل قبل
  assert.equal(r.json.users.find((u) => u.email === 'sara@x.ir').phone, '09123456789');
  assert.equal(r.json.users.find((u) => u.email === 'admin@x.ir').source, 'auth');
});

test('موبایل: جست‌وجو، فیلتر «بدون ایمیل»، وضعیت و صفحه‌بندی', async () => {
  const w = mkPhoneWorld(), h = createHandler(mkDeps(w));
  assert.equal((await call(h, { action: 'list', q: '۰۹۳۵۱۲' })).json.users[0].id, 'app:09351234567');
  assert.equal((await call(h, { action: 'list', q: '09301112233' })).json.users[0].id, PHONE_AUTH_ID);
  const ne = await call(h, { action: 'list', verified: 'no_email', pageSize: 100 });
  assert.equal(ne.json.total_filtered, 3); assert.ok(ne.json.users.every((u) => !u.email));
  const un = await call(h, { action: 'list', verified: 'unverified' });
  assert.equal(un.json.total_filtered, 1); assert.equal(un.json.users[0].email, 'sara@x.ir');
  assert.equal((await call(h, { action: 'list', status: 'disabled' })).json.total_filtered, 2);
  assert.equal((await call(h, { action: 'list', sort: 'name', pageSize: 100 })).json.users.length, 7);
  const p = await call(h, { action: 'list', pageSize: 10, page: 1 });
  assert.equal(p.json.users.length, 7); assert.equal(p.json.pages, 1);
});

test('موبایل: جزئیات کاربر اپ و اتصال حساب اپ به کاربر ایمیلی', async () => {
  const w = mkPhoneWorld(), h = createHandler(mkDeps(w));
  const a = await call(h, { action: 'get', id: 'app:09351234567' });
  assert.equal(a.status, 200); assert.equal(a.json.user.source, 'app'); assert.equal(a.json.user.app.device, 'اپ اندروید 412x915');
  assert.equal((await call(h, { action: 'get', id: 'app:09000000001' })).status, 404);
  const ali = await call(h, { action: 'get', id: USER_ID });
  assert.equal(ali.json.user.source, 'auth+app'); assert.equal(ali.json.user.app.name, 'علی اپ');
});

test('موبایل: حساب فقط-اپ از این بخش ویرایش/غیرفعال/حذف نمی‌شود', async () => {
  const w = mkPhoneWorld(), h = createHandler(mkDeps(w));
  for (const body of [
    { action: 'update_profile', id: 'app:09351234567', first_name: 'رضا', last_name: 'محمدی', phone: '' },
    { action: 'set_disabled', id: 'app:09351234567', disabled: true },
    { action: 'delete', id: 'app:09351234567', confirm_email: '09351234567' },
  ]) {
    const r = await call(h, body);
    assert.equal(r.status, 400); assert.equal(r.json.code, 'app_account');
  }
  assert.equal(w.aiAccounts.length, 4); assert.equal(w.authUsers.length, 5); assert.equal(w.audit.length, 0);
});

test('موبایل: حذف کاربر Auth بدون ایمیل با تأیید شماره', async () => {
  const w = mkPhoneWorld(), h = createHandler(mkDeps(w));
  assert.equal((await call(h, { action: 'delete', id: PHONE_AUTH_ID, confirm_email: '' })).status, 400);
  assert.equal((await call(h, { action: 'delete', id: PHONE_AUTH_ID, confirm_email: '09300000000' })).status, 400);
  assert.equal(w.authUsers.length, 5);
  const r = await call(h, { action: 'delete', id: PHONE_AUTH_ID, confirm_email: '۰۹۳۰۱۱۱۲۲۳۳' });
  assert.equal(r.status, 200); assert.equal(w.authUsers.length, 4);
  assert.equal(w.audit.at(-1).action, 'delete_user');
});

test('موبایل: خروجی CSV شامل کاربران اپ و منبع ثبت‌نام', async () => {
  const w = mkPhoneWorld(), h = createHandler(mkDeps(w));
  const r = await call(h, { action: 'export' });
  assert.equal(r.status, 200); assert.equal(r.json.users.length, 7);
  assert.ok(!('id' in r.json.users[0]));
  assert.equal(r.json.users.filter((u) => u.source === 'app').length, 2);
});

test('موبایل: اگر تابع حساب‌های اپ نباشد، کاربران ایمیلی مثل قبل نمایش داده می‌شوند', async () => {
  const w = mkWorld(), h = createHandler(mkDeps(w));      // aiAccounts = null
  const r = await call(h, { action: 'list', pageSize: 100 });
  assert.equal(r.status, 200); assert.equal(r.json.users.length, 4); assert.equal(r.json.app_accounts, 'unavailable');
  assert.ok(r.json.users.every((u) => u.source === 'auth' && u.app === null));
});

test('موبایل: کاربر عادی حساب‌های اپ را نمی‌بیند و پاسخ‌ها کلید محرمانه ندارند', async () => {
  const w = mkPhoneWorld(), h = createHandler(mkDeps(w));
  assert.equal((await call(h, { action: 'list' }, { token: 'user-token' })).status, 403);
  assert.equal((await call(h, { action: 'get', id: 'app:09351234567' }, { token: 'user-token' })).status, 403);
  assert.equal(w.calls.aiAccounts, 0);
  const r = await call(h, { action: 'list', pageSize: 100 });
  assert.ok(!/"service"|tokens_today|password/.test(JSON.stringify(r.json)));
});
