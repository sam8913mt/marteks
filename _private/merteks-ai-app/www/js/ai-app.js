/* ============================================================
   Merteks AI chat screen (ai.html)
   - Accounts: sign up once (username + mobile); the phone remembers every account that
     signed in, so after "log out" coming back is one tap.
   - Models: "Merteks AI" (free, daily allowance, reached only through the server function
     "ai-chat" that holds the key), "Merteks AI offline" (runs on the phone's RAM after a
     one-time download, no internet) and PRO models shown locked until subscriptions open.
   - The admin can switch the whole assistant off; every phone then shows
     "Merteks AI در حال به‌روزرسانی است" and nothing can be sent, offline included.
   - Photos (camera / gallery), PDFs and text/code files can be attached (online model).
   - Shared storage and native calls go through window.MXStore (js/mx-store.js).
   - Conversations are kept per account on the device; every exchange is also saved to
     Supabase (chat_start / chat_message) for the admin panel.
   ============================================================ */
(function () {
'use strict';
var D = document, W = window, N = W.MerteksNative || null, S = W.MXStore, CFG = W.MERTEKS_CONFIG || {};
var MAX_ATTS = 4, IMG_MAX = 1600, TEXT_MAX = 30000;
var PDF_MAX = 8 * 1024 * 1024, RAW_MAX = 20 * 1024 * 1024;
var SB = String(CFG.supabaseUrl || '').replace(/\/+$/, ''), SBKEY = CFG.supabaseKey || '';
var reduced = false, finePointer = false;
try { reduced = W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
try { finePointer = W.matchMedia('(hover: hover) and (pointer: fine)').matches; } catch (e) {}

/* ---------- helpers ---------- */
function $(id) { return D.getElementById(id); }
var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
var fa = S.fa;
function enDigits(v) {
  return String(v == null ? '' : v)
    .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
}
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function mb(bytes) { return bytes >= 1e9 ? fa((bytes / 1073741824).toFixed(1)) + ' گیگابایت' : fa(Math.round(bytes / 1048576)) + ' مگابایت'; }
var toastTimer;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3000);
}
function shake(el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }

var IC = {
  copy: '<svg class="i" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6a2 2 0 0 1 2-2h8"/></svg>',
  check: '<svg class="i" viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>',
  file: '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/></svg>',
  trash: '<svg class="i" viewBox="0 0 24 24"><path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/></svg>',
  pen: '<svg class="i" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  image: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/></svg>',
  translate: '<svg class="i" viewBox="0 0 24 24"><path d="M4 5h8M8 3v2M5.5 5c.8 3 3 5.5 5.5 6.5M10.5 5c-.8 3-3 5.5-5.5 6.5"/><path d="M13 21l4-9 4 9M14.5 18h5"/></svg>',
  code: '<svg class="i" viewBox="0 0 24 24"><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/></svg>',
  lock: '<svg class="i" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
  offline: '<svg class="i" viewBox="0 0 24 24"><rect x="6" y="2.5" width="12" height="19" rx="3"/><path d="M10 6h4"/><path d="M12 10v6M9.5 13.5L12 16l2.5-2.5"/></svg>',
  x: '<svg class="i" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'
};
var LOGO_SM = 'assets/merteks-ai-128.png', LOGO = 'assets/merteks-ai-512.png';

/* PRO models (Noqte); shown with their real names, locked until subscriptions open */
var PRO = [
  { name: 'Claude Opus 5', by: 'Anthropic', note: 'قوی‌ترین برای تحلیل و نوشتن', mark: 'A', tone: 'amber' },
  { name: 'Claude Sonnet 5', by: 'Anthropic', note: 'سریع و دقیق برای کارهای روزمره', mark: 'A', tone: 'amber' },
  { name: 'Claude Fable 5.1', by: 'Anthropic', note: 'استدلال و برنامه‌نویسی پیشرفته', mark: 'A', tone: 'amber' },
  { name: 'GPT-6 Sol', by: 'OpenAI', note: 'نسل جدید GPT', mark: 'G', tone: 'green' },
  { name: 'GPT-6 Astra', by: 'OpenAI', note: 'خلاقیت و گفتگوی طبیعی', mark: 'G', tone: 'green' },
  { name: 'GPT-5.5', by: 'OpenAI', note: 'همه‌کاره و قابل اعتماد', mark: 'G', tone: 'green' },
  { name: 'Claude Haiku 4.5', by: 'Anthropic', note: 'سبک و بسیار سریع', mark: 'A', tone: 'amber' },
  { name: 'Noqte 1.2', by: 'Noqte', note: 'مدل ایرانی نقطه', mark: 'N', tone: 'violet' }
];

/* ---------- Supabase logging (same RPCs the website uses) ---------- */
function rpc(name, args) {
  if (!SB || !SBKEY || !W.fetch) return;
  try {
    fetch(SB + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: SBKEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      keepalive: true
    }).catch(function () {});
  } catch (e) {}
}
var DEVICE = (N ? 'app ' : 'web ') + W.innerWidth + 'x' + W.innerHeight;

/* ---------- AI request: resolves {ok, answer} | {ok:false, error}; never rejects ---------- */
var pending = {}, streams = {}, seq = 0;
W.MXNativeReply = function (id, json) {
  var cb = pending[id];
  if (!cb) return;
  delete pending[id];
  delete streams[id];
  var d;
  try { d = JSON.parse(json); } catch (e) { d = { ok: false, error: 'bad_reply' }; }
  cb(d);
};
W.MXNativeStream = function (id, text) { var f = streams[id]; if (f) f(text); };

function askAI(messages, which, onStream) {
  if (which === 'free') return S.askOnline(profile, messages);
  if (!N) return Promise.resolve({ ok: false, error: which === 'offline' ? 'offline_missing' : 'locked' });
  return new Promise(function (resolve) {
    var id = 'q' + (++seq);
    var timer = setTimeout(function () {
      if (pending[id]) { delete pending[id]; delete streams[id]; resolve({ ok: false, error: 'timeout' }); }
    }, 420000);
    pending[id] = function (d) { clearTimeout(timer); resolve(d); };
    if (onStream) streams[id] = onStream;
    N.ask(id, JSON.stringify({ model: which, messages: messages }));
  });
}
var ERR = {
  unavailable: 'Merteks AI در حال به‌روزرسانی است؛ کمی بعد دوباره امتحان کنید.',
  disabled: 'Merteks AI در حال به‌روزرسانی است؛ به‌زودی برمی‌گردیم.',
  unknown: 'حساب شما پیدا نشد؛ یک بار از حساب خارج و دوباره وارد شوید.',
  exists: 'قبلاً با این شماره روی گوشی دیگری وارد شده‌اند؛ این حساب روی این گوشی کار نمی‌کند.',
  busy: 'الان درخواست‌ها زیاد است؛ چند دقیقهٔ دیگر دوباره بفرستید.',
  network: 'اتصال اینترنت برقرار نشد. اینترنت را بررسی کنید، یا از Merteks AI آفلاین استفاده کنید.',
  timeout: 'پاسخ خیلی دیر رسید؛ لطفاً دوباره بفرستید.',
  too_large: 'حجم پیوست‌ها زیاد است؛ تعداد یا اندازهٔ فایل‌ها را کم کنید.',
  attachment_rejected: 'سرویس هوش مصنوعی این پیوست را نپذیرفت. اگر PDF فرستاده‌اید، از صفحه‌هایش عکس بگیرید و دوباره بفرستید.',
  region_blocked: 'سرویس رایگان Merteks AI از اینترنت فعلی شما در دسترس نیست (محدودیت منطقه‌ای سرویس‌دهنده). با فیلترشکن دوباره امتحان کنید، یا از Merteks AI آفلاین استفاده کنید.',
  key_invalid: 'کلید سرویس رایگان معتبر نیست؛ لطفاً به تیم مرتکس خبر بدهید.',
  locked: 'این مدل مخصوص اشتراک PRO است و خرید اشتراک فعلاً غیرفعال است.',
  offline_missing: 'هنوز مدل آفلاین را دانلود نکرده‌اید. از دکمهٔ انتخاب هوش مصنوعی، «Merteks AI آفلاین» را دانلود کنید.',
  offline_failed: 'اجرای مدل آفلاین روی این گوشی ممکن نشد. اگر رم گوشی کم است، نسخهٔ «سبک» را امتحان کنید.',
  offline_memory: 'رم گوشی برای این مدل آفلاین کافی نیست؛ برنامه‌های دیگر را ببندید یا نسخهٔ «سبک» را دانلود کنید.',
  too_long: 'این پیام برای مدل آفلاین طولانی است؛ کوتاه‌ترش کنید یا گفتگوی جدید شروع کنید.'
};

