/* Merteks — extras: testimonials, project share links, terminal card, English helpers */
(function () {
'use strict';
var D = document, W = window;
var CFG = W.MERTEKS_CONFIG || {};
var API = String(CFG.supabaseUrl || '').replace(/\/+$/, ''), KEY = CFG.supabaseKey || '';
var EN = String(D.documentElement.lang || '').toLowerCase().indexOf('en') === 0;
var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
function qa(s, r) { return [].slice.call((r || D).querySelectorAll(s)); }
function reduced() { try { return W.matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) { return false; } }
function digits(v) {
  return String(v == null ? '' : v).replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
    .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); });
}
function safeUrl(u) { try { var x = new URL(String(u || '')); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch (e) { return ''; } }
function pub(key) { return API + '/storage/v1/object/public/projects/' + String(key).split('/').map(encodeURIComponent).join('/'); }
function get(path) {
  return fetch(API + path, { headers: { apikey: KEY }, cache: 'default' }).then(function (r) {
    if (!r.ok) throw new Error('http ' + r.status);
    return r.json();
  });
}

/* ---- customer testimonials (hidden until the table has rows) ---- */
(function () {
  var boxes = qa('[data-testi]');
  if (!boxes.length || !API || !KEY) return;
  get('/rest/v1/testimonials?select=id,name,role,body&order=pos.asc,created_at.desc&limit=9').then(function (rows) {
    if (!Array.isArray(rows) || !rows.length) return;
    var html = rows.map(function (t, i) {
      return '<figure class="mx-quote" style="animation-delay:' + (i * 90) + 'ms"><blockquote><p>' + esc(t.body) + '</p></blockquote>' +
        '<figcaption><span class="av" aria-hidden="true">' + esc(String(t.name).charAt(0)) + '</span><span><b>' + esc(t.name) + '</b>' +
        (t.role ? '<span class="r">' + esc(t.role) + '</span>' : '') + '</span></figcaption></figure>';
    }).join('');
    boxes.forEach(function (b) {
      var g = b.querySelector('.mx-testi-grid');
      if (g) g.innerHTML = html;
      b.hidden = false;
    });
  }).catch(function () {});
})();

/* ---- team list + counters (Persian #teamList and English #teamListEn, same admin data) ----
   The original team loader in app.js sat inside a scope without the "$" helper and never ran. */
(function () {
  var ul = D.getElementById('teamList') || D.getElementById('teamListEn');
  var LOC = EN ? 'en-US' : 'fa-IR';
  function setCount(el, n) {
    if (!el) return;
    el.setAttribute('data-to', String(n));
    if (digits(el.textContent.trim()) !== '0') el.textContent = n.toLocaleString(LOC);
  }
  if (ul && API && KEY) {
    get('/rest/v1/team_members?select=id,name,role,bio,photo_key,link&order=pos.asc,created_at.asc&limit=100').then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) return;
      ul.innerHTML = rows.map(function (m) {
        var pic = m.photo_key
          ? '<span class="avatar"><img src="' + esc(pub(m.photo_key)) + '" alt="' + esc(m.name) + '" width="48" height="48" loading="lazy" decoding="async"></span>'
          : '<span class="avatar" aria-hidden="true">' + esc(String(m.name).charAt(0)) + '</span>';
        var link = safeUrl(m.link);
        return '<li>' + pic + '<div><b>' + esc(m.name) + '</b>' + (m.role ? '<span>' + esc(m.role) + '</span>' : '') +
          (m.bio ? '<span class="team-bio">' + esc(m.bio) + '</span>' : '') +
          (link ? '<a class="team-link" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer">' + (EN ? 'View profile ↗' : 'مشاهدهٔ پروفایل ↗') + '</a>' : '') + '</div></li>';
      }).join('');
      setCount(D.getElementById('teamCount'), rows.length);
    }).catch(function () {});
  }
  /* delivered-projects fact: shown only when at least one project exists */
  var box = D.getElementById('projFact'), num = D.getElementById('projCount');
  if (box && num && API && KEY) {
    get('/rest/v1/projects?select=id&limit=1000').then(function (rows) {
      if (!Array.isArray(rows) || !rows.length) return;
      num.setAttribute('data-to', String(rows.length));
      num.textContent = rows.length.toLocaleString(LOC);
      box.hidden = false;
    }).catch(function () {});
  }
})();

