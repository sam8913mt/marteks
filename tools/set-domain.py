#!/usr/bin/env python3
"""استفاده:  python3 tools/set-domain.py https://example.ir
آدرس واقعی سایت را جای YOUR-DOMAIN.com می‌گذارد (canonical، og:image، sitemap، robots)."""
import sys, os
if len(sys.argv) != 2 or not sys.argv[1].startswith('http'):
    sys.exit('usage: python3 tools/set-domain.py https://your-domain.com')
base = sys.argv[1].rstrip('/')
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
for f in ('index.html', 'robots.txt', 'sitemap.xml'):
    p = os.path.join(root, f)
    s = open(p, encoding='utf-8').read().replace('https://YOUR-DOMAIN.com', base)
    open(p, 'w', encoding='utf-8').write(s)
    print('updated', f)