/* ---------- tiny, safe Markdown renderer (escape first, then format) ---------- */
var PH_CODE = String.fromCharCode(0xE000), PH_INLINE = String.fromCharCode(0xE001);
var RE_INLINE_PH = new RegExp(PH_INLINE + '(\\d+)' + PH_INLINE, 'g');
var RE_BLOCK_PH = new RegExp('^' + PH_CODE + '(\\d+)' + PH_CODE + '$');
function inline(s) {
  var codes = [];
  s = esc(s).replace(/`([^`\n]+)`/g, function (_, c) { codes.push(c); return PH_INLINE + (codes.length - 1) + PH_INLINE; });
  s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_\n]+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"،؛])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return s.replace(RE_INLINE_PH, function (_, i) { return '<code>' + codes[+i] + '</code>'; });
}
function md(src) {
  var blocks = [], out = [], para = [], list = null;
  src = String(src || '').replace(/\r\n?/g, '\n').replace(/```([^\n`]*)\n?([\s\S]*?)(?:```|$)/g, function (_, lang, code) {
    blocks.push({ lang: lang.trim(), code: code.replace(/\n$/, '') });
    return '\n' + PH_CODE + (blocks.length - 1) + PH_CODE + '\n';
  });
  function flushPara() { if (para.length) { out.push('<p>' + para.map(inline).join('<br>') + '</p>'); para = []; } }
  function flushList() {
    if (!list) return;
    out.push('<' + list.tag + '>' + list.items.map(function (li) { return '<li>' + inline(li) + '</li>'; }).join('') + '</' + list.tag + '>');
    list = null;
  }
  src.split('\n').forEach(function (line) {
    var m;
    if ((m = RE_BLOCK_PH.exec(line))) {
      flushPara(); flushList();
      var b = blocks[+m[1]];
      out.push('<div class="code"><div class="code-head"><span>' + esc(b.lang || 'code') + '</span><button type="button" class="copy-code">کپی کد</button></div><pre><code>' + esc(b.code) + '</code></pre></div>');
      return;
    }
    if (!line.trim()) { flushPara(); flushList(); return; }
    if ((m = /^\s{0,3}#{1,6}\s+(.+)$/.exec(line))) { flushPara(); flushList(); out.push('<h4>' + inline(m[1].replace(/#+\s*$/, '')) + '</h4>'); return; }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); return; }
    if ((m = /^\s*[-*•]\s+(.+)$/.exec(line))) {
      flushPara();
      if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; }
      list.items.push(m[1]);
      return;
    }
    if ((m = /^\s*(?:\d+|[۰-۹]+)[.)]\s+(.+)$/.exec(line))) {
      flushPara();
      if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; }
      list.items.push(m[1]);
      return;
    }
    flushList();
    para.push(line);
  });
  flushPara(); flushList();
  return out.join('');
}
/* answers are laid out right-to-left unless they start in a Latin script (e.g. an English reply) */
function dirOf(text) {
  var m = /[A-Za-z؀-ۿ]/.exec(String(text || ''));
  return m && /[A-Za-z]/.test(m[0]) ? 'ltr' : 'rtl';
}

/* ---------- elements + state ---------- */
var thread = $('thread'), threadIn = $('threadIn'), input = $('input'), sendBtn = $('sendBtn');
var composer = $('composer'), attsEl = $('atts'), limitCard = $('limitCard'), dockNote = $('dockNote');
var drawer = $('drawer'), scrim = $('scrim'), sheet = $('sheet'), modelSheet = $('modelSheet'), menuBtn = $('menuBtn');
var profile = S.profile();
var chats = [], cur = null, atts = [], busy = false, typing = false;
var model = lsGet('mxai_model') === 'offline' ? 'offline' : 'free';

function chatsKey() { return 'mxai_chats_' + (profile ? profile.phone : 'guest'); }
function loadChats() {
  chats = lsGet(chatsKey());
  if (!Array.isArray(chats)) {
    /* older builds kept one shared list; it belongs to the first account that signs in */
    var old = lsGet('mxai_chats_v1');
    chats = Array.isArray(old) ? old : [];
    try { localStorage.removeItem('mxai_chats_v1'); } catch (e) {}
    lsSet(chatsKey(), chats);
  }
}
function saveChats() {
  chats.sort(function (a, b) { return b.at - a.at; });
  chats = chats.slice(0, 25);
  if (lsSet(chatsKey(), chats)) return;
  /* storage full: drop the photo thumbnails of older conversations and retry */
  chats.forEach(function (c, i) {
    if (c === cur && i < 3) return;
    c.msgs.forEach(function (m) { (m.atts || []).forEach(function (a) { delete a.thumb; }); });
  });
  lsSet(chatsKey(), chats);
}

/* ---------- model choice ---------- */
function setModel(m) {
  model = m;
  lsSet('mxai_model', m);
  $('modelName').textContent = m === 'offline' ? 'Merteks AI آفلاین' : 'Merteks AI';
  $('modelSub').textContent = m === 'offline' ? 'بدون اینترنت، روی گوشی' : 'رایگان';
  $('modelBtn').classList.toggle('is-offline', m === 'offline');
  renderQuota();
}
function offlineInfo() { return S.offline(); }

