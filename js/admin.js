try { if (window.top !== window.self) window.top.location = window.self.location; } catch (e) { document.documentElement.style.display = 'none'; }
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
var RT_KEY = 'mx_adm_rt';
function getRt() { try { return sessionStorage.getItem(RT_KEY) || ''; } catch (e) { return ''; } }
function setRt(t) { try { t ? sessionStorage.setItem(RT_KEY, t) : sessionStorage.removeItem(RT_KEY); } catch (e) {} }
function saveSession(d) { setTok(d.access_token); if (d.refresh_token) setRt(d.refresh_token); }
function expSoon(t) {
try { var p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); return p.exp * 1000 - Date.now() < 60000; } catch (e) { return false; }
}
var refreshing = null;
function refreshSession() {
var rt = getRt();
if (!rt) return Promise.resolve(false);
if (!refreshing) {
refreshing = sbFetch('POST', '/auth/v1/token?grant_type=refresh_token', { json: { refresh_token: rt } }).then(function (res) {
refreshing = null;
if (res.ok && res.data && res.data.access_token) { saveSession(res.data); return true; }
return false;
}, function () { refreshing = null; return false; });
}
return refreshing;
}
function isAuthErr(res) {
if (res.status === 401) return true;
if (res.status === 400 || res.status === 403) { var m = String(errText(res)); return /jwt|exp claim|token.*expired|expired/i.test(m); }
return false;
}
function sb(method, path, o) {
o = o || {};
var useAuth = o.auth !== false;
function run() {
var tok = useAuth && getTok();
o.token = tok; o.timeout = o.timeout || 30000;
return sbFetch(method, path, o).then(function (res) { return { res: res, tok: tok }; });
}
var pre = (useAuth && getTok() && expSoon(getTok())) ? refreshSession() : Promise.resolve();
return pre.then(run).then(function (x) {
if (x.tok && getTok() && isAuthErr(x.res)) {
return refreshSession().then(function (ok) {
if (!ok) { if (getTok()) logout('نشست مدیر تمام شد؛ دوباره وارد شوید'); return x.res; }
return run().then(function (y) {
if (isAuthErr(y.res) && getTok()) logout('نشست مدیر تمام شد؛ دوباره وارد شوید');
return y.res;
});
});
}
return x.res;
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
setTok(''); setRt(''); clearTimeout(idleTimer);
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
saveSession(d);
return sb('POST', '/rest/v1/rpc/is_admin', { json: {} }).then(function (r2) {
reset();
if (r2.ok && r2.data === true) { $('adPass').value = ''; enter(); }
else { setTok(''); setRt(''); loginFail('این حساب دسترسی مدیر ندارد'); }
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
function enter() { showApp(true); touch(); onEnter(); pollBadges(); }
$('adLogout').addEventListener('click', function () { logout('از پنل خارج شدید'); });
function startSession() {
if (!getTok()) return;
sb('POST', '/rest/v1/rpc/is_admin', { json: {} }).then(function (r) {
if (r.ok && r.data === true) enter(); else if (r.status === 401 || r.status === 403) { setTok(''); setRt(''); showApp(false); } else showApp(false);
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
var state = { orders: [], chatRows: null, comments: null, projects: null, team: null, testimonials: null, users: null, ai: null, tab: 'orders' };
/* رابط کوچک برای بخش «کاربران» (js/admin-users.js) تا از همان نشست و ابزارهای پنل استفاده کند */
W.MX_ADMIN = Object.freeze({
sb: sb, esc: esc, fa: fa, norm: norm, errText: errText, csv: csv, download: download, toast: toast, getTok: getTok,
activeTab: function () { return state.tab; },
markLoaded: function (ok) { state.users = ok ? true : null; },
markAiLoaded: function (ok) { state.ai = ok ? true : null; }
});
function onLogout() {
state.orders = []; state.chatRows = null; state.comments = null; state.projects = null; state.team = null; state.testimonials = null; state.users = null; state.ai = null;
if (W.MX_ADMIN_USERS) W.MX_ADMIN_USERS.reset();
if (W.MX_ADMIN_AI) W.MX_ADMIN_AI.reset();
['orderList', 'chatList', 'commentList', 'projList', 'teamList', 'testiList'].forEach(function (id) { $(id).innerHTML = ''; });
clearPreview(); setBadge('chats', 0); setBadge('comments', 0);
}
function switchTab(name) {
state.tab = name;
qa('button.ad-tab').forEach(function (t) { var on = t.getAttribute('data-tab') === name; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', String(on)); });
Object.keys(LOAD).forEach(function (t) { $('pane' + t.charAt(0).toUpperCase() + t.slice(1)).hidden = name !== t; });
if (STATE_KEY[name] && (!state[STATE_KEY[name]] || badgeN[name] > 0)) LOAD[name]();
if (name === 'chats' || name === 'comments') setBadge(name, 0);
try { history.replaceState(null, '', '#' + name); } catch (e) {}
}
function loadUsersTab() { state.users = null; if (W.MX_ADMIN_USERS) W.MX_ADMIN_USERS.load(true); }
function loadAiTab() { state.ai = null; if (W.MX_ADMIN_AI) W.MX_ADMIN_AI.load(true); }
var LOAD = { orders: loadOrders, chats: loadChats, comments: loadComments, projects: loadProjects, team: loadTeam, testimonials: loadTesti, users: loadUsersTab, ai: loadAiTab };
var STATE_KEY = { chats: 'chatRows', comments: 'comments', projects: 'projects', team: 'team', testimonials: 'testimonials', users: 'users', ai: 'ai' };
qa('button.ad-tab').forEach(function (t) { t.addEventListener('click', function () { switchTab(t.getAttribute('data-tab')); }); });
$('adRefresh').addEventListener('click', function () { LOAD[state.tab](); });
W.addEventListener('hashchange', function () { var h = location.hash.slice(1); if (getTok() && LOAD[h] && h !== state.tab) switchTab(h); });
function onEnter() {
var h = location.hash.slice(1);
switchTab(LOAD[h] ? h : 'orders');
if (!LOAD[h] || h === 'orders') loadOrders();
}
var SEEN_KEY = 'mx_seen_', badgeN = { chats: 0, comments: 0 };
function getSeen(n) { try { return localStorage.getItem(SEEN_KEY + n) || ''; } catch (e) { return ''; } }
function setSeen(n, v) { try { localStorage.setItem(SEEN_KEY + n, v); } catch (e) {} }
function setBadge(n, c) {
badgeN[n] = c;
var el = $(n === 'chats' ? 'badgeChats' : 'badgeComments');
if (!el) return;
el.textContent = c > 99 ? '99+' : fa(c);
el.hidden = !c;
}
function markSeen(n, stamps) {
var best = getSeen(n);
stamps.forEach(function (s) { if (s && (!best || Date.parse(s) > Date.parse(best))) best = s; });
if (best) setSeen(n, best);
setBadge(n, 0);
}
function baseline(n) {
var path = n === 'chats' ? '/rest/v1/chats?select=at&order=at.desc&limit=1' : '/rest/v1/project_comments?select=created_at&order=created_at.desc&limit=1';
sb('GET', path).then(function (res) {
if (!res.ok || !Array.isArray(res.data)) return;
var r = res.data[0];
setSeen(n, r ? (r.at || r.created_at) : new Date().toISOString());
}, function () {});
}
function pollBadges() {
if (!getTok()) return;
['chats', 'comments'].forEach(function (n) {
var seen = getSeen(n);
if (!seen) { baseline(n); return; }
var path = n === 'chats'
? '/rest/v1/chats?select=chat_id,phone&at=gt.' + encodeURIComponent(seen) + '&order=at.desc&limit=1000'
: '/rest/v1/project_comments?select=id&created_at=gt.' + encodeURIComponent(seen) + '&limit=1000';
sb('GET', path).then(function (res) {
if (!getTok() || !res.ok || !Array.isArray(res.data)) return;
var cnt;
if (n === 'chats') { var u = {}; res.data.forEach(function (r) { u[r.phone || r.chat_id] = 1; }); cnt = Object.keys(u).length; }
else cnt = res.data.length;
if (state.tab === n) { if (cnt) LOAD[n](); return; }
setBadge(n, cnt);
}, function () {});
});
}
setInterval(pollBadges, 30000);
D.addEventListener('visibilitychange', function () { if (D.visibilityState === 'visible') pollBadges(); });
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
if (state.tab === 'chats') markSeen('chats', rows.map(function (r) { return r.at; }));
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
}, function (rows) { state.comments = rows; renderComments(); if (state.tab === 'comments') markSeen('comments', rows.map(function (r) { return r.created_at; })); });
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
function loadProjects() {
setEmpty('projList', 'در حال بارگذاری…');
fetchProjectRows(['id,name,description,url,created_at', 'id,name,created_at'], 200).then(function (res) {
if (!res.ok || !Array.isArray(res.data)) { setEmpty('projList', 'بارگذاری پروژه‌ها انجام نشد: ' + esc(errText(res))); return; }
state.projects = res.data.map(mapProject);
renderProjects();
}, function () { setEmpty('projList', 'اتصال به سرور برقرار نشد.'); });
}
function renderProjects() {
var list = state.projects || [];
if (!list.length) { setEmpty('projList', 'هنوز پروژه‌ای اضافه نشده است.'); return; }
$('projList').innerHTML = list.map(function (p) {
var cover = p.keys[0];
return '<article class="ad-item ad-proj">' +
(cover ? '<img src="' + esc(publicUrl(thumbKey(cover))) + '" data-full="' + esc(publicUrl(cover)) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">' : '<span></span>') +
'<div><strong>' + esc(p.name) + '</strong><span class="ad-muted">' + fa(p.keys.length) + ' عکس · ' + esc(new Date(p.createdAt).toLocaleDateString('fa-IR')) + '</span>' +
(p.description ? '<div class="ad-muted">' + esc(p.description) + '</div>' : '') + (p.url ? '<div class="ad-id">' + esc(p.url) + '</div>' : '') + '</div>' +
'<button class="ad-btn ad-danger" type="button" data-pdel="' + esc(p.id) + '">حذف پروژه</button></article>';
}).join('');
thumbFallback($('projList'));
}
$('projList').addEventListener('click', function (e) {
var b = e.target.closest('[data-pdel]');
if (!b) return;
if (!W.confirm('این پروژه و همهٔ عکس‌های آن حذف شود؟')) return;
var id = b.getAttribute('data-pdel'), p = (state.projects || []).filter(function (x) { return x.id === id; })[0];
if (!p) return;
b.disabled = true;
var keys = p.keys.slice();
if (keys[0]) keys.push(thumbKey(keys[0]));
keys = keys.filter(function (k, i) { return keys.indexOf(k) === i; });
sb('DELETE', '/storage/v1/object/' + BUCKET, { json: { prefixes: keys } }).then(function (r1) {
if (!r1.ok) throw new Error(errText(r1));
return sb('DELETE', '/rest/v1/projects?id=eq.' + encodeURIComponent(id), { prefer: 'return=minimal' });
}).then(function (r2) {
if (!r2.ok) throw new Error(errText(r2));
state.projects = state.projects.filter(function (x) { return x.id !== id; });
clearSiteCache();
renderProjects(); toast('پروژه حذف شد');
}).catch(function (err) { b.disabled = false; toast('حذف انجام نشد: ' + (err && err.message || 'خطا')); });
});
var picked = [], previewUrls = [];
function clearPreview() { previewUrls.forEach(function (u) { URL.revokeObjectURL(u); }); previewUrls = []; $('projPreview').innerHTML = ''; }
function showPicked() {
clearPreview();
$('projInfo').textContent = picked.length ? fa(picked.length) + ' عکس انتخاب شده است.' : 'هنوز عکسی انتخاب نشده است.';
picked.slice(0, 30).forEach(function (f) {
var u = URL.createObjectURL(f); previewUrls.push(u);
var im = D.createElement('img'); im.src = u; im.alt = 'پیش‌نمایش'; im.decoding = 'async'; $('projPreview').appendChild(im);
});
}
$('projFiles').addEventListener('change', function () {
var files = Array.prototype.slice.call(this.files || []).filter(function (f) { return /^image\//.test(f.type); });
if (files.length > 30) { toast('حداکثر ۳۰ عکس مجاز است'); files = files.slice(0, 30); }
picked = files; showPicked();
});
$('projReset').addEventListener('click', function () { picked = []; $('projFiles').value = ''; $('projName').value = ''; $('projDesc').value = ''; $('projUrl').value = ''; showPicked(); });
function loadImg(file) {
return new Promise(function (resolve, reject) {
var u = URL.createObjectURL(file), im = new Image();
im.onload = function () { URL.revokeObjectURL(u); resolve(im); };
im.onerror = function () { URL.revokeObjectURL(u); reject(new Error('خواندن تصویر ناموفق بود')); };
im.src = u;
});
}
function encode(img, max, q) {
var scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
var w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
var c = D.createElement('canvas'); c.width = w; c.height = h;
c.getContext('2d').drawImage(img, 0, 0, w, h);
return new Promise(function (resolve, reject) {
c.toBlob(function (b) {
if (b && b.type === 'image/webp') return resolve(b);
c.toBlob(function (j) { j ? resolve(j) : reject(new Error('فشرده‌سازی تصویر ناموفق بود')); }, 'image/jpeg', q);
}, 'image/webp', q);
});
}
function setProgress(n, total, label) {
var box = $('projProgress'); box.hidden = false;
box.firstElementChild.style.width = Math.round((n / total) * 100) + '%';
box.lastElementChild.textContent = label;
}
$('projForm').addEventListener('submit', function (e) {
e.preventDefault();
var name = $('projName').value.trim();
if (!name) { toast('نام پروژه را وارد کنید'); return; }
if (picked.length < 1) { toast('حداقل یک عکس انتخاب کنید'); return; }
if (picked.length > 30) { toast('حداکثر ۳۰ عکس مجاز است'); return; }
var btn = $('projSave'); btn.disabled = true;
var pid = null, uploaded = [], total = picked.length;
function rollback(err) {
var undo = Promise.resolve();
if (uploaded.length) undo = sb('DELETE', '/storage/v1/object/' + BUCKET, { json: { prefixes: uploaded } }).catch(function () {});
if (pid) undo = undo.then(function () { return sb('DELETE', '/rest/v1/projects?id=eq.' + encodeURIComponent(pid), { prefer: 'return=minimal' }).catch(function () {}); });
return undo.then(function () { throw err; });
}
function upload(key, blob) {
return sb('POST', '/storage/v1/object/' + BUCKET + '/' + key, { raw: blob, type: blob.type, timeout: 120000 }).then(function (r) {
if (!r.ok) throw new Error('آپلود عکس ناموفق بود: ' + errText(r));
uploaded.push(key);
});
}
var desc = $('projDesc').value.trim(), url = $('projUrl').value.trim();
if (url && !/^https?:\/\//i.test(url)) { btn.disabled = false; toast('لینک باید با http:// یا https:// شروع شود'); return; }
setProgress(0, total, 'در حال ساخت پروژه…');
var createP = sb('POST', '/rest/v1/projects', { json: { name: name, description: desc || null, url: url || null }, prefer: 'return=representation' }).then(function (r) {
if (r.ok) return r;
if (!desc && !url) return r;
toast('برای ذخیرهٔ توضیح و لینک، فایل migration-portfolio.sql را در Supabase اجرا کنید');
return sb('POST', '/rest/v1/projects', { json: { name: name }, prefer: 'return=representation' });
});
createP.then(function (r) {
if (!r.ok || !Array.isArray(r.data) || !r.data[0]) throw new Error('ساخت پروژه ناموفق بود: ' + errText(r));
pid = r.data[0].id;
return picked.reduce(function (chain, file, i) {
return chain.then(function () {
setProgress(i, total, 'عکس ' + fa(i + 1) + ' از ' + fa(total) + '…');
return loadImg(file).then(function (img) {
return encode(img, 1800, 0.82).then(function (full) {
var ext = full.type === 'image/webp' ? 'webp' : 'jpg';
var key = pid + '/' + i + '-' + Math.random().toString(36).slice(2, 8) + '.' + ext;
return upload(key, full).then(function () {
if (i === 0 && ext === 'webp') {
return encode(img, 640, 0.8).then(function (th) { return upload(thumbKey(key), th); });
}
}).then(function () {
return sb('POST', '/rest/v1/project_images', { json: { project_id: pid, pos: i, key: key }, prefer: 'return=minimal' }).then(function (r2) {
if (!r2.ok) throw new Error('ثبت عکس ناموفق بود: ' + errText(r2));
});
});
});
});
});
}, Promise.resolve());
}).catch(rollback).then(function () {
setProgress(total, total, 'انجام شد');
toast('پروژه با موفقیت اضافه شد');
clearSiteCache();
$('projReset').click(); state.projects = null; loadProjects();
setTimeout(function () { $('projProgress').hidden = true; }, 1200);
}, function (err) {
$('projProgress').hidden = true;
toast(err && err.message ? err.message : 'ذخیرهٔ پروژه انجام نشد؛ دوباره امتحان کنید');
}).then(function () { btn.disabled = false; });
});

/* ---------------- تیم ---------------- */
var TEAM_URL = '/rest/v1/team_members?select=id,name,role,bio,photo_key,link,pos,created_at&order=pos.asc,created_at.asc&limit=100';
var teamEditId = null, teamFile = null, teamPrevUrl = '';
function loadTeam() {
setEmpty('teamList', 'در حال بارگذاری…');
sb('GET', TEAM_URL).then(function (res) {
if (!getTok()) return;
if (res.status === 404) { setEmpty('teamList', 'جدول تیم ساخته نشده؛ فایل migration-team.sql را در Supabase اجرا کنید.'); return; }
if (!res.ok || !Array.isArray(res.data)) { setEmpty('teamList', 'بارگذاری تیم انجام نشد: ' + esc(errText(res))); return; }
state.team = res.data; renderTeam();
}, function () { setEmpty('teamList', 'اتصال به سرور برقرار نشد.'); });
}
function renderTeam() {
var list = state.team || [];
if (!list.length) { setEmpty('teamList', 'هنوز عضوی ثبت نشده است.'); return; }
$('teamList').innerHTML = list.map(function (m, i) {
var pic = m.photo_key
? '<img src="' + esc(publicUrl(m.photo_key)) + '" alt="' + esc(m.name) + '" loading="lazy" decoding="async">'
: '<span class="ad-avatar" aria-hidden="true">' + esc(String(m.name).charAt(0)) + '</span>';
return '<article class="ad-item ad-proj ad-team">' + pic +
'<div><strong>' + esc(m.name) + '</strong>' + (m.role ? '<span class="ad-muted">' + esc(m.role) + '</span>' : '') +
(m.bio ? '<div class="ad-muted">' + esc(m.bio) + '</div>' : '') + (m.link ? '<div class="ad-id">' + esc(m.link) + '</div>' : '') + '</div>' +
'<div class="ad-actions">' +
'<button class="ad-btn" type="button" data-tup="' + esc(m.id) + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="بالاتر">↑</button>' +
'<button class="ad-btn" type="button" data-tdown="' + esc(m.id) + '"' + (i === list.length - 1 ? ' disabled' : '') + ' aria-label="پایین‌تر">↓</button>' +
'<button class="ad-btn" type="button" data-tedit="' + esc(m.id) + '">ویرایش</button>' +
'<button class="ad-btn ad-danger" type="button" data-tdel="' + esc(m.id) + '">حذف</button></div></article>';
}).join('');
}
function teamPrevClear() { if (teamPrevUrl) { URL.revokeObjectURL(teamPrevUrl); teamPrevUrl = ''; } $('teamPhotoPrev').innerHTML = ''; }
function teamReset() {
teamEditId = null; teamFile = null; teamPrevClear();
['teamName', 'teamRole', 'teamBio', 'teamLink', 'teamPhoto'].forEach(function (id) { $(id).value = ''; });
$('teamRemovePhoto').checked = false; $('teamRemoveWrap').hidden = true;
$('teamFormTitle').textContent = 'افزودن عضو جدید'; $('teamSave').textContent = '➕ افزودن عضو';
}
$('teamReset').addEventListener('click', teamReset);
$('teamPhoto').addEventListener('change', function () {
teamPrevClear();
var f = this.files && this.files[0];
if (!f || !/^image\//.test(f.type)) { teamFile = null; return; }
teamFile = f; teamPrevUrl = URL.createObjectURL(f);
var im = D.createElement('img'); im.src = teamPrevUrl; im.alt = 'پیش‌نمایش'; $('teamPhotoPrev').appendChild(im);
});
function teamFind(id) { return (state.team || []).filter(function (x) { return x.id === id; })[0]; }
function teamPatchPos(order) {
return order.reduce(function (chain, m, i) {
return chain.then(function () {
if (m.pos === i) return;
return sb('PATCH', '/rest/v1/team_members?id=eq.' + encodeURIComponent(m.id), { json: { pos: i }, prefer: 'return=minimal' }).then(function (r) {
if (!r.ok) throw new Error(errText(r));
m.pos = i;
});
});
}, Promise.resolve());
}
$('teamList').addEventListener('click', function (e) {
var b;
if ((b = e.target.closest('[data-tedit]'))) {
var m = teamFind(b.getAttribute('data-tedit')); if (!m) return;
teamReset(); teamEditId = m.id;
$('teamName').value = m.name; $('teamRole').value = m.role || ''; $('teamBio').value = m.bio || ''; $('teamLink').value = m.link || '';
$('teamRemoveWrap').hidden = !m.photo_key;
$('teamFormTitle').textContent = 'ویرایش «' + m.name + '»'; $('teamSave').textContent = '💾 ذخیرهٔ تغییرات';
$('teamForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('teamName').focus({ preventScroll: true });
return;
}
if ((b = e.target.closest('[data-tup],[data-tdown]'))) {
var up = b.hasAttribute('data-tup'), id = b.getAttribute(up ? 'data-tup' : 'data-tdown');
var arr = state.team.slice(), i = arr.findIndex(function (x) { return x.id === id; }), k = up ? i - 1 : i + 1;
if (i < 0 || k < 0 || k >= arr.length) return;
var t = arr[i]; arr[i] = arr[k]; arr[k] = t;
b.disabled = true;
teamPatchPos(arr).then(function () { state.team = arr; renderTeam(); toast('ترتیب ذخیره شد'); }, function (err) { toast('تغییر ترتیب انجام نشد: ' + (err && err.message || 'خطا')); loadTeam(); });
return;
}
if ((b = e.target.closest('[data-tdel]'))) {
var mm = teamFind(b.getAttribute('data-tdel')); if (!mm) return;
if (!W.confirm('«' + mm.name + '» از تیم حذف شود؟')) return;
b.disabled = true;
var p = mm.photo_key ? sb('DELETE', '/storage/v1/object/' + BUCKET, { json: { prefixes: [mm.photo_key] } }) : Promise.resolve({ ok: true });
p.then(function () { return sb('DELETE', '/rest/v1/team_members?id=eq.' + encodeURIComponent(mm.id), { prefer: 'return=representation' }); }).then(function (r) {
if (!r.ok || !Array.isArray(r.data) || !r.data.length) throw new Error(r.ok ? 'عضو پیدا نشد' : errText(r));
state.team = state.team.filter(function (x) { return x.id !== mm.id; });
if (teamEditId === mm.id) teamReset();
renderTeam(); toast('عضو حذف شد');
}).catch(function (err) { b.disabled = false; toast('حذف انجام نشد: ' + (err && err.message || 'خطا')); });
}
});
$('teamForm').addEventListener('submit', function (e) {
e.preventDefault();
var name = $('teamName').value.trim(), link = $('teamLink').value.trim();
if (!name) { toast('نام را وارد کنید'); return; }
if (link && !/^https?:\/\//i.test(link)) { toast('لینک باید با http:// یا https:// شروع شود'); return; }
var btn = $('teamSave'); btn.disabled = true;
var editing = teamEditId ? teamFind(teamEditId) : null, oldKey = editing ? editing.photo_key : null, newKey = null;
var body = { name: name, role: $('teamRole').value.trim(), bio: $('teamBio').value.trim(), link: link || null };
var photoP = teamFile
? loadImg(teamFile).then(function (img) { return encode(img, 480, 0.85); }).then(function (blob) {
var key = 'team/' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8) + '.' + (blob.type === 'image/webp' ? 'webp' : 'jpg');
return sb('POST', '/storage/v1/object/' + BUCKET + '/' + key, { raw: blob, type: blob.type, timeout: 60000 }).then(function (r) {
if (!r.ok) throw new Error('آپلود عکس ناموفق بود: ' + errText(r));
newKey = key; return key;
});
})
: Promise.resolve(null);
photoP.then(function (key) {
if (key) body.photo_key = key;
else if (editing && $('teamRemovePhoto').checked) body.photo_key = null;
if (editing) return sb('PATCH', '/rest/v1/team_members?id=eq.' + encodeURIComponent(editing.id), { json: body, prefer: 'return=representation' });
var max = (state.team || []).reduce(function (a, x) { return Math.max(a, x.pos); }, -1);
body.pos = max + 1;
return sb('POST', '/rest/v1/team_members', { json: body, prefer: 'return=representation' });
}).then(function (r) {
if (!r.ok || !Array.isArray(r.data) || !r.data.length) throw new Error('ذخیره انجام نشد: ' + (r.ok ? 'دسترسی یا رکورد پیدا نشد' : errText(r)));
var gone = editing && oldKey && (newKey || body.photo_key === null) ? oldKey : null;
if (gone) sb('DELETE', '/storage/v1/object/' + BUCKET, { json: { prefixes: [gone] } }).catch(function () {});
toast(editing ? 'تغییرات ذخیره شد' : 'عضو جدید اضافه شد');
teamReset(); state.team = null; loadTeam();
}).catch(function (err) {
if (newKey) sb('DELETE', '/storage/v1/object/' + BUCKET, { json: { prefixes: [newKey] } }).catch(function () {});
toast(err && err.message ? err.message : 'ذخیره انجام نشد؛ دوباره امتحان کنید');
}).then(function () { btn.disabled = false; });
});
W.addEventListener('pagehide', function () { clearPreview(); teamPrevClear(); });

/* ---------- نظرات مشتریان ---------- */
var TESTI_URL = '/rest/v1/testimonials?select=id,name,role,body,pos,created_at&order=pos.asc,created_at.desc&limit=100';
var testiEditId = null;
function loadTesti() {
setEmpty('testiList', 'در حال بارگذاری…');
return sb('GET', TESTI_URL).then(function (res) {
if (res.status === 404) { setEmpty('testiList', 'جدول نظرها ساخته نشده؛ فایل migration-testimonials.sql را در Supabase اجرا کنید.'); return; }
if (!res.ok || !Array.isArray(res.data)) { setEmpty('testiList', 'بارگذاری انجام نشد: ' + esc(errText(res))); return; }
state.testimonials = res.data; renderTesti();
}, function () { setEmpty('testiList', 'اتصال به سرور برقرار نشد.'); });
}
function renderTesti() {
var list = state.testimonials || [];
if (!list.length) { setEmpty('testiList', 'هنوز نظری ثبت نشده است.'); return; }
$('testiList').innerHTML = list.map(function (t) {
return '<article class="ad-item ad-proj ad-team"><span class="ad-avatar" aria-hidden="true">' + esc(String(t.name).charAt(0)) + '</span>' +
'<div><strong>' + esc(t.name) + '</strong>' + (t.role ? '<span class="ad-muted">' + esc(t.role) + '</span>' : '') +
'<div class="ad-muted">' + esc(t.body) + '</div></div>' +
'<div class="ad-actions"><button class="ad-btn" type="button" data-sedit="' + esc(t.id) + '">ویرایش</button>' +
'<button class="ad-btn ad-danger" type="button" data-sdel="' + esc(t.id) + '">حذف</button></div></article>';
}).join('');
}
function testiFind(id) { return (state.testimonials || []).filter(function (x) { return x.id === id; })[0]; }
function testiReset() {
testiEditId = null;
['testiName', 'testiRole', 'testiBody'].forEach(function (id) { $(id).value = ''; });
$('testiFormTitle').textContent = 'افزودن نظر مشتری'; $('testiSave').textContent = '➕ افزودن نظر';
}
$('testiReset').addEventListener('click', testiReset);
$('testiList').addEventListener('click', function (e) {
var b = e.target.closest('[data-sedit]');
if (b) {
var t = testiFind(b.getAttribute('data-sedit')); if (!t) return;
testiReset(); testiEditId = t.id;
$('testiName').value = t.name; $('testiRole').value = t.role || ''; $('testiBody').value = t.body;
$('testiFormTitle').textContent = 'ویرایش نظر «' + t.name + '»'; $('testiSave').textContent = '💾 ذخیرهٔ تغییرات';
$('testiForm').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('testiName').focus({ preventScroll: true });
return;
}
b = e.target.closest('[data-sdel]');
if (!b) return;
var d = testiFind(b.getAttribute('data-sdel')); if (!d) return;
if (!W.confirm('نظر «' + d.name + '» حذف شود؟')) return;
b.disabled = true;
sb('DELETE', '/rest/v1/testimonials?id=eq.' + encodeURIComponent(d.id), { prefer: 'return=representation' }).then(function (r) {
if (!r.ok || !Array.isArray(r.data) || !r.data.length) throw new Error(r.ok ? 'نظر پیدا نشد' : errText(r));
state.testimonials = state.testimonials.filter(function (x) { return x.id !== d.id; });
if (testiEditId === d.id) testiReset();
renderTesti(); toast('نظر حذف شد');
}).catch(function (err) { b.disabled = false; toast('حذف انجام نشد: ' + (err && err.message || 'خطا')); });
});
$('testiForm').addEventListener('submit', function (e) {
e.preventDefault();
var name = $('testiName').value.trim(), body = $('testiBody').value.trim();
if (!name || body.length < 2) { toast('نام و متن نظر را بنویسید'); return; }
var btn = $('testiSave'); btn.disabled = true;
var payload = { name: name, role: $('testiRole').value.trim(), body: body };
var req;
if (testiEditId) req = sb('PATCH', '/rest/v1/testimonials?id=eq.' + encodeURIComponent(testiEditId), { json: payload, prefer: 'return=representation' });
else {
payload.pos = (state.testimonials || []).reduce(function (a, x) { return Math.max(a, x.pos); }, -1) + 1;
req = sb('POST', '/rest/v1/testimonials', { json: payload, prefer: 'return=representation' });
}
req.then(function (r) {
if (!r.ok || !Array.isArray(r.data) || !r.data.length) throw new Error('ذخیره انجام نشد: ' + (r.ok ? 'دسترسی یا رکورد پیدا نشد' : errText(r)));
toast(testiEditId ? 'تغییرات ذخیره شد' : 'نظر اضافه شد');
testiReset(); state.testimonials = null; loadTesti();
}).catch(function (err) { toast(err && err.message ? err.message : 'ذخیره انجام نشد؛ دوباره امتحان کنید'); }).then(function () { btn.disabled = false; });
});

startSession();
})();
