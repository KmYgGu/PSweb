"""라미아 + 스탠드 '브릴리언스' 임시 스프라이트: 검사/궁수와 같은 16x16 절차적 픽셀 스타일 (외곽선 포함 18x18).
python3 tools/gen_lamia_sprites.py → assets/Lamia/front.png, back.png, portrait.png, stand/front.png, stand/back.png, stand/arm.png"""
from PIL import Image, ImageDraw
import os
PAL = {'H': (200, 160, 112), 'T': (232, 196, 80), 'G': (120, 200, 255), 'S': (246, 222, 200), 'E': (224, 160, 32), 'M': (190, 100, 100),
       'W': (240, 240, 246), 'w': (196, 200, 214), 'K': (74, 48, 36), 'C': (150, 205, 240), 'c': (232, 246, 255), 'I': (190, 230, 255), 'i': (255, 255, 255), 'B': (40, 90, 160)}
A = 200  # 스탠드 반투명
F = {
 'front': ['', '.....HTGTH', '....HHHHHHHH', '....HSSSSSSH', '....HSESSESH', '....HSSSSSSH', '....HSSSSMSH', '....HWWWWWWH',
           '...HWWWwWWWWH', '...SWWWwWWWWS', '....WWWwWWWW', '....WWW..WWW', '....KKK..KKK', '....KKK..KKK', '....KKK..KKK', ''],
 'back': ['', '.....HTTTH', '....HHHHHHHH', '....HHHHHHHH', '....HHHHHHHH', '....HHHHHHHH', '....HHHHHHHH', '....HHHHHHHH',
          '...SHHHHHHHHS', '....WHHHHHHW', '....WWWWWWWW', '....WWW..WWW', '....KKK..KKK', '....KKK..KKK', '....KKK..KKK', ''],
 'stand/front': ['', '......cCCc', '......CccC', '......CBBC', '......CCCC', '.....CCccCC', '....CCCccCCC', '....CCCccCCC',
                 '.....CCccCC', '.....CCccCC', '......CCCC', '.....CCCCCC', '......CCCC', '.......CC', '', ''],  # 몸통만: 팔(arm.png)은 체력 비례 개수로 게임에서 따로 그림
 'stand/back': ['', '......cCCc', '......CCCC', '......CCCC', '......CCCC', '.....CCCCCC', '....CCCCCCCC', '....CCCccCCC',
                '.....CCCCCC', '.....CCccCC', '......CCCC', '.....CCCCCC', '......CCCC', '.......CC', '', ''],
 'stand/arm': ['', '', '', '', '', '', '...CCC', '..CCcCCCIIi', '..CCCCCCIIIii', '...CCC', '', '', '', '', '', ''],
}
def render(rows, alpha=255):
    c = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for j, r in enumerate(rows):
        for i, k in enumerate(r[:16]):
            if k != '.': c.putpixel((i, j), PAL[k] + (alpha,))
    o = Image.new('RGBA', (18, 18), (0, 0, 0, 0))
    sil = Image.new('RGBA', (16, 16), (26, 22, 34, 140)); sil.putalpha(c.getchannel('A').point(lambda a: 140 if a else 0))
    for dx, dy in [(0, 1), (2, 1), (1, 0), (1, 2)]: o.alpha_composite(sil, (dx, dy))
    o.alpha_composite(c, (1, 1)); return o
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'Lamia'); os.makedirs(os.path.join(d, 'stand'), exist_ok=True)
for k, rows in F.items(): render(rows, A if k.startswith('stand') else 255).save(os.path.join(d, k + '.png'))
f = render(F['front']); p = Image.new('RGBA', (48, 48)); dr = ImageDraw.Draw(p)
for y in range(48): t = y / 47; dr.line([(0, y), (47, y)], fill=(int(70 - 25 * t), int(90 - 30 * t), int(130 - 40 * t), 255))
p.alpha_composite(f.crop((2, 0, 16, 14)).resize((42, 42), Image.NEAREST), (3, 6)); p.save(os.path.join(d, 'portrait.png'))
