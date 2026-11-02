"""Builds every Sureshot brand asset from the client's logo
(assets/brand/sureshot-logo-original.jpeg): header logo, icons, favicon, PWA
icons and the Android launcher icons + splash (if web/android exists).
Run: python scripts/make-brand.py"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'brand', 'sureshot-logo-original.jpeg')
BG = (243, 247, 250)  # the source's light-grey backdrop

# Element boxes in the source image (left, top, right, bottom), padded.
MARK = (538, 158, 858, 427)
WORD = (430, 424, 978, 504)
SUB = (514, 504, 896, 561)
TAG = (486, 562, 921, 598)


def cutout(box):
    """Crop a box and turn the light backdrop transparent with soft edges."""
    im = Image.open(SRC).convert('RGB').crop(box)
    out = Image.new('RGBA', im.size)
    src, dst = im.load(), out.load()
    for y in range(im.height):
        for x in range(im.width):
            p = src[x, y]
            diff = max(abs(p[i] - BG[i]) for i in range(3))
            a = max(0.0, min(1.0, (diff - 14) / 70))
            if a == 0:
                dst[x, y] = (0, 0, 0, 0)
                continue
            # un-blend from the backdrop so edges don't keep a grey halo
            c = tuple(max(0, min(255, round((p[i] - (1 - a) * BG[i]) / a))) for i in range(3))
            dst[x, y] = (*c, round(a * 255))
    return out.crop(out.getbbox())


def fit(im, w=None, h=None):
    if w and not h: h = round(im.height * w / im.width)
    if h and not w: w = round(im.width * h / im.height)
    return im.resize((w, h), Image.LANCZOS)


def horizontal_logo(mark, word, sub):
    """Mark on the left, SURESHOT / DELIVERY stacked on the right (for headers)."""
    H = 300
    m = fit(mark, h=H)
    wd = fit(word, h=round(H * 0.34))
    sb = fit(sub, h=round(H * 0.24))
    gap = round(H * 0.08)
    width = m.width + gap + max(wd.width, sb.width)
    im = Image.new('RGBA', (width, H), (0, 0, 0, 0))
    im.alpha_composite(m, (0, 0))
    top = (H - (wd.height + round(H * 0.07) + sb.height)) // 2
    im.alpha_composite(wd, (m.width + gap, top))
    im.alpha_composite(sb, (m.width + gap, top + wd.height + round(H * 0.07)))
    return im


def stacked_logo(mark, word, sub, tag):
    parts = [fit(mark, h=260), fit(word, h=90), fit(sub, h=60), fit(tag, h=36)]
    gaps = [18, 14, 18]
    W = max(p.width for p in parts)
    H = sum(p.height for p in parts) + sum(gaps)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    y = 0
    for i, p in enumerate(parts):
        im.alpha_composite(p, ((W - p.width) // 2, y))
        y += p.height + (gaps[i] if i < len(gaps) else 0)
    return im


def icon(mark, size, shape='circle', scale=0.78):
    """The mark centred on a white disc / white square / transparent field."""
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    if shape == 'circle':
        disc = Image.new('L', (size * 4, size * 4), 0)
        ImageDraw.Draw(disc).ellipse([0, 0, size * 4 - 1, size * 4 - 1], fill=255)
        im.paste((255, 255, 255, 255), (0, 0), disc.resize((size, size), Image.LANCZOS))
    elif shape == 'square':
        im.paste((255, 255, 255, 255), (0, 0, size, size))
    inner = round(size * scale)
    m = fit(mark, w=inner) if mark.width >= mark.height else fit(mark, h=inner)
    im.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return im


def on_dark(im, text_from):
    """Variant for dark backgrounds: the navy wordmark (x >= text_from) becomes white."""
    out = im.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(text_from, out.width):
            r, g, b, a = px[x, y]
            if a and r < 60 and g < 90 and b < 150 and b > r:  # navy text pixels
                px[x, y] = (255, 255, 255, a)
    return out


def splash(stack, w, h):
    im = Image.new('RGBA', (w, h), (255, 255, 255, 255))
    s = fit(stack, w=round(min(w, h) * 0.62))
    im.alpha_composite(s, ((w - s.width) // 2, (h - s.height) // 2))
    return im.convert('RGB')


def main():
    mark, word, sub, tag = cutout(MARK), cutout(WORD), cutout(SUB), cutout(TAG)
    pub = os.path.join(ROOT, 'web', 'public')
    os.makedirs(os.path.join(pub, 'brand'), exist_ok=True)
    os.makedirs(os.path.join(pub, 'icons'), exist_ok=True)
    logo = horizontal_logo(mark, word, sub)
    logo.save(os.path.join(pub, 'brand', 'logo.png'))
    on_dark(logo, fit(mark, h=logo.height).width).save(os.path.join(pub, 'brand', 'logo-white.png'))
    stack = stacked_logo(mark, word, sub, tag)
    stack.save(os.path.join(pub, 'brand', 'logo-stacked.png'))
    mark.save(os.path.join(ROOT, 'assets', 'brand', 'sureshot-mark.png'))
    icon(mark, 256, 'none', 1.0).save(os.path.join(pub, 'brand', 'icon.png'))
    icon(mark, 64, 'circle', 0.86).save(os.path.join(pub, 'favicon.png'))
    icon(mark, 192).save(os.path.join(pub, 'icons', 'icon-192.png'))
    icon(mark, 512).save(os.path.join(pub, 'icons', 'icon-512.png'))
    icon(mark, 512, 'square', 0.62).save(os.path.join(pub, 'icons', 'maskable-512.png'))
    icon(mark, 1024, 'square', 0.7).convert('RGB').save(os.path.join(ROOT, 'assets', 'brand', 'sureshot-icon-1024.png'))
    count = 0

    # Capacitor Android shell (web/android), if generated.
    res = os.path.join(ROOT, 'web', 'android', 'app', 'src', 'main', 'res')
    if os.path.isdir(res):
        for d in os.listdir(res):
            folder = os.path.join(res, d)
            for f in os.listdir(folder):
                path = os.path.join(folder, f)
                if f in ('ic_launcher.png', 'ic_launcher_round.png'):
                    icon(mark, Image.open(path).size[0]).save(path); count += 1
                elif f == 'ic_launcher_foreground.png':
                    icon(mark, Image.open(path).size[0], 'none', 0.56).save(path); count += 1
                elif f == 'splash.png':
                    splash(stack, *Image.open(path).size).save(path); count += 1
        bg = os.path.join(res, 'values', 'ic_launcher_background.xml')
        if os.path.exists(bg):
            with open(bg, 'w', encoding='utf-8') as fh:
                fh.write('<?xml version="1.0" encoding="utf-8"?>\n<resources>\n'
                         '    <color name="ic_launcher_background">#FFFFFF</color>\n</resources>\n')
    print(f'brand assets written ({count} Android assets)')


if __name__ == '__main__':
    main()
