/* هستهٔ مشترک پنل مدیریت (admin.html و admin-projects.html): نشست، ورود، اعلان.
   هر صفحه این‌ها را تعریف می‌کند: PAGE_TITLE ، onEnter() ، onLogout() و در پایان startSession() را صدا می‌زند. */
var TOK_KEY = 'mx_adm_tok';
var IDLE_MS = 5 * 60 * 1000;
function fa(n) { return Number(n).toLocaleString('fa-IR'); }
function setEmpty(id, msg) { $(id).innerHTML = '<div class="ad-empty">' + msg + '</div>'; }
  var toastEl = $('adToast'), toastT;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
  }
/* ---------- نشست ---------- */
function getTok() { try { return sessionStorage.getItem(TOK_KEY) || ''; } catch (e) { return ''; } }
function setTok(t) { try { t ? sessionStorage.setItem(TOK_KEY, t) : sessionStorage.removeItem(TOK_KEY); } catch (e) {} }

/* sbFetch مشترک + توکن مدیر؛ با 401 از پنل خارج می‌شود */
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

/* ---------- ورود ---------- */
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

/* کش فهرست پروژه‌های سایت عمومی را پاک می‌کند */
function clearSiteCache() { try { ['mx_projects_v2', 'mx_projects_v3', 'mx_projects_v4'].forEach(function (k) { sessionStorage.removeItem(k); }); } catch (e) {} }
function enter() { showApp(true); touch(); onEnter(); }
$('adLogout').addEventListener('click', function () { logout('از پنل خارج شدید'); });
/* اگر نشست باز است مستقیم وارد شو */
function startSession() {
  if (!getTok()) return;
  sb('POST', '/rest/v1/rpc/is_admin', { json: {} }).then(function (r) {
    if (r.ok && r.data === true) enter(); else { setTok(''); showApp(false); }
  }, function () { showApp(false); });
}
