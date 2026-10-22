/* Merteks — authentication (Supabase Auth over its official REST API).
   Pages: login.html, signup.html, account.html.  No secrets here: only the public (publishable) key. */
(function () {
'use strict';
var D = document, W = window, CFG = W.MERTEKS_CONFIG || {};
var API = String(CFG.supabaseUrl || '').replace(/\/+$/, ''), KEY = CFG.supabaseKey || '';
var SK = 'mx_auth_v1', PK = 'mx_auth_pending_v1', FK = 'mx_auth_flash_v1';
var PAGE = D.body.getAttribute('data-auth-page') || '';
var RESEND_SECONDS = 60, MAX_FAILS = 5, LOCK_SECONDS = 60;

/* ---------- helpers ---------- */
function $(id) { return D.getElementById(id); }
function qa(s, r) { return [].slice.call((r || D).querySelectorAll(s)); }
function now() { return Math.floor(Date.now() / 1000); }
function digits(v) {
  return String(v == null ? '' : v).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
}
function fa(n) { try { return Number(n).toLocaleString('fa-IR'); } catch (e) { return String(n); } }
function normEmail(v) { return String(v || '').trim().toLowerCase(); }
function normPhone(v) {
  var s = digits(v).replace(/[\s\-()]/g, '');
  if (/^\+98/.test(s)) s = '0' + s.slice(3);
  else if (/^0098/.test(s)) s = '0' + s.slice(4);
  else if (/^98\d{10}$/.test(s)) s = '0' + s.slice(2);
  else if (/^9\d{9}$/.test(s)) s = '0' + s;
  return s;
}
var EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
var PHONE_RE = /^09\d{9}$/;
var NAME_RE = /^[\p{L}\p{M}\u200c' .\-]{2,60}$/u;
function passProblem(p) {
  if (p.length < 8) return 'رمز عبور باید دست‌کم ۸ نویسه باشد.';
  if (p.length > 72) return 'رمز عبور نباید بیشتر از ۷۲ نویسه باشد.';
  if (!/\p{L}/u.test(p) || !/[0-9۰-۹]/.test(p)) return 'رمز عبور باید هم حرف و هم عدد داشته باشد.';
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

/* ---------- session (localStorage when "remember me", else sessionStorage) ---------- */
function readSession() {
  var raw = sget('localStorage', SK) || sget('sessionStorage', SK), r = null;
  try { r = JSON.parse(raw || 'null'); } catch (e) {}
  return r && r.access_token && r.refresh_token ? r : null;
}
function clearSession() { sdel('localStorage', SK); sdel('sessionStorage', SK); }
function saveSession(d, remember) {
  var s = {
    access_token: d.access_token, refresh_token: d.refresh_token,
    expires_at: d.expires_at || (now() + (d.expires_in || 3600)), user: d.user || null, remember: !!remember
  };
  clearSession();
  sset(remember ? 'localStorage' : 'sessionStorage', SK, JSON.stringify(s));
  return s;
}

/* ---------- http ---------- */
function http(method, path, o) {
  o = o || {};
  var h = { apikey: KEY };
  if (o.json) h['Content-Type'] = 'application/json';
  if (o.token) h.Authorization = 'Bearer ' + o.token;
  if (o.prefer) h.Prefer = o.prefer;
  var ctl = ('AbortController' in W) ? new AbortController() : null;
  var t = setTimeout(function () { if (ctl) ctl.abort(); }, 15000);
  return fetch(API + path, { method: method, headers: h, body: o.json ? JSON.stringify(o.json) : undefined, signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
    .then(function (r) {
      clearTimeout(t);
      return r.text().then(function (tx) {
        var d = null; try { d = tx ? JSON.parse(tx) : null; } catch (e) {}
        return { ok: r.ok, status: r.status, data: d };
      });
    }, function () { clearTimeout(t); return { ok: false, status: 0, data: null, net: true }; });
}
function ecode(res) { var d = res && res.data || {}; return String(d.error_code || d.code || ''); }
function emsg(res) { var d = res && res.data || {}; return String(d.msg || d.message || d.error_description || d.error || ''); }

/* valid access token (refreshes when it is about to expire) */
function freshSession() {
  var s = readSession();
  if (!s) return Promise.resolve(null);
  if (s.expires_at - now() > 60) return Promise.resolve(s);
  return http('POST', '/auth/v1/token?grant_type=refresh_token', { json: { refresh_token: s.refresh_token } }).then(function (res) {
    if (res.ok && res.data && res.data.access_token) return saveSession(res.data, s.remember);
    if (!res.net) clearSession();           /* a network failure must not log the user out */
    return res.net ? s : null;
  });
}

/* ---------- Persian error messages ---------- */
function faError(res) {
  if (res.net) return 'اتصال به سرور برقرار نشد. اینترنت خود را بررسی کنید و دوباره تلاش کنید.';
  var c = ecode(res), m = emsg(res).toLowerCase();
  if (res.status === 429 || /rate_limit/.test(c) || /rate limit|too many/.test(m)) return 'تعداد درخواست‌ها زیاد است. کمی صبر کنید و دوباره تلاش کنید.';
  if (c === 'invalid_credentials' || /invalid login credentials/.test(m)) return 'ایمیل یا رمز عبور درست نیست.';
  if (c === 'email_not_confirmed' || /email not confirmed/.test(m)) return 'ایمیل شما هنوز تأیید نشده است.';
  if (c === 'user_banned' || /user is banned|user_banned/.test(m)) return 'حساب کاربری شما غیرفعال شده است. برای پیگیری با پشتیبانی تماس بگیرید.';
  if (c === 'otp_expired' || /expired|invalid/.test(m) && /token|otp|code/.test(m)) return 'کد اشتباه یا منقضی شده است.';
  if (c === 'weak_password' || /password should|weak/.test(m)) return 'رمز عبور به‌اندازهٔ کافی قوی نیست.';
  if (c === 'same_password') return 'رمز جدید باید با رمز قبلی متفاوت باشد.';
  if (c === 'signup_disabled' || /signups not allowed/.test(m)) return 'ثبت‌نام در حال حاضر غیرفعال است.';
  if (c === 'validation_failed' || res.status === 400 || res.status === 422) return 'اطلاعات واردشده معتبر نیست؛ ورودی‌ها را بررسی کنید.';
  if (res.status === 401 || res.status === 403) return 'دسترسی مجاز نیست؛ دوباره وارد شوید.';
  if (res.status >= 500) return 'خطایی در سرور رخ داد. کمی بعد دوباره تلاش کنید.';
  return 'خطای ناشناخته‌ای رخ داد. دوباره تلاش کنید.';
}

/* ---------- UI helpers ---------- */
var alertBox = $('authAlert');
function showAlert(kind, text) {
  if (!alertBox) return;
  alertBox.className = 'auth-alert ' + kind;
  alertBox.textContent = text;
  alertBox.hidden = false;
  alertBox.setAttribute('role', kind === 'err' ? 'alert' : 'status');
}
function hideAlert() { if (alertBox) alertBox.hidden = true; }
function fieldErr(input, msg) {
  var wrap = input.closest('.field'), box = wrap && wrap.querySelector('.field-err');
  if (!box) return;
  if (msg) { box.textContent = msg; box.hidden = false; input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', box.id); }
  else { box.hidden = true; input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
}
function clearErrors(form) { qa('input', form).forEach(function (i) { fieldErr(i, ''); }); }
function setBusy(btn, on) {
  if (!btn) return;
  btn.disabled = !!on;
  if (on) btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
}
function guard(form, fn) {              /* blocks double submits while a request is running */
  var running = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (running) return;
    running = true;
    var btn = form.querySelector('[type="submit"]');
    setBusy(btn, true);
    Promise.resolve().then(fn).catch(function () { showAlert('err', 'خطای ناشناخته‌ای رخ داد. دوباره تلاش کنید.'); })
      .then(function () { running = false; setBusy(btn, false); });
  });
}
function bindPwToggles() {
  qa('.pw-toggle').forEach(function (b) {
    b.addEventListener('click', function () {
      var inp = b.parentNode.querySelector('input'), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      b.textContent = show ? 'مخفی' : 'نمایش';
      b.setAttribute('aria-pressed', show ? 'true' : 'false');
    });
  });
}

/* ---------- views (login.html / signup.html) ---------- */
var VIEWS = qa('[data-view]');
function showView(name) {
  var found = false;
  VIEWS.forEach(function (v) {
    var on = v.getAttribute('data-view') === name;
    v.hidden = !on;
    if (on) {
      found = true;
      var t = $('authTitle'), l = $('authLead');
      if (t && v.getAttribute('data-title')) t.textContent = v.getAttribute('data-title');
      if (l) l.textContent = v.getAttribute('data-lead') || '';
    }
  });
  if (!found) return;
  qa('[data-show]').forEach(function (a) { a.hidden = a.getAttribute('data-show').split(' ').indexOf(name) < 0; });
  var f = qa('[data-view]').filter(function (v) { return !v.hidden; })[0];
  if (f) { clearErrors(f); var first = f.querySelector('input:not([type=checkbox]):not([disabled])'); if (first) setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) {} }, 30); }
}

/* ---------- pending verification (email only; never the password or the code) ---------- */
function getPending() { try { return JSON.parse(sget('sessionStorage', PK) || 'null'); } catch (e) { return null; } }
function setPending(p) { sset('sessionStorage', PK, JSON.stringify(p)); }
function clearPending() { sdel('sessionStorage', PK); }

var cdTimer = null;
function tickResend() {
  var btn = $('cdResend'), p = getPending();
  if (!btn || !p) return;
  var left = (p.nextAt || 0) - now();
  if (left > 0) { btn.disabled = true; btn.textContent = 'ارسال مجدد کد (' + fa(left) + ' ثانیه)'; }
  else { btn.disabled = false; btn.textContent = 'ارسال مجدد کد'; clearInterval(cdTimer); cdTimer = null; }
}
function startCountdown() { clearInterval(cdTimer); tickResend(); cdTimer = setInterval(tickResend, 1000); }

var CODE_TEXT = {
  signup: { title: 'تأیید ایمیل', lead: 'کد تأیید برای ایمیل زیر ارسال شد. آن را وارد کنید تا ثبت‌نام کامل شود.', btn: 'تأیید کد و تکمیل ثبت‌نام' },
  email: { title: 'ورود با کد یک‌بارمصرف', lead: 'کد ورود برای ایمیل زیر ارسال شد (اگر حسابی با این ایمیل وجود داشته باشد).', btn: 'تأیید کد و ورود' },
  recovery: { title: 'تنظیم رمز عبور جدید', lead: 'کد بازیابی برای ایمیل زیر ارسال شد (اگر حسابی با این ایمیل وجود داشته باشد). کد و رمز جدید را وارد کنید.', btn: 'تأیید کد و تغییر رمز' }
};
function openCodeView(p, message) {
  setPending(p);
  var t = CODE_TEXT[p.type], v = qa('[data-view="code"]')[0];
  if (!v) return;
  v.setAttribute('data-title', t.title);
  v.setAttribute('data-lead', t.lead);
  $('cdEmail').textContent = p.email;
  $('cdSubmit').textContent = t.btn;
  qa('.recovery-only').forEach(function (e) { e.hidden = p.type !== 'recovery'; });
  qa('.recovery-only input').forEach(function (i) { i.disabled = p.type !== 'recovery'; i.value = ''; });
  $('cdCode').value = '';
  showView('code');
  if (message) showAlert(message.kind, message.text);
  startCountdown();
}
function setFails(p, n) { p.fails = n; if (n >= MAX_FAILS) { p.lockUntil = now() + LOCK_SECONDS; p.fails = 0; } setPending(p); }

/* ---------- API actions ---------- */
function doSendCode(p) {
  if (p.type === 'signup') return http('POST', '/auth/v1/resend', { json: { type: 'signup', email: p.email } });
  if (p.type === 'email') return http('POST', '/auth/v1/otp', { json: { email: p.email, create_user: false } });
  return http('POST', '/auth/v1/recover', { json: { email: p.email } });
}
function profileExists(s) {
  var uid = s.user && s.user.id;
  if (!uid) return Promise.resolve(false);
  return http('GET', '/rest/v1/profiles?select=id&id=eq.' + encodeURIComponent(uid), { token: s.access_token }).then(function (r) {
    return r.ok && Array.isArray(r.data) && r.data.length > 0;
  });
}
function go(url) { W.location.assign(url); }

function submitCode() {
  var p = getPending(), form = $('vCode');
  if (!p) { showAlert('err', 'درخواست تأیید پیدا نشد. دوباره شروع کنید.'); return; }
  if ((p.lockUntil || 0) > now()) { showAlert('err', 'تلاش‌های ناموفق زیاد بود. ' + fa(p.lockUntil - now()) + ' ثانیه بعد دوباره امتحان کنید.'); return; }
  clearErrors(form); hideAlert();
  var codeEl = $('cdCode'), code = digits(codeEl.value).replace(/\s+/g, ''), bad = false;
  if (!/^\d{6,10}$/.test(code)) { fieldErr(codeEl, 'کد تأیید را (فقط عدد) کامل وارد کنید.'); bad = true; }
  var pass = '';
  if (p.type === 'recovery') {
    var a = $('cdPass'), b = $('cdPass2');
    pass = a.value;
    var pp = passProblem(pass);
    if (pp) { fieldErr(a, pp); bad = true; }
    if (b.value !== pass) { fieldErr(b, 'تکرار رمز عبور با رمز عبور یکسان نیست.'); bad = true; }
  }
  if (bad) return;

  return http('POST', '/auth/v1/verify', { json: { type: p.type, email: p.email, token: code } }).then(function (res) {
    if (!(res.ok && res.data && res.data.access_token)) {
      if (res.net || res.status === 429 || res.status >= 500 || ecode(res) === 'user_banned') { showAlert('err', faError(res)); return; }
      setFails(p, (p.fails || 0) + 1);
      fieldErr(codeEl, 'کد اشتباه یا منقضی شده است.');
      showAlert('err', 'تأیید انجام نشد. کد را بررسی کنید یا کد جدید بگیرید.');
      return;
    }
    var d = res.data;
    if (p.type === 'recovery') {
      return http('PUT', '/auth/v1/user', { json: { password: pass }, token: d.access_token }).then(function (r2) {
        if (!r2.ok) { showAlert('err', faError(r2)); return; }
        return http('POST', '/auth/v1/logout', { token: d.access_token }).then(function () {
          clearSession(); clearPending();
          sset('sessionStorage', FK, 'رمز عبور شما تغییر کرد. با رمز جدید وارد شوید.');
          go('login.html');
        });
      });
    }
    var s = saveSession(d, p.type === 'email' ? !!p.remember : false);
    return profileExists(s).then(function (ok) {
      if (p.type === 'signup' && !ok) {
        showAlert('err', 'ایمیل شما تأیید شد، اما پروفایل ساخته نشد. این مشکل از تنظیمات سایت است؛ لطفاً به پشتیبانی اطلاع دهید.');
        return;
      }
      clearPending();
      showAlert('ok', p.type === 'signup' ? 'ایمیل شما تأیید شد و ثبت‌نام کامل شد. در حال انتقال به حساب کاربری…' : 'ورود با موفقیت انجام شد. در حال انتقال…');
      setTimeout(function () { go(p.type === 'signup' ? 'account.html' : safeNext()); }, 900);
    });
  });
}

function resendCode() {
  var p = getPending(), btn = $('cdResend');
  if (!p || !btn || btn.disabled) return;
  hideAlert(); btn.disabled = true;
  doSendCode(p).then(function (res) {
    var limited = res.status === 429;
    var hidden = p.type !== 'signup' && !res.net && !limited;   /* do not reveal whether the account exists */
    if (res.ok || hidden) {
      p.nextAt = now() + RESEND_SECONDS; p.fails = 0; setPending(p);
      showAlert('ok', p.type === 'signup' ? 'کد جدید به ایمیل شما ارسال شد.' : 'اگر حسابی با این ایمیل وجود داشته باشد، کد جدید ارسال شد.');
    } else {
      if (limited) { p.nextAt = now() + RESEND_SECONDS; setPending(p); }
      showAlert('err', faError(res));
    }
    startCountdown();
  });
}

/* ---------- login.html ---------- */
function initLogin() {
  var flash = sget('sessionStorage', FK);
  if (flash) { sdel('sessionStorage', FK); showAlert('ok', flash); }

  guard($('vPassword'), function () {
    var form = $('vPassword'), em = $('lpEmail'), pw = $('lpPass'), bad = false;
    clearErrors(form); if (!flash) hideAlert();
    var email = normEmail(em.value);
    if (!EMAIL_RE.test(email)) { fieldErr(em, 'ایمیل معتبر وارد کنید.'); bad = true; }
    if (!pw.value) { fieldErr(pw, 'رمز عبور را وارد کنید.'); bad = true; }
    if (bad) return;
    return http('POST', '/auth/v1/token?grant_type=password', { json: { email: email, password: pw.value } }).then(function (res) {
      if (res.ok && res.data && res.data.access_token) {
        saveSession(res.data, $('lpRemember').checked);
        showAlert('ok', 'ورود با موفقیت انجام شد. در حال انتقال…');
        setTimeout(function () { go(safeNext()); }, 700);
        return;
      }
      if (ecode(res) === 'email_not_confirmed' || /email not confirmed/i.test(emsg(res))) {
        var p = { email: email, type: 'signup', nextAt: 0, fails: 0 };
        return doSendCode(p).then(function (r2) {
          p.nextAt = (r2.ok || r2.status === 429) ? now() + RESEND_SECONDS : 0;
          openCodeView(p, r2.ok
            ? { kind: 'info', text: 'ایمیل شما هنوز تأیید نشده است. کد تأیید به ایمیلتان ارسال شد؛ آن را وارد کنید.' }
            : { kind: 'err', text: 'ایمیل شما هنوز تأیید نشده است. ' + faError(r2) });
        });
      }
      showAlert('err', faError(res));
    });
  });

  guard($('vOtp'), function () {
    var form = $('vOtp'), em = $('loEmail');
    clearErrors(form); hideAlert();
    var email = normEmail(em.value);
    if (!EMAIL_RE.test(email)) { fieldErr(em, 'ایمیل معتبر وارد کنید.'); return; }
    var p = { email: email, type: 'email', remember: $('loRemember').checked, nextAt: now() + RESEND_SECONDS, fails: 0 };
    return doSendCode(p).then(function (res) {
      if (res.net || res.status === 429 || res.status >= 500) { showAlert('err', faError(res)); return; }
      /* ok, or "signups not allowed" for an unknown email: both look identical to the visitor */
      openCodeView(p, { kind: 'info', text: 'اگر حساب فعالی با این ایمیل وجود داشته باشد، کد ورود ارسال شد.' });
    });
  });

  guard($('vForgot'), function () {
    var form = $('vForgot'), em = $('lfEmail');
    clearErrors(form); hideAlert();
    var email = normEmail(em.value);
    if (!EMAIL_RE.test(email)) { fieldErr(em, 'ایمیل معتبر وارد کنید.'); return; }
    var p = { email: email, type: 'recovery', nextAt: now() + RESEND_SECONDS, fails: 0 };
    return doSendCode(p).then(function (res) {
      if (res.net || res.status === 429 || res.status >= 500) { showAlert('err', faError(res)); return; }
      openCodeView(p, { kind: 'info', text: 'اگر حسابی با این ایمیل وجود داشته باشد، کد بازیابی ارسال شد.' });
    });
  });

  guard($('vCode'), submitCode);
  $('cdResend').addEventListener('click', resendCode);
  $('cdBack').addEventListener('click', function () { clearPending(); hideAlert(); showView('password'); W.history.replaceState(null, '', W.location.pathname + W.location.search); });

  qa('[data-go]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault(); hideAlert();
      var v = a.getAttribute('data-go');
      showView(v);
      W.history.replaceState(null, '', W.location.pathname + W.location.search + (v === 'password' ? '' : '#' + v));
    });
  });

  var h = (W.location.hash || '').replace('#', ''), p0 = getPending();
  if (h === 'code' && p0) openCodeView(p0);
  else showView(h === 'otp' || h === 'forgot' ? h : 'password');
}

