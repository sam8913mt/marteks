/* ============================================================
   Merteks — پنل مدیریت (صفحهٔ مستقل: admin.html)
   - ورود با Supabase Auth (ایمیل + رمز)، توکن فقط در sessionStorage
   - داده‌ها همیشه از سرور خوانده می‌شوند؛ هیچ نسخهٔ محلی از سفارش/گفتگو ذخیره نمی‌شود
   - پروژه‌ها در صفحهٔ جدا هستند: admin-projects.html
   ============================================================ */
(function () {
  'use strict';

  //@include common
  //@include admin-core
  var PAGE_TITLE = 'پنل مدیریت مرتکس';
  var STATUSES = ['جدید', 'در حال بررسی', 'در حال انجام', 'انجام شد', 'لغو شد'];

  /* ---------- ابزارها ---------- */
  function statBox(id, items) {
    $(id).innerHTML = items.map(function (i) { return '<div class="ad-stat"><strong>' + fa(i[0]) + '</strong><span>' + i[1] + '</span></div>'; }).join('');
  }
  /* بارگذاری یک فهرست از سرور؛ failMsg(res) متن خطا را می‌سازد */
  function loadList(id, path, failMsg, onData) {
    setEmpty(id, 'در حال بارگذاری…');
    sb('GET', path).then(function (res) {
      if (!getTok()) return;
      if (!res.ok || !Array.isArray(res.data)) { setEmpty(id, failMsg(res)); return; }
      onData(res.data);
    }, function () { setEmpty(id, 'اتصال به سرور برقرار نشد.'); });
  }
  function budgetText(b) { b = String(b == null ? '' : b).trim(); if (!b) return 'اعلام نشده'; return /^\d+$/.test(b) ? fa(b) + ' تومان' : b; }
  function dateFa(iso) { var d = new Date(iso); return isNaN(d.getTime()) ? String(iso || '') : d.toLocaleString('fa-IR'); }
  function norm(s) {
    return enDigits(String(s == null ? '' : s).toLowerCase())
      .replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\s]+/g, ' ').trim();
  }
  /* جلوگیری از اجرای فرمول در Excel (CSV Injection) */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function csv(rows) { return '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'); }
  function download(name, type, data) {
    var url = URL.createObjectURL(new Blob([data], { type: type }));
    var a = D.createElement('a'); a.href = url; a.download = name;
    D.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 200);
  }
  function reportDoc(title, body) {
    return '<!DOCTYPE html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>' + esc(title) + '</title>' +
      '<style>body{font-family:Tahoma,Arial,sans-serif;line-height:1.9;padding:24px;color:#111}.order{border:1px solid #ccc;border-radius:10px;padding:12px 16px;margin:0 0 14px;page-break-inside:avoid}h1{font-size:22px}h2{font-size:16px;margin:0 0 6px}p{margin:3px 0}</style>' +
      '</head><body><h1>' + esc(title) + '</h1>' + body + '</body></html>';
  }
  function printHtml(html) {
    var w = W.open('', '_blank', 'width=900,height=700');
    if (!w) { toast('اجازهٔ باز شدن پنجرهٔ جدید را فعال کنید'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    w.focus(); setTimeout(function () { w.print(); }, 500);
  }

  /* ---------- تب‌ها ---------- */
  var state = { orders: [], chatRows: null, comments: null, tab: 'orders' };
  function onLogout() {
    state.orders = []; state.chatRows = null; state.comments = null;
    ['orderList', 'chatList', 'commentList'].forEach(function (id) { $(id).innerHTML = ''; });
  }
  function switchTab(name) {
    state.tab = name;
    qa('button.ad-tab').forEach(function (t) { var on = t.getAttribute('data-tab') === name; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', String(on)); });
    Object.keys(LOAD).forEach(function (t) { $('pane' + t.charAt(0).toUpperCase() + t.slice(1)).hidden = name !== t; });
    if (STATE_KEY[name] && !state[STATE_KEY[name]]) LOAD[name]();
  }
  /* هر تب: تابع بارگذاری و کلید دادهٔ آن در state (سفارش‌ها همیشه با ورود بارگذاری می‌شوند) */
  var LOAD = { orders: loadOrders, chats: loadChats, comments: loadComments };
  var STATE_KEY = { chats: 'chatRows', comments: 'comments' };
  qa('button.ad-tab').forEach(function (t) { t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); }); });
  $('adRefresh').addEventListener('click', function () { LOAD[state.tab](); });

  function onEnter() {
    var h = location.hash.slice(1);   /* admin.html#chats از صفحهٔ پروژه‌ها */
    switchTab(LOAD[h] ? h : 'orders');
    if (!LOAD[h] || h === 'orders') loadOrders();
  }

  /* ============================================================
     سفارش‌ها
     ============================================================ */
  var filterSel = $('orderFilter');
  STATUSES.forEach(function (s) { var o = D.createElement('option'); o.value = s; o.textContent = s; filterSel.appendChild(o); });

  var ORDERS_URL = '/rest/v1/orders?select=id,created_at,name,phone,service,budget,description,status&order=created_at.desc&limit=1000';
  var baseTitle = 'پنل مدیریت مرتکس', unseen = 0, orderSig = '';
  function sigOf(list) { return list.map(function (o) { return o.id + ':' + o.status; }).join('|'); }
  function setUnseen(n) { unseen = n; D.title = (n ? '(' + n + ') سفارش جدید · ' : '') + baseTitle; }
  D.addEventListener('visibilitychange', function () { if (D.visibilityState === 'visible') { setUnseen(0); pollOrders(); } });
  /* هر ۶۰ ثانیه سفارش‌های جدید را بی‌صدا می‌گیرد؛ اگر تب در پس‌زمینه باشد، تعدادشان در عنوان تب نشان داده می‌شود */
  function pollOrders() {
    if (!getTok() || state.tab !== 'orders') return;
    sb('GET', ORDERS_URL).then(function (res) {
      if (!getTok() || !res.ok || !Array.isArray(res.data)) return;
      var known = {}; state.orders.forEach(function (o) { known[o.id] = 1; });
      var fresh = res.data.filter(function (o) { return !known[o.id]; }).length;
      if (sigOf(res.data) === orderSig) return;
      state.orders = res.data; orderSig = sigOf(res.data); renderOrders();
      if (fresh) { toast(fa(fresh) + ' سفارش جدید رسید'); if (D.visibilityState !== 'visible') setUnseen(unseen + fresh); }
    }, function () {});
  }
  setInterval(pollOrders, 60000);

  function loadOrders() {
    loadList('orderList', ORDERS_URL, function (res) { return 'بارگذاری سفارش‌ها انجام نشد: ' + esc(errText(res)); }, function (rows) {
      state.orders = rows; orderSig = sigOf(rows); renderOrders();
    });
  }
  function renderOrders() {
    var all = state.orders, fresh = 0, done = 0;
    all.forEach(function (o) { if (o.status === 'جدید') fresh++; if (o.status === 'انجام شد') done++; });
    statBox('orderStats', [[all.length, 'کل سفارش‌ها'], [fresh, 'سفارش جدید'], [done, 'انجام شده']]);
    var q = norm($('orderSearch').value), st = filterSel.value;
    var list = all.filter(function (o) {
      if (st && o.status !== st) return false;
      return !q || norm([o.name, o.phone, o.id, o.service, o.description].join(' ')).indexOf(q) > -1;
    });
    if (!list.length) { setEmpty('orderList', all.length ? 'موردی با این فیلتر پیدا نشد.' : 'هنوز سفارشی ثبت نشده است.'); return; }
    $('orderList').innerHTML = list.map(function (o) {
      return '<article class="ad-item' + (o.status === 'جدید' ? ' is-new' : '') + '">' +
        '<div class="ad-item-head"><div><strong>' + esc(o.name) + '</strong><div class="ad-id">' + esc(o.id) + ' · ' + esc(dateFa(o.created_at)) + '</div></div>' +
        '<select class="ad-select ad-status" data-status="' + esc(o.id) + '" aria-label="وضعیت سفارش">' +
          STATUSES.map(function (s) { return '<option' + (o.status === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></div>' +
        '<div class="ad-meta"><span><b>تلفن:</b> <a href="tel:' + esc(o.phone) + '">' + esc(o.phone) + '</a></span><span><b>خدمت:</b> ' + esc(o.service) + '</span><span><b>بودجه:</b> ' + esc(budgetText(o.budget)) + '</span></div>' +
        '<div class="ad-desc">' + esc(o.description) + '</div>' +
        '<div class="ad-row-actions"><button class="ad-btn ad-danger" type="button" data-del="' + esc(o.id) + '">حذف سفارش</button></div></article>';
    }).join('');
  }
  $('orderSearch').addEventListener('input', renderOrders);
  filterSel.addEventListener('change', renderOrders);

  $('orderList').addEventListener('change', function (e) {
    var sel = e.target.closest('[data-status]');
    if (!sel) return;
    var id = sel.getAttribute('data-status'), val = sel.value;
    var item = state.orders.filter(function (o) { return o.id === id; })[0];
    var old = item && item.status;
    sel.disabled = true;
    sb('PATCH', '/rest/v1/orders?id=eq.' + encodeURIComponent(id), { json: { status: val }, prefer: 'return=representation' }).then(function (res) {
      sel.disabled = false;
      if (res.ok && Array.isArray(res.data) && res.data.length) { if (item) item.status = val; renderOrders(); toast('وضعیت سفارش تغییر کرد'); }
      else { sel.value = old; toast('تغییر وضعیت انجام نشد: ' + (res.ok ? 'سفارش پیدا نشد' : errText(res))); }
    }, function () { sel.disabled = false; sel.value = old; toast('اتصال به سرور برقرار نشد'); });
  });
  $('orderList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-del]');
    if (!b) return;
    if (!W.confirm('این سفارش حذف شود؟')) return;
    var id = b.getAttribute('data-del'); b.disabled = true;
    sb('DELETE', '/rest/v1/orders?id=eq.' + encodeURIComponent(id), { prefer: 'return=representation' }).then(function (res) {
      if (res.ok) { state.orders = state.orders.filter(function (o) { return o.id !== id; }); renderOrders(); toast('سفارش حذف شد'); }
      else { b.disabled = false; toast('حذف انجام نشد: ' + errText(res)); }
    }, function () { b.disabled = false; toast('اتصال به سرور برقرار نشد'); });
  });
  $('orderClear').addEventListener('click', function () {
    if (!state.orders.length) { toast('سفارشی برای حذف وجود ندارد'); return; }
    if (!W.confirm('همهٔ سفارش‌ها حذف شوند؟ این کار قابل برگشت نیست.')) return;
    sb('DELETE', '/rest/v1/orders?id=not.is.null', { prefer: 'return=minimal' }).then(function (res) {
      if (res.ok) { state.orders = []; renderOrders(); toast('همهٔ سفارش‌ها حذف شدند'); } else toast('حذف انجام نشد: ' + errText(res));
    }, function () { toast('اتصال به سرور برقرار نشد'); });
  });

  /* ============================================================
     گفتگوها (از سرور)
     ============================================================ */
  function loadChats() {
    loadList('chatList', '/rest/v1/chats?select=chat_id,name,phone,device,question,answer,at,type&order=at.asc&limit=5000', function (res) { return 'بارگذاری گفتگوها انجام نشد: ' + esc(errText(res)); }, function (rows) {
      state.chatRows = rows; renderChats();
    });
  }
  /* هر شماره تلفن = یک گفتگو (حتی اگر در چند نشست انجام شده باشد) */
  function groupChats() {
    var map = {}, order = [];
    (state.chatRows || []).forEach(function (r) {
      var k = r.phone || r.chat_id;
      var c = map[k];
      if (!c) { c = map[k] = { key: k, name: r.name, phone: r.phone, device: r.device, first: r.at, last: r.at, msgs: [] }; order.push(c); }
      if (r.name) c.name = r.name;
      if (r.device) c.device = r.device;
      if (r.at > c.last) c.last = r.at;
      if (r.type === 'message') c.msgs.push({ at: r.at, q: r.question, a: r.answer });
    });
    return order.sort(function (a, b) { return a.last < b.last ? 1 : -1; });
  }
  function renderChats() {
    var chats = groupChats(), today = new Date().toDateString(), q = 0, act = 0;
    chats.forEach(function (c) { q += c.msgs.length; if (new Date(c.last).toDateString() === today) act++; });
    statBox('chatStats', [[chats.length, 'کل گفتگوها'], [q, 'سؤال کاربران'], [act, 'فعال امروز']]);
    var s = norm($('chatSearch').value);
    var list = chats.filter(function (c) {
      return !s || norm(c.name + ' ' + c.phone + ' ' + c.msgs.map(function (m) { return m.q + ' ' + m.a; }).join(' ')).indexOf(s) > -1;
    });
    if (!list.length) { setEmpty('chatList', chats.length ? 'موردی پیدا نشد.' : 'هنوز گفتگویی با دستیار ثبت نشده است.'); return; }
    $('chatList').innerHTML = list.map(function (c) {
      return '<article class="ad-item"><div class="ad-item-head"><div><strong>' + esc(c.name || 'بدون نام') + '</strong>' +
        '<div class="ad-id">' + fa(c.msgs.length) + ' پیام</div></div>' + (c.phone ? '<a class="ad-id" href="tel:' + esc(c.phone) + '">' + esc(c.phone) + '</a>' : '<span class="ad-id">بدون شماره</span>') + '</div>' +
        '<div class="ad-meta"><span><b>شروع:</b> ' + esc(dateFa(c.first)) + '</span><span><b>آخرین پیام:</b> ' + esc(dateFa(c.last)) + '</span><span><b>دستگاه:</b> ' + esc(c.device || 'نامشخص') + '</span></div>' +
        '<div class="ad-msgs">' + (c.msgs.map(function (m) {
          return '<div class="ad-msg q"><small>👤 ' + esc(c.name) + ' · ' + esc(dateFa(m.at)) + '</small>' + esc(m.q) + '</div>' +
                 '<div class="ad-msg a"><small>🤖 ربات</small>' + esc(m.a) + '</div>';
        }).join('') || '<div class="ad-muted">هنوز پیامی ارسال نشده است.</div>') + '</div></article>';
    }).join('');
  }
  $('chatSearch').addEventListener('input', renderChats);

  /* ============================================================
     پروژه‌ها
     ============================================================ */
  /* ============================================================
     نظرات نمونه‌کارها
     ============================================================ */
  function loadComments() {
    loadList('commentList', '/rest/v1/project_comments?select=id,project_id,name,body,created_at,projects(name)&order=created_at.desc&limit=1000', function (res) {
      return res.status === 404 ? 'جدول نظرات ساخته نشده؛ فایل supabase/migration-comments.sql را در Supabase اجرا کنید.' : 'بارگذاری نظرات انجام نشد: ' + esc(errText(res));
    }, function (rows) { state.comments = rows; renderComments(); });
  }
  function renderComments() {
    var all = state.comments || [], today = new Date().toDateString(), td = 0, names = {};
    all.forEach(function (c) { if (new Date(c.created_at).toDateString() === today) td++; if (c.projects && c.projects.name) names[c.project_id] = 1; });
    statBox('commentStats', [[all.length, 'کل نظرها'], [td, 'نظرهای امروز'], [Object.keys(names).length, 'پروژهٔ دارای نظر']]);
    var q = norm($('commentSearch').value);
    var list = all.filter(function (c) {
      return !q || norm([c.name, c.body, c.projects && c.projects.name].join(' ')).indexOf(q) > -1;
    });
    if (!list.length) { setEmpty('commentList', all.length ? 'موردی پیدا نشد.' : 'هنوز نظری ثبت نشده است.'); return; }
    $('commentList').innerHTML = list.map(function (c) {
      return '<article class="ad-item"><div class="ad-item-head"><div><strong>' + esc(c.name) + '</strong>' +
        '<div class="ad-id">' + esc(dateFa(c.created_at)) + '</div></div>' +
        '<span class="ad-muted">پروژه: <b>' + esc((c.projects && c.projects.name) || 'حذف‌شده') + '</b></span></div>' +
        '<div class="ad-desc">' + esc(c.body) + '</div>' +
        '<div class="ad-row-actions"><button class="ad-btn ad-danger" type="button" data-cdel="' + esc(c.id) + '">حذف نظر</button></div></article>';
    }).join('');
  }
  $('commentSearch').addEventListener('input', renderComments);
  $('commentList').addEventListener('click', function (e) {
    var b = e.target.closest('[data-cdel]');
    if (!b) return;
    if (!W.confirm('این نظر حذف شود؟')) return;
    var id = b.getAttribute('data-cdel'); b.disabled = true;
    sb('DELETE', '/rest/v1/project_comments?id=eq.' + encodeURIComponent(id), { prefer: 'return=representation' }).then(function (res) {
      if (res.ok && Array.isArray(res.data) && res.data.length) {
        state.comments = state.comments.filter(function (c) { return String(c.id) !== id; });
        clearSiteCache(); renderComments(); toast('نظر حذف شد');
      } else { b.disabled = false; toast('حذف انجام نشد: ' + (res.ok ? 'نظر پیدا نشد' : errText(res))); }
    }, function () { b.disabled = false; toast('اتصال به سرور برقرار نشد'); });
  });

  /* ============================================================
     خروجی‌ها
     ============================================================ */
  function orderRowsHtml(list) {
    return list.map(function (o) {
      return '<div class="order"><h2>' + esc(o.name || 'بدون نام') + '</h2>' +
        '<p><b>شمارهٔ سفارش:</b> ' + esc(o.id) + '</p><p><b>تاریخ:</b> ' + esc(dateFa(o.created_at)) + '</p>' +
        '<p><b>تلفن:</b> ' + esc(o.phone) + '</p><p><b>نوع سفارش:</b> ' + esc(o.service) + '</p>' +
        '<p><b>بودجه:</b> ' + esc(budgetText(o.budget)) + '</p><p><b>وضعیت:</b> ' + esc(o.status) + '</p>' +
        '<p><b>توضیحات:</b><br>' + esc(o.description || '') + '</p></div>';
    }).join('');
  }
  function chatRowsHtml(chats) {
    return chats.map(function (c) {
      return '<div class="order"><h2>' + esc(c.name || 'بدون نام') + ' — ' + esc(c.phone) + '</h2>' +
        '<p><b>شروع:</b> ' + esc(dateFa(c.first)) + ' · <b>آخرین پیام:</b> ' + esc(dateFa(c.last)) + '</p>' +
        c.msgs.map(function (m) {
          return '<p><b>' + esc(c.name || 'کاربر') + '</b> (' + esc(dateFa(m.at)) + '): ' + esc(m.q) + '</p><p><b>ربات:</b> ' + esc(m.a) + '</p>';
        }).join('') + '</div>';
    }).join('');
  }
  function ordersReport() { return reportDoc('گزارش سفارش‌ها', '<p>تعداد: ' + state.orders.length + '</p>' + orderRowsHtml(state.orders)); }
  var EXPORTS = {
    'orders-json': function () { download('merteks-orders.json', 'application/json;charset=utf-8', JSON.stringify(state.orders, null, 2)); },
    'orders-csv': function () {
      var h = ['id', 'created_at', 'name', 'phone', 'service', 'budget', 'description', 'status'];
      download('merteks-orders.csv', 'text/csv;charset=utf-8', csv([h].concat(state.orders.map(function (o) { return h.map(function (k) { return o[k]; }); }))));
    },
    'orders-word': function () { download('merteks-orders.doc', 'application/msword;charset=utf-8', '\uFEFF' + ordersReport()); },
    'orders-pdf': function () { printHtml(ordersReport()); },
    'chats-csv': function () {
      var rows = [['phone', 'name', 'device', 'time', 'question', 'answer']];
      groupChats().forEach(function (c) { c.msgs.forEach(function (m) { rows.push([c.phone, c.name, c.device, m.at, m.q, m.a]); }); });
      download('merteks-chats.csv', 'text/csv;charset=utf-8', csv(rows));
    },
    'chats-word': function () { download('merteks-chats.doc', 'application/msword;charset=utf-8', '\uFEFF' + reportDoc('گزارش گفتگوهای دستیار', chatRowsHtml(groupChats()))); }
  };
  D.addEventListener('click', function (e) {
    var b = e.target.closest('[data-export]');
    if (!b) return;
    var name = b.getAttribute('data-export');
    if (name.indexOf('chats') === 0 && !state.chatRows) { toast('ابتدا تب گفتگوها را باز کنید'); return; }
    var fn = EXPORTS[name];
    if (fn) fn();
  });

  startSession();
})();
