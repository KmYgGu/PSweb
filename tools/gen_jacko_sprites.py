"""잭오랜턴 스프라이트 생성기 — 사용자 제공 원본(assets/jackO/잭오랜턴.png, 190x117: 왼쪽 앞모습 / 오른쪽 뒷모습)을 잘라 게임용으로
python3 tools/gen_jacko_sprites.py → assets/jackO/
  front.png / back.png  원본 그대로 잘라냄 (발 = 그림 맨 아래, 게임 배율 0.5 → 약 58px)
  portrait.png          얼굴 부분 (원본 해상도)
  head.png              호박 머리 변신 앞모습 2프레임 (눈·입 불빛 깜빡임) — 원본에 없는 동작이라 원본 팔레트로 새로 그린 도트
  head_back.png         호박 머리 변신 뒷모습 1프레임
  (JACKO_PREVIEW=경로 를 주면 확인용 4배 미리보기 PNG 도 저장 — 게임 폴더에는 안 만듦)
원본 파일은 수정하지 않음"""
from PIL import Image
import numpy as np, os, sys, math
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if len(sys.argv) < 2 else sys.argv[1]
DIR = os.path.join(ROOT, 'assets', 'jackO')
src = Image.open(os.path.join(DIR, '잭오랜턴.png')).convert('RGBA')
def crop_bbox(img):
    a = np.asarray(img)[..., 3] > 0; ys, xs = np.where(a)
    return img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
H = src.height
front = crop_bbox(src.crop((0, 0, 95, H)))
back = crop_bbox(src.crop((95, 0, src.width, H)))
# 같은 높이로 (발 = 맨 아래)
def pad_h(img, h):
    o = Image.new('RGBA', (img.width, h), (0, 0, 0, 0)); o.alpha_composite(img, (0, h - img.height)); return o
hh = max(front.height, back.height); front = pad_h(front, hh); back = pad_h(back, hh)
front.save(os.path.join(DIR, 'front.png')); back.save(os.path.join(DIR, 'back.png'))
print('front', front.size, 'back', back.size)
# 초상화: 얼굴(앞머리·눈·리본 일부) 정사각
fa = np.asarray(front)[..., 3] > 0
por = front.crop((16, 10, 16 + 46, 10 + 46)); por.save(os.path.join(DIR, 'portrait.png'))

