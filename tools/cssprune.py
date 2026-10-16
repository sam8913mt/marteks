#!/usr/bin/env python3
"""Prune unused CSS (selectors whose class/id never appears in HTML/JS) and minify."""
import re, sys

def strip_comments(s): return re.sub(r'/\*.*?\*/', '', s, flags=re.S)

def split_top(s, ch=','):
    out, depth, cur, q = [], 0, [], None
    for c in s:
        if q:
            cur.append(c)
            if c == q: q = None
            continue
        if c in '"\'': q = c; cur.append(c); continue
        if c in '([': depth += 1
        elif c in ')]': depth -= 1
        if c == ch and depth == 0: out.append(''.join(cur)); cur = []
        else: cur.append(c)
    out.append(''.join(cur)); return out

def parse(s):
    """-> list of ('rule', sel, body) | ('at', head, items|None, raw)"""
    items, i, n = [], 0, len(s)
    while i < n:
        while i < n and s[i] in ' \t\r\n': i += 1
        if i >= n: break
        j = i; depth = 0; q = None
        while j < n:
            c = s[j]
            if q:
                if c == q: q = None
            elif c in '"\'': q = c
            elif c in '([': depth += 1
            elif c in ')]': depth -= 1
            elif depth == 0 and c in '{;': break
            j += 1
        head = s[i:j].strip()
        if j < n and s[j] == ';':
            items.append(('stmt', head)); i = j + 1; continue
        k = j + 1; d = 1; q = None
        while k < n and d:
            c = s[k]
            if q:
                if c == q: q = None
            elif c in '"\'': q = c
            elif c == '{': d += 1
            elif c == '}': d -= 1
            k += 1
        body = s[j + 1:k - 1]
        if head.startswith('@'):
            name = head.split()[0].lower()
            if name in ('@media', '@supports', '@layer', '@container'):
                items.append(('at', head, parse(body)))
            else:
                items.append(('raw', head, body))
        else:
            items.append(('rule', head, body))
        i = k
    return items

TOK = re.compile(r'(?<![\w-])([.#])(-?[A-Za-z_][\w-]*)')
def sel_tokens(sel):
    sel = re.sub(r'\[[^\]]*\]', '', sel)          # drop attribute selectors
    sel = re.sub(r'"[^"]*"|\'[^\']*\'', '', sel)
    return TOK.findall(sel)

def make_known(files):
    words = set()
    for f in files:
        t = open(f, encoding='utf-8').read()
        words.update(re.findall(r'[A-Za-z_][\w-]*', t))
    return words

def keep_selector(sel, known, dynamic):
    for _, name in sel_tokens(sel):
        if name in known: continue
        if any(name.startswith(p) for p in dynamic): continue
        return False
    return True

def prune(items, known, dynamic, used_anim):
    out = []
    for it in items:
        if it[0] == 'rule':
            sels = [x.strip() for x in split_top(it[1]) if x.strip()]
            keep = [x for x in sels if keep_selector(x, known, dynamic)]
            if keep and it[2].strip():
                out.append(('rule', ','.join(keep), it[2]))
                used_anim.update(re.findall(r'animation(?:-name)?\s*:\s*([^;}]*)', it[2]))
        elif it[0] == 'at':
            inner = prune(it[2], known, dynamic, used_anim)
            if inner: out.append(('at', it[1], inner))
        else:
            out.append(it)
    return out

SHORT = ('margin', 'padding', 'background', 'transition', 'animation', 'flex', 'font', 'outline', 'list-style', 'text-decoration')
def _covers(later, earlier):
    """later (a property) fully overrides earlier when same property or later is a shorthand of it."""
    if later == earlier: return True
    return later in SHORT and earlier.startswith(later + '-')

def _decls(body):
    out = []
    for d in split_top(body, ';'):
        d = d.strip()
        if ':' in d:
            p, v = d.split(':', 1)
            p = p.strip(); p = p if p.startswith('--') else p.lower()
            out.append((p, v.strip()))
    return out

