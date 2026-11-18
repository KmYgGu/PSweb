"""도마뱀 삼촌 스프라이트: 24x30 픽셀 (외곽선 포함 26x32, 게임에서 x2). 사용자 제공 그림 기준으로 새로 그린 도트.
 - 뒤에 뾰족뾰족한 불꽃(빨강·주황·노랑), 위가 넓은 주황색 긴 머리, 이마의 흰 숫자 '3', 화난 눈·검은 눈썹, 검은 콧수염,
   큰 빨간 입, 입 오른쪽과 왼쪽 어깨의 담배, 흰 물방울무늬 파란 넥타이, 가는 주황 몸통, 허리에 손, 벌린 다리
python3 tools/gen_lizard_sprites.py → assets/lizard/front.png, back.png, portrait.png"""
from PIL import Image, ImageDraw
import math, os

PAL = {'O': (232, 134, 42), 'o': (184, 90, 24), 'p': (246, 170, 80), 'W': (250, 250, 246), 'E': (26, 20, 18), 'K': (40, 26, 16),
       'R': (200, 42, 26), 'r': (130, 24, 16), 'B': (42, 90, 216), 'b': (28, 60, 160), 'C': (244, 244, 238), 'c': (232, 58, 26), 'g': (150, 150, 150)}
FLAME = [(232, 64, 26), (255, 154, 26), (255, 224, 96)]  # 바깥 → 안쪽

# 머리: 10칸 너비, x 7~16 / 몸통·다리: 24칸 그대로
HEAD_FRONT = [  # y 2~14
    '.OOOOOOOO.', 'OpOOOOOOOO', 'OOOWWWOOOO', 'OOOOOWOOOO', 'OOOOWWOOOO', 'OOOOOWOOOO', 'OOOWWWOOOO',
    'OEEEOOEEEO', 'OWWEOOEWWO', 'OKKKOOKKKO', 'oRRRRRRRRo', 'oRrrrrrrRo', '.oRRRRRRo.']
HEAD_BACK = [
    '.OOOOOOOO.', 'OOOOOOOOOO', 'OOOOOOOOOo', 'OOOOOOOOOo', 'OOOOOOOOOo', 'OOOOOOOOOo', 'OOOOOOOOOo',
    'OOOOOOOOOo', 'OOOOOOOOOo', 'oOOOOOOOOo', 'oOOOOOOOOo', 'ooOOOOOOoo', '.oooooooo.']
BODY_FRONT = [  # y 15~29
    '........ooOBBOoo........', '.......OOOOBBOOOO.......', '......OO.OBWBBO.OO......', '.....OO..OBBWBO..OO.....', '.....O...OBWBBO...O.....',
    '......O..OBBBWO..O......', '.......OOOBBBBOOO.......', '.........OOBBOO.........', '........OO.BB.OO........', '.......OO......OO.......',
    '......OO........OO......', '.....OO..........OO.....', '.....O............O.....', '.....O............O.....', '....OO............OO....']
BODY_BACK = [
    '........ooOOOOoo........', '.......OOOOOOOOOO.......', '......OO.OOOOOO.OO......', '.....OO..OOooOO..OO.....', '.....O...OOOOOO...O.....',
    '......O..OOOOOO..O......', '.......OOOOOOOOOO.......', '.........OOOOOO.........', '........OO.oo.OO........', '.......OO......OO.......',
    '......OO........OO......', '.....OO..........OO.....', '.....O............O.....', '.....O............O.....', '....OO............OO....']
EXTRA_FRONT = [(17, 12, 'C'), (18, 12, 'C'), (19, 12, 'C'), (20, 12, 'c'), (20, 11, 'g'),  # 입 오른쪽 담배 (+연기 한 점)
               (5, 15, 'C'), (6, 15, 'C'), (7, 15, 'C'), (4, 15, 'c')]  # 왼쪽 어깨 담배

def flames(img):
    d = ImageDraw.Draw(img); cx, cy, n = 11.5, 7.5, 15
    for layer, (ro, ri) in enumerate([(12.5, 7.0), (10.0, 6.0), (7.0, 4.5)]):
        pts = []
        for i in range(n * 2):
            a = -math.pi / 2 + i * math.pi / n + 0.12 * layer
            r = ro if i % 2 == 0 else ri
            pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r * 0.95))
        d.polygon(pts, fill=FLAME[layer] + (255,))

def render(head, body, extra, flame=True):
    c = Image.new('RGBA', (24, 30), (0, 0, 0, 0))
    if flame: flames(c)
    for j, r in enumerate(head):  # 머리 진한 테두리 (불꽃과 구분)
        for i, k in enumerate(r):
            if k == '.': continue
            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                x, y = 7 + i + dx, 2 + j + dy
                if 0 <= x < 24 and 0 <= y < 30 and not (0 <= i + dx < 10 and 0 <= j + dy < len(head) and head[j + dy][i + dx] != '.'): c.putpixel((x, y), (70, 30, 14, 255))
    for j, r in enumerate(head):
        for i, k in enumerate(r):
            if k != '.': c.putpixel((7 + i, 2 + j), PAL[k] + (255,))
    for j, r in enumerate(body):
        for i, k in enumerate(r):
            if k != '.': c.putpixel((i, 15 + j), PAL[k] + (255,))
    for x, y, k in extra: c.putpixel((x, y), PAL[k] + (255,))
    o = Image.new('RGBA', (26, 32), (0, 0, 0, 0))
    sil = Image.new('RGBA', (24, 30), (30, 16, 10, 150)); sil.putalpha(c.getchannel('A').point(lambda a: 150 if a else 0))
    for dx, dy in [(0, 1), (2, 1), (1, 0), (1, 2)]: o.alpha_composite(sil, (dx, dy))
    o.alpha_composite(c, (1, 1)); return o

d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'lizard'); os.makedirs(d, exist_ok=True)
f = render(HEAD_FRONT, BODY_FRONT, EXTRA_FRONT); f.save(os.path.join(d, 'front.png'))
render(HEAD_BACK, BODY_BACK, [(5, 15, 'C'), (6, 15, 'C'), (7, 15, 'C'), (4, 15, 'c')]).save(os.path.join(d, 'back.png'))
p = Image.new('RGBA', (48, 48)); dr = ImageDraw.Draw(p)
for y in range(48): t = y / 47; dr.line([(0, y), (47, y)], fill=(int(90 - 40 * t), int(30 + 10 * t), int(20 + 10 * t), 255))
p.alpha_composite(f.crop((4, 0, 24, 20)).resize((48, 48), Image.NEAREST), (0, 2)); p.save(os.path.join(d, 'portrait.png'))
for rows in (HEAD_FRONT, HEAD_BACK): assert all(len(r) == 10 for r in rows)
for rows in (BODY_FRONT, BODY_BACK): assert all(len(r) == 24 for r in rows)
print('ok', d)
