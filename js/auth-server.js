/* Merteks AI sign-in for the website. Same screens and same server calls as the app:
   the accounts live in Supabase (functions ai_signup / ai_login, password kept only as a hash
   by the server). Nothing is changed on the server; this file only calls what the app calls.
   Accounts remembered in this browser use the app's own keys (mx_ai_accounts / mx_ai_active). */
(function () {
  'use strict';
  var D = document, W = window;
  var CFG = W.MERTEKS_CONFIG || {};
  var SB = String(CFG.supabaseUrl || '').replace(/\/+$/, ''), SBKEY = CFG.supabaseKey || '';
  var busy = false;

  function $(id) { return D.getElementById(id); }
  function ls(k) { try { return JSON.parse(W.localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function lsSet(k, v) { try { W.localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function enDigits(v) {
    return String(v == null ? '' : v)
      .replace(/[\u06F0-\u06F9]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
      .replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
  }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function mask(phone) { phone = String(phone || ''); return phone.slice(0, 4) + '•••' + phone.slice(-4); }
  var NAME_RE = /^[\u0600-\u06FFa-zA-Z0-9_. \u200c-]{2,30}$/;
  var OFFLINE = 'اتصال به سرور برقرار نشد؛ اینترنت را بررسی کنید و دوباره امتحان کنید.';

  /* ---------- the same device id / label the app sends ---------- */
  function platform() {
    var ua = navigator.userAgent || '';
    var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var home = W.navigator.standalone === true || (W.matchMedia && W.matchMedia('(display-mode: standalone)').matches);
    if (ios) return home ? 'اپ آیفون' : 'وب آیفون';
    return home ? 'وب‌اپ' : 'وب';
  }
  function device() { return platform() + ' ' + W.screen.width + 'x' + W.screen.height; }
  function deviceId() {
    var id = ls('mxai_device');
    if (!id) {
      var r = '';
      for (var i = 0; i < 32; i++) r += Math.floor(Math.random() * 16).toString(16);
      id = 'w-' + r; lsSet('mxai_device', id);
    }
    return id;
  }

  /* ---------- server call: {ok, data} or null when the server can't be reached ---------- */
  function rpc(name, args, timeoutMs) {
    if (!SB || !SBKEY || !W.fetch) return Promise.resolve(null);
    var ctl = W.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 12000) : null;
    return fetch(SB + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: { apikey: SBKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args || {}), cache: 'no-store', signal: ctl ? ctl.signal : undefined
    }).then(function (r) {
      if (timer) clearTimeout(timer);
      return r.json().catch(function () { return null; }).then(function (d) { return { ok: r.ok, data: d }; });
    }, function () { if (timer) clearTimeout(timer); return null; });
  }
  /* resolves the server's answer, {ok:false, code:'server'} on a server error, null when offline */
  function auth(fn, args) {
    return rpc(fn, args).then(function (r) {
      if (!r) return null;
      if (!r.ok || !r.data) return { ok: false, code: 'server' };
      return r.data;
    });
  }

  /* ---------- accounts remembered in this browser ---------- */
  function accounts() { var l = ls('mx_ai_accounts'); return Array.isArray(l) ? l : []; }
  function save(name, phone) {
    var list = accounts().filter(function (a) { return a.phone !== phone; });
    list.unshift({ name: name, phone: phone, at: Date.now() });
    return lsSet('mx_ai_accounts', list) && lsSet('mx_ai_active', phone);
  }
  function forget(phone) {
    lsSet('mx_ai_accounts', accounts().filter(function (a) { return a.phone !== phone; }));
    if (ls('mx_ai_active') === phone) lsSet('mx_ai_active', '');
  }

  /* ---------- tabs ---------- */
  function showTab(which, focus) {
    var login = which === 'in';
    $('obLogin').hidden = !login;
    $('obForm').hidden = login;
    $('obTabIn').setAttribute('aria-selected', String(login));
    $('obTabUp').setAttribute('aria-selected', String(!login));
    $('obLErr').textContent = ''; $('obErr').textContent = '';
    if (focus) (login ? $('obLPhone') : $('obName')).focus();
  }
  $('obTabIn').addEventListener('click', function () { showTab('in', true); });
  $('obTabUp').addEventListener('click', function () { showTab('up', true); });

  function renderSaved() {
    var list = accounts(), box = $('obAccounts'), el = $('obAccList');
    box.hidden = !list.length; el.textContent = '';
    list.forEach(function (a) {
      var row = D.createElement('div'); row.className = 'ob-acc-row';
      var go = D.createElement('button'); go.type = 'button'; go.className = 'ob-acc';
      var av = D.createElement('span'); av.className = 'ob-acc-av'; av.setAttribute('aria-hidden', 'true'); av.textContent = String(a.name || '?').charAt(0);
      var t = D.createElement('span');
      var nm = D.createElement('span'); nm.className = 'ob-acc-name'; nm.textContent = a.name || a.phone;
      var ph = D.createElement('span'); ph.className = 'ob-acc-phone'; ph.textContent = mask(a.phone);
      t.appendChild(nm); t.appendChild(ph); go.appendChild(av); go.appendChild(t);
      go.addEventListener('click', function () {
        $('obLPhone').value = a.phone; $('obLPass').value = ''; $('obLErr').textContent = '';
        showTab('in', false); $('obLPass').focus();
      });
      var x = D.createElement('button'); x.type = 'button'; x.className = 'ob-acc-x';
      x.setAttribute('aria-label', 'حذف این حساب از این مرورگر'); x.textContent = '×';
      x.addEventListener('click', function () { forget(a.phone); renderSaved(); });
      row.appendChild(go); row.appendChild(x); el.appendChild(row);
    });
  }

  /* ---------- show / hide password ---------- */
  Array.prototype.forEach.call(D.querySelectorAll('.ob-eye'), function (btn) {
    btn.addEventListener('click', function () {
      var input = btn.parentNode.querySelector('input'), show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', String(show));
      btn.textContent = show ? 'مخفی' : 'نمایش';
    });
  });

  function bad(err, el, msg) { err.textContent = msg; if (el) { el.setAttribute('aria-invalid', 'true'); el.focus(); } }
  function busyOn(form, on) {
    var b = form.querySelector('[type="submit"]');
    if (on) { b.setAttribute('data-label', b.textContent); b.textContent = 'در حال بررسی…'; }
    else b.textContent = b.getAttribute('data-label') || b.textContent;
    b.disabled = on; busy = on;
  }
  function enter(form, name, phone, isNew) {
    if (!save(name, phone)) return false;
    if (isNew) rpc('chat_start', { p_id: uid('U-'), p_name: name, p_phone: phone });
    Array.prototype.forEach.call(form.querySelectorAll('input'), function (i) { i.value = ''; });
    return true;
  }
  /* مقصد بعد از ورود: فقط صفحات داخلی ساده (نام.html) و نه صفحات ورود/ثبت‌نام/حساب/ادمین؛ هر چیز دیگر (آدرس خارجی، //، مسیر، پارامتر) رد می‌شود.
     account.html عمداً مجاز نیست: آن صفحه نشست Supabase Auth می‌خواهد که این ورود نمی‌سازد (حلقهٔ بازگشت به login). */
  function safeNext() {
    var n = '';
    try { n = new URLSearchParams(W.location.search).get('next') || ''; } catch (e) {}
    return /^[a-z0-9-]+\.html$/i.test(n) && !/^(login|signup|account|admin[a-z-]*|404)\.html$/i.test(n) ? n : 'index.html';
  }
  function go() { W.location.href = safeNext(); }

  /* ---------- sign in ---------- */
  $('obLogin').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var form = this, phoneEl = $('obLPhone'), passEl = $('obLPass'), err = $('obLErr');
    var phone = enDigits(phoneEl.value).replace(/[\s\-()]/g, ''), pass = passEl.value;
    phoneEl.removeAttribute('aria-invalid'); passEl.removeAttribute('aria-invalid'); err.textContent = '';
    if (!/^09\d{9}$/.test(phone)) return bad(err, phoneEl, 'شمارهٔ موبایل را درست وارد کنید؛ مثل ۰۹۱۲۳۴۵۶۷۸۹');
    if (!pass) return bad(err, passEl, 'رمز عبور را وارد کنید.');
    busyOn(form, true);
    auth('ai_login', { p_phone: phone, p_password: pass, p_device: device(), p_device_id: deviceId() }).then(function (d) {
      busyOn(form, false);
      if (!d) return bad(err, null, OFFLINE);
      if (d.ok === false) {
        renderSaved();
        if (d.code === 'unknown') return bad(err, phoneEl, 'حسابی با این شماره پیدا نشد؛ اول ثبت‌نام کنید.');
        if (d.code === 'wrong_password') { passEl.value = ''; return bad(err, passEl, 'رمز عبور اشتباه است.'); }
        if (d.code === 'no_password') return bad(err, phoneEl, 'برای این شماره هنوز رمز عبور ساخته نشده؛ از بخش «ثبت‌نام» با همین شماره یک رمز بسازید.');
        if (d.code === 'exists') { forget(phone); renderSaved(); return bad(err, phoneEl, 'این شماره روی دستگاه دیگری ثبت شده و از این مرورگر نمی‌شود وارد آن شد.'); }
        if (d.code === 'invalid') return bad(err, phoneEl, 'شمارهٔ موبایل را درست وارد کنید؛ مثل ۰۹۱۲۳۴۵۶۷۸۹');
        if (d.code === 'rate_limited') return bad(err, null, 'تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید.');
        return bad(err, null, 'ورود انجام نشد؛ دوباره امتحان کنید.');
      }
      var name = d.name || phone;
      if (!enter(form, name, phone, false)) return bad(err, null, 'ذخیرهٔ اطلاعات انجام نشد؛ دوباره امتحان کنید.');
      go();
    });
  });

  /* ---------- sign up ---------- */
  $('obForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var form = this, nameEl = $('obName'), phoneEl = $('obPhone'), passEl = $('obPass'), pass2El = $('obPass2'), err = $('obErr');
    var name = nameEl.value.replace(/\s+/g, ' ').trim(), phone = enDigits(phoneEl.value).replace(/[\s\-()]/g, ''), pass = passEl.value;
    [nameEl, phoneEl, passEl, pass2El].forEach(function (i) { i.removeAttribute('aria-invalid'); });
    err.textContent = '';
    if (!NAME_RE.test(name) || name.indexOf(' ') < 1) return bad(err, nameEl, 'نام و نام خانوادگی را کامل بنویسید (تا ۳۰ حرف)؛ مثل سارا رضایی');
    if (!/^09\d{9}$/.test(phone)) return bad(err, phoneEl, 'شمارهٔ موبایل را درست وارد کنید؛ مثل ۰۹۱۲۳۴۵۶۷۸۹');
    if (pass.length < 8 || !/\d/.test(pass) || !/\D/.test(pass)) return bad(err, passEl, 'رمز عبور باید دست‌کم ۸ نویسه و شامل حرف و عدد باشد.');
    if (pass2El.value !== pass) return bad(err, pass2El, 'تکرار رمز عبور با رمز عبور یکسان نیست.');
    busyOn(form, true);
    auth('ai_signup', { p_phone: phone, p_name: name, p_password: pass, p_device: device(), p_device_id: deviceId() }).then(function (d) {
      busyOn(form, false);
      if (!d) return bad(err, null, OFFLINE);
      if (d.ok === false) {
        if (d.code === 'registered') return bad(err, phoneEl, 'با این شماره قبلاً ثبت‌نام شده؛ از بخش «ورود» با رمز عبورتان وارد شوید.');
        if (d.code === 'exists') return bad(err, phoneEl, 'این شماره روی دستگاه دیگری ثبت شده و نمی‌شود با آن حساب جدید ساخت.');
        if (d.code === 'weak_password') return bad(err, passEl, 'رمز عبور باید دست‌کم ۸ نویسه و شامل حرف و عدد باشد.');
        if (d.code === 'invalid') return bad(err, nameEl, 'نام و شماره را بررسی کنید.');
        if (d.code === 'rate_limited') return bad(err, null, 'تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید.');
        return bad(err, null, 'ثبت‌نام انجام نشد؛ دوباره امتحان کنید.');
      }
      var existed = !!d.existed, real = existed && d.name ? d.name : name;
      if (!enter(form, real, phone, !existed)) return bad(err, null, 'ذخیرهٔ اطلاعات انجام نشد؛ دوباره امتحان کنید.');
      go();
    });
  });

  renderSaved();
  showTab(D.body.getAttribute('data-page') === 'login' ? 'in' : 'up', false);
})();