def dedupe(items):
    """Drop declarations that a later rule with the exact same selector (same @media scope) always overrides."""
    groups = {}
    for idx, it in enumerate(items):
        if it[0] == 'rule':
            groups.setdefault(re.sub(r'\s+', ' ', it[1]).strip(), []).append(idx)
    items = list(items)
    for idxs in groups.values():
        if len(idxs) < 2: continue
        parsed = {i: _decls(items[i][2]) for i in idxs}
        for a, i in enumerate(idxs[:-1]):
            keep = []
            for p, v in parsed[i]:
                imp = '!important' in v
                dead = False
                for j in idxs[a + 1:]:
                    for p2, v2 in parsed[j]:
                        if _covers(p2, p) and (('!important' in v2) or not imp):
                            dead = True; break
                    if dead: break
                if not dead: keep.append((p, v))
            parsed[i] = keep
            items[i] = ('rule', items[i][1], ';'.join(p + ':' + v for p, v in keep))
    out = []
    for it in items:
        if it[0] == 'rule' and not it[2].strip(): continue
        if it[0] == 'at': it = ('at', it[1], dedupe(it[2]))
        out.append(it)
    return out

def mini_body(b):
    b = re.sub(r'\s+', ' ', b).strip()
    b = re.sub(r'\s*([{};:,>])\s*', r'\1', b)
    b = re.sub(r';}', '}', b)
    b = re.sub(r'(?<![\d.])0\.(\d)', r'.\1', b)
    b = re.sub(r'(?<=[\s:,(])0(px|em|rem|%|s)\b(?!\w)', lambda m: '0' if m.group(1) != 's' else '0s', b)
    return b.rstrip(';')

def emit(items, pretty=False, depth=0):
    out = []
    pad = '  ' * depth if pretty else ''
    for it in items:
        if it[0] == 'rule':
            if pretty:
                decls = ';\n'.join(pad + '  ' + d.strip() for d in split_top(it[2], ';') if d.strip())
                out.append(f'{pad}{it[1]} {{\n{decls};\n{pad}}}')
            else:
                out.append(f'{re.sub(chr(92)+"s+"," ",it[1])}{{{mini_body(it[2])}}}'.replace(' ,', ',').replace(', ', ','))
        elif it[0] == 'at':
            inner = emit(it[2], pretty, depth + 1)
            head = it[1] if pretty else re.sub(r'\s*([:,()])\s*', r'\1', re.sub(r'\s+', ' ', it[1])).replace('and(', 'and (')
            out.append(f'{pad}{head} {{\n{inner}\n{pad}}}' if pretty else f'{head}{{{inner}}}')
        elif it[0] == 'raw':
            out.append(f'{pad}{it[1]} {{{it[2] if pretty else mini_body(it[2])}}}' if pretty else f'{it[1]}{{{mini_body(it[2])}}}')
        else:
            out.append(f'{pad}{it[1]};' if pretty else f'{it[1]};')
    return ('\n' if pretty else '').join(out)

def drop_unused_keyframes(items, used):
    out = []
    for it in items:
        if it[0] == 'raw' and it[1].lower().startswith('@keyframes'):
            name = it[1].split()[1]
            if not any(re.search(r'(?<![\w-])' + re.escape(name) + r'(?![\w-])', u) for u in used): continue
        elif it[0] == 'at':
            inner = drop_unused_keyframes(it[2], used)
            if not inner: continue
            it = ('at', it[1], inner)
        out.append(it)
    return out

if __name__ == '__main__':
    src, outpath, minpath = sys.argv[1], sys.argv[2], sys.argv[3]
    known_files = sys.argv[4:]
    css = strip_comments(open(src, encoding='utf-8').read())
    items = parse(css)
    known = make_known(known_files)
    dynamic = ('mx-ai-',)   # classes assembled from strings at runtime
    used = set()
    items = prune(items, known, dynamic, used)
    items = drop_unused_keyframes(items, used)
    items = prune(items, known, dynamic, set())  # second pass is a no-op safety
    open(outpath, 'w', encoding='utf-8').write(emit(items, True) + '\n')
    open(minpath, 'w', encoding='utf-8').write(emit(items, False))
    import os
    print('src', os.path.getsize(src), 'pretty', os.path.getsize(outpath), 'min', os.path.getsize(minpath))
