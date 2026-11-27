# art/raw 의 제미나이 원본을 게임용 그림(art/*.webp)으로 만든다.
#  - 오른쪽 아래 제미나이 반짝이 표시를 덮고
#  - 그림 안에 카드 테두리(안쪽 판)가 그려져 있으면 판 안쪽만 잘라 내고
#  - 남색 바탕의 소품(방패·인장·왕관)은 바탕을 투명하게 뺀다
# 사용: python3 tools/build_art.py
import os
from PIL import Image, ImageDraw, ImageFilter, ImageChops, ImageOps
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, OUT = os.path.join(ROOT, "art/raw"), os.path.join(ROOT, "art")

def clean(im):
    im = im.convert("RGB"); w, h = im.size
    cx, cy, r = w - 120, h - 120, 36
    best = None
    for dx, dy in [(-2.4, 0), (0, -2.4), (-2.4, -2.4), (2.2, 0), (0, 2.2), (-4, 0), (0, -4)]:
        sx, sy = round(cx + dx * r), round(cy + dy * r)
        if sx - r < 0 or sy - r < 0 or sx + r > w or sy + r > h: continue
        p = im.crop((sx - r, sy - r, sx + r, sy + r))
        ring = [im.getpixel((x, y)) for x, y in [(cx - r, cy), (cx + r - 1, cy), (cx, cy - r), (cx, cy + r - 1)]]
        pr = [p.getpixel((x, y)) for x, y in [(0, r), (2 * r - 1, r), (r, 0), (r, 2 * r - 1)]]
        d = sum(abs(a - b) for u, v in zip(ring, pr) for a, b in zip(u, v))
        if best is None or d < best[0]: best = (d, p)
    m = Image.new("L", (2 * r, 2 * r), 0)
    ImageDraw.Draw(m).ellipse((r * .12, r * .12, r * 1.88, r * 1.88), fill=255)
    im.paste(best[1], (cx - r, cy - r), m.filter(ImageFilter.GaussianBlur(r * .16)))
    return im

def diff(a, b): return sum(abs(x - y) for x, y in zip(a, b))

def panel(im):
    """그림 안에 따로 그린 판이 있으면 그 상자를 돌려준다"""
    w, h = im.size; my, mx = h // 2, w // 2
    def scan(pts):
        base = im.getpixel(pts[0])
        for i, p in enumerate(pts):
            if diff(im.getpixel(p), base) > 45: return i
        return None
    lim = int(w * .3)
    l = scan([(x, my) for x in range(2, lim)]); r = scan([(x, my) for x in range(w - 3, w - lim, -1)])
    t = scan([(mx, y) for y in range(2, int(h * .3))])
    if l is None or r is None or t is None or not (40 < l < lim and 40 < r < lim and 40 < t): return None
    l += 2; r = w - 3 - r; t += 2
    side = min(r - l, h - t)
    return (l, t, l + side, t + side)