/* ---------- usage ring, bar and limit card ---------- */
var RING = 2 * Math.PI * 15;
$('meterFill').style.strokeDasharray = RING.toFixed(2);
function untilMidnight() {
  var now = new Date(), mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  var mins = Math.max(1, Math.round((mid - now) / 60000)), h = Math.floor(mins / 60), m = mins % 60;
  return (h ? fa(h) + ' ساعت' + (m ? ' و ' : '') : '') + (m ? fa(m) + ' دقیقه' : '');
}
function dateFa(iso) {
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Tehran' }).format(new Date(iso)); }
  catch (e) { return new Date(iso).toLocaleString('fa-IR'); }
}
/* an account the admin banned can't use the assistant until the ban ends */
function renderBan() {
  var b = profile ? S.ban(profile.phone) : null;
  $('banCard').hidden = !b;
  if (!b) return false;
  composer.hidden = true;
  limitCard.hidden = true;
  $('banText').textContent = (b.forever ? 'این حساب به‌صورت دائمی مسدود شده است.' : 'این حساب تا ' + dateFa(b.until) + ' مسدود است.') +
    (b.reason ? ' دلیل: ' + b.reason + '.' : '') + ' اگر فکر می‌کنید اشتباهی رخ داده، به پشتیبانی پیام بدهید.';
  dockNote.innerHTML = '';
  return true;
}
function renderLock() {
  var off = !S.enabled();
  $('updCard').hidden = !off;
  if (!off) return false;
  composer.hidden = true;
  limitCard.hidden = true;
  $('banCard').hidden = true;
  dockNote.innerHTML = '';
  return true;
}
function renderQuota() {
  var q = S.quota(), pct = S.percent(), left = Math.max(0, q.limit - q.used);
  var level = pct >= 100 ? ' is-full' : pct >= 70 ? ' is-high' : '';
  $('meterFill').style.strokeDashoffset = (RING * (1 - pct / 100)).toFixed(2);
  $('meterPct').textContent = fa(pct) + '٪';
  var meter = $('meterBtn');
  meter.className = 'meter' + level;
  meter.setAttribute('aria-label', 'استفادهٔ امروز: ' + fa(pct) + ' درصد');
  $('usage').className = 'usage' + level;
  $('usageTxt').textContent = fa(pct) + '٪ استفاده‌شده';
  $('usageBar').style.width = pct + '%';
  $('usageNote').textContent = left ? 'هر شب ساعت ۱۲ دوباره پر می‌شود' : 'سهم امروز تمام شد؛ ' + untilMidnight() + ' دیگر تازه می‌شود';
  if (renderLock() || renderBan()) { updateSend(); return q; }
  var full = left === 0 && model === 'free';
  composer.hidden = full;
  limitCard.hidden = !full;
  if (full) {
    var off = offlineInfo();
    $('limitTitle').textContent = 'سهم رایگان امروزتان تمام شد';
    $('limitOffline').textContent = S.offlineReady() ? 'ادامه با Merteks AI آفلاین' : 'دانلود Merteks AI آفلاین';
    $('limitOffline').hidden = !off.supported;
    $('limitText').textContent = 'هر شب ساعت ۱۲ دوباره پر می‌شود (' + untilMidnight() + ' دیگر).' +
      (off.supported ? ' تا آن موقع می‌توانید بدون محدودیت با نسخهٔ آفلاین گفتگو کنید.' : ' اگر دستیاری مثل من برای کسب‌وکار خودتان می‌خواهید، با تیم مرتکس صحبت کنید.');
    dockNote.innerHTML = '';
  } else if (model === 'offline') {
    dockNote.innerHTML = '<b>Merteks AI آفلاین</b> · روی گوشی شما، بدون اینترنت';
  } else {
    dockNote.innerHTML = 'Merteks AI ممکن است اشتباه کند؛ پاسخ‌های مهم را بررسی کنید';
  }
  updateSend();
  return q;
}
function updateSend() {
  var ready = (input.value.trim() || atts.length) && !atts.some(function (a) { return a.busy; });
  sendBtn.disabled = !ready || busy || typing;
}

/* ---------- rendering ---------- */
function nearBottom() { return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 140; }
function toBottom() { thread.scrollTop = thread.scrollHeight; }

var INTRO = 'سلام! من <b dir="ltr">Merteks AI</b> هستم، رباتی که گروه مرتکس ساخته است. اینجا هستم تا به هر سؤالی که دارید پاسخ بدهم. شما حتی بدون اینترنت هم می‌توانید با من کار کنید؛ نسخهٔ آفلاین من با استفاده از رم خود گوشی‌تان و بدون هیچ محدودیتی در تعداد پیام اجرا می‌شود.';
var CARDS = [
  { ic: 'pen', t: 'یک کپشن بنویس', s: 'برای پیج کافه‌ای که تازه باز شده', q: 'یک کپشن جذاب اینستاگرامی برای کافه‌ای که تازه باز شده بنویس، همراه چند هشتگ مناسب.' },
  { ic: 'image', t: 'عکس را بررسی کن', s: 'عکس بفرست تا توضیحش بدهم', pick: 'pickImage' },
  { ic: 'translate', t: 'ترجمه کن', s: 'متن فارسی به انگلیسی روان', q: 'این متن را به انگلیسی روان و رسمی ترجمه کن: «سلام، فردا ساعت ده جلسه داریم؛ لطفاً گزارش ماهانه را همراه خودتان بیاورید.»' },
  { ic: 'code', t: 'کد بنویس', s: 'و خط‌به‌خط توضیحش بده', q: 'یک تابع جاوااسکریپت بنویس که درست بودن شمارهٔ موبایل ایرانی را بررسی کند و خط‌به‌خط توضیح بده.' }
];
function helloHtml() {
  var name = profile ? profile.name : '';
  if (!S.enabled()) return lockedHtml();
  var q = S.quota(), left = Math.max(0, q.limit - q.used);
  var showCards = model === 'offline' || left > 0;
  return '<section class="hello">' +
    '<div class="hello-orb rise"><img src="' + LOGO + '" width="92" height="92" alt=""></div>' +
    '<h1 class="rise" style="--d:80ms">' + (name ? 'سلام ' + esc(name) + '، ' : '') + 'امروز چطور کمکتان کنم؟</h1>' +
    '<p class="rise" style="--d:140ms">' + INTRO + '</p>' +
    (showCards ? '<div class="cards">' + CARDS.map(function (c, i) {
      return '<button class="card rise" type="button" style="--d:' + (200 + i * 60) + 'ms" data-card="' + i + '">' + IC[c.ic] + '<b>' + esc(c.t) + '</b><span>' + esc(c.s) + '</span></button>';
    }).join('') + '</div>' : '') +
    '</section>';
}
/* the admin switched the assistant off */
function lockedHtml() {
  return '<section class="hello locked-state">' +
    '<div class="hello-orb"><img src="' + LOGO + '" width="92" height="92" alt=""><span class="lock-badge">' + IC.lock + '</span></div>' +
    '<h1 dir="auto"><span dir="ltr">Merteks AI</span> در حال به‌روزرسانی است</h1>' +
    '<p>در حال بهتر کردن دستیار هستیم و تا پایان به‌روزرسانی، گفتگو با هوش مصنوعی برای همه بسته است. به‌زودی برمی‌گردیم.</p>' +
    '</section>';
}
/* the intro stays at the top of every conversation */
function introEl() {
  var el = D.createElement('div');
  el.className = 'msg bot intro';
  el.innerHTML = '<img class="bot-av" src="' + LOGO_SM + '" width="32" height="32" alt=""><div class="bot-main"><div class="md intro-md"><p>' + INTRO + '</p></div></div>';
  return el;
}
function attsHtml(list) {
  if (!list || !list.length) return '';
  return '<div class="msg-atts">' + list.map(function (a) {
    if (a.k === 'img' && a.thumb) return '<img src="' + esc(a.thumb) + '" alt="تصویر پیوست‌شده">';
    return '<span class="file-pill">' + (a.k === 'img' ? IC.image : IC.file) + '<span>' + esc(a.name || 'تصویر') + '</span></span>';
  }).join('') + '</div>';
}
function msgEl(m, i) {
  var el = D.createElement('div');
  if (m.r === 'u') {
    el.className = 'msg user';
    el.innerHTML = attsHtml(m.atts) + (m.t ? '<div class="bubble" dir="auto">' + esc(m.t) + '</div>' : '');
  } else {
    el.className = 'msg bot';
    el.innerHTML = '<img class="bot-av" src="' + LOGO_SM + '" width="32" height="32" alt="">' +
      '<div class="bot-main">' + (m.err
        ? '<div class="note-err">' + esc(m.t) + '</div>'
        : '<div class="md" dir="' + dirOf(m.t) + '">' + md(m.t) + '</div>' +
          '<div class="bot-tools"><button class="icon-btn" type="button" data-copy="' + i + '" aria-label="کپی پاسخ">' + IC.copy + '</button>' +
          (m.model === 'offline' ? '<span class="model-tag">' + IC.offline + 'آفلاین</span>' : '') + '</div>') +
      '</div>';
  }
  return el;
}
function renderThread() {
  threadIn.innerHTML = '';
  if (!S.enabled() || !cur || !cur.msgs.length) { threadIn.innerHTML = helloHtml(); return; }
  threadIn.appendChild(introEl());
  cur.msgs.forEach(function (m, i) { threadIn.appendChild(msgEl(m, i)); });
  thread.style.scrollBehavior = 'auto';
  toBottom();
  thread.style.scrollBehavior = '';
}
function typeOut(box, text, done) {
  if (reduced) { box.innerHTML = md(text); done(); return; }
  var i = 0, n = text.length, step = Math.max(2, Math.ceil(n / 110));
  box.classList.add('caret');
  (function tick() {
    var stick = nearBottom();
    i = Math.min(n, i + step);
    box.innerHTML = md(text.slice(0, i));
    if (stick) toBottom();
    if (i < n) requestAnimationFrame(tick);
    else { box.classList.remove('caret'); done(); }
  })();
}

