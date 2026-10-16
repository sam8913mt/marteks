(function () {
'use strict';
var D = document, W = window;
function $(id) { return D.getElementById(id); }
function qa(sel, root) { return Array.prototype.slice.call((root || D).querySelectorAll(sel)); }
var CFG = W.MERTEKS_CONFIG || {};
var API = String(CFG.supabaseUrl || '').replace(/\/+$/, '');
var KEY = CFG.supabaseKey || '';
var BUCKET = 'projects';
var ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; }); }
function enDigits(v) {
return String(v == null ? '' : v)
.replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
.replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
}
function sbFetch(method, path, o) {
o = o || {};
var h = { apikey: KEY }, body;
if (o.token) h.Authorization = 'Bearer ' + o.token;
if (o.raw !== undefined) { body = o.raw; h['Content-Type'] = o.type; }
else if (o.json !== undefined) { body = JSON.stringify(o.json); h['Content-Type'] = 'application/json'; }
if (o.prefer) h.Prefer = o.prefer;
var ctl = W.AbortController ? new AbortController() : null;
var timer = ctl ? setTimeout(function () { ctl.abort(); }, o.timeout || 15000) : null;
return fetch(API + path, {
method: method, headers: h, body: body,
keepalive: !!o.keepalive && method !== 'GET',
cache: o.cache || 'no-store',
signal: ctl ? ctl.signal : undefined
}).then(function (r) {
if (timer) clearTimeout(timer);
return r.text().then(function (t) {
var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { d = t; }
return { ok: r.ok, status: r.status, data: d };
});
}, function (err) { if (timer) clearTimeout(timer); throw err; });
}
function errText(res) {
var d = res.data;
return (d && typeof d === 'object' && (d.message || d.msg || d.error_description || d.error)) || ('خطای سرور (' + res.status + ')');
}
function publicUrl(key) { return API + '/storage/v1/object/public/' + BUCKET + '/' + String(key).split('/').map(encodeURIComponent).join('/'); }
function thumbKey(key) { return /\.webp$/.test(key) ? key.slice(0, -5) + '-t.webp' : key; }
function thumbFallback(root) {
qa('img[data-full]', root).forEach(function (img) {
img.addEventListener('error', function () { var f = img.getAttribute('data-full'); if (f && img.src !== f) img.src = f; });
});
}
function mapProject(p) {
var im = (p.project_images || []).slice().sort(function (a, b) { return a.pos - b.pos; });
return { id: p.id, name: p.name, description: p.description || '', url: p.url || '', createdAt: p.created_at, keys: im.map(function (x) { return x.key; }) };
}
function fetchProjectRows(variants, limit, o) {
o = o || {};
return (function next(i) {
return sbFetch('GET', '/rest/v1/projects?order=created_at.desc&limit=' + limit + '&select=' + variants[i] + ',project_images(key,pos)', o).then(function (res) {
return (res.ok && Array.isArray(res.data)) || i + 1 >= variants.length ? res : next(i + 1);
});
})(0);
}
var TOK_KEY = 'mx_adm_tok';
var IDLE_MS = 5 * 60 * 1000;
function fa(n) { return Number(n).toLocaleString('fa-IR'); }
function setEmpty(id, msg) { $(id).innerHTML = '<div class="ad-empty">' + msg + '</div>'; }
var toastEl = $('adToast'), toastT;
function toast(msg) {
toastEl.textContent = msg; toastEl.classList.add('show');
clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
}
function getTok() { try { return sessionStorage.getItem(TOK_KEY) || ''; } catch (e) { return ''; } }
function setTok(t) { try { t ? sessionStorage.setItem(TOK_KEY, t) : sessionStorage.removeItem(TOK_KEY); } catch (e) {} }
function sb(method, path, o) {
o = o || {};
var tok = o.auth !== false && getTok();
o.token = tok; o.timeout = o.timeout || 30000;
return sbFetch(method, path, o).then(function (res) {
if (res.status === 401 && tok && getTok()) logout('نشست مدیر تمام شد؛ دوباره وارد شوید');
return res;
});
}
var idleTimer;
function touch() {
clearTimeout(idleTimer);
if (!getTok()) return;
idleTimer = setTimeout(function () { logout('به‌دلیل بی‌فعالیتی از پنل خارج شدید'); }, IDLE_MS);
}
['click', 'keydown', 'pointerdown', 'touchstart', 'scroll'].forEach(function (ev) { D.addEventListener(ev, touch, { passive: true }); });
function showApp(on) {
$('adLogin').hidden = on;
$('adApp').hidden = !on;
D.title = on ? PAGE_TITLE : 'ورود به پنل مدیریت';
}
function logout(msg) {
setTok(''); clearTimeout(idleTimer);
onLogout();
$('adPass').value = '';
showApp(false);
if (msg) toast(msg);
}
var loginForm = $('adLoginForm'), loginErr = $('adLoginError');
if (CFG.adminEmail) $('adEmail').value = CFG.adminEmail;
function loginFail(msg) {
loginErr.textContent = '✕ ' + msg; loginErr.hidden = false;
loginForm.classList.remove('ad-shake'); void loginForm.offsetWidth; loginForm.classList.add('ad-shake');
$('adPass').select();
}
$('adPassToggle').addEventListener('click', function () {
var p = $('adPass'), show = p.type === 'password';
p.type = show ? 'text' : 'password';
this.setAttribute('aria-pressed', String(show));
});
loginForm.addEventListener('submit', function (e) {
e.preventDefault();
loginErr.hidden = true;
var email = $('adEmail').value.trim(), pass = $('adPass').value;
if (!email || !pass) return;
if (!API || !KEY) { loginFail('اتصال به سرور تنظیم نشده است (js/config.js)'); return; }
var btn = $('adLoginBtn'); btn.disabled = true; btn.textContent = 'در حال بررسی…';
function reset() { btn.disabled = false; btn.textContent = 'ورود'; }
sb('POST', '/auth/v1/token?grant_type=password', { auth: false, json: { email: email, password: pass } }).then(function (res) {
var d = res.data;
if (res.ok && d && d.access_token) {
setTok(d.access_token);
return sb('POST', '/rest/v1/rpc/is_admin', { json: {} }).then(function (r2) {
reset();
if (r2.ok && r2.data === true) { $('adPass').value = ''; enter(); }
else { setTok(''); loginFail('این حساب دسترسی مدیر ندارد'); }
});
}
reset();
var code = d && typeof d === 'object' ? (d.error_code || d.code || '') : '';
if (res.status === 429) loginFail('تلاش‌های زیاد بود؛ چند دقیقه بعد دوباره امتحان کنید');
else if (code === 'invalid_credentials') loginFail('ایمیل یا رمز عبور اشتباه است');
else if (code === 'email_not_confirmed') loginFail('ایمیل این کاربر در Supabase تأیید نشده است');
else loginFail('ورود انجام نشد' + (code ? ' (' + code + ')' : ''));
}, function () { reset(); loginFail('اتصال به سرور برقرار نشد'); });
});
function clearSiteCache() { try { ['mx_projects_v2', 'mx_projects_v3', 'mx_projects_v4'].forEach(function (k) { sessionStorage.removeItem(k); }); } catch (e) {} }
function enter() { showApp(true); touch(); onEnter(); }
$('adLogout').addEventListener('click', function () { logout('از پنل خارج شدید'); });
function startSession() {
if (!getTok()) return;
sb('POST', '/rest/v1/rpc/is_admin', { json: {} }).then(function (r) {
if (r.ok && r.data === true) enter(); else { setTok(''); showApp(false); }
}, function () { showApp(false); });
}
var PAGE_TITLE = 'پنل مدیریت مرتکس';
var STATUSES = ['جدید', 'در حال بررسی', 'در حال انجام', 'انجام شد', 'لغو شد'];
function statBox(id, items) {
$(id).innerHTML = items.map(function (i) { return '<div class="ad-stat"><strong>' + fa(i[0]) + '</strong><span>' + i[1] + '</span></div>'; }).join('');
}
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
var LOAD = { orders: loadOrders, chats: loadChats, comments: loadComments };
var STATE_KEY = { chats: 'chatRows', comments: 'comments' };
qa('button.ad-tab').forEach(function (t) { t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); }); });
$('adRefresh').addEventListener('click', function () { LOAD[state.tab](); });
function onEnter() {
var h = location.hash.slice(1);
switchTab(LOAD[h] ? h : 'orders');
if (!LOAD[h] || h === 'orders') loadOrders();
}
var filterSel = $('orderFilter');
STATUSES.forEach(function (s) { var o = D.createElement('option'); o.value = s; o.textContent = s; filterSel.appendChild(o); });
var ORDERS_URL = '/rest/v1/orders?select=id,created_at,name,phone,service,budget,description,status&order=created_at.desc&limit=1000';
var baseTitle = 'پنل مدیریت مرتکس', unseen = 0, orderSig = '';
function sigOf(list) { return list.map(function (o) { return o.id + ':' + o.status; }).join('|'); }
function setUnseen(n) { unseen = n; D.title = (n ? '(' + n + ') سفارش جدید · ' : '') + baseTitle; }
D.addEventListener('visibilitychange', function () { if (D.visibilityState === 'visible') { setUnseen(0); pollOrders(); } });
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
function loadChats() {
loadList('chatList', '/rest/v1/chats?select=chat_id,name,phone,device,question,answer,at,type&order=at.asc&limit=5000', function (res) { return 'بارگذاری گفتگوها انجام نشد: ' + esc(errText(res)); }, function (rows) {
state.chatRows = rows; renderChats();
});
}
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
var CM_LABEL = { pending: '⏳ در انتظار تأیید', approved: '✅ نمایش داده می‌شود', hidden: '🚫 مخفی' };
function cmStatus(c) { return c.status === 'approved' || c.status === 'hidden' ? c.status : 'pending'; }
function loadComments() {
loadList('commentList', '/rest/v1/project_comments?select=id,project_id,name,body,created_at,status,projects(name)&order=created_at.desc&limit=1000', function (res) {
if (res.status === 404) return 'جدول نظرات ساخته نشده؛ فایل supabase/migration-comments.sql را در Supabase اجرا کنید.';
if (res.status === 400) return 'ستون وضعیت نظرها ساخته نشده؛ فایل supabase/migration-comment-moderation.sql را در Supabase اجرا کنید.';
return 'بارگذاری نظرات انجام نشد: ' + esc(errText(res));
}, function (rows) { state.comments = rows; renderComments(); });
}
function renderComments() {
var all = state.comments || [], cnt = { pending: 0, approved: 0, hidden: 0 };
all.forEach(function (c) { cnt[cmStatus(c)]++; });
statBox('commentStats', [[all.length, 'کل نظرها'], [cnt.pending, 'در انتظار تأیید'], [cnt.approved, 'نمایش داده می‌شود'], [cnt.hidden, 'مخفی']]);
var q = norm($('commentSearch').value), f = $('commentFilter').value;
var list = all.filter(function (c) {
return (!f || cmStatus(c) === f) && (!q || norm([c.name, c.body, c.projects && c.projects.name].join(' ')).indexOf(q) > -1);
}).sort(function (a, b) {
return (cmStatus(a) === 'pending' ? 0 : 1) - (cmStatus(b) === 'pending' ? 0 : 1);
});
if (!list.length) { setEmpty('commentList', all.length ? 'موردی پیدا نشد.' : 'هنوز نظری ثبت نشده است.'); return; }
$('commentList').innerHTML = list.map(function (c) {
var st = cmStatus(c), id = esc(c.id), act;
if (st === 'pending') act = '<button class="ad-btn ad-show" type="button" data-cset="approved" data-cid="' + id + '">✓ تأیید و نمایش</button>';
else if (st === 'approved') act = '<button class="ad-btn ad-hide" type="button" data-cset="hidden" data-cid="' + id + '">مخفی کردن</button>';
else act = '<button class="ad-btn ad-show" type="button" data-cset="approved" data-cid="' + id + '">نمایش دادن</button>';
return '<article class="ad-item ad-cm-' + st + '"><div class="ad-item-head"><div><strong>' + esc(c.name) + '</strong>' +
'<div class="ad-id">' + esc(dateFa(c.created_at)) + '</div></div>' +
'<span class="ad-badge ad-badge-' + st + '">' + CM_LABEL[st] + '</span></div>' +
'<span class="ad-muted">پروژه: <b>' + esc((c.projects && c.projects.name) || 'حذف‌شده') + '</b></span>' +
'<div class="ad-desc">' + esc(c.body) + '</div>' +
'<div class="ad-row-actions">' + act + '<button class="ad-btn ad-danger" type="button" data-cdel="' + id + '">حذف نظر</button></div></article>';
}).join('');
}
$('commentSearch').addEventListener('input', renderComments);
$('commentFilter').addEventListener('change', renderComments);
$('commentList').addEventListener('click', function (e) {
var t = e.target.closest('[data-cset]');
if (!t) return;
var id = t.getAttribute('data-cid'), st = t.getAttribute('data-cset'); t.disabled = true;
sb('PATCH', '/rest/v1/project_comments?id=eq.' + encodeURIComponent(id), { json: { status: st }, prefer: 'return=representation' }).then(function (res) {
if (res.ok && Array.isArray(res.data) && res.data.length) {
(state.comments || []).forEach(function (c) { if (String(c.id) === id) c.status = res.data[0].status; });
clearSiteCache(); renderComments();
toast(st === 'approved' ? 'نظر در سایت نمایش داده می‌شود' : 'نظر مخفی شد');
} else { t.disabled = false; toast('تغییر وضعیت انجام نشد: ' + (res.ok ? 'دسترسی یا نظر پیدا نشد (فایل migration-comment-moderation.sql اجرا شده؟)' : errText(res))); }
}, function () { t.disabled = false; toast('اتصال به سرور برقرار نشد'); });
});
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