def card(name, size=640, inset=.055):
    im = clean(Image.open(os.path.join(RAW, "cards", name + ".png")))
    box = panel(im)
    if box:
        l, t, r, b = box; d = (r - l) * inset
        im = im.crop((round(l + d), round(t + d), round(r - d), round(b - d)))
    else:
        w, h = im.size; s = min(w, h); im = im.crop(((w - s) // 2, (h - s) // 2, (w + s) // 2, (h + s) // 2))
    im = im.resize((size, size), Image.LANCZOS)
    im.save(os.path.join(OUT, name + ".webp"), quality=84)
    print(name, "판 잘라 냄" if box else "그대로", im.size)

def key_out(im, bg=None, soft=(28, 70)):
    """평평한 바탕색을 투명으로"""
    im = im.convert("RGB")
    if bg is None:
        w0, h0 = im.size
        edge = [im.getpixel((x, y)) for x in range(0, w0, 7) for y in (2, h0 - 3)] + [im.getpixel((x, y)) for y in range(0, h0, 7) for x in (2, w0 - 3)]
        bg = tuple(sorted(c[i] for c in edge)[len(edge) // 2] for i in range(3))
    px = im.load(); w, h = im.size
    a = Image.new("L", (w, h)); ap = a.load()
    lo, hi = soft
    for y in range(h):
        for x in range(w):
            d = diff(px[x, y], bg)
            ap[x, y] = 0 if d < lo else 255 if d > hi else int((d - lo) / (hi - lo) * 255)
    out = im.convert("RGBA"); out.putalpha(a.filter(ImageFilter.GaussianBlur(.6)))
    return out

def trim(im, pad=6):
    bb = im.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    l, t, r, b = bb
    return im.crop((max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad)))

for k in ["guardA", "guardB", "guardC", "star", "watch", "spyA", "spyB", "assassin", "wisp", "newmoon", "wander", "lady", "back"]:
    card(k)

# 원정 카드(5:7)
for k in ["q_ok", "q_fail"]:
    im = clean(Image.open(os.path.join(RAW, "cards", k + ".png"))); w, h = im.size
    tw = round(h * 5 / 7); im = im.crop(((w - tw) // 2, 0, (w + tw) // 2, h)).resize((500, 700), Image.LANCZOS)
    im.save(os.path.join(OUT, k + ".webp"), quality=84); print(k, im.size)

# 인장 둘, 방패 셋, 왕관: 바탕 빼고 잘라 내기
im = clean(Image.open(os.path.join(RAW, "cards/votes.png"))); w, h = im.size
for k, cx in [("seal_yes", .29), ("seal_no", .71)]:
    s = w * .2; c = im.crop((round(w * cx - s), round(h * .5 - s), round(w * cx + s), round(h * .5 + s)))
    c = trim(key_out(c, soft=(40, 110))).resize((280, 280), Image.LANCZOS); c.save(os.path.join(OUT, k + ".webp"), quality=88); print(k)
im = clean(Image.open(os.path.join(RAW, "cards/shields.png"))); w, h = im.size
for k, cx in [("sh_empty", .2), ("sh_ok", .5), ("sh_fail", .8)]:
    s = w * .14; c = im.crop((round(w * cx - s), round(h * .5 - s * 1.5), round(w * cx + s), round(h * .5 + s * 1.5)))
    c = trim(key_out(c)); c.thumbnail((260, 300), Image.LANCZOS); c.save(os.path.join(OUT, k + ".webp"), quality=88); print(k, c.size)
c = trim(key_out(clean(Image.open(os.path.join(RAW, "cards/crown.png"))))); c.thumbnail((160, 160), Image.LANCZOS)
c.save(os.path.join(OUT, "crown.webp"), quality=90); print("crown", c.size)

# 장면
for k in ["bg", "win", "lose"]:
    im = clean(Image.open(os.path.join(RAW, "scenes", k + ".png")))
    im.save(os.path.join(OUT, k + ".webp"), quality=80); print(k, im.size)

# 판 화면용 (2026-11-27 둘째 손질): 탁자·원정대 표식·출정·성공·실패 장면
def disc(name, out, size, shrink=.0):
    """남색 바탕 위 동그란 물건: 가장 큰 원을 찾아 동그랗게 오려 낸다"""
    im = clean(Image.open(os.path.join(RAW, "stage", name + ".png")))
    a = key_out(im).getchannel("A").point(lambda v: 255 if v > 128 else 0)
    l, t, r, b = a.getbbox(); cx, cy = (l + r) / 2, (t + b) / 2; rad = min(r - l, b - t) / 2 * (1 - shrink)
    big = 4; m = Image.new("L", (im.width * big, im.height * big), 0)
    ImageDraw.Draw(m).ellipse(((cx - rad) * big, (cy - rad) * big, (cx + rad) * big, (cy + rad) * big), fill=255)
    m = m.resize(im.size, Image.LANCZOS)
    o = im.convert("RGBA"); o.putalpha(m)
    o = o.crop((round(cx - rad), round(cy - rad), round(cx + rad), round(cy + rad))).resize((size, size), Image.LANCZOS)
    o.save(os.path.join(OUT, out + ".webp"), quality=86); print(out, o.size)
disc("table", "table", 900, .004)
disc("token", "token", 160, .01)
for k in ["depart", "ret_ok", "ret_fail"]:
    im = clean(Image.open(os.path.join(RAW, "stage", k + ".png")))
    im.save(os.path.join(OUT, k + ".webp"), quality=78); print(k, im.size)
