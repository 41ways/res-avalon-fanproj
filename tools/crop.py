# 2x2 시트를 잘라 webp 로 저장. 오른쪽 아래 칸의 Gemini 반짝이 표시는 주변 조각으로 덮는다.
import sys
from PIL import Image, ImageFilter, ImageDraw
raw, out = sys.argv[1], sys.argv[2]
sheets = {
    "good.png": ["guardA", "guardB", "star", "watch"],
    "evil.png": ["spyA", "assassin", "wisp", "newmoon"],
    "extra.png": ["wander", "spyB", "back", "cloud"],
}
def find_cuts(im):
    # 가운데 어두운 틈과 바깥 테두리 찾기
    g = im.convert("L")
    w, h = g.size
    def dark_col(x): return sum(g.getpixel((x, y)) for y in range(0, h, 8)) / (h / 8)
    def dark_row(y): return sum(g.getpixel((x, y)) for x in range(0, w, 8)) / (w / 8)
    return dark_col, dark_row
for name, keys in sheets.items():
    im = Image.open(f"{raw}/{name}").convert("RGB")
    w, h = im.size
    dc, dr = find_cuts(im)
    # 바깥 테두리
    l = next(x for x in range(0, w // 4) if dc(x) > 30)
    r = next(x for x in range(w - 1, w * 3 // 4, -1) if dc(x) > 30)
    t = next(y for y in range(0, h // 4) if dr(y) > 30)
    b = next(y for y in range(h - 1, h * 3 // 4, -1) if dr(y) > 30)
    # 가운데 틈
    mx = min(range(w // 2 - 40, w // 2 + 40), key=dc)
    my = min(range(h // 2 - 40, h // 2 + 40), key=dr)
    gl = next(x for x in range(mx, l, -1) if dc(x) > 30); gr = next(x for x in range(mx, r) if dc(x) > 30)
    gt = next(y for y in range(my, t, -1) if dr(y) > 30); gb = next(y for y in range(my, b) if dr(y) > 30)
    b = max(b, gb + (gt - t))
    boxes = [(l, t, gl, gt), (gr, t, r, gt), (l, gb, gl, b), (gr, gb, r, b)]
    print(name, boxes)
    for k, box in zip(keys, boxes):
        p = im.crop(box)
        if k == keys[3]:
            # 반짝이 표시: 오른쪽 아래 약 (0.73~0.86, 0.73~0.86) → 위쪽 조각으로 덮기
            pw, ph = p.size
            x0, y0, x1, y1 = int(pw * .73), int(ph * .73), int(pw * .87), int(ph * .87)
            patch = p.crop((x1 + 4, y0, x1 + 4 + (x1 - x0), y1)) if name == "good.png" else p.crop((x0 - (x1 - x0) - 6, y0, x0 - 6, y1))
            mask = Image.new("L", patch.size, 0)
            ImageDraw.Draw(mask).ellipse((4, 4, patch.size[0] - 4, patch.size[1] - 4), fill=255)
            mask = mask.filter(ImageFilter.GaussianBlur(8))
            p.paste(patch, (x0, y0), mask)
        p = p.resize((480, 480), Image.LANCZOS)
        p.save(f"{out}/{k}.webp", quality=82)
