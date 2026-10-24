"""샌즈 임시 스프라이트: 16x16 절차적 픽셀 (외곽선 포함 18x18, 게임에서 x3). 파란 후드, 하얀 해골 얼굴, 검은 반바지, 분홍 슬리퍼.
python3 tools/gen_sans_sprites.py → assets/Sans/front.png, back.png, portrait.png"""
from PIL import Image, ImageDraw
import os
PAL = {'W': (236, 236, 240), 'w': (200, 200, 210), 'E': (20, 20, 30), 'K': (40, 40, 50), 'B': (60, 110, 200), 'b': (40, 80, 150), 'F': (220, 220, 230),
       'S': (30, 30, 40), 'P': (240, 130, 170), 'L': (230, 230, 236)}
FRONT = ['................', '.....WWWWWW.....', '....WWWWWWWW....', '....WEEWWEEW....', '....WEEWWEEW....',
         '....WWWKKWWW....', '....wKWKWKWw....', '..BBBWWWWWWBBB..', '.BBBBFBBBBFBBBB.', '.BBBBBBBBBBBBBB.', '.WBBBBBBBBBBBBW.',
         '...bBBBBBBBBb...', '....SSSSSSSS....', '.....LL..LL.....', '....PPP..PPP....', '................']
BACK = ['................', '.....WWWWWW.....', '....WWWWWWWW....', '....WWWWWWWW....', '....WWWWWWWW....',
        '...BBBWWWWBBB...', '..BBBBwwwwBBBB..', '..BBBBBBBBBBBB..', '.BBBBBbbbbBBBBB.', '.BBBBBbbbbBBBBB.', '.WBBBBbbbbBBBBW.',
        '...bBBBBBBBBb...', '....SSSSSSSS....', '.....LL..LL.....', '....PPP..PPP....', '................']
def render(rows):
    c = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for j, r in enumerate(rows):
        for i, k in enumerate(r[:16]):
            if k != '.': c.putpixel((i, j), PAL[k] + (255,))
    o = Image.new('RGBA', (18, 18), (0, 0, 0, 0))
    sil = Image.new('RGBA', (16, 16), (26, 22, 34, 140)); sil.putalpha(c.getchannel('A').point(lambda a: 140 if a else 0))
    for dx, dy in [(0, 1), (2, 1), (1, 0), (1, 2)]: o.alpha_composite(sil, (dx, dy))
    o.alpha_composite(c, (1, 1)); return o
d = os.path.join(os.path.dirname(__file__), '..', 'assets', 'Sans'); os.makedirs(d, exist_ok=True)
f = render(FRONT); f.save(os.path.join(d, 'front.png')); render(BACK).save(os.path.join(d, 'back.png'))
p = Image.new('RGBA', (48, 48)); dr = ImageDraw.Draw(p)
for y in range(48): t = y / 47; dr.line([(0, y), (47, y)], fill=(int(20 + 10 * t), int(30 + 10 * t), int(60 - 10 * t), 255))
p.alpha_composite(f.crop((2, 0, 16, 14)).resize((42, 42), Image.NEAREST), (3, 6)); p.save(os.path.join(d, 'portrait.png'))