/* ---------- conversations ---------- */
function newChat() {
  if (busy || typing) return;
  cur = null;
  clearAtts();
  input.value = '';
  autosize();
  renderThread();
  renderDrawer();
  closeAll();
}
function openChat(id) {
  if (busy || typing) return;
  for (var i = 0; i < chats.length; i++) if (chats[i].id === id) cur = chats[i];
  renderThread();
  renderDrawer();
  closeAll();
}
function deleteChat(id) {
  chats = chats.filter(function (c) { return c.id !== id; });
  if (cur && cur.id === id) { cur = null; renderThread(); }
  saveChats();
  renderDrawer();
}
function renderDrawer() {
  var list = $('drList');
  if (!chats.length) { list.innerHTML = '<p class="dr-empty">هنوز گفتگویی ندارید.</p>'; }
  else {
    list.innerHTML = chats.map(function (c) {
      return '<div class="dr-item' + (cur && cur.id === c.id ? ' active' : '') + '">' +
        '<button type="button" data-open="' + esc(c.id) + '" dir="auto">' + esc(c.title || 'گفتگو') + '</button>' +
        '<button class="icon-btn" type="button" data-del="' + esc(c.id) + '" aria-label="حذف این گفتگو">' + IC.trash + '</button></div>';
    }).join('');
  }
  $('drUser').hidden = !profile;
  if (profile) {
    $('drAv').textContent = profile.name.charAt(0);
    $('drName').textContent = profile.name;
    $('drPhone').textContent = S.mask(profile.phone);
  }
}

/* ---------- model sheet ---------- */
function offlineRow(m, info) {
  var label = 'نسخهٔ ' + esc(m.title) + ' · ' + mb(m.bytes);
  var rec = info.recommended === m.id ? '<em class="rec">پیشنهادی</em>' : '';
  var action = '', extra = '';
  if (!m.fits) {
    action = '<span class="ms-note">رم کافی نیست</span>';
  } else if (m.state === 'ready') {
    action = m.active
      ? '<span class="ms-note ok">در حال استفاده</span>'
      : '<button class="mini primary" type="button" data-use="' + m.id + '">استفاده</button>';
    action += '<button class="mini ghost" type="button" data-delmodel="' + m.id + '" aria-label="حذف نسخهٔ ' + esc(m.title) + '">' + IC.trash + '</button>';
  } else if (m.state === 'downloading' || m.state === 'paused') {
    var pct = m.bytes ? Math.floor(m.done * 100 / m.bytes) : 0;
    action = '<button class="mini ghost" type="button" data-cancel="' + m.id + '">لغو</button>';
    extra = '<div class="dl-bar"><i style="width:' + pct + '%"></i></div><small class="dl-txt">' +
      (m.state === 'paused' ? 'منتظر اینترنت… ' : 'در حال دانلود… ') + fa(pct) + '٪ (' + mb(m.done) + ' از ' + mb(m.bytes) + ')</small>';
  } else {
    action = '<button class="mini primary" type="button" data-dl="' + m.id + '">' + (m.state === 'failed' ? 'دانلود دوباره' : 'دانلود') + '</button>';
  }
  return '<div class="off-row"><div class="off-top"><span>' + label + rec + '</span><span class="off-act">' + action + '</span></div>' + extra + '</div>';
}
var pollTimer = null;
function renderModels() {
  var info = offlineInfo(), q = S.quota(), left = Math.max(0, q.limit - q.used);
  var ready = info.models && info.models.some(function (m) { return m.state === 'ready'; });
  var downloading = info.models && info.models.some(function (m) { return m.state === 'downloading' || m.state === 'paused'; });
  var html = '';
  html += '<button class="ms-item' + (model === 'free' ? ' sel' : '') + '" type="button" data-model="free">' +
    '<span class="ms-ic logo"><img src="' + LOGO_SM + '" alt=""></span>' +
    '<span class="ms-body"><b>Merteks AI</b><small>رایگان · متن، عکس و فایل · ' + fa(S.percent()) + '٪ از سهم امروز استفاده شده</small></span>' +
    '<span class="ms-check">' + IC.check + '</span></button>';
  var offSub = !info.supported
    ? (N ? 'روی این گوشی پشتیبانی نمی‌شود (اندروید ۷ به بالا لازم است)' : 'فقط در اپ اندروید Merteks AI')
    : ready ? 'بدون اینترنت · روی رم گوشی شما · بدون محدودیت پیام'
      : 'بدون اینترنت روی گوشی شما · یک‌بار دانلود لازم است';
  html += '<div class="ms-group' + (model === 'offline' ? ' sel' : '') + '">' +
    '<button class="ms-item' + (model === 'offline' ? ' sel' : '') + (info.supported ? '' : ' off') + '" type="button" data-model="offline">' +
    '<span class="ms-ic off-ic">' + IC.offline + '</span>' +
    '<span class="ms-body"><b>Merteks AI آفلاین</b><small>' + offSub + '</small></span>' +
    '<span class="ms-check">' + IC.check + '</span></button>';
  if (info.supported) {
    html += '<div class="off-panel">' + info.models.map(function (m) { return offlineRow(m, info); }).join('') +
      '<small class="off-ram">رم گوشی شما: ' + fa(info.ramGb) + ' گیگابایت · مدل آفلاین فقط متن می‌خواند</small></div>';
  }
  html += '</div>';
  html += '<p class="ms-sep"><span>مدل‌های <b dir="ltr">PRO</b></span><em>' + IC.lock + 'نیاز به اشتراک</em></p>';
  html += PRO.map(function (p, i) {
    return '<button class="ms-item locked" type="button" data-pro="' + i + '" aria-disabled="true">' +
      '<span class="ms-ic brand ' + p.tone + '" dir="ltr">' + p.mark + '</span>' +
      '<span class="ms-body"><b dir="ltr">' + esc(p.name) + '</b><small>' + esc(p.by) + ' · ' + esc(p.note) + '</small></span>' +
      '<span class="pro-tag">' + IC.lock + '<span dir="ltr">PRO</span></span></button>';
  }).join('');
  $('msList').innerHTML = html;
  clearTimeout(pollTimer);
  if (downloading && !modelSheet.hidden) pollTimer = setTimeout(renderModels, 1000);
}
function openModels() {
  closeAll();
  renderModels();
  modelSheet.hidden = false;
  scrim.hidden = false;
}
$('msList').addEventListener('click', function (e) {
  var t = e.target.closest('button');
  if (!t) return;
  var info = offlineInfo();
  if (t.hasAttribute('data-model')) {
    var which = t.getAttribute('data-model');
    if (which === 'free') { setModel('free'); closeAll(); renderThread(); return; }
    if (!info.supported) { shake(t); toast(N ? 'مدل آفلاین به اندروید ۷ یا جدیدتر نیاز دارد' : 'حالت آفلاین فقط در اپ اندروید Merteks AI است'); return; }
    if (!S.offlineReady()) { shake(t); toast('اول یکی از نسخه‌های آفلاین را دانلود کنید'); return; }
    setModel('offline'); closeAll(); renderThread(); return;
  }
  if (t.hasAttribute('data-pro')) {
    shake(t);
    toast(PRO[+t.getAttribute('data-pro')].name + ' مخصوص اشتراک PRO است؛ از «تهیه اشتراک» طرح‌ها را ببینید.');
    return;
  }
  if (!N) return;
  var id;
  if ((id = t.getAttribute('data-dl'))) {
    var err = N.offlineDownload(id);
    var msg = {
      ram: 'رم این گوشی برای این نسخه کافی نیست؛ نسخهٔ سبک را دانلود کنید.',
      storage: 'فضای خالی گوشی کافی نیست؛ کمی فضا آزاد کنید و دوباره بزنید.',
      unsupported: 'حالت آفلاین روی این گوشی پشتیبانی نمی‌شود.',
      failed: 'دانلود شروع نشد؛ اینترنت را بررسی کنید.'
    }[err];
    toast(msg || 'دانلود شروع شد؛ می‌توانید از برنامه بیرون بروید، دانلود ادامه پیدا می‌کند.');
  } else if ((id = t.getAttribute('data-cancel'))) {
    N.offlineCancel(id);
  } else if ((id = t.getAttribute('data-use'))) {
    if (N.offlineSelect(id)) { setModel('offline'); toast('Merteks AI آفلاین روشن شد'); }
  } else if ((id = t.getAttribute('data-delmodel'))) {
    if (t.getAttribute('data-armed') !== '1') { t.setAttribute('data-armed', '1'); toast('برای حذف مدل دوباره بزنید'); return; }
    N.offlineDelete(id);
    if (!S.offlineReady() && model === 'offline') setModel('free');
    toast('مدل آفلاین حذف شد');
  }
  renderModels();
});
function openSubscription() { closeAll(); S.subscription.open(); }
$('subBtn').addEventListener('click', openSubscription);
$('drPro').addEventListener('click', openSubscription);
$('modelBtn').addEventListener('click', openModels);
$('limitOffline').addEventListener('click', function () {
  if (S.offlineReady()) { setModel('offline'); renderThread(); } else openModels();
});

