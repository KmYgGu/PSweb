"""다오 (카트라이더 팬 캐릭터) 스프라이트: 카트를 탄 모습, 24x21 픽셀 (외곽선 포함 26x23, 게임에서 x2).
 - 앞모습: 검은 머리·이마의 고글(파란 렌즈), 큰 얼굴, 파란 레이싱 슈트, 빨간 카트(흰 줄무늬·노란 헤드라이트·검은 바퀴)
 - 뒷모습: 뒷머리·고글 끈, 카트 뒷면(배기구 두 개)
python3 tools/gen_dao_sprites.py → assets/dao/front.png, back.png, portrait.png"""
from PIL import Image, ImageDraw
import os

PAL = {'H': (34, 30, 40), 'h': (70, 66, 86), 'G': (150, 156, 170), 'L': (90, 190, 255), 'S': (246, 206, 168), 'E': (30, 26, 34), 'm': (196, 90, 80),
       'B': (40, 100, 210), 'W': (246, 246, 246), 'K': (26, 26, 30), 'R': (216, 40, 40), 'Y': (255, 224, 90), 'k': (80, 24, 24), 'g': (170, 170, 176)}
FRONT = [
    '.........HHHHHH.........', '.......HHhHHHHHHH.......', '......HHHHHHHHHHHH......', '.....HHGGGGGGGGGGHH.....', '.....HGLLGGGGGGLLGH.....',
    '.....HSSSSSSSSSSSSH.....', '.....SSSEESSSSEESSS.....', '.....SSSEESSSSEESSS.....', '.....SSSSSSSSSSSSSS.....', '......SSSSmmmmSSSS......',
    '.......SSSSSSSSSS.......', '.....BBBBBWWWWBBBBB.....', '..KK.BBBBBWWWWBBBBB.KK..', '..KKRRRRRRRRRRRRRRRRKK..', '..KKRRRRRRRRRRRRRRRRKK..',
    '..KKRWWWWWWWWWWWWWWRKK..', '...RRRRRRRRRRRRRRRRRR...', '..KKRRRRYYRRRRYYRRRRKK..', '..KKRRRRRRRRRRRRRRRRKK..', '..KKkkkkkkkkkkkkkkkkKK..',
    '..KK................KK..']
BACK = [
    '.........HHHHHH.........', '.......HHhHHHHHHH.......', '......HHHHHHHHHHHH......', '.....HHGGGGGGGGGGHH.....', '.....HHHHHHHHHHHHHH.....',
    '.....HHHHHHHHHHHHHH.....', '.....HHHHHHHHHHHHHH.....', '.....HHHHHHHHHHHHHH.....', '.....HHHHHHHHHHHHHH.....', '......HHHHHHHHHHHH......',
    '.......SSSSSSSSSS.......', '.....BBBBBBBBBBBBBB.....', '..KK.BBBBBBBBBBBBBB.KK..', '..KKRRRRRRRRRRRRRRRRKK..', '..KKRRRRRRRRRRRRRRRRKK..',
    '..KKRWWWWWWWWWWWWWWRKK..', '...RRRRRRRRRRRRRRRRRR...', '..KKRRggRRRRRRRRggRRKK..', '..KKRRggRRRRRRRRggRRKK..', '..KKkkkkkkkkkkkkkkkkKK..',
    '..KK................KK..']
for rows in (FRONT, BACK): assert len(rows) == 21 and all(len(r) == 24 for r in rows), [len(r) for r in rows]

def render(rows):
    c = Image.new('RGBA', (24, 21), (0, 0, 0, 0))
    for j, r in enumerate(rows):
        for i, k in enumerate(r):
            if k != '.': c.putpixel((i, j), PAL[k] + (255,))
    o = Image.new('RGBA', (26, 23), (0, 0, 0, 0))
    sil = Image.new('RGBA', (24, 21), (20, 16, 24, 150)); sil.putalpha(c.getchannel('A').point(lambda a: 150 if a else 0))
    for dx, dy in [(0, 1), (2, 1), (1, 0), (1, 2)]: o.alpha_composite(sil, (dx, dy))
    o.alpha_composite(c, (1, 1)); return o

d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'dao'); os.makedirs(d, exist_ok=True)
f = render(FRONT); f.save(os.path.join(d, 'front.png')); render(BACK).save(os.path.join(d, 'back.png'))
p = Image.new('RGBA', (48, 48)); dr = ImageDraw.Draw(p)
for y in range(48): t = y / 47; dr.line([(0, y), (47, y)], fill=(int(30 + 20 * t), int(60 + 30 * t), int(120 + 40 * t), 255))
p.alpha_composite(f.crop((4, 0, 22, 14)).resize((54, 42), Image.NEAREST), (-3, 4)); p.save(os.path.join(d, 'portrait.png'))
print('ok', d)