/* ---------- signup.html ---------- */
function initSignup() {
  guard($('vSignup'), function () {
    var form = $('vSignup'), f = {
      fn: $('suFirst'), ln: $('suLast'), ph: $('suPhone'), em: $('suEmail'), pw: $('suPass'), pw2: $('suPass2')
    }, bad = false;
    clearErrors(form); hideAlert();
    var first = f.fn.value.trim(), last = f.ln.value.trim(), phone = normPhone(f.ph.value), email = normEmail(f.em.value), pass = f.pw.value;
    if (!NAME_RE.test(first)) { fieldErr(f.fn, 'نام را درست وارد کنید (۲ تا ۶۰ حرف).'); bad = true; }
    if (!NAME_RE.test(last)) { fieldErr(f.ln, 'نام خانوادگی را درست وارد کنید (۲ تا ۶۰ حرف).'); bad = true; }
    if (!PHONE_RE.test(phone)) { fieldErr(f.ph, 'شمارهٔ موبایل معتبر وارد کنید؛ مثلاً ۰۹۱۲۳۴۵۶۷۸۹.'); bad = true; }
    if (!EMAIL_RE.test(email) || email.length > 254) { fieldErr(f.em, 'ایمیل معتبر وارد کنید.'); bad = true; }
    var pp = passProblem(pass);
    if (pp) { fieldErr(f.pw, pp); bad = true; }
    if (f.pw2.value !== pass) { fieldErr(f.pw2, 'تکرار رمز عبور با رمز عبور یکسان نیست.'); bad = true; }
    if (bad) { var firstBad = form.querySelector('[aria-invalid="true"]'); if (firstBad) firstBad.focus(); return; }

    return http('POST', '/auth/v1/signup', { json: { email: email, password: pass, data: { first_name: first, last_name: last, phone: phone } } }).then(function (res) {
      if (!res.ok) { showAlert('err', faError(res)); return; }
      if (res.data && res.data.access_token) {
        /* Confirm email is OFF in Supabase: the account is active immediately, no code step. */
        var s = saveSession(res.data, false);
        return profileExists(s).then(function (ok) {
          if (!ok) { showAlert('err', 'ثبت‌نام انجام شد، اما پروفایل ساخته نشد. لطفاً به پشتیبانی اطلاع دهید.'); return; }
          showAlert('ok', 'ثبت‌نام با موفقیت انجام شد. در حال انتقال به حساب کاربری…');
          setTimeout(function () { go('account.html'); }, 900);
        });
      }
      openCodeView({ email: email, type: 'signup', nextAt: now() + RESEND_SECONDS, fails: 0 },
        { kind: 'ok', text: 'کد تأیید به ایمیل شما ارسال شد. لطفاً ایمیل خود را بررسی کنید.' });
    });
  });

  guard($('vCode'), submitCode);
  $('cdResend').addEventListener('click', resendCode);
  $('cdBack').addEventListener('click', function () { clearPending(); hideAlert(); showView('signup'); });

  var p = getPending();
  if (p && p.type === 'signup') openCodeView(p, { kind: 'info', text: 'کد تأیید قبلاً به ایمیل شما ارسال شده است. کد را وارد کنید یا کد جدید بگیرید.' });
  else showView('signup');
}

