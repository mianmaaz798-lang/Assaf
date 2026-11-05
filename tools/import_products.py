#!/usr/bin/env python3
"""Import the live Assaf catalogue (Shopify) into assets/js/data.js.

Usage:
    python3 tools/import_products.py              # fetch from https://assaf.ae
    python3 tools/import_products.py feed.json    # use a saved products.json

It keeps perfumes and gift sets (watches, sunglasses etc. are skipped), merges
duplicate listings of the same scent into one product with several sizes,
downloads the first photo of each listing as WebP into assets/img/products/
and derives a tint colour from each photo for the card backgrounds.
Requires Pillow (pip install pillow).
"""
import html
import io
import json
import os
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from PIL import Image

STORE = 'https://assaf.ae'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG_DIR = os.path.join(ROOT, 'assets', 'img', 'products')
OUT = os.path.join(ROOT, 'assets', 'js', 'data.js')

SKIP_TAGS = {'watches', 'sunglasses', 'sunglasses-col', 'women-glasses', 'frankel-watch',
             'women-watches', 'watch-offer', 'care'}
SET_TAGS = {'offers and pkgs', 'gift box', 'bundles', 'gift'}
FAMILY_ORDER = ['Arrogate', 'Frankel', 'Enable', 'Old Era', 'Niche', 'Signature', 'Gift Sets']


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (assaf-site-importer)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read(), r.headers.get('Content-Type', '')


def load_products(path=None):
    if path:
        data = json.load(open(path))
        return data['products'] if isinstance(data, dict) else data
    out, page = [], 1
    while True:
        raw, _ = fetch(f'{STORE}/products.json?limit=250&page={page}')
        items = json.loads(raw)['products']
        if not items:
            return out
        out += items
        page += 1


def text(h):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', h or ''))).strip()


def nice_name(title):
    t = re.sub(r'\b(EDP|\d+\s*ML|25ML|200|copy|updated)\b', ' ', title, flags=re.I)
    t = re.sub(r'\s*-\s*$', '', re.sub(r'\s+', ' ', t)).strip(' -')
    if t.isupper() or t.islower():
        t = ' '.join(w if w.isupper() and len(w) <= 3 and w not in ('AND',) else w.capitalize() for w in t.split())
        t = t.replace("I'm", "I'm").replace('Ii', 'II')
    return t


def merge_key(title):
    t = re.sub(r'\b(EDP|\d+\s*ML|\d+ml|copy|updated|new)\b', ' ', title, flags=re.I)
    return re.sub(r'[^a-z0-9]+', ' ', t.lower()).strip()


def variant_label(v, title, is_set):
    t = re.sub(r'[؀-ۿ]+', '', v['title']).strip(' -')
    if t.lower() in ('default title', ''):
        m = re.search(r'(\d+)\s*ML', title, re.I)
        return f'{m.group(1)} ml' if m else ('Gift set' if is_set else 'One size')
    if t.upper() == 'PACK':
        return 'Gift set'
    t = re.sub(r'(\d+)\s*ML', r'\1 ml', t, flags=re.I)
    t = re.sub(r'\s*-\s*Best Seller', '', t, flags=re.I)
    return t.replace(' / ', ' · ').strip()


def blocks(body):
    """Split HTML into plain-text paragraphs."""
    h = re.sub(r'<(?:br|/p|/h[1-6]|/li|/div|/tr)[^>]*>', '\n', body or '', flags=re.I)
    out = []
    for line in html.unescape(re.sub(r'<[^>]+>', ' ', h)).split('\n'):
        line = re.sub(r'\s+', ' ', line).strip(' |')
        if line:
            out.append(line)
    return out


def is_arabic(s):
    letters = [c for c in s if c.isalpha()]
    return bool(letters) and sum('\u0600' <= c <= '\u06FF' for c in letters) / len(letters) > 0.4


BAD_NOTE = re.compile(r'\b(?:sure|character|sophistication|depth|elegance|breeze|sillage|warranty|fragrance|intense|wr|wrists|here|touch|scent|presence|aroma|occasions?|special oc)\b|\)', re.I)


def clean_note(n):
    n = re.sub(r'^(?:and|of|with|notes? of|blended with)\s+', '', n.strip(' .:;-'), flags=re.I)
    n = re.sub(r'\s+(?:notes?)$', '', n, flags=re.I)
    if not n or len(n.split()) > 3 or not n[0].isalpha() or is_arabic(n) or BAD_NOTE.search(n):
        return None
    return ' '.join(w if w.isupper() else w.capitalize() for w in n.split())


