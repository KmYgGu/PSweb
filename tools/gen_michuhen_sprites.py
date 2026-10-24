"""미츄헨 데슈타프 임시 스프라이트: 검사/궁수와 같은 16x16 절차적 픽셀 스타일 (외곽선 포함 18x18, 게임에서 x3).
도끼(오른손)·권총(허리)·전자기 팔찌(왼손목, 청록). python3 tools/gen_michuhen_sprites.py → assets/Michuhen/front.png, back.png, portrait.png"""
from PIL import Image, ImageDraw
import os
PAL = {'H': (92, 70, 52), 'h': (64, 48, 36), 'S': (238, 204, 176), 'E': (40, 40, 52), 'C': (58, 74, 96), 'c': (40, 52, 70),
       'W': (210, 214, 222), 'G': (40, 40, 46), 'Q': (90, 230, 240), 'L': (48, 44, 56), 'D': (26, 22, 26), 'A': (150, 156, 170), 'a': (110, 72, 40), 'B': (120, 90, 60)}
FRONT = ['................', '.....HHHHHH.....', '....HHHHHHHH....', '....HSSSSSSH....', '....SSESSESS....',
         '....SSSSSSSS..AA', '.....SSSSSS...AA', '...CCCWWWWCCC.a.', '..SCCCCWWCCCCSa.', '..QCCCCCCCCCC.a.', '...CBBBBBBBBG...',
         '....CCCCCCCCG...', '....LLL..LLL....', '....LLL..LLL....', '....DDD..DDD....', '................']
BACK = ['................', '.....HHHHHH.....', '....HHHHHHHH....', '....HHHHHHHH....', '....HHHHHHHH....',
        '....hHHHHHHh..AA', '.....hhhhhh...AA', '...CCCCCCCCCC.a.', '..SCCCccccCCCSa.', '..QCCCccccCCC.a.', '...CBBBBBBBBG...',
        '....CCCCCCCCG...', '....LLL..LLL....', '....LLL..LLL....', '....DDD..DDD....', '................']
def render(rows):
    c = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for j, r in enumerate(rows):
        for i, k in enumerate(r):
            if k != '.': c.putpixel((i, j), PAL[k] + (255,))
    o = Image.new('RGBA', (18, 18), (0, 0, 0, 0))
    sil = Image.new('RGBA', (16, 16), (26, 22, 34, 140)); sil.putalpha(c.getchannel('A').point(lambda a: 140 if a else 0))
    for dx, dy in [(0, 1), (2, 1), (1, 0), (1, 2)]: o.alpha_composite(sil, (dx, dy))
    o.alpha_composite(c, (1, 1)); return o
d = os.path.join(os.path.dirname(__file__), '..', 'assets', 'Michuhen'); os.makedirs(d, exist_ok=True)
f = render(FRONT); f.save(os.path.join(d, 'front.png')); render(BACK).save(os.path.join(d, 'back.png'))
p = Image.new('RGBA', (48, 48)); dr = ImageDraw.Draw(p)
for y in range(48): t = y / 47; dr.line([(0, y), (47, y)], fill=(int(40 - 15 * t), int(60 - 20 * t), int(80 - 25 * t), 255))
p.alpha_composite(f.crop((2, 0, 16, 14)).resize((42, 42), Image.NEAREST), (3, 6)); p.save(os.path.join(d, 'portrait.png'))