/* ---- projects page: share button, deep link (#p-<id>), English labels ---- */
(function () {
  var grid = D.getElementById('mxProjectsGrid');
  if (!grid) return;
  var tries = 0;
  function rows() {
    try { var c = JSON.parse(sessionStorage.getItem('mx_projects_v4') || 'null'); return (c && c.rows) || []; } catch (e) { return []; }
  }
  function copy(text, btn, okLabel, label) {
    function done() { btn.textContent = okLabel; setTimeout(function () { btn.textContent = label; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, done); return; }
    var ta = D.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
    D.body.appendChild(ta); ta.select(); try { D.execCommand('copy'); } catch (e) {} D.body.removeChild(ta); done();
  }
  function translate(card) {
    var badge = card.querySelector('.mx-project-badge');
    if (badge) { var n = parseInt(digits(badge.textContent), 10); if (n) badge.textContent = n + (n === 1 ? ' photo' : ' photos'); }
    var v = card.querySelector('.mx-project-view'); if (v) v.textContent = 'View photos';
    var l = card.querySelector('.mx-project-link'); if (l) l.textContent = 'Visit site ↗';
    var m = card.querySelector('.mx-project-media'), nm = card.querySelector('.mx-project-name');
    if (m && nm) m.setAttribute('aria-label', 'View photos: ' + nm.textContent);
    var im = card.querySelector('.mx-project-cover'); if (im && nm) im.setAttribute('alt', 'Project: ' + nm.textContent);
  }
  function decorate() {
    var rs = rows();
    qa('.mx-project-card', grid).forEach(function (card) {
      if (card.getAttribute('data-x')) return;
      card.setAttribute('data-x', '1');
      var b = card.querySelector('[data-i]'), i = b ? parseInt(b.getAttribute('data-i'), 10) : -1, p = rs[i];
      if (p && p.id) card.id = 'p-' + p.id;
      if (EN) translate(card);
      var act = card.querySelector('.mx-project-actions');
      if (act && p && p.id) {
        var label = EN ? 'Copy link' : 'کپی لینک', ok = EN ? 'Copied ✓' : 'کپی شد ✓';
        var s = D.createElement('button');
        s.type = 'button'; s.className = 'btn btn-ghost mx-project-share'; s.textContent = label;
        s.addEventListener('click', function () { copy(location.origin + location.pathname + '#p-' + p.id, s, ok, label); });
        act.appendChild(s);
      }
    });
    openFromHash();
  }
  function openFromHash() {
    var m = /^#p-([\w-]+)$/.exec(location.hash);
    if (!m || grid.getAttribute('data-hash-done')) return;
    var el = D.getElementById('p-' + m[1]);
    if (el) {
      grid.setAttribute('data-hash-done', '1');
      el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      el.classList.add('mx-pulse');
      var view = el.querySelector('.mx-project-view');
      if (view) setTimeout(function () { view.click(); }, 700);
      return;
    }
    var more = D.querySelector('#mxProjectsMore button');
    if (more && !D.getElementById('mxProjectsMore').hidden && tries++ < 12) more.click();
  }
  var pending = false;
  new MutationObserver(function () {
    if (pending) return; pending = true;
    requestAnimationFrame(function () { pending = false; decorate(); });
  }).observe(grid, { childList: true });
  decorate();
})();

/* ---- terminal card: types the first line, then reveals the result lines ---- */
(function () {
  qa('.mx-term').forEach(function (term) {
    var body = term.querySelector('.mx-term-body');
    if (!body || reduced() || !('IntersectionObserver' in W)) return;
    var lines = qa('.l', body), texts = lines.map(function (l) { return l.textContent; });
    lines.forEach(function (l) { l.textContent = ''; l.style.visibility = 'hidden'; });
    var cur = D.createElement('span'); cur.className = 'cur'; cur.setAttribute('aria-hidden', 'true');
    var started = false;
    var io = new IntersectionObserver(function (en) {
      if (en[0].isIntersecting && !started) { started = true; io.disconnect(); run(); }
    }, { threshold: .4 });
    io.observe(term);
    function run() {
      var li = 0;
      (function next() {
        if (li >= lines.length) return;
        var el = lines[li], txt = texts[li];
        el.style.visibility = 'visible'; el.appendChild(cur);
        if (li === 0) {
          var ci = 0;
          (function ch() {
            el.insertBefore(D.createTextNode(txt.charAt(ci)), cur); ci++;
            if (ci < txt.length) setTimeout(ch, 30); else { li++; setTimeout(next, 450); }
          })();
        } else { el.insertBefore(D.createTextNode(txt), cur); li++; setTimeout(next, 520); }
      })();
    }
  });
})();
/* ---- nav shortcut: "account" when signed in, "login" otherwise ---- */
(function () {
  var list = qa('#navAuth, .links-auth');
  if (!list.length) return;
  var raw = null;
  try { raw = W.localStorage.getItem('mx_auth_v1') || W.sessionStorage.getItem('mx_auth_v1'); } catch (e) {}
  var on = false;
  try { on = !!(raw && JSON.parse(raw).access_token); } catch (e) {}
  if (on) list.forEach(function (a) {
    a.href = 'account.html'; a.classList.add('on');
    if (a.id === 'navAuth') { a.title = 'حساب من'; a.setAttribute('aria-label', 'حساب کاربری من'); } else a.textContent = 'حساب من';
  });
})();
})();