/* ---------- drawer, sheets, back button ---------- */
function openDrawer() {
  closeAll();
  renderDrawer();
  renderQuota();
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  menuBtn.setAttribute('aria-expanded', 'true');
  scrim.hidden = false;
}
function openSheet() {
  if (atts.length >= MAX_ATTS) { toast('حداکثر ' + fa(MAX_ATTS) + ' پیوست در هر پیام'); return; }
  closeAll();
  sheet.hidden = false;
  scrim.hidden = false;
}
function closeAll() {
  var was = drawer.classList.contains('open') || !sheet.hidden || !modelSheet.hidden;
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  menuBtn.setAttribute('aria-expanded', 'false');
  sheet.hidden = true;
  modelSheet.hidden = true;
  scrim.hidden = true;
  clearTimeout(pollTimer);
  return was;
}
/* Android back button closes the subscription sheet, drawer or sheets first */
W.MXBack = function () { return S.subscription.close() || closeAll(); };

/* ---------- attachments ---------- */
var TEXT_EXT = /\.(txt|md|csv|tsv|json|xml|html?|css|js|mjs|ts|jsx|tsx|py|java|kt|kts|c|cc|cpp|h|hpp|cs|go|rs|rb|php|sql|ya?ml|ini|toml|log|sh|bat|svg)$/i;
function classify(f) {
  var t = (f.type || '').toLowerCase(), n = f.name || '';
  if (/^image\/(jpe?g|png|webp|gif|bmp)$/.test(t) || (!t && /\.(jpe?g|png|webp|gif|bmp)$/i.test(n))) return 'image';
  if (t === 'application/pdf' || /\.pdf$/i.test(n)) return 'pdf';
  if (/^text\//.test(t) || /json|xml|javascript|x-sh|sql|yaml/.test(t) || TEXT_EXT.test(n)) return 'text';
  if (/^image\//.test(t)) return 'image';
  return '';
}
function readAs(f, how) {
  return new Promise(function (resolve, reject) {
    var r = new FileReader();
    r.onload = function () { resolve(r.result); };
    r.onerror = function () { reject(r.error); };
    if (how === 'text') r.readAsText(f); else r.readAsDataURL(f);
  });
}
function loadImage(f) {
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(f), img = new Image();
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
    img.src = url;
  });
}
function shrink(img, max, quality) {
  var s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  var c = D.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * s));
  c.height = Math.max(1, Math.round(img.naturalHeight * s));
  var g = c.getContext('2d');
  g.fillStyle = '#fff'; /* transparent PNGs get a white page instead of black */
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}
function prepare(f, a) {
  if (a.kind === 'image') {
    return loadImage(f).then(function (img) {
      a.data = shrink(img, IMG_MAX, 0.85);
      a.thumb = shrink(img, 240, 0.72);
    });
  }
  if (a.kind === 'pdf') {
    if (f.size > PDF_MAX) return Promise.reject(new Error('big'));
    return readAs(f, 'url').then(function (u) { a.data = String(u).replace(/^data:[^;,]*/, 'data:application/pdf'); });
  }
  return readAs(f, 'text').then(function (t) {
    t = String(t);
    a.text = t.length > TEXT_MAX ? t.slice(0, TEXT_MAX) + '\n… (ادامهٔ فایل به دلیل حجم زیاد حذف شد)' : t;
  });
}
function addFiles(files) {
  Array.prototype.forEach.call(files || [], function (f) {
    if (atts.length >= MAX_ATTS) { toast('حداکثر ' + fa(MAX_ATTS) + ' پیوست در هر پیام'); return; }
    var kind = classify(f);
    if (!kind) { toast('این نوع فایل پشتیبانی نمی‌شود: ' + (f.name || '')); return; }
    if (f.size > RAW_MAX) { toast('حجم فایل زیاد است: ' + (f.name || '')); return; }
    var a = { id: uid('a'), kind: kind, name: f.name || (kind === 'image' ? 'photo.jpg' : 'file'), busy: true };
    atts.push(a);
    renderAtts();
    prepare(f, a).then(function () {
      a.busy = false;
      renderAtts();
    }, function (e) {
      atts = atts.filter(function (x) { return x !== a; });
      renderAtts();
      toast(e && e.message === 'big' ? 'PDF باید کمتر از ۸ مگابایت باشد' : 'خواندن «' + a.name + '» ممکن نشد');
    });
  });
  if (model === 'offline' && Array.prototype.some.call(files || [], function (f) { var k = classify(f); return k === 'image' || k === 'pdf'; })) {
    toast('مدل آفلاین فقط متن می‌خواند؛ عکس و PDF با Merteks AI آنلاین بررسی می‌شوند');
  }
}
function renderAtts() {
  attsEl.hidden = !atts.length;
  attsEl.innerHTML = atts.map(function (a) {
    var body = a.kind === 'image' && a.thumb
      ? '<img src="' + esc(a.thumb) + '" alt="' + esc(a.name) + '">'
      : '<span class="file-pill">' + (a.kind === 'image' ? IC.image : IC.file) + '<span>' + esc(a.busy ? 'در حال آماده‌سازی…' : a.name) + '</span></span>';
    return '<div class="att">' + body + '<button class="att-x" type="button" data-rm="' + a.id + '" aria-label="حذف پیوست ' + esc(a.name) + '">×</button></div>';
  }).join('');
  updateSend();
}
function clearAtts() { atts = []; renderAtts(); }

