# 루델리안 임시 스프라이트 (front/back/portrait) — assets/Rudelian/*.png 덮어쓰기로 교체 가능
from PIL import Image, ImageDraw
import os
W, H = 74, 124
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'assets', 'Rudelian')
HAIR, HAIR_D, HAIR_L = (122, 22, 48), (70, 10, 28), (176, 52, 78)
SKIN, SKIN_D = (246, 232, 232), (220, 196, 200)
SUIT, SUIT_L = (22, 18, 28), (52, 44, 64)
GOLD, LACE, EYE = (232, 192, 80), (240, 236, 244), (214, 24, 40)
OUTL = (26, 8, 16)

def outline(im):
    px = im.load(); o = im.copy(); po = o.load()
    for y in range(H):
        for x in range(W):
            if px[x, y][3] == 0 and any(0 <= x + dx < W and 0 <= y + dy < H and px[x + dx, y + dy][3] > 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                po[x, y] = OUTL + (255,)
    return o

def body(d, back=False):
    # 다리 (가늘고 길게) + 부츠
    for x0 in (30, 39):
        d.rectangle([x0, 92, x0 + 5, 114], fill=SUIT); d.rectangle([x0 + 1, 92, x0 + 1, 112], fill=SUIT_L)
        d.rectangle([x0 - 1, 114, x0 + 6, 119], fill=(12, 10, 16)); d.rectangle([x0, 115, x0 + 2, 115], fill=(70, 60, 80))
    # 연미복 자락
    d.polygon([(26, 84), (48, 84), (52, 100), (44, 96), (37, 99), (30, 96), (22, 100)], fill=SUIT)
    # 몸통 (잘록한 허리)
    d.polygon([(27, 60), (47, 60), (45, 74), (44, 86), (30, 86), (29, 74)], fill=SUIT)
    d.line([(37, 62), (37, 86)], fill=SUIT_L)
    if not back:
        for y in (66, 72, 78): d.rectangle([35, y, 35, y + 1], fill=GOLD); d.rectangle([39, y, 39, y + 1], fill=GOLD)
        d.polygon([(33, 60), (37, 68), (41, 60)], fill=LACE)  # 크라바트
        d.rectangle([36, 64, 38, 66], fill=EYE)                # 루비 브로치
    d.rectangle([29, 82, 45, 84], fill=(60, 14, 28))           # 허리띠
    d.rectangle([36, 82, 38, 84], fill=GOLD)
    # 팔 + 레이스 소매
    for x0, dx in ((22, 1), (47, -1)):
        d.polygon([(x0 + 3 * (dx < 0), 61), (x0 + 6 if dx > 0 else x0 + 3, 61), (x0 + 5 if dx > 0 else x0 + 4, 84), (x0 if dx > 0 else x0 + 7, 84)], fill=SUIT)
        d.rectangle([x0, 83, x0 + 6, 86], fill=LACE); d.rectangle([x0 + 1, 87, x0 + 5, 90], fill=SKIN)
    # 높은 깃
    d.polygon([(28, 52), (33, 56), (37, 60), (41, 56), (46, 52), (47, 61), (27, 61)], fill=SUIT)
    d.line([(29, 53), (29, 60)], fill=SUIT_L); d.line([(45, 53), (45, 60)], fill=SUIT_L)
    d.rectangle([34, 56, 40, 59], fill=SKIN_D if not back else SUIT)  # 목
    # 마검 (허리 왼쪽에서 비스듬히)
    d.line([(46, 80), (60, 108)], fill=(40, 6, 16), width=3); d.line([(47, 80), (60, 106)], fill=(110, 20, 36))
    d.rectangle([43, 76, 49, 78], fill=GOLD); d.line([(44, 72), (46, 77)], fill=(30, 24, 36), width=2); d.point((44, 72), fill=EYE)

def head(d, back=False):
    # 뒷머리 (길게 허리 아래까지)
    if back: d.polygon([(16, 30), (58, 30), (61, 66), (56, 88), (48, 92), (42, 86), (37, 91), (32, 86), (26, 92), (18, 88), (13, 66)], fill=HAIR)
    d.ellipse([14, 10, 60, 56], fill=HAIR)
    if back:
        for x in (22, 30, 37, 44, 52): d.line([(x, 20), (x + (x - 37) // 6, 86)], fill=HAIR_D)
        d.line([(37, 12), (37, 40)], fill=HAIR_L); d.arc([20, 12, 54, 40], 200, 340, fill=HAIR_L)
        d.rectangle([33, 44, 41, 47], fill=(20, 16, 24)); d.rectangle([36, 44, 38, 47], fill=GOLD)  # 머리 리본
        return
    d.ellipse([22, 22, 52, 56], fill=SKIN)                       # 얼굴
    d.ellipse([22, 44, 52, 56], fill=SKIN)
    # 앞머리 (단정한 가르마 + 옆머리)
    d.polygon([(18, 22), (37, 14), (56, 22), (54, 34), (46, 28), (40, 34), (37, 26), (32, 33), (26, 29), (20, 36)], fill=HAIR)
    d.line([(37, 14), (37, 26)], fill=HAIR_D)
    d.polygon([(18, 28), (24, 30), (23, 60), (19, 74), (15, 60)], fill=HAIR); d.polygon([(56, 28), (50, 30), (51, 60), (55, 74), (59, 60)], fill=HAIR)
    d.line([(20, 34), (19, 66)], fill=HAIR_L); d.line([(54, 34), (55, 66)], fill=HAIR_L); d.arc([20, 12, 54, 34], 200, 300, fill=HAIR_L)
    # 눈 (붉은, 가늘고 차분)
    for ex in (28, 41):
        d.rectangle([ex, 39, ex + 5, 39], fill=OUTL); d.rectangle([ex + 1, 40, ex + 4, 43], fill=EYE)
        d.rectangle([ex + 2, 41, ex + 3, 42], fill=(120, 0, 16)); d.point((ex + 1, 40), fill=(255, 220, 220))
    d.line([(28, 36), (33, 35)], fill=HAIR_D); d.line([(41, 35), (46, 36)], fill=HAIR_D)  # 눈썹
    d.line([(35, 50), (38, 50)], fill=(170, 60, 70))              # 입
    d.point((24, 46), fill=(240, 200, 206)); d.point((50, 46), fill=(240, 200, 206))

def make(back=False):
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if back: body(d, True); head(d, True)
    else:
        head_back = Image.new('RGBA', (W, H)); hb = ImageDraw.Draw(head_back)
        hb.polygon([(16, 30), (58, 30), (62, 70), (58, 98), (50, 104), (44, 94), (37, 100), (30, 94), (24, 104), (16, 98), (12, 70)], fill=HAIR_D)
        im.alpha_composite(head_back); body(d); head(d)
    return outline(im)

os.makedirs(OUT, exist_ok=True)
f = make(False); b = make(True)
f.save(os.path.join(OUT, 'front.png')); b.save(os.path.join(OUT, 'back.png'))
p = Image.new('RGBA', (74, 74), (0, 0, 0, 0)); p.alpha_composite(f.crop((0, 4, 74, 78))); p.save(os.path.join(OUT, 'portrait.png'))
sheet = Image.new('RGBA', (74 * 3 * 3 + 20, 124 * 3), (60, 70, 60, 255))
for i, im in enumerate([f, b, p]): sheet.paste(im.resize((im.width * 3, im.height * 3), Image.NEAREST), (i * (74 * 3 + 10), 0), im.resize((im.width * 3, im.height * 3), Image.NEAREST))
sheet.save('/tmp/rudel_sheet.png'); print('ok')
