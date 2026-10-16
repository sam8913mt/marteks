#!/usr/bin/env python3
"""Build: src/*  ->  css/ , js/   (run:  python3 tools/build.py)"""
import os, re, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'src')); sys.path.insert(0, os.path.join(ROOT, 'tools'))
from min import minify
import cssprune as cp

def build_css():
    css = cp.strip_comments(open(os.path.join(ROOT, 'src/style.css'), encoding='utf-8').read())
    used = set()
    known = cp.make_known([os.path.join(ROOT, f) for f in ('index.html', 'src/app.src.js', 'src/assistant.src.js')])
    items = cp.prune(cp.parse(css), known, ('mx-ai-',), used)   # انتخاب‌گرهای بلااستفاده
    items = cp.drop_unused_keyframes(cp.dedupe(items), used)       # بازنویسی‌های بی‌اثر + keyframes بلااستفاده
    out = cp.emit(items, False)
    open(os.path.join(ROOT, 'css/style.css'), 'w', encoding='utf-8').write(out)
    print('css/style.css', len(out.encode()))

def build_js():
    for name, dest in (('app', 'app'), ('assistant', 'assistant'), ('admin', 'admin'), ('projects', 'projects')):
        src = open(os.path.join(ROOT, f'src/{name}.src.js'), encoding='utf-8').read()
        src = re.sub(r'//@include (\S+)', lambda m: open(os.path.join(ROOT, f'src/{m.group(1)}.src.js'), encoding='utf-8').read(), src)
        out = minify(src)
        open(os.path.join(ROOT, f'js/{dest}.js'), 'w', encoding='utf-8').write(out)
        print(f'js/{dest}.js', len(out.encode()))

if __name__ == '__main__':
    build_css(); build_js()
