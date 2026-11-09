"""아오오니(귀여운 버전) 도트 스프라이트 생성기 — 직접 그린 절차적 픽셀 (원작처럼 무섭지 않게: 큰 둥근 머리, 동그란 눈, 볼터치, 작은 입)
python3 tools/gen_aooni_sprites.py → assets/aooni/
  front.png (2프레임 걷기, 24x28 한 칸) / back.png / portrait.png
  slam.png (지면 내리치기: 두 팔 번쩍) / run.png + run_back.png (추적: 앞으로 기울어 달림, 2프레임) / hurt.png (피격: >_<)
게임 배율 2.5 (내부 2배 캔버스에서 정수 배율)"""
from PIL import Image, ImageDraw
import os
FW, FH = 24, 28
PAL = {'o': (28, 34, 78), 'B': (104, 140, 238), 'b': (72, 100, 196), 'l': (164, 194, 255), 'W': (255, 255, 255), 'K': (24, 24, 44),
       'P': (255, 150, 190), 'M': (96, 30, 60), 'T': (255, 120, 156), 'H': (52, 66, 160), 'h': (82, 100, 200), 'w': (214, 232, 255), 'S': (150, 210, 255)}

def blank(): return [['.'] * FW for _ in range(FH)]
def ell(g, cx, cy, rx, ry, k):
    for y in range(FH):
        for x in range(FW):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1: g[y][x] = k
def rect(g, x0, y0, w, h, k):
    for y in range(y0, y0 + h):
        for x in range(x0, x0 + w):
            if 0 <= x < FW and 0 <= y < FH: g[y][x] = k
def put(g, pts, k):
    for x, y in pts:
        if 0 <= x < FW and 0 <= y < FH: g[y][x] = k

def shade(g):  # 오른쪽 아래 가장자리 어둡게, 왼쪽 위 밝게 (몸 색 B 만)
    out = [r[:] for r in g]
    for y in range(FH):
        for x in range(FW):
            if g[y][x] != 'B': continue
            r = x + 1 >= FW or g[y][x + 1] == '.'; d = y + 1 >= FH or g[y + 1][x] == '.'
            if r or d: out[y][x] = 'b'
    return out
def outline(g):
    out = [r[:] for r in g]
    for y in range(FH):
        for x in range(FW):
            if g[y][x] != '.': continue
            if any(0 <= x + dx < FW and 0 <= y + dy < FH and g[y + dy][x + dx] not in '.o' for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): out[y][x] = 'o'
    return out