/* ---------- account.html ---------- */
function initAccount() {
  var page = $('accountPage'), info = $('profileList'), form = $('profileForm');
  function toLogin() { go('login.html?next=account.html'); }
  freshSession().then(function (s) {
    if (!s) { toLogin(); return; }
    page.hidden = false;
    $('acEmail').textContent = (s.user && s.user.email) || '';

    function render(p) {
      if (!p) {
        showAlert('err', 'پروفایل شما هنوز ساخته نشده است. اگر تازه ثبت‌نام کرده‌اید چند لحظه بعد صفحه را تازه کنید؛ در غیر این صورت (یا اگر حساب شما غیرفعال شده است) به پشتیبانی اطلاع دهید.');
        form.hidden = true; return;
      }
      $('acName').textContent = [p.first_name, p.last_name].filter(Boolean).join(' ') || '—';
      $('acPhone').textContent = p.phone || '—';
      $('acSince').textContent = p.created_at ? new Date(p.created_at).toLocaleDateString('fa-IR') : '—';
      $('apFirst').value = p.first_name || ''; $('apLast').value = p.last_name || ''; $('apPhone').value = p.phone || '';
      form.hidden = false;
      if (!p.profile_complete) showAlert('info', 'پروفایل شما کامل نیست. نام، نام خانوادگی و شمارهٔ تماس را تکمیل کنید.');
    }
    var uid = s.user && s.user.id;
    http('GET', '/rest/v1/profiles?select=first_name,last_name,phone,created_at,profile_complete&id=eq.' + encodeURIComponent(uid), { token: s.access_token }).then(function (r) {
      if (r.status === 401) { clearSession(); toLogin(); return; }
      if (!r.ok) { showAlert('err', faError(r)); form.hidden = true; return; }
      render(Array.isArray(r.data) && r.data[0] || null);
    });

    guard(form, function () {
      var a = $('apFirst'), b = $('apLast'), c = $('apPhone'), bad = false;
      clearErrors(form); hideAlert();
      var first = a.value.trim(), last = b.value.trim(), phone = normPhone(c.value);
      if (!NAME_RE.test(first)) { fieldErr(a, 'نام را درست وارد کنید.'); bad = true; }
      if (!NAME_RE.test(last)) { fieldErr(b, 'نام خانوادگی را درست وارد کنید.'); bad = true; }
      if (!PHONE_RE.test(phone)) { fieldErr(c, 'شمارهٔ موبایل معتبر وارد کنید.'); bad = true; }
      if (bad) return;
      return freshSession().then(function (cur) {
        if (!cur) { toLogin(); return; }
        return http('PATCH', '/rest/v1/profiles?id=eq.' + encodeURIComponent(uid), { json: { first_name: first, last_name: last, phone: phone }, token: cur.access_token, prefer: 'return=representation' }).then(function (r) {
          if (r.status === 409) { fieldErr(c, 'این شماره قبلاً برای حساب دیگری ثبت شده است.'); return; }
          if (!r.ok || !Array.isArray(r.data) || !r.data.length) { showAlert('err', r.ok ? 'ذخیره انجام نشد؛ پروفایل پیدا نشد.' : faError(r)); return; }
          render(r.data[0]);
          showAlert('ok', 'اطلاعات شما ذخیره شد.');
        });
      });
    });

    $('acLogout').addEventListener('click', function () {
      var btn = $('acLogout'); setBusy(btn, true);
      var cur = readSession();
      (cur ? http('POST', '/auth/v1/logout', { token: cur.access_token }) : Promise.resolve()).then(function () {
        clearSession(); clearPending(); go('login.html');
      });
    });
  });
}

/* ---------- boot ---------- */
if (!API || !KEY) { showAlert('err', 'پیکربندی اتصال به Supabase کامل نیست (js/config.js).'); return; }
bindPwToggles();
if (PAGE === 'account') { initAccount(); return; }
/* already signed in? skip the forms (a pending verification or ?switch keeps the page open) */
freshSession().then(function (s) {
  if (s && !getPending() && !/[?&]switch\b/.test(W.location.search)) { go(safeNext()); return; }
  if (PAGE === 'login') initLogin(); else if (PAGE === 'signup') initSignup();
});
})();