/* ---------- sending ---------- */
function apiHistory(msgs) {
  return msgs.filter(function (m) { return !m.err; }).slice(-10).map(function (m) {
    var t = m.t || '';
    if (m.r === 'u' && m.atts && m.atts.length) t += (t ? '\n' : '') + '(کاربر اینجا ' + fa(m.atts.length) + ' پیوست فرستاده بود)';
    return { role: m.r === 'u' ? 'user' : 'assistant', content: t || '…' };
  });
}
function buildContent(text, list) {
  if (!list.length) return text;
  var extra = '', hasImg = false;
  list.forEach(function (a) {
    if (a.kind === 'text') extra += '\n\n[فایل پیوست: ' + a.name + ']\n```\n' + a.text + '\n```';
    if (a.kind === 'image') hasImg = true;
  });
  var parts = [{ type: 'text', text: (text || (hasImg ? 'این تصویر را دقیق بررسی و توضیح بده.' : 'این فایل را بررسی کن و خلاصهٔ مهم‌ترین نکته‌هایش را بگو.')) + extra }];
  list.forEach(function (a) {
    if (a.kind === 'image') parts.push({ type: 'image_url', image_url: { url: a.data } });
    if (a.kind === 'pdf') parts.push({ type: 'file', file: { filename: a.name, file_data: a.data } });
  });
  return parts;
}
var lastCheck = 0;
function blocked() { return !S.enabled() || (profile && S.ban(profile.phone)); }
function send(text) {
  if (busy || typing || !profile) return;
  if (blocked()) { renderQuota(); renderThread(); return; }
  if (Date.now() - lastCheck > 60000 && S.online()) {
    busy = true;
    updateSend();
    S.checkStatus(profile).then(function (d) {
      busy = false;
      if (d && d.code === 'auth') { updateSend(); needLogin(); return; }
      lastCheck = Date.now();
      if (blocked()) { renderQuota(); renderThread(); return; }
      send(text);
    });
    return;
  }
  doSend(text);
}
function doSend(text) {
  text = String(text == null ? input.value : text).trim();
  if (busy || typing) return;
  if (!text && !atts.length) return;
  if (atts.some(function (a) { return a.busy; })) { toast('چند لحظه صبر کنید تا پیوست‌ها آماده شوند'); return; }

  var which = model;
  if (which === 'free' && !S.online() && S.offlineReady()) {
    which = 'offline';
    toast('اینترنت وصل نیست؛ Merteks AI آفلاین جواب می‌دهد');
  }
  if (which === 'offline' && atts.some(function (a) { return a.kind !== 'text'; })) {
    toast('مدل آفلاین عکس و PDF را نمی‌خواند؛ آن‌ها را حذف کنید یا Merteks AI آنلاین را انتخاب کنید');
    return;
  }
  if (which === 'free') {
    var q = S.quota();
    if (q.used >= q.limit) { renderQuota(); return; }
  }

  if (!cur) { cur = { id: uid('C-'), title: '', at: Date.now(), msgs: [] }; chats.unshift(cur); threadIn.innerHTML = ''; threadIn.appendChild(introEl()); }
  var sent = atts.slice();
  var userMsg = {
    r: 'u', t: text,
    atts: sent.map(function (a) { return a.kind === 'image' ? { k: 'img', thumb: a.thumb } : { k: 'file', name: a.name }; })
  };
  var messages = apiHistory(cur.msgs).concat([{ role: 'user', content: buildContent(text, sent) }]);
  cur.msgs.push(userMsg);
  cur.title = cur.title || (text || sent[0].name).replace(/\s+/g, ' ').slice(0, 48);
  cur.at = Date.now();
  saveChats();
  threadIn.appendChild(msgEl(userMsg, cur.msgs.length - 1));
  input.value = '';
  autosize();
  clearAtts();
  toBottom();
  if (!finePointer) input.blur(); /* drop the keyboard so the answer is visible */

  busy = true;
  updateSend();
  var think = D.createElement('div');
  think.className = 'msg bot';
  var thinkText = which === 'offline' ? 'در حال فکر کردن روی گوشی شما…' : sent.length ? 'در حال بررسی پیوست‌ها…' : 'در حال فکر کردن…';
  think.innerHTML = '<img class="bot-av" src="' + LOGO_SM + '" width="32" height="32" alt=""><div class="bot-main"><div class="thinking"><i></i><i></i><i></i><em>' + thinkText + '</em></div></div>';
  threadIn.appendChild(think);
  toBottom();

  /* the offline model streams its words as it writes them */
  var live = null;
  function onStream(t) {
    if (!t) return;
    if (!live) {
      live = D.createElement('div');
      live.className = 'md caret';
      var main = think.querySelector('.bot-main');
      main.innerHTML = '';
      main.appendChild(live);
    }
    var stick = nearBottom();
    live.setAttribute('dir', dirOf(t));
    live.innerHTML = md(t);
    if (stick) toBottom();
  }

  var chat = cur, logQ = text + (sent.length ? ' [پیوست: ' + sent.map(function (a) { return a.name; }).join('، ') + ']' : '');
  askAI(messages, which, which === 'offline' ? onStream : null).then(function (res) {
    busy = false;
    var streamed = !!live;
    if (think.parentNode) think.parentNode.removeChild(think);
    if (res.ok) {
      var m = { r: 'a', t: res.answer, model: which };
      if (profile && which === 'offline') S.logOffline(profile.phone, res.inTok, res.outTok);
      chat.msgs.push(m);
      chat.at = Date.now();
      saveChats();
      rpc('chat_message', {
        p_chat_id: chat.id, p_name: profile ? profile.name : '', p_phone: profile ? profile.phone : '',
        p_device: DEVICE + (which === 'offline' ? ' offline' : ''), p_question: logQ, p_answer: res.answer, p_mid: uid('M-')
      });
      if (chat !== cur) { renderQuota(); return; }
      if (streamed) { threadIn.appendChild(msgEl(m, chat.msgs.length - 1)); renderQuota(); toBottom(); return; }
      var el = msgEl({ r: 'a', t: '', model: which }, chat.msgs.length - 1);
      threadIn.appendChild(el);
      typing = true;
      updateSend();
      var box = el.querySelector('.md');
      box.setAttribute('dir', dirOf(res.answer));
      typeOut(box, res.answer, function () {
        typing = false;
        var nq = renderQuota(), left = nq.limit - nq.used;
        if (left === 0) toBottom();
      });
      return;
    }
    if (res.error === 'auth') { updateSend(); needLogin('نشست شما تمام شده است؛ دوباره وارد شوید.'); return; }
    if (res.error === 'limit' || res.error === 'banned' || res.error === 'disabled') {
      renderQuota();
      if (res.error === 'disabled') renderThread();
      return;
    }
    var em = { r: 'a', t: (ERR[res.error] || 'پاسخی دریافت نشد؛ کمی بعد دوباره امتحان کنید.') + (which === 'free' ? ' این پیام از سهم امروزتان کم نشد.' : ''), err: true };
    chat.msgs.push(em);
    saveChats();
    if (chat === cur) { threadIn.appendChild(msgEl(em, chat.msgs.length - 1)); toBottom(); }
    renderQuota();
  });
}

/* ---------- copy ---------- */
function copyText(t, btn) {
  function ok() {
    if (!btn) { toast('کپی شد'); return; }
    var old = btn.innerHTML;
    btn.innerHTML = btn.classList.contains('copy-code') ? 'کپی شد' : IC.check;
    setTimeout(function () { btn.innerHTML = old; }, 1500);
  }
  function legacy() {
    var ta = D.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    D.body.appendChild(ta);
    ta.select();
    try { D.execCommand('copy'); ok(); } catch (e) { toast('کپی ممکن نشد'); }
    D.body.removeChild(ta);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, legacy);
  else legacy();
}

