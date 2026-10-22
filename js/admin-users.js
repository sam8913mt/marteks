/* Merteks admin — بخش «کاربران»
   همهٔ داده‌ها و عملیات از Edge Function «admin-users» می‌آید (مجوز مدیر در سرور بررسی می‌شود).
   این فایل هیچ کلید محرمانه‌ای ندارد و به auth.users مستقیم دسترسی ندارد. */
(function () {
'use strict';
var D = document, W = window;
var A = W.MX_ADMIN;
if (!A) return;
function $(id) { return D.getElementById(id); }
var esc = A.esc, fa = A.fa, FN = '/functions/v1/admin-users';

var S = { page: 1, data: null, loading: false, seq: 0, busy: false, count: null, detail: null };

/* ---------- ابزارها ---------- */
var dfD = null, dfT = null;
try {
  dfD = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tehran' });
  dfT = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tehran' });
} catch (e) {}
/* تاریخ شمسی و ساعت به وقت تهران؛ جدا فرمت می‌شوند تا ویرگول عربیِ خروجی Intl در متن راست‌به‌چپ جابه‌جا نشود */
function dt(iso) {
  if (!iso) return '—';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  try { return dfD && dfT ? dfD.format(d) + ' ساعت ' + dfT.format(d) : d.toLocaleString('fa-IR'); } catch (e) { return d.toLocaleString('fa-IR'); }
}
function nameOf(u) { return ((u.first_name || '') + ' ' + (u.last_name || '')).trim(); }
function badge(kind, text) { return '<span class="ad-badge ad-badge-' + kind + '">' + text + '</span>'; }
function verBadge(u) { return u.email_confirmed ? badge('approved', '✓ تأییدشده') : badge('pending', '✕ تأییدنشده'); }
function accBadge(u) { return u.disabled ? badge('hidden', '⛔ غیرفعال') : badge('approved', 'فعال'); }

function call(body) {
  return A.sb('POST', FN, { json: body }).then(function (res) {
    return res;
  });
}
function failText(res) {
  var d = res && res.data, code = d && typeof d === 'object' ? d.code : '';
  if (res.status === 404 && (!d || code === 'NOT_FOUND' || /function/i.test(String(d.message || '')))) {
    return 'سرویس مدیریت کاربران هنوز روی Supabase مستقر نشده است (Edge Function با نام admin-users). راهنما: _private/supabase/ADMIN-USERS-SETUP.md';
  }
  if (res.status === 403) return 'این حساب اجازهٔ مدیریت کاربران را ندارد.';
  if (res.status === 429) return A.errText(res);
  return A.errText(res);
}

/* ---------- فهرست ---------- */
var searchTimer = null;
function params(extra) {
  var o = {
    q: $('userSearch').value.trim(),
    verified: $('userVerified').value,
    status: $('userStatus').value,
    sort: $('userSort').value,
    pageSize: parseInt($('userPageSize').value, 10) || 25,
    page: S.page
  };
  for (var k in extra) o[k] = extra[k];
  return o;
}
function setNote(msg) { $('userNote').textContent = msg || ''; }

function load(fresh, silent) {
  if (!A.getTok()) return;
  var seq = ++S.seq;
  S.loading = true;
  $('userRefresh').disabled = true;
  if (!silent) {
    $('userBox').innerHTML = '<div class="ad-empty" role="status">در حال بارگذاری کاربران…</div>';
    $('userPager').hidden = true;
  }
  var body = params({ action: 'list', fresh: !!fresh });
  return call(body).then(function (res) {
    if (seq !== S.seq || !A.getTok()) return;
    S.loading = false; $('userRefresh').disabled = false;
    if (!res.ok || !res.data || res.data.ok !== true) {
      A.markLoaded(false);
      if (!silent || !S.data) $('userBox').innerHTML = '<div class="ad-empty ad-err" role="alert">بارگذاری کاربران انجام نشد: ' + esc(failText(res)) + '</div>';
      else A.toast('تازه‌سازی انجام نشد');
      return;
    }
    var d = res.data;
    if (S.count !== null && silent && d.stats.total > S.count) A.toast(fa(d.stats.total - S.count) + ' کاربر جدید ثبت‌نام کرد');
    S.count = d.stats.total;
    S.data = d; S.page = d.page;
    A.markLoaded(true);
    render();
  }, function () {
    if (seq !== S.seq) return;
    S.loading = false; $('userRefresh').disabled = false;
    A.markLoaded(false);
    if (!silent || !S.data) $('userBox').innerHTML = '<div class="ad-empty ad-err" role="alert">اتصال به سرور برقرار نشد. اینترنت را بررسی کنید و «تازه‌سازی» را بزنید.</div>';
  });
}

function stats(s) {
  var items = [[s.total, 'کل کاربران'], [s.verified, 'ایمیل تأییدشده'], [s.unverified, 'ایمیل تأییدنشده'], [s.today, 'ثبت‌نام امروز'], [s.disabled, 'حساب غیرفعال']];
  $('userStats').innerHTML = items.map(function (i) { return '<div class="ad-stat"><strong>' + fa(i[0]) + '</strong><span>' + i[1] + '</span></div>'; }).join('');
}

function render() {
  var d = S.data;
  if (!d) return;
  stats(d.stats);
  var note = fa(d.total_filtered) + ' کاربر' + (d.total_filtered !== d.stats.total ? ' از ' + fa(d.stats.total) : '') + ' · امروز ' + fa(d.stats.today) + ' ثبت‌نام (' + fa(d.stats.today_verified) + ' تأییدشده)';
  if (d.truncated) note += ' · فقط ۱۰٬۰۰۰ کاربر اول بارگذاری شد';
  setNote(note);
  if (!d.users.length) {
    $('userBox').innerHTML = '<div class="ad-empty">' + (d.stats.total ? 'کاربری با این جست‌وجو یا فیلتر پیدا نشد.' : 'هنوز کسی در سایت ثبت‌نام نکرده است.') + '</div>';
    $('userPager').hidden = true;
    return;
  }
  var base = (d.page - 1) * d.pageSize;
  $('userBox').innerHTML = '<div class="ad-table-wrap"><table class="ad-table"><thead><tr>' +
    '<th scope="col">ردیف</th><th scope="col">نام و نام خانوادگی</th><th scope="col">ایمیل</th><th scope="col">شمارهٔ تماس</th>' +
    '<th scope="col">ثبت‌نام</th><th scope="col">ایمیل</th><th scope="col">حساب</th><th scope="col">آخرین ورود</th><th scope="col">عملیات</th></tr></thead><tbody>' +
    d.users.map(function (u, i) {
      var nm = nameOf(u);
      return '<tr' + (u.disabled ? ' class="is-off"' : '') + '>' +
        '<td data-label="ردیف">' + fa(base + i + 1) + '</td>' +
        '<td data-label="نام"><button type="button" class="ad-link" data-uview="' + esc(u.id) + '">' + (nm ? esc(nm) : '<i class="ad-muted">بدون نام</i>') + '</button>' + (u.has_profile ? '' : ' <span class="ad-muted ad-np">(بدون پروفایل)</span>') + '</td>' +
        '<td data-label="ایمیل" class="ad-ltr">' + esc(u.email) + '</td>' +
        '<td data-label="تلفن" class="ad-ltr">' + (u.phone ? esc(u.phone) : '—') + '</td>' +
        '<td data-label="ثبت‌نام">' + esc(dt(u.created_at)) + '</td>' +
        '<td data-label="تأیید ایمیل">' + verBadge(u) + '</td>' +
        '<td data-label="وضعیت حساب">' + accBadge(u) + '</td>' +
        '<td data-label="آخرین ورود">' + esc(dt(u.last_sign_in_at)) + '</td>' +
        '<td data-label="عملیات"><div class="ad-row-actions">' +
          '<button type="button" class="ad-btn ad-sm" data-uview="' + esc(u.id) + '">جزئیات</button>' +
          '<button type="button" class="ad-btn ad-sm" data-uedit="' + esc(u.id) + '"' + (u.has_profile ? '' : ' disabled title="پروفایل پس از تأیید ایمیل ساخته می‌شود"') + '>ویرایش</button>' +
          '<button type="button" class="ad-btn ad-sm" data-utoggle="' + esc(u.id) + '" data-to="' + (u.disabled ? 'enable' : 'disable') + '">' + (u.disabled ? 'فعال‌سازی' : 'غیرفعال') + '</button>' +
          '<button type="button" class="ad-btn ad-sm ad-danger" data-udel="' + esc(u.id) + '">حذف</button>' +
        '</div></td></tr>';
    }).join('') + '</tbody></table></div>';

  var pg = $('userPager');
  if (d.pages > 1) {
    pg.hidden = false;
    pg.innerHTML = '<button type="button" class="ad-btn" data-upage="' + (d.page - 1) + '"' + (d.page <= 1 ? ' disabled' : '') + '>→ قبلی</button>' +
      '<span>صفحهٔ ' + fa(d.page) + ' از ' + fa(d.pages) + '</span>' +
      '<button type="button" class="ad-btn" data-upage="' + (d.page + 1) + '"' + (d.page >= d.pages ? ' disabled' : '') + '>بعدی ←</button>';
  } else { pg.hidden = true; pg.innerHTML = ''; }
}

function userById(id) { return S.data && S.data.users.filter(function (u) { return u.id === id; })[0]; }

/* ---------- پنجره‌ها ---------- */
var dlg = $('userDialog');
function openDlg(title, html) {
  $('userDialogTitle').textContent = title;
  $('userDialogBody').innerHTML = html;
  if (!dlg.open) { if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', ''); }
}
function closeDlg() { if (dlg.open) { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); } }
$('userDialogClose').addEventListener('click', closeDlg);
dlg.addEventListener('click', function (e) { if (e.target === dlg) closeDlg(); });
dlg.addEventListener('close', function () { S.detail = null; });

function actionLabel(a) {
  return { update_profile: 'ویرایش پروفایل', disable_user: 'غیرفعال‌سازی حساب', enable_user: 'فعال‌سازی حساب', delete_user: 'حذف حساب', export_users: 'خروجی CSV' }[a] || a;
}
function detailText(a, det) {
  det = det || {};
  if (a === 'update_profile' && det.changed) return 'فیلدها: ' + det.changed.map(function (k) { return { first_name: 'نام', last_name: 'نام خانوادگی', phone: 'شماره تماس' }[k] || k; }).join('، ');
  if (a === 'export_users') return fa(det.count || 0) + ' ردیف';
  if (a === 'disable_user') return det.sessions_revoked === false ? 'نشست‌ها قطع نشد' : 'نشست‌های فعال قطع شد';
  return '';
}
function historyHtml(items) {
  if (!items || !items.length) return '<div class="ad-muted">هنوز عملیات مدیریتی ثبت نشده است.</div>';
  return '<ul class="ad-hist">' + items.map(function (h) {
    return '<li><b>' + esc(actionLabel(h.action)) + '</b>' + (h.target_email ? ' · <span class="ad-ltr">' + esc(h.target_email) + '</span>' : '') +
      '<div class="ad-muted">' + esc(dt(h.created_at)) + ' · توسط <span class="ad-ltr">' + esc(h.admin_email) + '</span>' + (detailText(h.action, h.details) ? ' · ' + esc(detailText(h.action, h.details)) : '') + '</div></li>';
  }).join('') + '</ul>';
}

function row(k, v) { return '<div class="ad-dl-row"><dt>' + k + '</dt><dd>' + v + '</dd></div>'; }
function showDetail(id) {
  S.detail = id;
  openDlg('جزئیات کاربر', '<div class="ad-empty">در حال بارگذاری…</div>');
  call({ action: 'get', id: id }).then(function (res) {
    if (S.detail !== id) return;
    if (!res.ok || !res.data || res.data.ok !== true) { $('userDialogBody').innerHTML = '<div class="ad-empty ad-err" role="alert">' + esc(failText(res)) + '</div>'; return; }
    var u = res.data.user;
    $('userDialogTitle').textContent = nameOf(u) || u.email;
    $('userDialogBody').innerHTML =
      '<dl class="ad-dl">' +
      row('شناسهٔ کاربر', '<span class="ad-ltr ad-mono">' + esc(u.id) + '</span>') +
      row('نام', esc(u.first_name || '—')) + row('نام خانوادگی', esc(u.last_name || '—')) +
      row('ایمیل', '<span class="ad-ltr">' + esc(u.email) + '</span>') +
      row('شمارهٔ تماس', u.phone ? '<span class="ad-ltr">' + esc(u.phone) + '</span>' : '—') +
      row('تاریخ ثبت‌نام', esc(dt(u.created_at))) +
      row('تأیید ایمیل', verBadge(u) + (u.email_confirmed_at ? ' <span class="ad-muted">' + esc(dt(u.email_confirmed_at)) + '</span>' : '')) +
      row('وضعیت حساب', accBadge(u)) +
      row('آخرین ورود', esc(dt(u.last_sign_in_at))) +
      row('روش ورود', esc((u.providers || []).join('، ') || '—')) +
      row('پروفایل', u.has_profile ? (u.profile_complete ? 'کامل' : 'ناقص') + ' <span class="ad-muted">· آخرین ویرایش: ' + esc(dt(u.profile_updated_at)) + '</span>' : 'ساخته نشده (پس از تأیید ایمیل ساخته می‌شود)') +
      '</dl>' +
      '<div class="ad-muted ad-safe">رمز عبور، توکن نشست و کدهای تأیید در هیچ‌جا نمایش داده نمی‌شوند.</div>' +
      '<h3 class="ad-h3">تاریخچهٔ مدیریتی این کاربر</h3>' + historyHtml(res.data.user.history) +
      '<div class="ad-row-actions ad-dlg-actions">' +
        (u.has_profile ? '<button type="button" class="ad-btn" data-uedit="' + esc(u.id) + '">ویرایش پروفایل</button>' : '') +
        '<button type="button" class="ad-btn" data-utoggle="' + esc(u.id) + '" data-to="' + (u.disabled ? 'enable' : 'disable') + '">' + (u.disabled ? 'فعال‌سازی حساب' : 'غیرفعال کردن حساب') + '</button>' +
        '<button type="button" class="ad-btn ad-danger" data-udel="' + esc(u.id) + '">حذف کاربر</button></div>';
    S.detailUser = u;
  }, function () { if (S.detail === id) $('userDialogBody').innerHTML = '<div class="ad-empty ad-err" role="alert">اتصال به سرور برقرار نشد.</div>'; });
}

function busy(on, btn, label) {
  S.busy = on;
  if (btn) { btn.disabled = on; if (label) { if (on) { btn.dataset.l = btn.textContent; btn.textContent = label; } else if (btn.dataset.l) btn.textContent = btn.dataset.l; } }
}
function afterMutation(msg) {
  S.detailUser = null;
  A.toast(msg);
  load(true, true);
}
function dlgError(msg) {
  var e = $('userDialogBody').querySelector('.ad-form-err');
  if (e) { e.textContent = '✕ ' + msg; e.hidden = false; } else A.toast(msg);
}

function showEdit(id) {
  var list = userById(id);
  var src = (S.detailUser && S.detailUser.id === id) ? S.detailUser : list;
  if (!src) return;
  S.detail = id;
  openDlg('ویرایش پروفایل', '<div class="ad-form">' +
    '<label class="ad-field"><span>نام</span><input id="ueFirst" type="text" maxlength="60" autocomplete="off" value="' + esc(src.first_name || '') + '"></label>' +
    '<label class="ad-field"><span>نام خانوادگی</span><input id="ueLast" type="text" maxlength="60" autocomplete="off" value="' + esc(src.last_name || '') + '"></label>' +
    '<label class="ad-field"><span>شمارهٔ تماس (اختیاری؛ مثل 09123456789)</span><input id="uePhone" type="tel" dir="ltr" inputmode="tel" maxlength="20" autocomplete="off" value="' + esc(src.phone || '') + '"></label>' +
    '<label class="ad-field"><span>ایمیل (فقط خواندنی)</span><input type="email" dir="ltr" value="' + esc(src.email) + '" readonly disabled></label>' +
    '<div class="ad-muted">تغییر ایمیل از این بخش ممکن نیست؛ باید خود کاربر از مسیر امن و با کد تأیید انجام دهد.</div>' +
    '<div class="ad-error ad-form-err" role="alert" hidden></div>' +
    '<div class="ad-row-actions"><button type="button" class="ad-btn ad-primary" id="ueSave">ذخیره</button><button type="button" class="ad-btn" id="ueCancel">انصراف</button></div></div>');
  $('ueCancel').addEventListener('click', closeDlg);
  $('ueSave').addEventListener('click', function () {
    if (S.busy) return;
    var btn = this; btn.setAttribute('aria-busy', 'true');
    busy(true, btn, 'در حال ذخیره…');
    call({ action: 'update_profile', id: id, first_name: $('ueFirst').value, last_name: $('ueLast').value, phone: $('uePhone').value }).then(function (res) {
      busy(false, btn, true); btn.removeAttribute('aria-busy');
      if (res.ok && res.data && res.data.ok) { closeDlg(); afterMutation(res.data.unchanged ? 'تغییری وجود نداشت' : 'پروفایل ذخیره شد'); }
      else dlgError(failText(res));
    }, function () { busy(false, btn, true); btn.removeAttribute('aria-busy'); dlgError('اتصال به سرور برقرار نشد'); });
  });
  setTimeout(function () { var f = $('ueFirst'); if (f) f.focus(); }, 30);
}

function showToggle(id, to) {
  var u = userById(id) || S.detailUser;
  if (!u) return;
  var disable = to === 'disable';
  S.detail = id;
  openDlg(disable ? 'غیرفعال کردن حساب' : 'فعال‌سازی حساب',
    '<div class="ad-form"><p>' + (disable
      ? 'حساب <b class="ad-ltr">' + esc(u.email) + '</b> غیرفعال شود؟ کاربر دیگر نمی‌تواند وارد شود و نشست‌های فعالش قطع می‌شود. اطلاعات او حذف نمی‌شود و هر زمان می‌توانید دوباره فعالش کنید.'
      : 'حساب <b class="ad-ltr">' + esc(u.email) + '</b> دوباره فعال شود؟') + '</p>' +
    '<div class="ad-error ad-form-err" role="alert" hidden></div>' +
    '<div class="ad-row-actions"><button type="button" class="ad-btn ' + (disable ? 'ad-hide' : 'ad-show') + '" id="utGo">' + (disable ? 'غیرفعال شود' : 'فعال شود') + '</button><button type="button" class="ad-btn" id="utNo">انصراف</button></div></div>');
  $('utNo').addEventListener('click', closeDlg);
  $('utGo').addEventListener('click', function () {
    if (S.busy) return;
    var btn = this; busy(true, btn, 'در حال انجام…');
    call({ action: 'set_disabled', id: id, disabled: disable }).then(function (res) {
      busy(false, btn, true);
      if (res.ok && res.data && res.data.ok) {
        closeDlg();
        afterMutation(disable ? (res.data.sessions_revoked === false ? 'حساب غیرفعال شد (قطع نشست‌ها انجام نشد؛ migration را بررسی کنید)' : 'حساب غیرفعال شد') : 'حساب فعال شد');
      } else dlgError(failText(res));
    }, function () { busy(false, btn, true); dlgError('اتصال به سرور برقرار نشد'); });
  });
}

function showDelete(id) {
  var u = userById(id) || S.detailUser;
  if (!u) return;
  S.detail = id;
  openDlg('حذف کاربر', '<div class="ad-form">' +
    '<p class="ad-warn">⚠️ حذف <b>دائمی</b> و غیرقابل برگشت است.</p>' +
    '<ul class="ad-policy"><li>حساب ورود و پروفایل این کاربر کاملاً حذف می‌شود و پروفایلِ یتیم نمی‌ماند.</li>' +
    '<li>سفارش‌ها، گفتگوهای دستیار و نظرهای نمونه‌کار به حساب کاربری وصل نیستند و نگه‌داری می‌شوند.</li>' +
    '<li>یک رکورد در «تاریخچهٔ مدیریتی» (ایمیل، زمان و مدیر) نگه‌داری می‌شود.</li></ul>' +
    '<label class="ad-field"><span>برای تأیید، ایمیل کاربر را عیناً بنویسید: <b class="ad-ltr">' + esc(u.email) + '</b></span><input id="udMail" type="email" dir="ltr" autocomplete="off" autocapitalize="off" spellcheck="false"></label>' +
    '<div class="ad-error ad-form-err" role="alert" hidden></div>' +
    '<div class="ad-row-actions"><button type="button" class="ad-btn ad-hide" id="udGo" disabled>حذف دائمی کاربر</button><button type="button" class="ad-btn" id="udNo">انصراف</button></div></div>');
  var mail = $('udMail'), go = $('udGo');
  mail.addEventListener('input', function () { go.disabled = S.busy || mail.value.trim().toLowerCase() !== String(u.email).toLowerCase(); });
  $('udNo').addEventListener('click', closeDlg);
  go.addEventListener('click', function () {
    if (S.busy || go.disabled) return;
    busy(true, go, 'در حال حذف…');
    call({ action: 'delete', id: id, confirm_email: mail.value.trim() }).then(function (res) {
      busy(false, go, true);
      if (res.ok && res.data && res.data.ok) {
        closeDlg();
        if (S.data) S.data.users = S.data.users.filter(function (x) { return x.id !== id; });
        render();
        afterMutation('کاربر حذف شد');
      } else { go.disabled = false; dlgError(failText(res)); }
    }, function () { busy(false, go, true); dlgError('اتصال به سرور برقرار نشد'); });
  });
  setTimeout(function () { mail.focus(); }, 30);
}

/* ---------- تاریخچهٔ مدیریتی (همهٔ کاربران) ---------- */
function showAudit(page) {
  page = page || 1;
  S.detail = null;
  openDlg('تاریخچهٔ مدیریتی', '<div class="ad-empty">در حال بارگذاری…</div>');
  call({ action: 'audit', page: page }).then(function (res) {
    if (!res.ok || !res.data || res.data.ok !== true) { $('userDialogBody').innerHTML = '<div class="ad-empty ad-err" role="alert">' + esc(failText(res)) + '</div>'; return; }
    var d = res.data, pages = Math.max(1, Math.ceil(d.total / d.pageSize));
    $('userDialogBody').innerHTML = historyHtml(d.items) +
      (pages > 1 ? '<nav class="ad-pager"><button type="button" class="ad-btn" data-apage="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>→ قبلی</button><span>صفحهٔ ' + fa(page) + ' از ' + fa(pages) + '</span><button type="button" class="ad-btn" data-apage="' + (page + 1) + '"' + (page >= pages ? ' disabled' : '') + '>بعدی ←</button></nav>' : '');
  }, function () { $('userDialogBody').innerHTML = '<div class="ad-empty ad-err" role="alert">اتصال به سرور برقرار نشد.</div>'; });
}

/* ---------- خروجی CSV ---------- */
function exportCsv() {
  if (S.busy) return;
  if (!W.confirm('فهرست کاربران (با ایمیل و شمارهٔ تماس) به‌صورت فایل CSV دانلود می‌شود و این خروجی در تاریخچهٔ مدیریتی ثبت می‌شود. فایل حاوی اطلاعات شخصی است؛ آن را امن نگه دارید. ادامه می‌دهید؟')) return;
  var btn = $('userExport'); busy(true, btn);
  call(params({ action: 'export', page: 1 })).then(function (res) {
    busy(false, btn);
    if (!res.ok || !res.data || res.data.ok !== true) { A.toast('خروجی انجام نشد: ' + failText(res)); return; }
    var rows = [['first_name', 'last_name', 'email', 'phone', 'registered_at', 'email_verified', 'account_status', 'last_sign_in_at']];
    res.data.users.forEach(function (u) {
      rows.push([u.first_name, u.last_name, u.email, u.phone, u.created_at, u.email_confirmed ? 'yes' : 'no', u.disabled ? 'disabled' : 'active', u.last_sign_in_at || '']);
    });
    A.download('merteks-users.csv', 'text/csv;charset=utf-8', A.csv(rows));
    A.toast(fa(res.data.users.length) + ' کاربر در فایل CSV قرار گرفت');
  }, function () { busy(false, btn); A.toast('اتصال به سرور برقرار نشد'); });
}

/* ---------- رویدادها ---------- */
function reload() { S.page = 1; load(false); }
$('userSearch').addEventListener('input', function () { clearTimeout(searchTimer); searchTimer = setTimeout(reload, 400); });
['userVerified', 'userStatus', 'userSort', 'userPageSize'].forEach(function (id) { $(id).addEventListener('change', reload); });
$('userRefresh').addEventListener('click', function () { load(true); });
$('userExport').addEventListener('click', exportCsv);
$('userAuditBtn').addEventListener('click', function () { showAudit(1); });

D.addEventListener('click', function (e) {
  var t;
  if (!$('paneUsers') || ($('paneUsers').hidden && !dlg.open)) return;
  if ((t = e.target.closest('[data-upage]')) && !t.disabled) { S.page = parseInt(t.getAttribute('data-upage'), 10) || 1; load(false); return; }
  if ((t = e.target.closest('[data-apage]')) && !t.disabled) { showAudit(parseInt(t.getAttribute('data-apage'), 10) || 1); return; }
  if ((t = e.target.closest('[data-uview]'))) { showDetail(t.getAttribute('data-uview')); return; }
  if ((t = e.target.closest('[data-uedit]')) && !t.disabled) { showEdit(t.getAttribute('data-uedit')); return; }
  if ((t = e.target.closest('[data-utoggle]'))) { showToggle(t.getAttribute('data-utoggle'), t.getAttribute('data-to')); return; }
  if ((t = e.target.closest('[data-udel]'))) { showDelete(t.getAttribute('data-udel')); return; }
});

/* به‌روزرسانی خودکار هر ۹۰ ثانیه (فقط وقتی تب باز و صفحه دیده می‌شود) تا ثبت‌نام‌های جدید بیایند */
setInterval(function () {
  if (!A.getTok() || A.activeTab() !== 'users' || D.visibilityState !== 'visible' || dlg.open || S.loading || S.busy || !S.data) return;
  load(true, true);
}, 90000);

W.MX_ADMIN_USERS = {
  load: function (fresh) { S.page = 1; return load(fresh); },
  reset: function () {
    S.seq++; S.data = null; S.count = null; S.page = 1; S.detail = null; S.detailUser = null; S.busy = false; S.loading = false;
    clearTimeout(searchTimer);
    if (dlg.open) closeDlg();
    $('userBox').innerHTML = ''; $('userStats').innerHTML = ''; $('userPager').hidden = true; setNote('');
    $('userDialogBody').innerHTML = '';
    $('userSearch').value = '';
  }
};
})();
