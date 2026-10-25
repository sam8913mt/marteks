/* Merteks — sign in / sign up / account (login.html, signup.html, account.html).
   One account for the Merteks site and the Merteks AI app: mobile number + password, through the
   Supabase functions ai_signup / ai_login / ai_me / ai_update_name / ai_change_password / ai_logout
   (_private/supabase/migration-phone-password.sql). The password is only checked (bcrypt) on the server;
   this page keeps nothing but the session token. No secrets here: only the public (publishable) key. */
(function () {
'use strict';
var D = document, W = window, CFG = W.MERTEKS_CONFIG || {};
var API = String(CFG.supabaseUrl || '').replace(/\/+$/, ''), KEY = CFG.supabaseKey || '';
var SK = 'mx_acct_v1';
var PAGE = D.body.getAttribute('data-auth-page') || '';

/* ---------- helpers ---------- */
function $(id) { return D.getElementById(id); }
function qa(s, r) { return [].slice.call((r || D).querySelectorAll(s)); }
function digits(v) {
  return String(v == null ? '' : v).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
}
function normPhone(v) {
  var s = digits(v).replace(/[\s\-()]/g, '');
  if (/^\+98/.test(s)) s = '0' + s.slice(3);
  else if (/^0098/.test(s)) s = '0' + s.slice(4);
  else if (/^98\d{10}$/.test(s)) s = '0' + s.slice(2);
  else if (/^9\d{9}$/.test(s)) s = '0' + s;
  return s;
}
var PHONE_RE = /^09\d{9}$/;
var NAME_RE = /^[؀-ۿa-zA-Z0-9_. ‌-]{2,30}$/;          /* same rule as the Merteks AI app */
/* same rule as the server (private.ai_pw_problem): 8-72 characters, a letter and a digit */
var PASS_LETTER = /[A-Za-zء-يپچژکگی]/, PASS_DIGIT = /[0-9۰-۹٠-٩]/;
function passProblem(p) {
  if (p.length < 8) return 'رمز عبور باید دست‌کم ۸ نویسه باشد.';
  if (p.length > 72) return 'رمز عبور نباید بیشتر از ۷۲ نویسه باشد.';
  if (!PASS_LETTER.test(p) || !PASS_DIGIT.test(p)) return 'رمز عبور باید هم حرف و هم عدد داشته باشد.';
  return '';
}
function safeNext() {
  var n = '';
  try { n = new URLSearchParams(W.location.search).get('next') || ''; } catch (e) {}
  return /^[a-z0-9-]+\.html$/i.test(n) && !/^(login|signup)\.html$/i.test(n) ? n : 'account.html';
}
function store(kind) { try { return W[kind]; } catch (e) { return null; } }
function sget(kind, k) { var s = store(kind); try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
function sset(kind, k, v) { var s = store(kind); try { if (s) s.setItem(k, v); } catch (e) {} }
function sdel(kind, k) { var s = store(kind); try { if (s) s.removeItem(k); } catch (e) {} }
function go(url) { W.location.assign(url); }

/* ---------- session (localStorage when "remember me", else sessionStorage) ---------- */
function readSession() {
  var raw = sget('localStorage', SK) || sget('sessionStorage', SK), r = null;
  try { r = JSON.parse(raw || 'null'); } catch (e) {}
  return r && /^[0-9a-f]{64}$/.test(r.token || '') ? r : null;
}
function clearSession() { sdel('localStorage', SK); sdel('sessionStorage', SK); }
function saveSession(d, phone, remember) {
  var s = { token: d.token, phone: d.phone || phone, name: d.name || '', remember: !!remember };
  clearSession();
  sset(remember ? 'localStorage' : 'sessionStorage', SK, JSON.stringify(s));
  return s;
}

/* ---------- server: Supabase RPC; resolves {ok, status, data, net} and never rejects ---------- */
function rpc(name, args) {
  var ctl = ('AbortController' in W) ? new AbortController() : null;
  var t = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
  return fetch(API + '/rest/v1/rpc/' + name, {
    method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}), signal: ctl ? ctl.signal : undefined, cache: 'no-store'
  }).then(function (r) {
    clearTimeout(t);
    return r.text().then(function (tx) {
      var d = null; try { d = tx ? JSON.parse(tx) : null; } catch (e) {}
      return { ok: r.ok, status: r.status, data: d };
    });
  }, function () { clearTimeout(t); return { ok: false, status: 0, data: null, net: true }; });
}
var DEVICE = 'وب ' + (W.screen ? W.screen.width + 'x' + W.screen.height : '');

/* ---------- Persian messages ---------- */
var MSG = {
  bad_credentials: 'شماره یا رمز عبور درست نیست.',
  no_password: 'این شماره هنوز رمز عبور ندارد (حساب قدیمی اپ Merteks AI). یک بار در «ثبت‌نام» با همین شماره رمز بسازید؛ حساب و اطلاعات قبلی‌تان سر جایش می‌ماند.',
  registered: 'این شماره قبلاً ثبت‌نام کرده است؛ از «ورود» با شماره و رمز وارد شوید.',
  invalid_phone: 'شمارهٔ موبایل معتبر وارد کنید؛ مثلاً ۰۹۱۲۳۴۵۶۷۸۹.',
  invalid_name: 'نام کاربری باید ۲ تا ۳۰ حرف باشد.',
  weak_password: 'رمز عبور باید دست‌کم ۸ نویسه و شامل حرف و عدد باشد.',
  rate_limited: 'تلاش‌ها زیاد بود؛ کمی صبر کنید (حداکثر ۱۵ دقیقه) و دوباره امتحان کنید.'
};
function errText(res) {
  if (res.net) return 'اتصال به سرور برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید.';
  var d = res.data || {};
  if (res.ok && d.code && MSG[d.code]) return MSG[d.code];
  if (res.status === 404) return 'سرویس حساب کاربری هنوز روی سرور راه‌اندازی نشده است؛ لطفاً به پشتیبانی خبر دهید.';
  if (res.status >= 500) return 'خطایی در سرور رخ داد. کمی بعد دوباره تلاش کنید.';
  return 'انجام نشد؛ دوباره تلاش کنید.';
}

/* ---------- UI helpers ---------- */
var alertBox = $('authAlert');
function showAlert(kind, text) {
  if (!alertBox) return;
  alertBox.className = 'ob-alert ' + kind;
  alertBox.textContent = text;
  alertBox.hidden = false;
}
function hideAlert() { if (alertBox) alertBox.hidden = true; }
function invalid(el, on) { if (on) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
function fail(box, el, msg) { box.textContent = msg; if (el) { invalid(el, true); el.focus(); } }
function guard(form, fn) {              /* blocks double submits while a request is running */
  var running = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (running) return;
    running = true;
    var btn = form.querySelector('[type="submit"]'), label = btn.textContent;
    btn.disabled = true;
    btn.textContent = btn.getAttribute('data-busy') || 'لطفاً صبر کنید…';
    Promise.resolve().then(fn).catch(function () { showAlert('err', 'خطای ناشناخته‌ای رخ داد. دوباره تلاش کنید.'); })
      .then(function () { running = false; btn.disabled = false; btn.textContent = label; });
  });
}
function bindEyes() {
  qa('.ob-eye').forEach(function (b) {
    b.addEventListener('click', function () {
      var inp = b.parentNode.querySelector('input'), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.setAttribute('aria-pressed', show ? 'true' : 'false');
      b.setAttribute('aria-label', show ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور');
    });
  });
}

/* ---------- login.html / signup.html: two tabs, like the Merteks AI sign-in screen ---------- */
function setTab(which) {
  var login = which !== 'signup';
  $('vLogin').hidden = !login;
  $('vSignup').hidden = login;
  $('tabLogin').setAttribute('aria-selected', String(login));
  $('tabSignup').setAttribute('aria-selected', String(!login));
  $('liErr').textContent = ''; $('suErr').textContent = '';
  hideAlert();
}
function signedIn(d, phone, remember, text) {
  saveSession(d, phone, remember);
  showAlert('ok', text);
  setTimeout(function () { go(safeNext()); }, 700);
}

function initForms() {
  $('tabLogin').addEventListener('click', function () { setTab('login'); $('liPhone').focus(); });
  $('tabSignup').addEventListener('click', function () { setTab('signup'); $('suName').focus(); });

  guard($('vLogin'), function () {
    var ph = $('liPhone'), pw = $('liPass'), err = $('liErr');
    invalid(ph, false); invalid(pw, false); err.textContent = ''; hideAlert();
    var phone = normPhone(ph.value);
    if (!PHONE_RE.test(phone)) return fail(err, ph, MSG.invalid_phone);
    if (!pw.value) return fail(err, pw, 'رمز عبور را وارد کنید.');
    return rpc('ai_login', { p_phone: phone, p_password: pw.value, p_device: DEVICE, p_device_id: '' }).then(function (res) {
      var d = res.data || {};
      if (res.ok && d.ok && d.token) {
        pw.value = '';
        signedIn(d, phone, $('liRemember').checked, 'خوش آمدید ' + (d.name || '') + '؛ در حال انتقال…');
        return;
      }
      err.textContent = errText(res);
      if (d.code === 'bad_credentials') { invalid(pw, true); pw.select(); }
      if (d.code === 'no_password') $('suPhone').value = phone;
    });
  });

  guard($('vSignup'), function () {
    var nm = $('suName'), ph = $('suPhone'), pw = $('suPass'), pw2 = $('suPass2'), err = $('suErr');
    [nm, ph, pw, pw2].forEach(function (el) { invalid(el, false); });
    err.textContent = ''; hideAlert();
    var name = nm.value.replace(/\s+/g, ' ').trim(), phone = normPhone(ph.value), pass = pw.value;
    if (!NAME_RE.test(name)) return fail(err, nm, 'نام کاربری باید ۲ تا ۳۰ حرف باشد (حروف، عدد، فاصله، _ یا .).');
    if (!PHONE_RE.test(phone)) return fail(err, ph, MSG.invalid_phone);
    if (passProblem(pass)) return fail(err, pw, passProblem(pass));
    if (pw2.value !== pass) return fail(err, pw2, 'تکرار رمز عبور با رمز عبور یکسان نیست.');
    return rpc('ai_signup', { p_phone: phone, p_name: name, p_password: pass, p_device: DEVICE, p_device_id: '' }).then(function (res) {
      var d = res.data || {};
      if (res.ok && d.ok && d.token) {
        [nm, ph, pw, pw2].forEach(function (el) { el.value = ''; });
        signedIn(d, phone, true, d.existed
          ? 'رمز روی حساب قبلی شما ثبت شد؛ خوش برگشتید ' + (d.name || '') + '. در حال انتقال…'
          : 'ثبت‌نام با موفقیت انجام شد. در حال انتقال به حساب کاربری…');
        return;
      }
      if (d.code === 'registered') {
        setTab('login');
        $('liPhone').value = phone;
        $('liErr').textContent = MSG.registered;
        $('liPass').focus();
        return;
      }
      err.textContent = errText(res);
    });
  });

  setTab(PAGE === 'signup' || W.location.hash === '#signup' ? 'signup' : 'login');
}

/* ---------- account.html ---------- */
function initAccount() {
  var s = readSession();
  function toLogin() { clearSession(); go('login.html?next=account.html'); }
  if (!s) { toLogin(); return; }

  function render(d) {
    $('acName').textContent = d.name || '—';
    $('acPhone').textContent = d.phone || '—';
    $('acSince').textContent = d.created_at ? new Date(d.created_at).toLocaleDateString('fa-IR') : '—';
    $('anName').value = d.name || '';
    if (d.banned) showAlert('err', 'استفادهٔ این حساب از Merteks AI فعلاً مسدود شده است' + (d.reason ? ' (' + d.reason + ')' : '') + '. برای پیگیری با پشتیبانی تماس بگیرید.');
    $('accountPage').hidden = false;
  }
  rpc('ai_me', { p_token: s.token }).then(function (res) {
    var d = res.data || {};
    if (res.ok && d.code === 'auth') { toLogin(); return; }
    if (!res.ok || !d.ok) { showAlert('err', errText(res)); return; }
    render(d);
  });

  guard($('nameForm'), function () {
    var el = $('anName'), err = $('anErr'), okBox = $('anOk');
    invalid(el, false); err.textContent = ''; okBox.textContent = '';
    var name = el.value.replace(/\s+/g, ' ').trim();
    if (!NAME_RE.test(name)) return fail(err, el, 'نام کاربری باید ۲ تا ۳۰ حرف باشد (حروف، عدد، فاصله، _ یا .).');
    return rpc('ai_update_name', { p_token: s.token, p_name: name }).then(function (res) {
      var d = res.data || {};
      if (res.ok && d.code === 'auth') { toLogin(); return; }
      if (!res.ok || !d.ok) { err.textContent = errText(res); return; }
      $('acName').textContent = d.name;
      s.name = d.name; saveSession(s, s.phone, s.remember);
      okBox.textContent = 'نام شما ذخیره شد.';
    });
  });

  guard($('passForm'), function () {
    var o = $('apOld'), n = $('apNew'), n2 = $('apNew2'), err = $('apErr'), okBox = $('apOk');
    [o, n, n2].forEach(function (el) { invalid(el, false); });
    err.textContent = ''; okBox.textContent = '';
    if (!o.value) return fail(err, o, 'رمز عبور فعلی را وارد کنید.');
    if (passProblem(n.value)) return fail(err, n, passProblem(n.value));
    if (n2.value !== n.value) return fail(err, n2, 'تکرار رمز عبور جدید با رمز جدید یکسان نیست.');
    if (n.value === o.value) return fail(err, n, 'رمز جدید باید با رمز فعلی متفاوت باشد.');
    return rpc('ai_change_password', { p_token: s.token, p_old: o.value, p_new: n.value }).then(function (res) {
      var d = res.data || {};
      if (res.ok && d.code === 'auth') { toLogin(); return; }
      if (!res.ok || !d.ok) {
        err.textContent = d.code === 'bad_credentials' ? 'رمز عبور فعلی درست نیست.' : errText(res);
        if (d.code === 'bad_credentials') invalid(o, true);
        return;
      }
      [o, n, n2].forEach(function (el) { el.value = ''; });
      okBox.textContent = 'رمز عبور تغییر کرد. ورود شما روی دستگاه‌های دیگر بسته شد.';
    });
  });

  $('acLogout').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    rpc('ai_logout', { p_token: s.token }).then(function () { clearSession(); go('login.html'); });
  });
}

/* ---------- boot ---------- */
if (!API || !KEY) { showAlert('err', 'پیکربندی اتصال به سرور کامل نیست (js/config.js).'); return; }
bindEyes();
/* sessions of the old e-mail sign-in are no longer used */
sdel('localStorage', 'mx_auth_v1'); sdel('sessionStorage', 'mx_auth_v1');
if (PAGE === 'account') { initAccount(); return; }
/* already signed in? skip the forms (?switch keeps the page open to sign in with another account) */
if (readSession() && !/[?&]switch\b/.test(W.location.search)) { go(safeNext()); return; }
initForms();
})();