/* ---------- composer ---------- */
function autosize() {
  input.style.height = 'auto';
  input.style.height = Math.min(160, input.scrollHeight) + 'px';
  updateSend();
}
input.addEventListener('input', autosize);
input.addEventListener('keydown', function (e) {
  /* on a computer Enter sends; on phones Enter is a new line, like the ChatGPT app */
  if (e.key === 'Enter' && !e.shiftKey && finePointer) { e.preventDefault(); send(); }
});
sendBtn.addEventListener('click', function () { send(); });
$('attachBtn').addEventListener('click', openSheet);
['pickImage', 'pickCamera', 'pickFile'].forEach(function (id) {
  $(id).addEventListener('change', function () { addFiles(this.files); this.value = ''; });
});
sheet.addEventListener('click', function (e) {
  var b = e.target.closest('[data-pick]');
  if (!b) return;
  closeAll();
  $(b.getAttribute('data-pick')).click();
});
attsEl.addEventListener('click', function (e) {
  var b = e.target.closest('[data-rm]');
  if (!b) return;
  var id = b.getAttribute('data-rm');
  atts = atts.filter(function (a) { return a.id !== id; });
  renderAtts();
});
threadIn.addEventListener('click', function (e) {
  var card = e.target.closest('[data-card]');
  if (card) {
    var c = CARDS[+card.getAttribute('data-card')];
    if (c.pick) {
      if (model === 'offline') { toast('برای بررسی عکس، Merteks AI آنلاین را انتخاب کنید'); return; }
      $(c.pick).click();
    } else send(c.q);
    return;
  }
  var cp = e.target.closest('[data-copy]');
  if (cp && cur) { var m = cur.msgs[+cp.getAttribute('data-copy')]; if (m) copyText(m.t, cp); return; }
  var cc = e.target.closest('.copy-code');
  if (cc) { var code = cc.closest('.code').querySelector('pre'); if (code) copyText(code.textContent, cc); }
});
menuBtn.addEventListener('click', openDrawer);
$('meterBtn').addEventListener('click', openDrawer);
$('newBtn').addEventListener('click', newChat);
$('drNew').addEventListener('click', newChat);
scrim.addEventListener('click', closeAll);
$('drList').addEventListener('click', function (e) {
  var o = e.target.closest('[data-open]'), d = e.target.closest('[data-del]');
  if (d) { deleteChat(d.getAttribute('data-del')); return; }
  if (o) openChat(o.getAttribute('data-open'));
});
/* "home" should not stack another copy of the home page on the back history */
D.querySelector('[data-home]').addEventListener('click', function (e) {
  e.preventDefault();
  if (/app\.html/.test(D.referrer) && history.length > 1) history.back();
  else location.replace('app.html');
});
D.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAll(); });
/* the allowance resets at midnight even if the app stays open */
var wasEnabled = S.enabled();
function refreshStatus() {
  if (!profile || D.hidden || !S.online()) return;
  S.checkStatus(profile).then(function (d) {
    if (d && d.code === 'auth') { if (!busy && !typing) needLogin(); return; }
    lastCheck = Date.now();
    renderQuota();
    if (S.enabled() !== wasEnabled) { wasEnabled = S.enabled(); if (!busy && !typing) renderThread(); }
  });
}
setInterval(refreshStatus, 60000);
D.addEventListener('visibilitychange', function () { if (!D.hidden && profile) { renderQuota(); refreshStatus(); } });
/* keep the latest message visible when the keyboard opens */
var lastH = W.innerHeight;
W.addEventListener('resize', function () {
  if (W.innerHeight < lastH && D.activeElement === input) toBottom();
  lastH = W.innerHeight;
});

/* ---------- accounts: switch / log out ---------- */
$('drSwitch').addEventListener('click', function () {
  S.logout();
  profile = null;
  closeAll();
  showOnboard('login');
});
$('drLogout').addEventListener('click', function () {
  var b = this;
  if (b.getAttribute('data-armed') !== '1') {
    b.setAttribute('data-armed', '1');
    b.textContent = 'برای خروج دوباره بزنید';
    setTimeout(function () { b.removeAttribute('data-armed'); b.textContent = 'خروج از حساب'; }, 3500);
    return;
  }
  S.logout();
  profile = null;
  closeAll();
  toast('از حساب خارج شدید؛ حسابتان روی این گوشی یادش می‌ماند');
  showOnboard();
});

