"""잭오랜턴 스프라이트 생성기 — 사용자 제공 원본(assets/jackO/잭오랜턴.png, 190x117: 왼쪽 앞모습 / 오른쪽 뒷모습)을 잘라 게임용으로
python3 tools/gen_jacko_sprites.py → assets/jackO/
  front.png / back.png  원본 그대로 잘라냄 (발 = 그림 맨 아래, 게임 배율 0.5 → 약 58px)
  portrait.png          얼굴 부분 (원본 해상도)
  head.png              호박 머리 변신 앞모습 2프레임 (눈·입 불빛 깜빡임) — 원본에 없는 동작이라 새로 그린 평범한 잭오랜턴 호박 도트
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

# ---------- 호박 머리 (평범한 잭오랜턴 호박: 주황 호박 + 짧은 꼭지 + 삼각 눈·코 + 톱니 웃는 입, 머리카락·리본 없음) ----------
OUT = (52, 24, 10)
OR0 = (112, 44, 12); OR1 = (176, 72, 18); OR = (226, 114, 28); ORH = (248, 156, 56); SPEC = (255, 214, 150)
ST0 = (58, 66, 24); ST = (96, 116, 40); ST2 = (142, 162, 62)
IN0 = (150, 54, 10)                                   # 파낸 안쪽 벽 (불빛 가장자리)
G0 = (255, 150, 60); G1 = (255, 206, 110); G2 = (255, 244, 200)
W, Hh = 76, 70
def head(frame, backside=False):
    c = np.zeros((Hh, W, 4), np.uint8)
    def put(x, y, col):
        if 0 <= x < W and 0 <= y < Hh: c[y, x, :3] = col; c[y, x, 3] = 255
    cx, cy, rx, ry = 38, 39, 25, 19                   # 가로로 조금 넓은 호박 (예전 불꽃 꼬리 자리까지 내려와 프레임 안에서 무게중심 유지)
    # 호박 몸통 — 세로 골(경선)이 구면을 따라 휘어짐, 꼭지 자리 위쪽이 살짝 오목
    for y in range(Hh):
        for x in range(W):
            nx, ny = (x - cx) / rx, (y - cy) / ry
            top_dent = 0.10 * math.exp(-(nx * 3.2) ** 2) if ny < 0 else 0
            ny2 = ny + (top_dent if ny < 0 else 0)
            lobe = 1 + 0.06 * math.cos(nx * math.pi * 3)
            r2 = nx * nx + ny2 * ny2 * lobe
            if r2 > 1: continue
            m = nx / max(0.18, math.sqrt(max(0.0, 1 - ny * ny)))   # 경선 좌표 (-1..1)
            gs = (-1.0, -0.68, -0.25, 0.25, 0.68, 1.0)
            j = max(i for i in range(5) if gs[i] <= max(-1.0, min(0.999, m)))
            rib = 1 - abs((m - (gs[j] + gs[j + 1]) / 2) / ((gs[j + 1] - gs[j]) / 2))   # 골 사이 볼록함 (0..1)
            light = -m * 0.45 - ny * 0.7 + (rib - 0.5) * 0.5
            col = OR
            if light < -0.2: col = OR1
            if light < -0.8 or r2 > 0.86: col = OR1 if light > -0.3 else OR0
            if light > 0.4 and r2 < 0.72: col = ORH
            groove = min(abs(m - g) for g in (-0.68, -0.25, 0.25, 0.68))
            if groove < 0.06 and abs(ny) < 0.93: col = OR0 if light < 0.1 else OR1
            elif groove < 0.12 and abs(ny) < 0.93 and col == ORH: col = OR
            c[y, x, :3] = col; c[y, x, 3] = 255
    for (x, y) in [(24, 29), (25, 29), (23, 30), (24, 30), (23, 31)]:   # 반사광
        if c[y, x, 3]: put(x, y, SPEC)
    # 짧은 꼭지 (갈색빛 초록, 살짝 기울어짐)
    sy = cy - ry + 2
    for i in range(8):
        x0 = cx - 2 + (1 if i > 4 else 0); y = sy - i
        for dx in range(4 if i < 6 else 3):
            put(x0 + dx, y, ST2 if dx == 0 else ST if dx < 3 else ST0)
    put(cx + 2, sy - 8, ST); put(cx + 3, sy - 8, ST0)
    if not backside:
        k = frame % 2
        def fill_tri(p):
            xs = [q[0] for q in p]; ys = [q[1] for q in p]
            (x1, y1), (x2, y2), (x3, y3) = p
            d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
            for y in range(min(ys), max(ys) + 1):
                for x in range(min(xs), max(xs) + 1):
                    a = ((y2 - y3) * (x - x3) + (x3 - x2) * (y - y3)) / d; b2 = ((y3 - y1) * (x - x3) + (x1 - x3) * (y - y3)) / d
                    if a >= -0.02 and b2 >= -0.02 and 1 - a - b2 >= -0.02: put(x, y, G1)
        fill_tri([(23, 39), (33, 39), (28, 30)]); fill_tri([(43, 39), (53, 39), (48, 30)])   # 눈 (위로 뾰족한 삼각형)
        fill_tri([(35, 44), (41, 44), (38, 40)])                                             # 코
        # 웃는 톱니 입: 양 끝이 올라간 초승달 + 위아래 이빨 홈
        for x in range(22, 55):
            t = (x - 38) / 16.0
            top = int(round(45 + 4 * (1 - t * t))) - (2 if abs(t) > 0.85 else 0)
            bot = int(round(48 + 5 * (1 - t * t)))
            if abs(t) > 0.92: bot = top + 1
            for y in range(top, bot + 1): put(x, y, G1)
        for tx in (31, 45):                     # 윗니 (호박 살이 남은 사각 이빨)
            for y in range(46, 50):
                for x in range(tx - 1, tx + 2): put(x, y, OR)
        for x in range(37, 40):                 # 아랫니
            for y in range(50, 54): 
                if c[y, x, 3] and tuple(c[y, x, :3]) == G1: put(x, y, OR)
        # 불빛: 가장자리는 파낸 벽(어두운 주황), 안쪽은 밝게 — 프레임마다 살짝 깜빡
        g = [[tuple(c[y, x, :3]) == G1 for x in range(W)] for y in range(Hh)]
        for y in range(Hh):
            for x in range(W):
                if not g[y][x]: continue
                up = y > 0 and not g[y - 1][x]
                edge = any(not (0 <= x + a < W and 0 <= y + b < Hh) or not g[y + b][x + a] for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)))
                if up: c[y, x, :3] = IN0                       # 위쪽 가장자리 = 칼로 판 두께
                elif edge: c[y, x, :3] = G0 if k == 0 else G1
                elif k == 1 and (x + y) % 3 == 0: c[y, x, :3] = G2
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
