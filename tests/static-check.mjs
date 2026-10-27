// اجرا: node tests/static-check.mjs   (بدون وابستگی؛ فقط بررسی ایستای پروژه)
import fs from 'fs'; import path from 'path'; import crypto from 'crypto'; import { execSync } from 'child_process';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0; const out = [];
const ok = (c, m) => { c ? pass++ : (fail++, out.push('FAIL: ' + m)); };
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.name.startsWith('.') || ['node_modules','tests','docs'].includes(e.name) ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(root), rel = f => path.relative(root, f);
const htmls = files.filter(f => f.endsWith('.html'));
// 1) لینک‌ها و دارایی‌های داخلی
for (const f of htmls) {
  const s = fs.readFileSync(f, 'utf8');
  for (const m of s.matchAll(/(?:href|src)=["']([^"'#?]+)/g)) {
    const u = m[1]; if (/^(https?:|mailto:|tel:|data:|javascript:|\/\/)/.test(u)) continue;
    if (u.startsWith('/')) { if (rel(f) !== '404.html') ok(false, `${rel(f)}: مسیر مطلق ${u}`); continue; }
    ok(fs.existsSync(path.resolve(path.dirname(f), u)), `${rel(f)}: فایل موجود نیست ${u}`);
  }
}
// 2) CSP: بدون wildcard، و Google Fonts فقط برای Noto Naskh
for (const f of htmls) {
  const s = fs.readFileSync(f, 'utf8');
  ok(!/workers\.dev/.test(s), `${rel(f)}: workers.dev در CSP`);
  for (const m of s.matchAll(/fonts\.googleapis\.com\/css2\?([^"']+)/g)) ok(!/Vazirmatn/.test(m[1]), `${rel(f)}: Vazirmatn هنوز از Google`);
  if (/admin(-app)?\.html$/.test(f)) ok(!/googleapis|gstatic/.test(s) && /font-src 'self'/.test(s), `${rel(f)}: ادمین باید فونت محلی داشته باشد`);
}
// 3) @font-face محلی
for (const c of ['css/style.css', 'css/admin.css', 'css/admin-app.css']) ok(/@font-face\s*\{[^}]*Vazirmatn\.woff2/.test(fs.readFileSync(path.join(root, c), 'utf8')), `${c}: @font-face محلی نیست`);
ok(fs.existsSync(path.join(root, 'fonts/Vazirmatn.woff2')), 'فایل فونت محلی موجود نیست');
// 4) 404: هش اسکریپت = هش CSP
{ const s = fs.readFileSync(path.join(root, '404.html'), 'utf8');
  const sc = s.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '', h = crypto.createHash('sha256').update(sc).digest('base64');
  ok(s.includes(`'sha256-${h}'`), '404: هش CSP با اسکریپت یکی نیست'); }
// 5) APK و app.json
{ const j = JSON.parse(fs.readFileSync(path.join(root, 'downloads/app.json'), 'utf8'));
  for (const it of j.items) if (it.url) { const b = fs.readFileSync(path.join(root, it.url));
    ok(crypto.createHash('sha256').update(b).digest('hex') === it.sha256, `${it.url}: SHA-256 نمی‌خواند`); ok(b.length === it.size, `${it.url}: اندازه نمی‌خواند`); } }
// 6) sitemap / canonical روی یک origin
{ const sm = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8'); const origins = new Set([...sm.matchAll(/<loc>(https?:\/\/[^/]+\/[^/]+)\//g)].map(m => m[1])); ok(origins.size === 1, 'origin‌های sitemap یکسان نیست: ' + [...origins]); }
// 7) لینک «پرش به محتوا» در صفحات عمومی (اطلاعاتی)
const pub = htmls.filter(f => !/(admin|login|signup|404|account)/.test(rel(f)));
const noSkip = pub.filter(f => !/class="skip"/.test(fs.readFileSync(f, 'utf8'))).map(rel);
if (noSkip.length) out.push('INFO: بدون skip-link: ' + noSkip.join(', '));
// 8) نحو JS
for (const f of files.filter(f => f.endsWith('.js'))) { try { execSync(`node --check "${f}"`, { stdio: 'pipe' }); pass++; } catch (e) { fail++; out.push('FAIL: syntax ' + rel(f)); } }
console.log(out.join('\n')); console.log(`passed=${pass} failed=${fail}`); process.exit(fail ? 1 : 0);
