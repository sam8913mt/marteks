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
var PAGE_TITLE = 'مدیریت پروژه‌های مرتکس';
var state = { projects: null };
function onEnter() { loadProjects(); }
function onLogout() { state.projects = null; $('projList').innerHTML = ''; clearPreview(); }
$('adRefresh').addEventListener('click', loadProjects);
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
startSession();
W.addEventListener('pagehide', function () { clearPreview(); });
})();
