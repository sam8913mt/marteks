/* ============================================================
   Merteks AI shared data layer (app.html + ai.html)
   - In the Android app the accounts remembered on the phone, the daily allowance and
     the offline model live natively in window.MerteksNative; on the website the same
     calls fall back to localStorage.
   - Server side (Supabase, migration-ai-accounts.sql + Edge Function "ai-chat"): the
     online model is reached only through the server, which holds the AI key and checks
     the on/off switch, bans and the daily allowance before every message. The app keeps
     the last answer of the server (allowance used, ban, on/off) to draw its screens.
     Tokens of offline answers are reported later from a small queue.
   - The PRO subscription sheet is shared by both screens.
   ============================================================ */
(function () {
'use strict';
var D = document, W = window, N = W.MerteksNative || null, CFG = W.MERTEKS_CONFIG || {};
var FREE_LIMIT = 10;
var SB = String(CFG.supabaseUrl || '').replace(/\/+$/, ''), SBKEY = CFG.supabaseKey || '';

function ls(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function json(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; } }
/* YYYY-MM-DD in Tehran time, the day the server counts usage in */
function tehranDay() {
  try {
    var p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(p)) return p;
  } catch (e) {}
  return new Date().toISOString().slice(0, 10);
}

/* web: one list of accounts + the active phone number (older builds kept a single profile) */
function webAccounts() {
  var list = ls('mx_ai_accounts');
  if (!Array.isArray(list)) {
    list = [];
    var old = ls('mx_ai_profile');
    if (old && old.name && old.phone) { list.push({ name: old.name, phone: old.phone }); lsSet('mx_ai_active', old.phone); }
    lsSet('mx_ai_accounts', list);
  }
  return list;
}

/* ---------- Supabase RPC: resolves {ok, data} or null when the server can't be reached ---------- */
function rpc(name, args, timeoutMs) {
  if (!SB || !SBKEY || !W.fetch) return Promise.resolve(null);
  var ctl = W.AbortController ? new AbortController() : null;
  var timer = ctl ? setTimeout(function () { ctl.abort(); }, timeoutMs || 8000) : null;
  return fetch(SB + '/rest/v1/rpc/' + name, {
    method: 'POST',
    headers: { apikey: SBKEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
    cache: 'no-store',
    signal: ctl ? ctl.signal : undefined
  }).then(function (r) {
    if (timer) clearTimeout(timer);
    return r.json().catch(function () { return null; }).then(function (d) { return { ok: r.ok, data: d }; });
  }, function () { if (timer) clearTimeout(timer); return null; });
}

var S = {
  native: !!N,
  limit: FREE_LIMIT,
  fa: function (n) { return String(n).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.charAt(+d); }); },
  mask: function (phone) { phone = String(phone || ''); return phone.slice(0, 4) + '•••' + phone.slice(-4); },

  profile: function () {
    if (N) return json(N.getProfile(), null);
    var active = ls('mx_ai_active');
    var hit = webAccounts().filter(function (a) { return a.phone === active; })[0];
    return hit || null;
  },
  accounts: function () {
    if (N) return json(N.getAccounts(), []);
    return webAccounts();
  },
  save: function (name, phone) {
    if (N) return !!N.saveProfile(name, phone);
    var list = webAccounts().filter(function (a) { return a.phone !== phone; });
    list.unshift({ name: name, phone: phone, at: Date.now() });
    return lsSet('mx_ai_accounts', list) && lsSet('mx_ai_active', phone);
  },
  switchTo: function (phone) {
    if (N) return !!N.switchAccount(phone);
    var hit = webAccounts().filter(function (a) { return a.phone === phone; })[0];
    return hit ? S.save(hit.name, hit.phone) : false;
  },
  logout: function () {
    if (N) return !!N.logout();
    return lsSet('mx_ai_active', '');
  },
  forget: function (phone) {
    if (N) return !!N.forgetAccount(phone);
    lsSet('mx_ai_accounts', webAccounts().filter(function (a) { return a.phone !== phone; }));
    if (ls('mx_ai_active') === phone) lsSet('mx_ai_active', '');
    return true;
  },

  /* the allowance itself is never shown as a count, only as a percentage;
     the server is the one that counts, the app shows what it last reported */
  quota: function () {
    var p = S.profile(), svc = ls('mxai_service') || {};
    var lim = svc.limit | 0 || FREE_LIMIT;
    var day = tehranDay(), q = p ? ls('mxai_q_' + p.phone) : null, dq = ls('mxai_q_dev');
    /* the allowance belongs to the phone: switching accounts never shows a fresh one */
    var used = Math.max(q && q.day === day ? q.used | 0 : 0, dq && dq.day === day ? dq.used | 0 : 0);
    if (q && q.day === day && q.limit) lim = q.limit | 0;
    return { used: Math.min(used, lim), limit: lim };
  },
  percent: function () { var q = S.quota(); return q.limit ? Math.min(100, Math.round(q.used * 100 / q.limit)) : 0; },
  /* the admin's on/off switch for the whole assistant (last known value) */
  enabled: function () { var v = ls('mxai_service'); return !v || v.enabled !== false; },
  _keep: function (phone, d) {
    if (!d || typeof d !== 'object') return;
    if (typeof d.enabled === 'boolean' || d.code === 'disabled') {
      var svc = ls('mxai_service') || {};
      svc.enabled = d.code === 'disabled' ? false : d.enabled;
      if (d.limit) svc.limit = d.limit | 0;
      svc.at = Date.now();
      lsSet('mxai_service', svc);
    }
    if (phone && typeof d.used === 'number') lsSet('mxai_q_' + phone, { day: tehranDay(), used: d.used, limit: d.limit | 0 || FREE_LIMIT });
    if (typeof d.device_used === 'number') lsSet('mxai_q_dev', { day: tehranDay(), used: d.device_used });
    if (phone && (d.ok === true || d.code === 'banned')) {
      lsSet('mxai_ban_' + phone, { banned: !!d.banned, until: d.banned_until || null, forever: !!d.forever, reason: d.reason || '', at: Date.now() });
    }
  },

  /* {free:{configured,limit}, pro:{enabled}, offline:{supported, ramGb, recommended, models:[...]}} */
  models: function () {
    if (N && N.getModels) return json(N.getModels(), null);
    return { pro: { enabled: false }, offline: { supported: false, models: [] } };
  },
  offline: function () { var m = S.models(); return m && m.offline ? m.offline : { supported: false, models: [] }; },
  offlineReady: function () { return S.offline().models.some(function (m) { return m.state === 'ready'; }); },

  online: function () {
    if (N && N.isOnline) { try { return !!N.isOnline(); } catch (e) {} }
    return navigator.onLine !== false;
  },

  /* ---------- server: registration, status, the online model ---------- */
  device: function () { return S.platform() + ' ' + W.screen.width + 'x' + W.screen.height; },
  /* where the app runs: Android app, Windows app, iPhone/iPad (Safari or home-screen app) or a browser */
  platform: function () {
    if (W.MerteksDesktop) return 'اپ ویندوز';
    if (N) return 'اپ اندروید';
    var ua = navigator.userAgent || '';
    var ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    var home = W.navigator.standalone === true || (W.matchMedia && W.matchMedia('(display-mode: standalone)').matches);
    if (ios) return home ? 'اپ آیفون' : 'وب آیفون';
    return home ? 'وب‌اپ' : 'وب';
  },
  /* stable id of this phone (native) or this browser, for the per-phone allowance */
  deviceId: function () {
    if (N && N.deviceId) { try { var d = N.deviceId(); if (d) return d; } catch (e) {} }
    /* the Windows app gives a stable id of the computer */
    var dk = W.MerteksDesktop;
    if (dk && /^[A-Za-z0-9_-]{8,80}$/.test(dk.deviceId || '')) return dk.deviceId;
    var id = ls('mxai_device');
    if (!id) {
      var r = '';
      for (var i = 0; i < 32; i++) r += Math.floor(Math.random() * 16).toString(16);
      id = 'w-' + r;
      lsSet('mxai_device', id);
    }
    return id;
  },

  /* last known ban state of an account: {banned, until, forever, reason} */
  ban: function (phone) {
    var b = ls('mxai_ban_' + phone);
    if (!b || !b.banned) return null;
    if (!b.forever && b.until && Date.parse(b.until) <= Date.now()) return null;
    return b;
  },
  /* sign-up / sign-in; refreshes ban, allowance and the on/off switch */
  register: function (p) {
    if (!p) return Promise.resolve(null);
    return rpc('ai_register', { p_phone: p.phone, p_name: p.name, p_device: S.device(), p_device_id: S.deviceId() }).then(function (r) {
      if (r && r.ok && r.data) { S._keep(p.phone, r.data); S._taken(p.phone, r.data); }
      S.flushUsage();
      return r && r.data;
    });
  },
  /* sign-up / sign-in with a password (the server keeps only its bcrypt hash).
     resolves the server's answer, {ok:false, code:'server'} on a server error, or null when offline */
  signup: function (p, pass) {
    return S._auth('ai_signup', p.phone, { p_phone: p.phone, p_name: p.name, p_password: pass, p_device: S.device(), p_device_id: S.deviceId() });
  },
  login: function (phone, pass) {
    return S._auth('ai_login', phone, { p_phone: phone, p_password: pass, p_device: S.device(), p_device_id: S.deviceId() });
  },
  _auth: function (fn, phone, args) {
    return rpc(fn, args).then(function (r) {
      if (!r) return null;
      if (!r.ok || !r.data) return { ok: false, code: 'server' };
      S._keep(phone, r.data);
      S._taken(phone, r.data);
      if (r.data.ok !== false) S.flushUsage();
      return r.data;
    });
  },
  /* tokens of the market section: {balance, bonus, pro, pro_until, pro_tokens, bourse}; cached per account */
  wallet: function (phone) { return ls('mxai_w_' + phone); },
  _wallet: function (phone, d) {
    if (phone && d && typeof d.balance === 'number') {
      lsSet('mxai_w_' + phone, { balance: d.balance, bonus: d.bonus | 0, pro: !!d.pro, pro_until: d.pro_until || null, pro_tokens: d.pro_tokens | 0, bourse: d.bourse !== false, at: Date.now() });
    }
  },
  loadWallet: function (p) {
    if (!p) return Promise.resolve(null);
    return rpc('ai_wallet', { p_phone: p.phone, p_device_id: S.deviceId() }, 6000).then(function (r) {
      if (r && r.ok && r.data) { S._wallet(p.phone, r.data); S._taken(p.phone, r.data); }
      return S.wallet(p.phone);
    });
  },
  /* prices for the market chart (the server refreshes them at most once an hour) */
  market: function (p) {
    if (!p || !SB || !SBKEY || !W.fetch) return Promise.resolve(null);
    return fetch(SB + '/functions/v1/ai-chat', {
      method: 'POST',
      headers: { apikey: SBKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: p.phone, device: S.deviceId(), mode: 'market' }),
      cache: 'no-store'
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok && d.market) lsSet('mxai_market', { market: d.market, at: d.at });
      return d;
    }, function () { return null; });
  },
  lastMarket: function () { return ls('mxai_market'); },
  /* the server says this number belongs to another phone: it can't be used here */
  _taken: function (phone, d) {
    if (!d || d.code !== 'exists') return false;
    if (S.accounts().some(function (a) { return a.phone === phone; })) {
      S.forget(phone);
      lsSet('mxai_taken', { phone: phone, at: Date.now() });
    }
    return true;
  },
  /* shown once after an account was removed because its number belongs to another phone */
  takenNotice: function () {
    var t = ls('mxai_taken');
    if (!t || !t.phone) return '';
    lsSet('mxai_taken', null);
    return 'شمارهٔ ' + S.mask(t.phone) + ' قبلاً روی گوشی دیگری ثبت شده و از این گوشی برداشته شد.';
  },
  /* fresh status before a message; falls back to the last known state when offline */
  checkStatus: function (p) {
    if (!p) return Promise.resolve(null);
    return rpc('ai_status', { p_phone: p.phone, p_device_id: S.deviceId() }, 5000).then(function (r) {
      if (r && r.ok && r.data) {
        S._keep(p.phone, r.data);
        S._taken(p.phone, r.data);
        if (r.data.ok === false && r.data.code === 'unknown') return S.register(p);
      }
      return r && r.data;
    });
  },
  /* the online model, through the server function that holds the key and enforces the rules.
     resolves {ok, answer, inTok, outTok} or {ok:false, error}; never rejects */
  /* extra: {mode:'study'|'bourse', study:{…}} for the study and market sections */
  askOnline: function (p, messages, retried, extra) {
    if (!SB || !SBKEY || !W.fetch) return Promise.resolve({ ok: false, error: 'unavailable' });
    var ctl = W.AbortController ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 150000) : null;
    return fetch(SB + '/functions/v1/ai-chat', {
      method: 'POST',
      headers: { apikey: SBKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ phone: p.phone, device: S.deviceId(), messages: messages }, extra || {})),
      cache: 'no-store',
      signal: ctl ? ctl.signal : undefined
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      return res.json().catch(function () { return null; }).then(function (d) {
        if (!d || typeof d !== 'object') return { ok: false, error: res.status === 404 ? 'unavailable' : 'http_' + res.status };
        S._keep(p.phone, d);
        S._taken(p.phone, d);
        S._wallet(p.phone, d);
        if (d.ok) return d;
        /* an account made before the server was set up: register it once and try again */
        if (d.error === 'unknown' && !retried) return S.register(p).then(function () { return S.askOnline(p, messages, true, extra); });
        if (res.status === 404 || d.error === 'not_configured' || d.error === 'server') return { ok: false, error: 'unavailable' };
        return d;
      });
    }, function (e) {
      if (timer) clearTimeout(timer);
      return { ok: false, error: e && e.name === 'AbortError' ? 'timeout' : 'network' };
    });
  },
  /* tokens of an answer given by the OFFLINE model (online answers are counted by the server) */
  logOffline: function (phone, inTok, outTok) {
    var box = ls('mxai_usage_outbox') || [];
    box.push({ p: phone, i: inTok | 0, o: outTok | 0, d: tehranDay() });
    lsSet('mxai_usage_outbox', box.slice(-200));
    S.flushUsage();
  },
  _flushing: false,
  flushUsage: function () {
    if (S._flushing) return;
    var box = ls('mxai_usage_outbox') || [];
    if (!box.length) return;
    S._flushing = true;
    (function next() {
      var item = (ls('mxai_usage_outbox') || [])[0];
      if (!item) { S._flushing = false; return; }
      rpc('ai_log_usage', { p_phone: item.p, p_input: item.i, p_output: item.o, p_day: item.d }).then(function (r) {
        /* offline, server not set up yet or rate limited: keep it and try later */
        if (!r || !r.ok || (r.data && r.data.code === 'rate_limited')) { S._flushing = false; return; }
        var rest = (ls('mxai_usage_outbox') || []).slice(1);
        lsSet('mxai_usage_outbox', rest);
        next();
      });
    })();
  },

  /* ---------- PRO subscription sheet (shared) ---------- */
  subscription: (function () {
    var el = null, scrim = null;
    function build() {
      scrim = D.createElement('div');
      scrim.className = 'scrim sub-scrim';
      scrim.hidden = true;
      el = D.createElement('div');
      el.className = 'sheet sub-sheet';
      el.setAttribute('role', 'dialog');
      el.setAttribute('aria-modal', 'true');
      el.setAttribute('aria-labelledby', 'subTitle');
      el.hidden = true;
      var tick = '<svg class="i" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>';
      el.innerHTML =
        '<div class="sheet-grab" aria-hidden="true"></div>' +
        '<div class="sub-hero"><span class="sub-crown" aria-hidden="true"><svg class="i" viewBox="0 0 24 24"><path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/></svg></span>' +
        '<h3 id="subTitle">اشتراک <b dir="ltr">Merteks AI PRO</b></h3>' +
        '<p>قوی‌ترین مدل‌های هوش مصنوعی دنیا، همه در یک برنامه</p></div>' +
        '<ul class="sub-feats">' +
        '<li>' + tick + '<span dir="ltr">Claude Opus 5 · Claude Sonnet 5 · Claude Fable 5.1</span></li>' +
        '<li>' + tick + '<span dir="ltr">GPT-6 Sol · GPT-6 Astra · GPT-5.5</span></li>' +
        '<li>' + tick + '<span>سهم استفادهٔ روزانهٔ خیلی بیشتر</span></li>' +
        '<li>' + tick + '<span>اولویت در پاسخ‌گویی و پیوست‌های بزرگ‌تر</span></li>' +
        '</ul>' +
        '<div class="sub-plans" role="radiogroup" aria-label="مدت اشتراک">' +
        '<button type="button" class="sub-plan" role="radio" aria-checked="false"><b>ماهانه</b><small>۱ ماه</small></button>' +
        '<button type="button" class="sub-plan on" role="radio" aria-checked="true"><em>محبوب</em><b>سه‌ماهه</b><small>۳ ماه</small></button>' +
        '<button type="button" class="sub-plan" role="radio" aria-checked="false"><b>سالانه</b><small>۱۲ ماه</small></button>' +
        '</div>' +
        '<p class="sub-alert" id="subAlert" role="alert" hidden>به دلیل به‌روزرسانی برنامه، خرید اشتراک فعلاً مقدور نمی‌باشد. به‌زودی دوباره فعال می‌شود.</p>' +
        '<button type="button" class="btn primary block sub-buy" id="subBuy">خرید اشتراک</button>' +
        '<button type="button" class="btn block sub-close" id="subClose">بستن</button>';
      D.body.appendChild(scrim);
      D.body.appendChild(el);
      scrim.addEventListener('click', close);
      el.querySelector('#subClose').addEventListener('click', close);
      el.querySelector('.sub-plans').addEventListener('click', function (e) {
        var b = e.target.closest('.sub-plan');
        if (!b) return;
        Array.prototype.forEach.call(el.querySelectorAll('.sub-plan'), function (x) {
          x.classList.toggle('on', x === b);
          x.setAttribute('aria-checked', String(x === b));
        });
      });
      el.querySelector('#subBuy').addEventListener('click', function () {
        var a = el.querySelector('#subAlert');
        a.hidden = false;
        a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake');
      });
    }
    function open() {
      if (!el) build();
      el.querySelector('#subAlert').hidden = true;
      scrim.hidden = false;
      el.hidden = false;
    }
    function close() {
      if (!el || el.hidden) return false;
      el.hidden = true;
      scrim.hidden = true;
      return true;
    }
    return { open: open, close: close };
  })()
};
W.addEventListener('online', function () { S.flushUsage(); });

/* the Windows app shows these same pages: there the device is a computer, not a phone */
S.dv = function (s) {
  return W.MerteksDesktop ? String(s).replace(/گوشی دیگری/g, 'دستگاه دیگری').replace(/گوشی‌تان/g, 'کامپیوترتان').replace(/گوشی/g, 'کامپیوتر') : s;
};
if (W.MerteksDesktop && document.body) {
  /* the pages' fixed texts (never the chat itself) */
  var walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: function (n) { return n.parentNode.closest('#thread') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
  });
  for (var tn = walk.nextNode(); tn; tn = walk.nextNode()) {
    if (tn.nodeValue.indexOf('گوشی') >= 0) tn.nodeValue = S.dv(tn.nodeValue);
  }
}
W.MXStore = S;
})();
