"""루델리안 임시 스프라이트: 검사/궁수와 같은 16x16 절차적 픽셀 스타일 (외곽선 포함 18x18, 게임에서 x3).
python3 tools/gen_rudelian_sprites.py → assets/Rudelian/front.png, back.png, portrait.png"""
from PIL import Image, ImageDraw
import os
PAL = {'H': (138, 24, 48), 'h': (98, 14, 34), 'S': (244, 228, 224), 'E': (224, 24, 48), 'B': (30, 26, 36), 'A': (216, 176, 64),
       'C': (70, 20, 40), 'L': (42, 36, 48), 'D': (20, 14, 20)}
FRONT = ['................', '.....HHHHHH.....', '....HHHHHHHH....', '....HSSSSSSH....', '...HSSESSESH....'[:0] + '...HSSESSESSH...',
         '...HSSSSSSSSH...', '...HHSSSSSSHH...', '...HCBBBBBBCH...', '...HBBBAABBBH...', '...SBBBAABBBS...', '...HBBBBBBBBH...',
         '....BBBBBBBB....', '....LLL..LLL....', '....LLL..LLL....', '....DDD..DDD....', '................']
BACK = ['................', '.....HHHHHH.....', '....HHHHHHHH....', '....HHHHHHHH....', '...HHHHHHHHHH...', '...HHHHHHHHHH...',
        '...HHHHhhHHHH...', '...HHCBBBBCHH...', '...HHBBBBBBHH...', '...SHHBBBBHHS...', '...HHHBBBBHHH...', '....BBBBBBBB....',
        '....LLL..LLL....', '....LLL..LLL....', '....DDD..DDD....', '................']
def render(rows):
    c = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for j, r in enumerate(rows):
        for i, k in enumerate(r):
            if k != '.': c.putpixel((i, j), PAL[k] + (255,))
    o = Image.new('RGBA', (18, 18), (0, 0, 0, 0))
    sil = Image.new('RGBA', (16, 16), (26, 22, 34, 140)); sil.putalpha(c.getchannel('A').point(lambda a: 140 if a else 0))
    for dx, dy in [(0, 1), (2, 1), (1, 0), (1, 2)]: o.alpha_composite(sil, (dx, dy))
    o.alpha_composite(c, (1, 1)); return o
d = os.path.join(os.path.dirname(__file__), '..', 'assets', 'Rudelian'); os.makedirs(d, exist_ok=True)
f = render(FRONT); f.save(os.path.join(d, 'front.png')); render(BACK).save(os.path.join(d, 'back.png'))
p = Image.new('RGBA', (48, 48)); dr = ImageDraw.Draw(p)
for y in range(48): t = y / 47; dr.line([(0, y), (47, y)], fill=(int(85 - 40 * t), int(14 - 5 * t), int(28 - 10 * t), 255))
p.alpha_composite(f.crop((2, 0, 16, 14)).resize((42, 42), Image.NEAREST), (3, 6)); p.save(os.path.join(d, 'portrait.png'))
