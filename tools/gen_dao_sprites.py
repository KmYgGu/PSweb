"""다오 (카트라이더 팬 캐릭터) 스프라이트: 카트를 탄 모습, 24x20 픽셀 (외곽선 포함 26x22, 게임에서 x2).
 - 사용자 제공 그림 기준: 위쪽 양옆이 동그랗게 솟은 파란 머리, 눈 감은 얼굴·발그레한 볼, 흰 장갑으로 잡은 핸들, 번호판 '0'의 파란 카트
 - 뒷모습: 파란 뒷머리, 카트 뒷면(배기구 두 개)
python3 tools/gen_dao_sprites.py → assets/dao/front.png, back.png, portrait.png"""
from PIL import Image, ImageDraw
import os

PAL = {'B': (58, 122, 216), 'b': (30, 74, 160), 'h': (154, 200, 255), 'S': (244, 204, 160), 'E': (58, 36, 24), 'P': (240, 122, 138), 'm': (192, 80, 64),
       'W': (248, 248, 248), 'D': (58, 58, 66), 'K': (26, 26, 30), 'C': (58, 138, 224), 'c': (42, 98, 176), 'N': (30, 58, 122), 'g': (154, 160, 170)}
# 참고 그림 기준: 위쪽 양옆이 동그랗게 솟은 파란 머리(모자처럼), 눈을 감은 얼굴·발그레한 볼, 흰 장갑으로 잡은 핸들, 번호판 '0'이 달린 파란 카트
FRONT = [
    '...bBBb........bBBb.....', '..bBBBBb......bBBBBb....', '..bBBBBBbbbbbbBBBBBb....', '...bBBBBBBBBBBBBBBb.....', '...bBBhBBBBBBBBBBBb.....',
    '...bBBBBBBBBBBBBBBb.....', '...bBSSSSSSSSSSSSBb.....', '...bSSEESSSSSSEESSb.....', '...bSPPSSSSSSSSPPSb.....', '....SSSSSmmSSSSSSS......',
    '.....SSSSSSSSSSSS.......', '..KK..WWDDDDDDWW..KK....', '..KKCCCCCCCCCCCCCCKK....', '..KKCCCCWNNNNWCCCCKK....', '..KKCccCWNWWNWCccCKK....',
    '...CCccCWNWWNWCccCC.....', '..KKCCCCWNNNNWCCCCKK....', '..KKggggggggggggggKK....', '..KK..............KK....', '..KK..............KK....']
BACK = [
    '...bBBb........bBBb.....', '..bBBBBb......bBBBBb....', '..bBBBBBbbbbbbBBBBBb....', '...bBBBBBBBBBBBBBBb.....', '...bBBhBBBBBBBBBBBb.....',
    '...bBBBBBBBBBBBBBBb.....', '...bBBBBBBBBBBBBBBb.....', '...bBBBBBBBBBBBBBBb.....', '...bBBBBBBBBBBBBBBb.....', '....bBBBBBBBBBBBBb......',
    '.....bbbbbbbbbbbb.......', '..KK..CCCCCCCCCC..KK....', '..KKCCCCCCCCCCCCCCKK....', '..KKCCCCCCCCCCCCCCKK....', '..KKCggCCCCCCCCggCKK....',
    '...CCggCCCCCCCCggCC.....', '..KKCCCCCCCCCCCCCCKK....', '..KKggggggggggggggKK....', '..KK..............KK....', '..KK..............KK....']
H = len(FRONT)
for rows in (FRONT, BACK): assert len(rows) == H and all(len(r) == 24 for r in rows), [len(r) for r in rows]

def render(rows):
    c = Image.new('RGBA', (24, H), (0, 0, 0, 0))
    for j, r in enumerate(rows):
        for i, k in enumerate(r):
            if k != '.': c.putpixel((i, j), PAL[k] + (255,))
    o = Image.new('RGBA', (26, H + 2), (0, 0, 0, 0))
    sil = Image.new('RGBA', (24, H), (20, 16, 24, 150)); sil.putalpha(c.getchannel('A').point(lambda a: 150 if a else 0))
    for dx, dy in [(0, 1), (2, 1), (1, 0), (1, 2)]: o.alpha_composite(sil, (dx, dy))
    o.alpha_composite(c, (1, 1)); return o

d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'dao'); os.makedirs(d, exist_ok=True)
f = render(FRONT); f.save(os.path.join(d, 'front.png')); render(BACK).save(os.path.join(d, 'back.png'))
p = Image.new('RGBA', (48, 48)); dr = ImageDraw.Draw(p)
for y in range(48): t = y / 47; dr.line([(0, y), (47, y)], fill=(int(30 + 20 * t), int(60 + 30 * t), int(120 + 40 * t), 255))
p.alpha_composite(f.crop((2, 0, 22, 14)).resize((50, 35), Image.NEAREST), (-1, 8)); p.save(os.path.join(d, 'portrait.png'))
print('ok', d)