/* ---------- onboarding: sign in (number + password) or sign up (name + number + password) ---------- */
var NAME_RE = /^[؀-ۿa-zA-Z0-9_. ‌-]{2,30}$/;
/* same rule as the server (private.ai_pw_problem): 8-72 characters, a letter and a digit */
var PASS_LETTER = /[A-Za-zء-يپچژکگی]/, PASS_DIGIT = /[0-9۰-۹٠-٩]/;
function passProblem(p) {
  if (p.length < 8) return 'رمز عبور باید دست‌کم ۸ نویسه باشد.';
  if (p.length > 72) return 'رمز عبور نباید بیشتر از ۷۲ نویسه باشد.';
  if (!PASS_LETTER.test(p) || !PASS_DIGIT.test(p)) return 'رمز عبور باید هم حرف و هم عدد داشته باشد.';
  return '';
}
function cleanPhone(v) {
  var s = enDigits(v).replace(/[\s\-()]/g, '');
  if (/^\+989\d{9}$/.test(s)) s = '0' + s.slice(3);
  else if (/^00989\d{9}$/.test(s)) s = '0' + s.slice(4);
  else if (/^989\d{9}$/.test(s)) s = '0' + s.slice(2);
  else if (/^9\d{9}$/.test(s)) s = '0' + s;
  return s;
}
var NET_ERR = 'اتصال به اینترنت برقرار نشد؛ اینترنت را بررسی کنید و دوباره امتحان کنید.';
var LOGIN_ERR = {
  bad_credentials: 'شماره یا رمز عبور درست نیست.',
  no_password: 'این شماره هنوز رمز عبور ندارد. یک بار در «ثبت‌نام» با همین شماره رمز بسازید؛ حساب و سهم قبلی‌تان سر جایش می‌ماند.',
  rate_limited: 'تلاش‌ها زیاد بود؛ ۱۵ دقیقهٔ دیگر دوباره امتحان کنید.',
  save_failed: 'ذخیرهٔ اطلاعات روی گوشی انجام نشد؛ دوباره امتحان کنید.'
};
var SIGNUP_ERR = {
  registered: 'این شماره قبلاً ثبت‌نام کرده است؛ از «ورود» با شماره و رمز وارد شوید.',
  invalid_phone: 'شمارهٔ موبایل را درست وارد کنید؛ مثل ۰۹۱۲۳۴۵۶۷۸۹',
  invalid_name: 'نام کاربری باید ۲ تا ۳۰ حرف باشد.',
  weak_password: 'رمز عبور باید دست‌کم ۸ نویسه و شامل حرف و عدد باشد.',
  rate_limited: 'تلاش‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید.',
  save_failed: 'ذخیرهٔ اطلاعات روی گوشی انجام نشد؛ دوباره امتحان کنید.'
};
function setTab(which) {
  var login = which !== 'signup';
  $('obLogin').hidden = !login;
  $('obForm').hidden = login;
  $('obTabLogin').setAttribute('aria-selected', String(login));
  $('obTabSignup').setAttribute('aria-selected', String(!login));
  $('obLErr').textContent = '';
  $('obErr').textContent = '';
}
function invalid(el, on) { if (on) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid'); }
function formBusy(form, on, text) {
  var btn = form.querySelector('[type="submit"]');
  if (on) { btn.setAttribute('data-label', btn.textContent); btn.textContent = text; }
  else if (btn.getAttribute('data-label')) btn.textContent = btn.getAttribute('data-label');
  btn.disabled = on;
}
$('obTabLogin').addEventListener('click', function () { setTab('login'); $('obLPhone').focus(); });
$('obTabSignup').addEventListener('click', function () { setTab('signup'); $('obName').focus(); });
[].forEach.call(D.querySelectorAll('.ob-eye'), function (b) {
  b.addEventListener('click', function () {
    var inp = b.parentNode.querySelector('input'), show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(show));
    b.setAttribute('aria-label', show ? 'پنهان کردن رمز عبور' : 'نمایش رمز عبور');
  });
});
/* this phone has to sign in again (no / expired session, password set on another phone) */
function needLogin(msg) {
  var phone = profile && profile.phone;
  S.logout();
  profile = null;
  closeAll();
  showOnboard('login', phone, msg || 'برای ادامه، رمز عبور این حساب را وارد کنید.');
}
function renderSavedAccounts() {
  var list = S.accounts(), box = $('obAccounts');
  box.hidden = !list.length;
  $('obAccList').innerHTML = list.map(function (a) {
    return '<div class="ob-acc"><button type="button" class="ob-acc-go" data-phone="' + esc(a.phone) + '">' +
      '<span class="av">' + esc(a.name.charAt(0)) + '</span><span><b>' + esc(a.name) + '</b><small dir="ltr">' + esc(S.mask(a.phone)) + '</small></span>' +
      '<svg class="i" viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>' +
      '<button type="button" class="icon-btn" data-forget="' + esc(a.phone) + '" aria-label="حذف این حساب از گوشی">' + IC.x + '</button></div>';
  }).join('');
}
function enter() {
  $('onboard').hidden = true;
  D.body.classList.remove('onboarding');
  start();
}
function showOnboard(tab, phone, msg) {
  renderSavedAccounts();
  setTab(tab || 'login');
  if (phone) { $('obLPhone').value = phone; $('obLPass').value = ''; }
  if (msg) $('obLErr').textContent = msg;
  $('onboard').hidden = false;
  D.body.classList.add('onboarding');
}
$('obAccList').addEventListener('click', function (e) {
  var f = e.target.closest('[data-forget]');
  if (f) { S.forget(f.getAttribute('data-forget')); renderSavedAccounts(); return; }
  var g = e.target.closest('[data-phone]');
  if (!g) return;
  var phone = g.getAttribute('data-phone');
  /* a remembered account with a live session goes straight in; otherwise its password is asked */
  if (S.token(phone) && S.switchTo(phone)) {
    profile = S.profile();
    toast('خوش برگشتید ' + profile.name);
    enter();
    return;
  }
  setTab('login');
  $('obLPhone').value = phone;
  $('obLPass').value = '';
  $('obLErr').textContent = 'رمز عبور این حساب را وارد کنید.';
  $('obLPass').focus();
});
$('obLogin').addEventListener('submit', function (e) {
  e.preventDefault();
  var form = this, phoneEl = $('obLPhone'), passEl = $('obLPass'), err = $('obLErr');
  var phone = cleanPhone(phoneEl.value), pass = passEl.value;
  invalid(phoneEl, false); invalid(passEl, false);
  if (!/^09\d{9}$/.test(phone)) {
    err.textContent = 'شمارهٔ موبایل را درست وارد کنید؛ مثل ۰۹۱۲۳۴۵۶۷۸۹';
    invalid(phoneEl, true); phoneEl.focus(); return;
  }
  if (!pass) { err.textContent = 'رمز عبور را وارد کنید.'; invalid(passEl, true); passEl.focus(); return; }
  err.textContent = '';
  formBusy(form, true, 'در حال ورود…');
  S.login(phone, pass).then(function (d) {
    formBusy(form, false);
    if (!d) { err.textContent = NET_ERR; return; }
    if (!d.ok) {
      err.textContent = LOGIN_ERR[d.code] || 'ورود انجام نشد؛ دوباره امتحان کنید.';
      if (d.code === 'no_password') $('obPhone').value = phone;
      else if (d.code === 'bad_credentials') { invalid(passEl, true); passEl.select(); }
      return;
    }
    profile = S.profile() || { name: d.name, phone: phone };
    passEl.value = ''; err.textContent = '';
    toast('خوش آمدید ' + profile.name);
    enter();
  });
});
$('obForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var form = this, nameEl = $('obName'), phoneEl = $('obPhone'), passEl = $('obPass'), pass2El = $('obPass2'), err = $('obErr');
  var name = nameEl.value.replace(/\s+/g, ' ').trim(), phone = cleanPhone(phoneEl.value), pass = passEl.value;
  [nameEl, phoneEl, passEl, pass2El].forEach(function (el) { invalid(el, false); });
  var bad = !NAME_RE.test(name) ? [nameEl, 'نام کاربری باید ۲ تا ۳۰ حرف باشد (حروف، عدد، فاصله، _ یا .).']
    : !/^09\d{9}$/.test(phone) ? [phoneEl, 'شمارهٔ موبایل را درست وارد کنید؛ مثل ۰۹۱۲۳۴۵۶۷۸۹']
    : passProblem(pass) ? [passEl, passProblem(pass)]
    : pass2El.value !== pass ? [pass2El, 'تکرار رمز عبور با رمز عبور یکسان نیست.'] : null;
  if (bad) { err.textContent = bad[1]; invalid(bad[0], true); bad[0].focus(); return; }
  err.textContent = '';
  formBusy(form, true, 'در حال ساخت حساب…');
  S.signup(name, phone, pass).then(function (d) {
    formBusy(form, false);
    if (!d) { err.textContent = NET_ERR; return; }
    if (!d.ok) {
      err.textContent = SIGNUP_ERR[d.code] || 'ثبت‌نام انجام نشد؛ دوباره امتحان کنید.';
      if (d.code === 'registered') { setTab('login'); $('obLPhone').value = phone; $('obLErr').textContent = SIGNUP_ERR.registered; $('obLPass').focus(); }
      return;
    }
    profile = S.profile() || { name: d.name, phone: phone };
    if (!d.existed) rpc('chat_start', { p_id: uid('U-'), p_name: d.name, p_phone: phone });
    [nameEl, phoneEl, passEl, pass2El].forEach(function (el) { el.value = ''; });
    toast(d.existed ? 'رمز روی حساب قبلی‌تان ثبت شد؛ خوش برگشتید «' + d.name + '»' : 'حساب شما ساخته شد؛ خوش آمدید ' + d.name);
    enter();
  });
});

function start() {
  if (profile) S.checkStatus(profile).then(function (d) {
    if (d && d.code === 'auth') { needLogin(); return; }
    if (d && d.code === 'exists') {
      profile = S.profile();
      toast(S.takenNotice() || ERR.exists);
      if (!profile) { showOnboard(); return; }
    }
    lastCheck = Date.now();
    renderQuota();
    if (S.enabled() !== wasEnabled) { wasEnabled = S.enabled(); renderThread(); }
  });
  loadChats();
  cur = null;
  if (model === 'offline' && !S.offlineReady()) model = 'free';
  setModel(model);
  renderThread();
  renderDrawer();
  if (finePointer) input.focus({ preventScroll: true });
}
renderAtts();
/* an account remembered on the phone without a sign-in session (older version of the app) signs in once */
if (profile && !S.token(profile.phone)) {
  var keepPhone = profile.phone;
  S.logout();
  profile = null;
  setModel(model); renderThread();
  showOnboard('login', keepPhone, 'برای امنیت حساب، یک بار با شماره و رمز وارد شوید. اگر هنوز رمز ندارید، از «ثبت‌نام» با همین شماره رمز بسازید.');
} else if (profile) start();
else { setModel(model); renderThread(); showOnboard('login'); }
})();