def body(g, lean=0, legs=0, arms='down'):
    hx = 12 + lean
    # 다리 (짧고 통통)
    l1, l2 = (0, 0) if legs == 0 else ((-1, 0) if legs == 1 else (0, -1))
    rect(g, 8 + lean // 2, 23 + l1, 3, 3, 'B'); rect(g, 13 + lean // 2, 23 + l2, 3, 3, 'B')
    # 몸통
    ell(g, 12 + lean * 0.5, 20, 5.6, 4.6, 'B')
    # 팔
    if arms == 'down':
        sw = 0 if legs == 0 else (1 if legs == 1 else -1)
        ell(g, 5.6 + lean * 0.5, 20.2 + sw * 0.6, 2.0, 3.0, 'B'); ell(g, 18.4 + lean * 0.5, 20.2 - sw * 0.6, 2.0, 3.0, 'B')
    elif arms == 'slam':  # 두 주먹으로 땅을 쾅 (팔을 양옆 아래로 뻗음)
        for sx in (-1, 1):
            for t in range(5): ell(g, 12 + sx * (6.0 + t * 0.7), 19.0 + t * 1.1, 2.3, 2.3, 'B')
            ell(g, 12 + sx * 9.4, 25.0, 2.8, 2.3, 'B')
    elif arms == 'fwd':  # 추적: 두 팔을 앞으로 쭉
        for y0 in (17.6, 20.8):
            for t in range(6): ell(g, 16.5 + lean + t, y0, 1.6, 1.4, 'B')
            ell(g, 22.2 + lean * 0.3, y0, 1.7, 1.7, 'B')
    # 머리 (크고 둥글게)
    ell(g, hx, 9.2, 9.6, 8.6, 'B')
    # 머리 위 작은 혹 세 개 (원작의 울퉁불퉁한 머리 → 귀엽게)
    for cx, cy, r in ((hx - 4, 1.4, 1.6), (hx, 0.9, 1.7), (hx + 4, 1.4, 1.6)): ell(g, cx, cy, r, r, 'H')
    return hx

def face(g, hx, kind='normal', look=0):
    lx, rx, ey = hx - 4, hx + 4, 10
    if kind in ('normal', 'run'):
        for cx in (lx, rx):
            ell(g, cx + 0.5, ey + 0.5, 2.3, 2.9, 'W')
            px = cx - 1 + (1 if look > 0 else 0)
            rect(g, px, ey - 1, 2, 3, 'K'); put(g, [(px, ey - 1)], 'W')  # 반짝이
    elif kind == 'shut':  # > <
        put(g, [(lx - 2, ey - 1), (lx - 1, ey), (lx, ey + 1), (lx - 1, ey + 2), (lx - 2, ey + 3)], 'K')
        put(g, [(rx + 2, ey - 1), (rx + 1, ey), (rx, ey + 1), (rx + 1, ey + 2), (rx + 2, ey + 3)], 'K')
    put(g, [(lx - 3, ey + 3), (lx - 2, ey + 3), (rx + 2, ey + 3), (rx + 3, ey + 3)], 'P')  # 볼터치
    my = ey + 4
    if kind == 'normal': put(g, [(hx - 1, my), (hx + 1, my), (hx, my + 1)], 'M')                 # ω 작은 입
    elif kind == 'run': rect(g, hx - 1, my, 3, 2, 'M'); put(g, [(hx, my + 1)], 'T')              # 신나서 벌린 입
    elif kind == 'shut': rect(g, hx - 1, my, 2, 2, 'M'); put(g, [(hx, my + 1)], 'T')            # 영차!
    # 머리 하이라이트
    put(g, [(hx - 6, 4), (hx - 7, 5), (hx - 7, 6), (hx - 5, 3)], 'l')

def back_details(g, hx):
    put(g, [(hx - 6, 4), (hx - 7, 5), (hx - 5, 3)], 'l')
    for y in range(12, 17):
        if g[y][hx] == 'B': g[y][hx] = 'b'  # 뒤통수 가르마 그림자

def finish(g):
    g = shade(g)
    return outline(g)

def img(g):
    c = Image.new('RGBA', (FW, FH), (0, 0, 0, 0))
    for y in range(FH):
        for x in range(FW):
            k = g[y][x]
            if k != '.': c.putpixel((x, y), PAL[k] + (255,))
    return c
def sheet(frames):
    s = Image.new('RGBA', (FW * len(frames), FH), (0, 0, 0, 0))
    for i, f in enumerate(frames): s.alpha_composite(img(f), (i * FW, 0))
    return s

def front(legs, look=1):
    g = blank(); hx = body(g, 0, legs, 'down'); face(g, hx, 'normal', look); return finish(g)
def back(legs):
    g = blank(); hx = body(g, 0, legs, 'down'); back_details(g, hx); return finish(g)
def slam():
    g = blank(); hx = body(g, 0, 0, 'slam'); face(g, hx, 'shut'); return finish(g)
def run(legs):
    g = blank(); hx = body(g, 1, legs, 'fwd'); face(g, hx, 'run', 1); return finish(g)
def run_back(legs):
    g = blank(); hx = body(g, 1, legs, 'fwd'); back_details(g, hx); return finish(g)
def hurt():
    g = blank(); hx = body(g, 0, 0, 'down'); face(g, hx, 'shut')
    put(g, [(hx + 8, 4), (hx + 8, 5), (hx + 7, 5)], 'S')  # 땀방울
    return finish(g)

d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'aooni'); os.makedirs(d, exist_ok=True)
F = sheet([front(0), front(1)]); F.save(os.path.join(d, 'front.png'))
sheet([back(0)]).save(os.path.join(d, 'back.png'))
sheet([slam()]).save(os.path.join(d, 'slam.png'))
sheet([run(1), run(2)]).save(os.path.join(d, 'run.png'))
sheet([run_back(1)]).save(os.path.join(d, 'run_back.png'))
sheet([hurt()]).save(os.path.join(d, 'hurt.png'))
p = Image.new('RGBA', (48, 48)); dr = ImageDraw.Draw(p)
for y in range(48): t = y / 47; dr.line([(0, y), (47, y)], fill=(int(40 + 20 * t), int(52 + 16 * t), int(110 - 20 * t), 255))
p.alpha_composite(img(front(0)).crop((1, 0, 23, 19)).resize((44, 38), Image.NEAREST), (2, 8)); p.save(os.path.join(d, 'portrait.png'))
print('ok', d)
