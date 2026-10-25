/* Merteks AI — makes the website behave like the installed app:
   registers the service worker (opens fast, works offline) and offers "install". */
(function () {
  'use strict';
  var W = window, D = document;
  if (W.MerteksNative) return; /* inside the Android app: nothing to do */

  var secure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (secure && 'serviceWorker' in navigator) {
    W.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    });
  }

  var standalone = W.navigator.standalone === true || (W.matchMedia && W.matchMedia('(display-mode: standalone)').matches);
  var KEY = 'mx_install_dismissed';
  function dismissed() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  if (standalone || dismissed()) return;

  var deferred = null;
  W.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    show();
  });
  W.addEventListener('appinstalled', function () { hide(); });

  var bar = null;
  function show() {
    if (bar || !D.body) return;
    bar = D.createElement('div');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'نصب برنامه');
    bar.style.cssText = 'position:fixed;z-index:9999;inset-inline:12px;bottom:calc(14px + env(safe-area-inset-bottom));margin-inline:auto;max-width:420px;display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;background:var(--card-solid,#141e2f);border:1px solid var(--line2,#34465f);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.45);font-family:var(--font,inherit);color:var(--text,#eaf4f4)';
    var t = D.createElement('span');
    t.textContent = 'Merteks AI را روی گوشی نصب کنید';
    t.style.cssText = 'flex:1;font-size:.9rem;line-height:1.6';
    var ok = D.createElement('button');
    ok.type = 'button'; ok.textContent = 'نصب';
    ok.style.cssText = 'min-height:44px;padding:0 20px;border:0;border-radius:10px;background:var(--accent,#5aa9e6);color:var(--on-accent,#0b1220);font:700 .9rem var(--font,inherit);cursor:pointer';
    var no = D.createElement('button');
    no.type = 'button'; no.textContent = '×'; no.setAttribute('aria-label', 'بستن');
    no.style.cssText = 'width:44px;height:44px;border:0;background:transparent;color:var(--muted,#8fa1b6);font-size:1.4rem;cursor:pointer';
    ok.addEventListener('click', function () {
      if (!deferred) return hide();
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; hide(); }, hide);
    });
    no.addEventListener('click', function () { try { localStorage.setItem(KEY, '1'); } catch (e) {} hide(); });
    bar.appendChild(t); bar.appendChild(ok); bar.appendChild(no);
    D.body.appendChild(bar);
  }
  function hide() { if (bar && bar.parentNode) bar.parentNode.removeChild(bar); bar = null; }
})();