def parse_notes(body):
    t = ' '.join(blocks(body))
    labels = {'top': r'Top(?:\s*Notes?)?', 'heart': r'(?:Heart|Middle)(?:\s*Notes?)?', 'base': r'Base(?:\s*Notes?)?'}
    stop = r'(?=(?:Top|Heart|Middle|Base)(?:\s*Notes?)?\s*:|$)'
    res = {}
    for key, lab in labels.items():
        m = re.search(r'\b' + lab + r'\s*:\s*(.+?)' + stop, t)
        if not m:
            continue
        chunk = re.split(r'\.\s', m.group(1) + ' ')[0]  # first sentence only
        items = [clean_note(x) for x in re.split(r'\s*(?:[|,،]|\band\b)\s*', chunk)]
        res[key] = [x for x in items if x][:6]
    if not any(res.values()):
        # prose style: "The top notes ... open with X and Y, while the heart notes of A, B ..."
        for key, lab in (('top', 'top'), ('heart', 'heart|middle'), ('base', 'base')):
            m = re.search(r'(?:' + lab + r') notes?(?: of the fragrance)?(?: open with| of| are| include|:)?\s+([^.;]+)', t, re.I)
            if m:
                chunk = re.split(r',?\s*(?:while|add|adds|are|make|create|give)\b', m.group(1))[0]
                items = [clean_note(x) for x in re.split(r'\s*(?:,|\band\b)\s*', chunk)]
                res[key] = [x for x in items if x][:6]
    seen, out = set(), {}
    for k in ('top', 'heart', 'base'):
        out[k] = [x for x in res.get(k, []) if not (x.lower() in seen or seen.add(x.lower()))]
    res = out
    return res if sum(len(v) for v in res.values()) >= 3 else None


SKIP_HEAD = re.compile(r'^(?:\d|fragrance|composition|specifications|inspiration|source of|the collection|notes|olfactory|order|why|faq|frequently|exclusive|how to|conclusion|final)|longevity|warranty|guarantee|offer|\?\s*$|\||\d+\s*ml', re.I)


def tagline_and_description(body, title):
    heads = re.findall(r'<h[1-6][^>]*>(.*?)</h[1-6]>', body or '', re.S)
    tagline = ''
    for hd in heads:
        hd = text(hd)
        if not hd or is_arabic(hd) or SKIP_HEAD.search(hd) or len(hd) > 64:
            continue
        tagline = hd.split(':', 1)[1].strip() if ':' in hd else hd
        if tagline.lower().replace(' ', '') in title.lower().replace(' ', ''):
            tagline = ''
            continue
        break
    paras = [b for b in blocks(body) if len(b) > 70 and not re.match(r'(?:order|try it|اطلب)', b, re.I)
             and 'guarantee' not in b.lower() and 'ضمان' not in b and not re.search(r'\b(?:Top|Heart|Base)\s*(?:Notes?)?\s*:', b)]
    en = [b for b in paras if not is_arabic(b)]
    chosen = en or paras
    desc = ''
    for b in chosen:
        desc = (desc + ' ' + b).strip()
        if len(desc) > 260:
            break
    if len(desc) > 440:
        cut = desc[:440]
        desc = cut[:cut.rfind('.') + 1] if '.' in cut[200:] else cut.rsplit(' ', 1)[0] + '…'
    return tagline, desc, (not en and bool(paras))


def family_of(p, is_set):
    tags, title = set(p['tags']), p['title'].upper()
    if is_set:
        return 'Gift Sets'
    if 'niche' in tags:
        return 'Niche'
    if 'arrogate' in tags or 'ARROGATE' in title:
        return 'Arrogate'
    if 'frankel' in tags or 'FRANKEL' in title:
        return 'Frankel'
    if 'enable' in tags or 'ENABLE' in title:
        return 'Enable'
    if 'old era' in tags:
        return 'Old Era'
    return 'Signature'


def gender_of(tags):
    tags = set(tags)
    men = 'men' in tags or 'man' in tags
    women = 'women' in tags or 'women-perfumes' in tags or 'lady' in tags
    if 'unisex' in tags or (men and women):
        return 'Unisex'
    return 'Men' if men else 'Women' if women else 'Unisex'


def image_url(src):
    # cdn.shopify.com may be blocked in some networks; the store domain serves the same file.
    src = re.sub(r'^https://cdn\.shopify\.com/s/files/[0-9/]+/files/', f'{STORE}/cdn/shop/files/', src)
    return src + ('&' if '?' in src else '?') + 'width=800'


def save_image(handle, src):
    dest = os.path.join(IMG_DIR, handle + '.webp')
    if not os.path.exists(dest):
        raw, _ = fetch(image_url(src))
        im = Image.open(io.BytesIO(raw))
        if im.mode in ('P', 'LA'):
            im = im.convert('RGBA')
        if not (im.mode == 'RGBA' and im.getextrema()[3][0] < 250):
            im = im.convert('RGB')
        im.thumbnail((800, 800))
        im.save(dest, 'WEBP', quality=80, method=6)
    return dest