# ---------- 호박 머리 (원본 팔레트) ----------
OUT = (44, 30, 29); HAIR = (57, 44, 43); HAIR2 = (80, 66, 61); HAIR0 = (62, 50, 48)
RD0 = (74, 22, 18); RD1 = (120, 34, 26); RD = (174, 53, 37); RDH = (214, 96, 74); SPEC = (239, 163, 144)
PUR = (82, 57, 82); PUR2 = (142, 87, 126)
G0 = (255, 150, 60); G1 = (255, 206, 110); G2 = (255, 244, 200)
W, Hh = 76, 70
def head(frame, backside=False):
    c = np.zeros((Hh, W, 4), np.uint8)
    def put(x, y, col):
        if 0 <= x < W and 0 <= y < Hh: c[y, x, :3] = col; c[y, x, 3] = 255
    cx, cy, rx, ry = 38, 36, 21, 17
    # 트윈테일 (양옆 높이 묶은 머리 → 바깥으로 휘었다가 아래로 늘어짐, 끝은 가늘게)
    for side in (-1, 1):
        for t in np.linspace(0, 1, 220):
            y = cy - ry + 7 + t * 36
            x = cx + side * (rx - 1 + 9 * math.sin(t * 2.6) - t * 2) + side * 1.2 * math.sin(t * 7 + frame * 1.3) * t
            w = 9 * (1 - t) ** 0.8 + 1.2
            for dx in np.arange(-w / 2, w / 2 + 0.01, 0.5):
                xx = int(round(x + dx)); yy = int(round(y)); q = dx * side
                col = HAIR2 if q < -w / 2 + 1.5 else HAIR0 if q > w / 2 - 1.2 else HAIR
                put(xx, yy, col)
    # 호박 몸통 (세로 골)
    for y in range(Hh):
        for x in range(W):
            nx, ny = (x - cx) / rx, (y - cy) / ry
            lobe = 1 + 0.07 * math.cos(nx * math.pi * 2.5)
            if nx * nx + ny * ny * lobe > 1: continue
            r2 = nx * nx + ny * ny * lobe
            light = -nx * 0.5 - ny * 0.8
            col = RD
            if light < -0.25: col = RD1
            if light < -0.75 or (r2 > 0.82 and light < 0.1): col = RD0 if light < -0.45 else RD1
            if light > 0.45 and r2 < 0.7: col = RDH
            groove = min(abs(nx - g) for g in (-0.55, 0, 0.55))
            if groove < 0.05 * (1.1 - abs(ny)) + 0.015 and abs(ny) < 0.9: col = RD0 if light < 0.2 else RD1
            c[y, x, :3] = col; c[y, x, 3] = 255
    for (x, y) in [(27, 28), (28, 28), (26, 29), (27, 29), (26, 30)]: put(x, y, SPEC)
    # 앞머리 덮개 (원본의 검은 머리 + 들쭉날쭉한 앞머리)
    for y in range(Hh):
        for x in range(W):
            nx, ny = (x - cx) / rx, (y - cy) / ry
            if nx * nx + ny * ny > 1.02 or c[y, x, 3] == 0: continue
            zig = 0.22 * abs(((x - 2) % 6) - 3) / 3
            lim = -0.58 + zig + (0.12 if abs(nx) > 0.6 else 0) + (0.55 if backside else 0)
            if ny < lim: c[y, x, :3] = HAIR2 if (ny < lim - 0.25 and nx < -0.1 and nx > -0.55) else HAIR if ny < lim - 0.08 else HAIR0
    # 머리끈 (빨강)
    for side in (-1, 1):
        tx, ty = cx + side * (rx - 1), cy - ry + 7
        for dy in range(-2, 3):
            for dx in range(-2, 3):
                if abs(dx) + abs(dy) <= 3: put(tx + dx, ty + dy, RD if dy < 1 else RD1)
    # 꼭지 (보라색 지팡이 색, 갈고리 모양)
    for i in range(8):
        x = cx + 2 + int(round(math.sin(i / 7 * 2.0) * 3)); y = cy - ry - 1 - i
        for dx in range(0, 3): put(x + dx, y, PUR if dx < 2 else PUR2)
    put(cx + 6, cy - ry - 8, PUR); put(cx + 7, cy - ry - 7, PUR)
    # 리본 (원본처럼 왼쪽 위 큰 빨간 리본 + 깃털)
    bx, by = cx - 11, cy - ry
    for dy in range(-6, 7):
        for dx in range(-10, 11):
            ad = abs(dx)
            if ad <= 2 and abs(dy) <= 2: put(bx + dx, by + dy, RD0 if ad == 2 or abs(dy) == 2 else RD1); continue
            if ad > 2 and abs(dy) <= 1 + (ad - 2) * 0.55 and ad <= 10:
                col = RDH if dy < -1 and ad < 7 else RD if dy < 2 else RD1
                if ad == 10 or abs(dy) > (ad - 2) * 0.55: col = RD0
                put(bx + dx, by + dy, col)
    for dy in (3, 4, 5, 6):  # 리본 꼬리
        put(bx - 2 - dy // 2, by + dy, RD1); put(bx + 2 + dy // 3, by + dy, RD1)
    for i in range(11):   # 깃털 (위로 솟음)
        fx, fy = bx + 4 + int(i * 0.55), by - 5 - i
        ww = 2 if 2 < i < 9 else 1
        for dx in range(-ww, ww + 1): put(fx + dx, fy, RD if dx <= 0 else RD1)
        if 3 < i < 8: put(fx - ww - 1, fy, RDH)
    if not backside:
        glow = [G0, G1, G2]
        k = frame % 2
        def fill_tri(p):
            xs = [q[0] for q in p]; ys = [q[1] for q in p]
            for y in range(min(ys), max(ys) + 1):
                for x in range(min(xs), max(xs) + 1):
                    (x1, y1), (x2, y2), (x3, y3) = p
                    d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
                    a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d; b2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d
                    if a >= -0.02 and b2 >= -0.02 and 1 - a - b2 >= -0.02: put(x, y, G1)
        fill_tri([(25, 37), (33, 37), (31, 29)]); fill_tri([(43, 37), (51, 37), (45, 29)]) # 눈 (안쪽으로 치켜뜬 삼각형)
        fill_tri([(36, 41), (40, 41), (38, 38)])                                          # 코
        for x in range(25, 52):                                                            # 톱니 입
            t = (x - 25) / 26; ymid = 45 + int(round(math.sin(t * math.pi) * 3))
            top = ymid - 2 - (1 if (x // 3) % 2 == 0 else 0); bot = ymid + 2 + (1 if (x // 3) % 2 == 1 else 0)
            if x in (25, 51): top, bot = ymid - 1, ymid
            for y in range(top, bot + 1): put(x, y, G1)
        # 불빛 그라데이션 (가운데 밝게, 프레임마다 살짝 깜빡)
        for y in range(Hh):
            for x in range(W):
                if tuple(c[y, x, :3]) == G1:
                    edge = any(not (0 <= x + a < W and 0 <= y + b < Hh) or tuple(c[y + b, x + a, :3]) != G1 for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                    if edge: c[y, x, :3] = G0 if k == 0 else G1
                    elif k == 1 and (x + y) % 3 == 0: c[y, x, :3] = G2
    # 아래 불꽃 꼬리 (떠 있는 느낌, 프레임마다 흔들림)
    k = frame % 2
    for y in range(54, 64):
        t = (y - 54) / 10; hw = 4.5 * (1 - t) ** 1.2 + 0.3; ox = (1 if k else -1) * t * 1.5
        for x in range(int(cx - hw + ox), int(cx + hw + ox) + 1): put(x, y, G2 if t < 0.35 and abs(x - cx - ox) < hw - 2 else G1 if t < 0.65 else G0)
    # 외곽선
    a = c[..., 3] > 0; o = np.zeros_like(a)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)): o |= np.roll(np.roll(a, dy, 0), dx, 1)
    o &= ~a
    c[o, :3] = OUT; c[o, 3] = 255
    return Image.fromarray(c, 'RGBA')
f0, f1, bk = head(0), head(1), head(0, True)
sheet = Image.new('RGBA', (W * 2, Hh)); sheet.alpha_composite(f0, (0, 0)); sheet.alpha_composite(f1, (W, 0)); sheet.save(os.path.join(DIR, 'head.png'))
bk.save(os.path.join(DIR, 'head_back.png'))
prev = Image.new('RGBA', (W * 3 + 8, Hh), (40, 44, 56, 255)); prev.alpha_composite(f0, (0, 0)); prev.alpha_composite(f1, (W + 4, 0)); prev.alpha_composite(bk, (W * 2 + 8, 0))
if os.environ.get('JACKO_PREVIEW'): prev.resize((prev.width * 4, prev.height * 4), Image.NEAREST).save(os.environ['JACKO_PREVIEW'])
print('head', f0.size)
