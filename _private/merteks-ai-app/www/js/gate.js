/* Merteks AI home screen: account chip, connection state, live quota, starfield, exit dialog. */
(function () {
'use strict';
var D = document, W = window, S = W.MXStore, N = W.MerteksNative || null, fa = S.fa;
function $(id) { return D.getElementById(id); }
var reduced = false;
try { reduced = W.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

var toastTimer;
function toast(msg) {
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
}

/* ---------- account chip + sheet ---------- */
var profile = S.profile();
function renderAccount() {
  profile = S.profile();
  if (profile) {
    $('acctAv').textContent = profile.name.charAt(0);
    $('acctName').textContent = profile.name;
    $('acctSub').textContent = 'حساب شما · ' + S.mask(profile.phone);
  } else {
    $('acctAv').innerHTML = '<svg class="i" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
    $('acctName').textContent = S.accounts().length ? 'انتخاب حساب' : 'ورود / ثبت‌نام';
    $('acctSub').textContent = 'حساب Merteks AI';
  }
}

/* ---------- quota + offline badges on the AI card (a percentage only, never a count) ---------- */
function renderStats() {
  var pct = S.percent(), el = $('statQuota'), off = !S.enabled();
  el.hidden = !off && pct < 100;
  el.className = 'full';
  el.textContent = off ? 'در حال به‌روزرسانی' : 'سهم امروز تمام شد';
  var offline = S.offline(), so = $('statOffline');
  so.hidden = !offline.supported || off;
  if (offline.supported) {
    var ready = S.offlineReady();
    so.className = ready ? 'ok' : '';
    so.textContent = 'دارای حالت آفلاین و آنلاین';
  }
  var u = $('sheetUsage');
  if (u) {
    $('sheetUsageTxt').textContent = fa(pct) + '٪ استفاده‌شده';
    $('sheetUsageBar').style.width = pct + '%';
    u.className = 'usage' + (pct >= 100 ? ' is-full' : pct >= 70 ? ' is-high' : '');
  }
}

/* ---------- connection pill ---------- */
function renderNet() {
  var on = S.online(), p = $('netPill');
  p.classList.toggle('off', !on);
  p.querySelector('span').textContent = on ? 'آنلاین' : 'آفلاین';
}
W.addEventListener('online', renderNet);
W.addEventListener('offline', renderNet);

/* ---------- sheets ---------- */
var scrim = $('scrim'), open = null;
function show(id) {
  hide();
  open = $(id);
  open.hidden = false;
  scrim.hidden = false;
}
function hide() {
  var was = !!open;
  if (open) open.hidden = true;
  open = null;
  scrim.hidden = true;
  return was;
}
scrim.addEventListener('click', hide);
$('acctChip').addEventListener('click', function () {
  if (!profile) { W.location.href = 'ai.html'; return; }
  $('sheetAv').textContent = profile.name.charAt(0);
  $('acctTitle').textContent = profile.name;
  $('sheetPhone').textContent = S.mask(profile.phone);
  renderStats();
  show('acctSheet');
});
var logoutArmed = false;
$('logoutBtn').addEventListener('click', function () {
  if (!logoutArmed) {
    logoutArmed = true;
    this.textContent = 'برای خروج دوباره بزنید';
    var b = this;
    setTimeout(function () { logoutArmed = false; b.textContent = 'خروج از حساب'; }, 3500);
    return;
  }
  S.logout();
  hide();
  renderAccount();
  toast('از حساب خارج شدید؛ حسابتان روی این گوشی یادش می‌ماند');
});
$('proCard').addEventListener('click', function () { hide(); S.subscription.open(); });

/* Android back button: close a sheet first; on this home page ask before leaving */
W.MXBack = function () { return S.subscription.close() || hide(); };
W.MXConfirmExit = function () { show('exitSheet'); };
$('stayBtn').addEventListener('click', hide);
$('exitBtn').addEventListener('click', function () { if (N && N.exitApp) N.exitApp(); else hide(); });

/* ---------- typing prompts ---------- */
var LINES = [
  'یک کپشن جذاب برای کافه بنویس…',
  'این عکس را برایم توضیح بده…',
  'این متن را به انگلیسی ترجمه کن…',
  'یک برنامهٔ ورزشی یک‌هفته‌ای بچین…',
  'کد پایتون مرتب‌سازی بنویس…'
];
(function typeLoop() {
  var el = $('typeLine');
  if (reduced) { el.textContent = LINES[0]; return; }
  var li = 0, ci = 0, del = false;
  (function step() {
    var line = LINES[li];
    ci += del ? -1 : 1;
    el.textContent = line.slice(0, ci);
    var wait = del ? 28 : 55;
    if (!del && ci >= line.length) { del = true; wait = 1600; }
    else if (del && ci <= 0) { del = false; li = (li + 1) % LINES.length; wait = 350; }
    setTimeout(step, wait);
  })();
})();

/* ---------- star network ---------- */
(function stars() {
  var c = $('stars');
  if (!c || !c.getContext || reduced) return;
  var g = c.getContext('2d'), dpr = Math.min(2, W.devicePixelRatio || 1), pts = [], w = 0, h = 0;
  function size() {
    w = c.clientWidth; h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var n = Math.round(Math.min(60, w * h / 9000));
    pts = [];
    for (var i = 0; i < n; i++) pts.push({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - .5) * .18, vy: (Math.random() - .5) * .18, r: Math.random() * 1.4 + .4 });
  }
  size();
  W.addEventListener('resize', size);
  var running = true;
  D.addEventListener('visibilitychange', function () { running = !D.hidden; if (running) requestAnimationFrame(frame); });
  function frame() {
    if (!running) return;
    g.clearRect(0, 0, w, h);
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      for (var j = i + 1; j < pts.length; j++) {
        var q = pts[j], dx = p.x - q.x, dy = p.y - q.y, d = dx * dx + dy * dy;
        if (d < 9000) {
          g.strokeStyle = 'rgba(140,196,240,' + (0.12 * (1 - d / 9000)).toFixed(3) + ')';
          g.lineWidth = 1;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
        }
      }
      g.fillStyle = 'rgba(191,226,251,.75)';
      g.beginPath(); g.arc(p.x, p.y, p.r, 0, 6.283); g.fill();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* hidden way into the admin panel: hold the big logo ~1.5s (login + is_admin still checked by the server) */
(function () {
  var tile = D.querySelector('.orb-stage'), timer = 0;
  if (!tile) return;
  tile.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  function cancel() { clearTimeout(timer); timer = 0; }
  tile.addEventListener('pointerdown', function () {
    cancel();
    timer = setTimeout(function () {
      timer = 0;
      try { if (navigator.vibrate) navigator.vibrate(30); } catch (e) {}
      W.location.href = 'admin.html#ai';
    }, 1500);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) { tile.addEventListener(t, cancel); });
})();

renderAccount();
renderStats();
renderNet();
/* keep the server copy of the account fresh ("last seen", ban state); without a valid sign-in
   session the account chip goes back to "sign in" (the chat page asks for the password) */
function signedOut(msg) { S.logout(); renderAccount(); renderStats(); if (msg) toast(msg); }
if (profile && !S.token(profile.phone)) signedOut('برای ادامه، یک بار با شماره و رمز وارد شوید');
else if (profile) S.checkStatus(profile).then(function (d) {
  if (d && d.code === 'auth') { signedOut('نشست شما تمام شده؛ دوباره وارد شوید'); return; }
  if (d && d.code === 'exists') { renderAccount(); var m = S.takenNotice(); if (m) toast(m); }
  renderStats();
});
/* coming back from the chat: refresh the counters */
W.addEventListener('pageshow', function () { renderAccount(); renderStats(); renderNet(); });
D.addEventListener('visibilitychange', function () { if (!D.hidden) { renderStats(); renderNet(); } });
})();
