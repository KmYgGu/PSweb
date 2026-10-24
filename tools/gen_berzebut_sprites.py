"""베르제브트 임시 스프라이트: 검사/궁수와 같은 16x16 절차적 픽셀 스타일 (외곽선 포함 18x18, 게임에서 x3).
작은 소녀, 붉은 망토, 악마성 깃발(왼쪽), 루비 팬던트, 날개 없음. python3 tools/gen_berzebut_sprites.py → assets/Berzebut/front.png, back.png, portrait.png"""
from PIL import Image, ImageDraw
import os
PAL = {'H': (236, 226, 240), 'h': (196, 184, 210), 'S': (246, 214, 190), 'E': (70, 40, 90), 'C': (150, 34, 48), 'c': (110, 22, 36),
       'W': (240, 236, 230), 'P': (255, 70, 90), 'L': (60, 50, 70), 'D': (30, 24, 34), 'F': (60, 30, 90), 'f': (130, 60, 170), 'p': (120, 96, 70)}
FRONT = ['ff..............', 'fFF..HHHHHH.....', 'fFFF.HHHHHHH....', 'fFF.HSSSSSSH....', 'p...HSESSESH....',
         'p...HSSSSSSH....', 'p....SSSSSS.....', 'p..CCCWWWWCCC...', 'pS.CCCCPPCCCC...', 'p..CCCCCCCCCC...', 'p..cCCCCCCCCc...',
         'p...cCCCCCCc....', 'p....LL..LL.....', '.....LL..LL.....', '.....DD..DD.....', '................']
BACK = ['ff..............', 'fFF..HHHHHH.....', 'fFFF.HHHHHHH....', 'fFF.HHHHHHHH....', 'p...HHHHHHHH....',
        'p...HhHHHHhH....', 'p....hhhhhh.....', 'p..CCCCCCCCCC...', 'pS.CCCccccCCC...', 'p..CCCccccCCC...', 'p..cCCccccCCc...',
        'p...cCCCCCCc....', 'p....LL..LL.....', '.....LL..LL.....', '.....DD..DD.....', '................']
def render(rows):
    c = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for j, r in enumerate(rows):
        for i, k in enumerate(r[:16]):
            if k != '.': c.putpixel((i, j), PAL[k] + (255,))
    o = Image.new('RGBA', (18, 18), (0, 0, 0, 0))
    sil = Image.new('RGBA', (16, 16), (26, 22, 34, 140)); sil.putalpha(c.getchannel('A').point(lambda a: 140 if a else 0))
    for dx, dy in [(0, 1), (2, 1), (1, 0), (1, 2)]: o.alpha_composite(sil, (dx, dy))
    o.alpha_composite(c, (1, 1)); return o
d = os.path.join(os.path.dirname(__file__), '..', 'assets', 'Berzebut'); os.makedirs(d, exist_ok=True)
f = render(FRONT); f.save(os.path.join(d, 'front.png')); render(BACK).save(os.path.join(d, 'back.png'))
p = Image.new('RGBA', (48, 48)); dr = ImageDraw.Draw(p)
for y in range(48): t = y / 47; dr.line([(0, y), (47, y)], fill=(int(70 - 25 * t), int(30 - 10 * t), int(60 - 20 * t), 255))
p.alpha_composite(f.crop((2, 0, 16, 14)).resize((42, 42), Image.NEAREST), (3, 6)); p.save(os.path.join(d, 'portrait.png'))
