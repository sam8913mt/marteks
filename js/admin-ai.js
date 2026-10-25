/* Merteks admin — بخش «هوش مصنوعی» (حساب‌های اپ Merteks AI)
   داده‌ها از توابع امن Supabase می‌آید (migration-ai-accounts.sql)؛ مجوز مدیر در خود پایگاه داده بررسی می‌شود.
   - فهرست حساب‌هایی که در اپ ثبت‌نام/ورود کرده‌اند
   - مصرف توکن امروز، ۷ روز و ۳۰ روز گذشتهٔ هر حساب + جزئیات روزبه‌روز
   - مسدود کردن حساب برای چند روز یا دائمی، و رفع مسدودی */
(function () {
'use strict';
var D = document, W = window;
var A = W.MX_ADMIN;
if (!A) return;
function $(id) { return D.getElementById(id); }
var esc = A.esc, fa = A.fa;

var S = { rows: null, loading: false, banPhone: '' };

var dfD = null, dfT = null;
try {
  dfD = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' });
  dfT = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' });
} catch (e) {}
function dt(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  try { return dfD && dfT ? dfD.format(d) + ' ساعت ' + dfT.format(d) : d.toLocaleString('fa-IR'); } catch (e) { return d.toLocaleString('fa-IR'); }
}
function day(iso) {
  var d = new Date(iso + 'T12:00:00');
  try { return dfD ? dfD.format(d) : iso; } catch (e) { return iso; }
}
function badge(kind, text) { return '<span class="ad-badge ad-badge-' + kind + '">' + text + '</span>'; }
function isBanned(r) { return r.banned_until && (r.banned_until === 'infinity' || Date.parse(r.banned_until) > Date.now()); }
function banText(r) {
  if (!isBanned(r)) return badge('approved', 'فعال');
  return badge('hidden', r.banned_until === 'infinity' ? '⛔ مسدود دائمی' : '⛔ مسدود تا ' + dt(r.banned_until));
}
function n(v) { return Number(v) || 0; }

function rpc(name, args) { return A.sb('POST', '/rest/v1/rpc/' + name, { json: args || {} }); }
function failText(res) {
  var d = res && res.data, msg = d && typeof d === 'object' ? String(d.message || d.hint || '') : String(d || '');
  if (res.status === 404 || /PGRST202|Could not find the function/i.test(msg + (d && d.code || ''))) {
    return 'بخش هوش مصنوعی هنوز در Supabase ساخته نشده است. فایل <span class="ad-ltr">_private/supabase/migration-ai-accounts.sql</span> را در Supabase › SQL Editor اجرا کنید و دوباره «تازه‌سازی» بزنید.';
  }
  if (res.status === 401 || res.status === 403 || /forbidden/i.test(msg)) return 'دسترسی مدیر تأیید نشد؛ دوباره وارد شوید.';
  return 'بارگذاری انجام نشد: ' + esc(A.errText(res));
}

/* ---------- the on/off switch and the daily allowance ---------- */
var svc = null;
function renderService() {
  var on = svc && svc.enabled !== false;
  $('aiSvcDot').className = 'ad-ai-dot ' + (svc ? (on ? 'on' : 'off') : '');
  $('aiSvcTitle').textContent = !svc ? 'وضعیت هوش مصنوعی اپ' : on ? 'هوش مصنوعی اپ روشن است' : 'هوش مصنوعی اپ بسته است';
  $('aiSvcText').textContent = !svc ? 'خوانده نشد.' : on
    ? 'همه می‌توانند با Merteks AI گفتگو کنند.'
    : 'در همهٔ گوشی‌ها و حساب‌ها پیام «Merteks AI در حال به‌روزرسانی است» نشان داده می‌شود و گفتگو (حتی آفلاین) بسته است.';
  var t = $('aiSvcToggle');
  t.disabled = !svc;
  t.textContent = on ? 'بستن کل هوش مصنوعی' : 'باز کردن هوش مصنوعی';
  t.className = 'ad-btn ' + (on ? 'ad-danger-solid' : 'ad-primary');
  if (svc && D.activeElement !== $('aiSvcLimit')) $('aiSvcLimit').value = svc.limit;
}
function loadService() {
  rpc('admin_ai_service').then(function (res) {
    svc = res.ok && res.data && res.data.ok ? res.data : null;
    renderService();
  }, function () { svc = null; renderService(); });
}
function setService(args, okMsg) {
  rpc('admin_ai_set_service', args).then(function (res) {
    if (!res.ok || !res.data || !res.data.ok) { A.toast('ذخیره انجام نشد'); return; }
    svc = res.data;
    renderService();
    A.toast(okMsg);
  }, function () { A.toast('اتصال به سرور برقرار نشد'); });
}
$('aiSvcToggle').addEventListener('click', function () {
  if (!svc) return;
  var on = svc.enabled !== false;
  if (on && !W.confirm('هوش مصنوعی برای همهٔ کاربران و همهٔ گوشی‌ها بسته شود؟\nدر صفحهٔ چت همه «Merteks AI در حال به‌روزرسانی است» نشان داده می‌شود.')) return;
  setService({ p_enabled: !on }, on ? 'هوش مصنوعی برای همه بسته شد' : 'هوش مصنوعی دوباره باز شد');
});
$('aiSvcSave').addEventListener('click', function () {
  var n = parseInt($('aiSvcLimit').value, 10);
  if (!(n >= 1 && n <= 1000)) { A.toast('یک عدد بین ۱ تا ۱۰۰۰ وارد کنید'); return; }
  setService({ p_limit: n }, 'سهم روزانه ذخیره شد');
});

/* ---------- the market section switch (migration-ai-tools.sql) ---------- */
var bs = null;
function renderBourse() {
  var on = bs && bs.enabled !== false;
  $('bsSvcDot').className = 'ad-ai-dot ' + (bs ? (on ? 'on' : 'off') : '');
  $('bsSvcTitle').textContent = !bs ? 'بخش «تحلیل بازار و بورس»' : on ? 'بخش تحلیل بازار و بورس باز است' : 'بخش تحلیل بازار و بورس بسته است';
  $('bsSvcText').textContent = !bs ? 'خوانده نشد (فایل migration-ai-tools.sql را اجرا کنید).' : on
    ? 'کاربران با توکن‌هایشان می‌توانند تحلیل بازار بگیرند.'
    : 'در اپ پیام «بخش تحلیل بازار در حال به‌روزرسانی است» نشان داده می‌شود؛ بقیهٔ بخش‌ها باز هستند.';
  var t = $('bsSvcToggle');
  t.disabled = !bs;
  t.textContent = on ? 'بستن بخش تحلیل بازار' : 'باز کردن بخش تحلیل بازار';
  t.className = 'ad-btn ' + (on ? 'ad-danger-solid' : 'ad-primary');
}
function loadBourse(args) {
  rpc('admin_bourse_service', args || {}).then(function (res) {
    bs = res.ok && res.data && res.data.ok ? res.data : null;
    renderBourse();
    if (args) A.toast(bs ? (bs.enabled ? 'بخش تحلیل بازار باز شد' : 'بخش تحلیل بازار بسته شد') : 'ذخیره انجام نشد');
  }, function () { bs = null; renderBourse(); });
}
$('bsSvcToggle').addEventListener('click', function () {
  if (!bs) return;
  var on = bs.enabled !== false;
  if (on && !W.confirm('بخش تحلیل بازار و بورس برای همه بسته شود؟ در اپ پیام «در حال به‌روزرسانی است» نشان داده می‌شود.')) return;
  loadBourse({ p_enabled: !on });
});

/* ---------- tokens and PRO of each account ---------- */
S.wal = {};
function loadWallets() {
  return rpc('admin_ai_wallets').then(function (res) {
    S.wal = {};
    if (res.ok && Array.isArray(res.data)) res.data.forEach(function (w) { S.wal[w.phone] = w; });
  }, function () {});
}
function proOn(w) { return w && w.pro_until && Date.parse(w.pro_until) > Date.now(); }
function walText(phone) {
  var w = S.wal[phone];
  if (!w) return '<span class="ad-muted">—</span>';
  return fa(n(w.bonus) + (proOn(w) ? n(w.pro_tokens) : 0)) + (proOn(w) ? ' ' + badge('approved', 'PRO تا ' + day(w.pro_until)) : '');
}
function walNow(phone) {
  var w = S.wal[phone] || {};
  $('aiWalNow').innerHTML = 'توکن هدیه: <strong>' + fa(n(w.bonus)) + '</strong> · ' +
    (proOn(w) ? 'PRO فعال تا <strong>' + day(w.pro_until) + '</strong> با <strong>' + fa(n(w.pro_tokens)) + '</strong> توکن' : 'اشتراک PRO ندارد');
}
function openWallet(phone) {
  var r = rowOf(phone);
  if (!r) return;
  S.walPhone = phone;
  $('aiWalWho').textContent = r.name + ' — ' + r.phone;
  $('aiWalTokens').value = '';
  walNow(phone);
  var dlg = $('aiWalDlg');
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}
function walCall(name, args, okMsg) {
  rpc(name, args).then(function (res) {
    if (!res.ok || !res.data || !res.data.ok) { A.toast(res.data && res.data.code === 'unknown' ? 'این حساب پیدا نشد' : 'ذخیره انجام نشد'); return; }
    var d = res.data;
    S.wal[S.walPhone] = { phone: S.walPhone, bonus: d.bonus, pro_until: d.pro_until, pro_tokens: d.pro_tokens };
    walNow(S.walPhone);
    render();
    A.toast(okMsg);
  }, function () { A.toast('اتصال به سرور برقرار نشد'); });
}
$('aiWalGrant').addEventListener('click', function () {
  var t = parseInt($('aiWalTokens').value, 10);
  if (!t || t < -100000 || t > 100000) { A.toast('یک عدد (مثبت یا منفی) وارد کنید'); return; }
  walCall('admin_ai_grant', { p_phone: S.walPhone, p_tokens: t }, t > 0 ? fa(t) + ' توکن اضافه شد' : fa(-t) + ' توکن کم شد');
});
$('aiWalPro').addEventListener('click', function () {
  var d = parseInt($('aiWalDays').value, 10), t = parseInt($('aiWalProTokens').value, 10);
  if (!(d >= 1 && d <= 3650)) { A.toast('مدت را بین ۱ تا ۳۶۵۰ روز وارد کنید'); return; }
  if (!(t >= 0 && t <= 1000000)) { A.toast('تعداد توکن PRO را درست وارد کنید'); return; }
  walCall('admin_ai_set_pro', { p_phone: S.walPhone, p_days: d, p_tokens: t }, 'اشتراک PRO داده شد');
});
$('aiWalUnpro').addEventListener('click', function () {
  if (!W.confirm('اشتراک PRO این حساب حذف شود؟ توکن‌های PRO باقی‌مانده هم حذف می‌شوند.')) return;
  walCall('admin_ai_clear_pro', { p_phone: S.walPhone }, 'اشتراک PRO حذف شد');
});
$('aiWalClose').addEventListener('click', function () { var d = $('aiWalDlg'); if (d.close) d.close(); else d.removeAttribute('open'); });

/* ---------- list ---------- */
function load(force) {
  loadService();
  loadBourse();
  if (S.loading) return;
  if (S.rows && !force) { render(); return; }
  S.loading = true;
  $('aiNote').textContent = 'در حال بارگذاری…';
  rpc('admin_ai_accounts').then(function (res) {
    S.loading = false;
    if (!res.ok || !Array.isArray(res.data)) {
      $('aiNote').textContent = '';
      $('aiStats').innerHTML = '';
      $('aiBox').innerHTML = '<div class="ad-empty">' + failText(res) + '</div>';
      A.markAiLoaded(false);
      return;
    }
    S.rows = res.data;
    A.markAiLoaded(true);
    loadWallets().then(render);
    $('aiNote').textContent = 'به‌روزرسانی: ' + dt(new Date().toISOString()) + ' · روزها به وقت تهران حساب می‌شوند';
    render();
  }, function () {
    S.loading = false;
    $('aiNote').textContent = '';
    $('aiBox').innerHTML = '<div class="ad-empty">اتصال به سرور برقرار نشد.</div>';
  });
}

function filtered() {
  var q = A.norm($('aiSearch').value || ''), f = $('aiFilter').value, sort = $('aiSort').value;
  var today = new Date(Date.now() - 864e5).getTime();
  var list = S.rows.filter(function (r) {
    if (q && A.norm(r.name + ' ' + r.phone).indexOf(q) === -1) return false;
    if (f === 'banned') return isBanned(r);
    if (f === 'active') return Date.parse(r.last_seen) > today;
    if (f === 'heavy') return n(r.tokens_today) > 0;
    return true;
  });
  var key = { today: 'tokens_today', week: 'tokens_week', month: 'tokens_month' }[sort];
  list.sort(function (a, b) {
    if (key) return n(b[key]) - n(a[key]);
    if (sort === 'new') return Date.parse(b.created_at) - Date.parse(a.created_at);
    return Date.parse(b.last_seen) - Date.parse(a.last_seen);
  });
  return list;
}

function render() {
  if (!S.rows) return;
  var all = S.rows, dayAgo = Date.now() - 864e5;
  var sum = function (k) { return all.reduce(function (s, r) { return s + n(r[k]); }, 0); };
  $('aiStats').innerHTML = [
    [all.length, 'حساب ثبت‌شده'],
    [all.filter(function (r) { return Date.parse(r.last_seen) > dayAgo; }).length, 'فعال در ۲۴ ساعت'],
    [all.filter(isBanned).length, 'مسدودشده'],
    [sum('tokens_today'), 'توکن امروز'],
    [sum('tokens_week'), 'توکن ۷ روز'],
    [sum('tokens_month'), 'توکن ۳۰ روز']
  ].map(function (i) { return '<div class="ad-stat"><strong>' + fa(i[0]) + '</strong><span>' + i[1] + '</span></div>'; }).join('');

  var list = filtered();
  if (!list.length) {
    $('aiBox').innerHTML = '<div class="ad-empty">' + (all.length ? 'حسابی با این فیلتر پیدا نشد.' : 'هنوز کسی در اپ Merteks AI ثبت‌نام نکرده است.') + '</div>';
    return;
  }
  $('aiBox').innerHTML = '<div class="ad-table-wrap"><table class="ad-table ad-ai-table"><thead><tr>' +
    '<th>کاربر</th><th>ثبت‌نام</th><th>آخرین فعالیت</th><th>توکن امروز</th><th>توکن ۷ روز</th><th>توکن ۳۰ روز</th><th>پیام امروز / ماه</th><th>توکن / PRO</th><th>وضعیت</th><th>عملیات</th>' +
    '</tr></thead><tbody>' + list.map(function (r) {
      var banned = isBanned(r);
      return '<tr' + (banned ? ' class="ad-ai-banned"' : '') + '>' +
        '<td><strong>' + esc(r.name) + '</strong><div class="ad-muted ad-ltr">' + esc(r.phone) + '</div>' +
          (r.device ? '<div class="ad-muted ad-np">' + esc(r.device) + '</div>' : '') + '</td>' +
        '<td>' + dt(r.created_at) + '</td>' +
        '<td>' + dt(r.last_seen) + '</td>' +
        '<td class="ad-num">' + fa(n(r.tokens_today)) + '</td>' +
        '<td class="ad-num">' + fa(n(r.tokens_week)) + '</td>' +
        '<td class="ad-num">' + fa(n(r.tokens_month)) + '</td>' +
        '<td class="ad-num">' + fa(n(r.messages_today)) + ' / ' + fa(n(r.messages_month)) + '</td>' +
        '<td>' + walText(r.phone) + '</td>' +
        '<td>' + banText(r) + (banned && r.ban_reason ? '<div class="ad-muted ad-np">' + esc(r.ban_reason) + '</div>' : '') + '</td>' +
        '<td><div class="ad-row-actions">' +
          '<button type="button" class="ad-btn ad-sm" data-aiuse="' + esc(r.phone) + '">جزئیات</button>' +
          '<button type="button" class="ad-btn ad-sm ad-primary" data-aiwal="' + esc(r.phone) + '">توکن و PRO</button>' +
          (banned
            ? '<button type="button" class="ad-btn ad-sm" data-aiunban="' + esc(r.phone) + '">رفع مسدودی</button>'
            : '<button type="button" class="ad-btn ad-sm ad-danger" data-aiban="' + esc(r.phone) + '">مسدود کردن</button>') +
        '</div></td></tr>';
    }).join('') + '</tbody></table></div>';
}

function rowOf(phone) { return (S.rows || []).filter(function (r) { return r.phone === phone; })[0]; }

/* ---------- ban dialog ---------- */
function openBan(phone) {
  var r = rowOf(phone);
  if (!r) return;
  S.banPhone = phone;
  $('aiBanWho').textContent = r.name + ' — ' + r.phone;
  $('aiBanDays').value = '1';
  $('aiBanReason').value = '';
  var dlg = $('aiBanDlg');
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
}
function closeBan() { var dlg = $('aiBanDlg'); if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); }
$('aiBanForm').addEventListener('submit', function (e) {
  e.preventDefault();
  var days = parseInt($('aiBanDays').value, 10), btn = $('aiBanGo');
  btn.disabled = true;
  rpc('admin_ai_ban', { p_phone: S.banPhone, p_days: days, p_reason: $('aiBanReason').value.trim() }).then(function (res) {
    btn.disabled = false;
    if (!res.ok || !res.data || res.data.ok === false) { A.toast('مسدود کردن انجام نشد'); return; }
    closeBan();
    A.toast(days > 0 ? 'حساب برای ' + fa(days) + ' روز مسدود شد' : 'حساب برای همیشه مسدود شد');
    load(true);
  }, function () { btn.disabled = false; A.toast('اتصال به سرور برقرار نشد'); });
});
$('aiBanCancel').addEventListener('click', closeBan);

function unban(phone) {
  var r = rowOf(phone);
  if (!r || !W.confirm('مسدودی «' + r.name + '» برداشته شود؟')) return;
  rpc('admin_ai_unban', { p_phone: phone }).then(function (res) {
    if (!res.ok) { A.toast('رفع مسدودی انجام نشد'); return; }
    A.toast('مسدودی برداشته شد');
    load(true);
  }, function () { A.toast('اتصال به سرور برقرار نشد'); });
}

/* ---------- day-by-day usage ---------- */
function openUsage(phone) {
  var r = rowOf(phone);
  if (!r) return;
  $('aiUseWho').textContent = r.name + ' — ' + r.phone;
  $('aiUseBody').innerHTML = '<div class="ad-muted">در حال بارگذاری…</div>';
  var dlg = $('aiUseDlg');
  if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  rpc('admin_ai_usage', { p_phone: phone }).then(function (res) {
    if (!res.ok || !Array.isArray(res.data)) { $('aiUseBody').innerHTML = '<div class="ad-empty">' + failText(res) + '</div>'; return; }
    if (!res.data.length) { $('aiUseBody').innerHTML = '<div class="ad-empty">در ۳۰ روز گذشته مصرفی ثبت نشده است.</div>'; return; }
    var label = function (m) { return m === 'offline' ? 'آفلاین (روی گوشی)' : m === 'free' ? 'Merteks AI (رایگان)' : m === 'study' ? 'درس‌یار' : m === 'bourse' ? 'تحلیل بازار و بورس' : esc(m); };
    $('aiUseBody').innerHTML = '<div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>روز</th><th>مدل</th><th>پیام</th><th>توکن ورودی</th><th>توکن خروجی</th><th>جمع</th></tr></thead><tbody>' +
      res.data.map(function (u) {
        return '<tr><td>' + day(u.day) + '</td><td>' + label(u.model) + '</td><td class="ad-num">' + fa(n(u.messages)) + '</td><td class="ad-num">' + fa(n(u.input_tokens)) +
          '</td><td class="ad-num">' + fa(n(u.output_tokens)) + '</td><td class="ad-num"><strong>' + fa(n(u.input_tokens) + n(u.output_tokens)) + '</strong></td></tr>';
      }).join('') + '</tbody></table></div>';
  }, function () { $('aiUseBody').innerHTML = '<div class="ad-empty">اتصال به سرور برقرار نشد.</div>'; });
}
$('aiUseClose').addEventListener('click', function () { var d = $('aiUseDlg'); if (d.close) d.close(); else d.removeAttribute('open'); });

/* ---------- events ---------- */
$('aiBox').addEventListener('click', function (e) {
  var b = e.target.closest('button');
  if (!b) return;
  if (b.hasAttribute('data-aiban')) openBan(b.getAttribute('data-aiban'));
  else if (b.hasAttribute('data-aiunban')) unban(b.getAttribute('data-aiunban'));
  else if (b.hasAttribute('data-aiuse')) openUsage(b.getAttribute('data-aiuse'));
  else if (b.hasAttribute('data-aiwal')) openWallet(b.getAttribute('data-aiwal'));
});
['aiSearch', 'aiFilter', 'aiSort'].forEach(function (id) { $(id).addEventListener(id === 'aiSearch' ? 'input' : 'change', render); });
$('aiRefresh').addEventListener('click', function () { load(true); });
$('aiExport').addEventListener('click', function () {
  if (!S.rows) return;
  var rows = [['نام', 'شماره', 'ثبت‌نام', 'آخرین فعالیت', 'توکن امروز', 'توکن ۷ روز', 'توکن ۳۰ روز', 'توکن کل', 'پیام امروز', 'پیام ۳۰ روز', 'مسدود تا', 'دلیل']];
  filtered().forEach(function (r) {
    rows.push([r.name, r.phone, r.created_at, r.last_seen, n(r.tokens_today), n(r.tokens_week), n(r.tokens_month), n(r.tokens_total),
      n(r.messages_today), n(r.messages_month), isBanned(r) ? r.banned_until : '', isBanned(r) ? r.ban_reason : '']);
  });
  A.download('merteks-ai-accounts.csv', 'text/csv;charset=utf-8', A.csv(rows));
});

W.MX_ADMIN_AI = {
  load: function (force) { load(force); },
  reset: function () { S.rows = null; svc = null; bs = null; S.wal = {}; renderService(); renderBourse(); $('aiBox').innerHTML = ''; $('aiStats').innerHTML = ''; $('aiNote').textContent = ''; }
};
})();