def tint_of(path):
    im = Image.open(path).convert('RGBA').resize((60, 60))
    px = [p for p in (im.get_flattened_data() if hasattr(im, "get_flattened_data") else im.getdata()) if p[3] > 200 and not (p[0] > 225 and p[1] > 225 and p[2] > 225)]
    px = [p for p in px if max(p[:3]) - min(p[:3]) > 18] or px  # prefer coloured pixels
    if not px:
        return ['#d9cbb6', '#8a7356']
    r, g, b = (sum(p[i] for p in px) // len(px) for i in range(3))
    light = tuple(min(255, int(c + (255 - c) * 0.35)) for c in (r, g, b))
    dark = tuple(int(c * 0.45) for c in (r, g, b))
    return ['#%02x%02x%02x' % light, '#%02x%02x%02x' % dark]


def main():
    os.makedirs(IMG_DIR, exist_ok=True)
    src = load_products(sys.argv[1] if len(sys.argv) > 1 else None)
    keep = [p for p in src if 'perfume' in p['tags'] and not (set(p['tags']) & SKIP_TAGS)
            and p['images'] and not p['handle'].startswith('test')]

    with ThreadPoolExecutor(8) as ex:
        paths = dict(zip([p['handle'] for p in keep],
                         ex.map(lambda p: save_image(p['handle'], p['images'][0]['src']), keep)))

    merged, order = {}, []
    for p in keep:
        is_set = bool(set(p['tags']) & SET_TAGS) or 'collection' in p['title'].lower() or 'package' in p['title'].lower()
        key = ('set:' if is_set else '') + merge_key(p['title'])
        tagline, desc, rtl = tagline_and_description(p['body_html'], p['title'])
        variants = [{
            'id': p['handle'],
            'label': variant_label(v, p['title'], is_set),
            'price': float(v['price']),
            'compare': float(v['compare_at_price']) if v.get('compare_at_price') and float(v['compare_at_price']) > float(v['price']) else None,
            'available': bool(v['available']),
            'image': 'assets/img/products/' + p['handle'] + '.webp',
        } for v in p['variants']]
        if key in merged:
            m = merged[key]
            m['variants'] += variants
            m['tags'] |= set(p['tags'])
            if not m['notes']:
                m['notes'] = parse_notes(p['body_html'])
            continue
        merged[key] = {
            'id': p['handle'], 'name': nice_name(p['title']), 'family': family_of(p, is_set),
            'tags': set(p['tags']), 'tagline': tagline, 'description': desc, 'rtl': rtl,
            'notes': parse_notes(p['body_html']), 'variants': variants,
            'liquid': tint_of(paths[p['handle']]), 'url': f"{STORE}/products/{p['handle']}",
            'created': p.get('created_at', ''),
        }
        order.append(key)

    products = []
    for key in order:
        m = merged[key]
        vs = sorted(m['variants'], key=lambda v: (not v['available'], v['price']))
        tags = m.pop('tags')
        m['variants'] = vs
        m['gender'] = gender_of(tags)
        m['price'] = vs[0]['price']
        m['compare'] = vs[0]['compare']
        m['image'] = vs[0]['image']
        m['available'] = any(v['available'] for v in vs)
        m['bestseller'] = 'best-seller' in tags
        m['badge'] = ('Sold out' if not m['available'] else 'Bestseller' if m['bestseller']
                      else 'Niche' if m['family'] == 'Niche'
                      else (f"-{round(100 - m['price'] / m['compare'] * 100)}%" if m['compare'] else ''))
        if not m['tagline'] or m['family'] == 'Gift Sets':
            m['tagline'] = {'Gift Sets': 'A curated Assaf gift set', 'Signature': 'An Assaf signature',
                            'Niche': 'From the Assaf niche collection'}.get(m['family'], 'From the ' + m['family'] + ' collection')
        seen, uniq = set(), []
        for v in m['variants']:
            if v['label'] not in seen:
                seen.add(v['label']); uniq.append(v)
        m['variants'] = uniq
        products.append(m)

    families = [f for f in FAMILY_ORDER if any(p['family'] == f for p in products)]
    js = ('/* ASSAF — product catalogue, generated by tools/import_products.py from ' + STORE + '.\n'
          '   Re-run the script to refresh; manual edits here will be overwritten. */\n'
          'window.ASSAF = window.ASSAF || {};\n'
          "ASSAF.CURRENCY = 'AED';\n"
          'ASSAF.FREE_SHIP = 275;\n'
          'ASSAF.FAMILIES = ' + json.dumps(families) + ';\n'
          'ASSAF.PRODUCTS = ' + json.dumps(products, ensure_ascii=False, indent=1) + ';\n'
          'ASSAF.getProduct = function (id) {\n'
          '  return ASSAF.PRODUCTS.find(function (p) { return p.id === id || p.variants.some(function (v) { return v.id === id; }); });\n'
          '};\n')
    open(OUT, 'w', encoding='utf8').write(js)
    used = {os.path.basename(v['image']) for p in products for v in p['variants']}
    for f in os.listdir(IMG_DIR):
        if f not in used:
            os.remove(os.path.join(IMG_DIR, f))
    print(f'{len(products)} products ({sum(len(p["variants"]) for p in products)} listings) in {len(families)} families -> {OUT}')


if __name__ == '__main__':
    main()
