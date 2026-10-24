"""슈르프 임시 스프라이트: 검사/궁수와 같은 16x16 절차적 픽셀 스타일 (외곽선 포함 18x18).
python3 tools/gen_schurf_sprites.py → assets/Schurf/front.png, back.png, portrait.png, forms/{rabbit,snake,octopus,bear,dragon}.png"""
from PIL import Image, ImageDraw
import os
PAL = {'H': (216, 196, 154), 'S': (244, 214, 186), 'E': (42, 34, 48), 'K': (12, 10, 14), 'Y': (240, 200, 60), 'B': (30, 42, 74),
       'A': (232, 228, 216), 'L': (36, 40, 58), 'D': (24, 20, 26), 'W': (240, 238, 232), 'P': (240, 160, 180), 'G': (90, 170, 80),
       'g': (200, 220, 120), 'R': (200, 50, 40), 'O': (170, 90, 200), 'N': (130, 84, 50), 'T': (210, 170, 120), 'r': (240, 80, 80)}
F = {
 'front': ['', '.....HHHHHH', '....HHHHHHHH', '....HSSSSSSH', '....SSESSKYS', '....SSSSSSSS', '.....SSSSSS', '....BBBBBBBB',
           '...BBBAAAABBB', '...SBBAAAABBS', '....BBAAAABB', '....BBAAAABB', '....LLL..LLL', '....LLL..LLL', '....DDD..DDD', ''],
 'back': ['', '.....HHHHHH', '....HHHHHHHH', '....HHHHHHHH', '....HHHHHHHH', '....SHHHHHHS', '.....SSSSSS', '....BBBBBBBB',
          '...BBBBAABBBB', '...SBBBBBBBBS', '....BBBBBBBB', '....BBBBBBBB', '....LLL..LLL', '....LLL..LLL', '....DDD..DDD', ''],
 'rabbit': ['', '.....W..W', '.....WP.WP', '.....WP.WP', '.....WWWWW', '....WWWWWWW', '....WEWWWEW', '....WWWPWWW', '.....WWWWW',
            '....WWWWWWWW', '...WWWWWWWWWW', '...WWWWWWWWWWW', '...WWWWWWWWWW', '....WW....WW', '', ''],
 'snake': ['', '', '', '', '', '..........GGG', '.........GGEGG', '.........GGGGGr', '..........GG', '...GGGGGGGG', '..GGggggggGG',
           '..GG......GG', '...GGGGGGGGGG', '....ggggggggG', '', ''],
 'octopus': ['', '', '', '.....OOOOOO', '....OOOOOOOO', '....OOOOOOOO', '....OWEOOWEO', '....OOOOOOOO', '.....OOOOOO',
             '....O.O..O.O', '...O.O.OO.O.O', '...O..O..O..O', '..O..O....O..O', '', '', ''],
 'bear': ['', '', '....NN....NN', '....NNNNNNNN', '...NNNNNNNNNN', '...NNENNNNENN', '...NNNNTTNNNN', '....NNTKKTNN', '...NNNNNNNNNN',
          '..NNNNTTTTNNNN', '..NNNNTTTTNNNN', '..NN.NNNNNN.NN', '....NNN..NNN', '....NNN..NNN', '', ''],
 'dragon': ['', '', '......RRRR', '.R...RRRRRR...R', '.RR..RYRRYR..RR', '.RRR.RRRRRR.RRR', '.RRRRRRKKRRRRRR', '..RRRRRRRRRRRR',
            '...RRRRTTRRRR', '....RRTTTTRR', '....RRTTTTRRR', '....RRRRRRRR.RR', '...RR.RRRR.RR.R', '...RR......RR', '', ''],
}
def render(rows):
    c = Image.new('RGBA', (16, 16), (0, 0, 0, 0))
    for j, r in enumerate(rows):
        for i, k in enumerate(r[:16]):
            if k != '.': c.putpixel((i, j), PAL[k] + (255,))
    o = Image.new('RGBA', (18, 18), (0, 0, 0, 0))
    sil = Image.new('RGBA', (16, 16), (26, 22, 34, 140)); sil.putalpha(c.getchannel('A').point(lambda a: 140 if a else 0))
    for dx, dy in [(0, 1), (2, 1), (1, 0), (1, 2)]: o.alpha_composite(sil, (dx, dy))
    o.alpha_composite(c, (1, 1)); return o
d = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'Schurf'); os.makedirs(os.path.join(d, 'forms'), exist_ok=True)
for k, rows in F.items():
    render(rows).save(os.path.join(d, k + '.png') if k in ('front', 'back') else os.path.join(d, 'forms', k + '.png'))
f = render(F['front']); p = Image.new('RGBA', (48, 48)); dr = ImageDraw.Draw(p)
for y in range(48): t = y / 47; dr.line([(0, y), (47, y)], fill=(int(40 - 15 * t), int(52 - 18 * t), int(84 - 30 * t), 255))
p.alpha_composite(f.crop((2, 0, 16, 14)).resize((42, 42), Image.NEAREST), (3, 6)); p.save(os.path.join(d, 'portrait.png'))
