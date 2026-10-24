# 구울즈 듀얼리스트 + 몬스터(미소녀) 픽셀 스프라이트 생성기 (참고 이미지를 보고 색/실루엣을 정한 원본 도트)
# 결과: assets/Ghouls/character/{front,back,portrait}.png, assets/Ghouls/monsters/G01.png ... G40.png
# 이 PNG 들을 같은 이름으로 덮어쓰면 게임에 그대로 반영됩니다 (크기 자유, 게임이 높이에 맞춰 축소/확대).
from PIL import Image
import os
ROOT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'Ghouls')
W, H = 28, 42
OY = 6  # 모자/귀가 위로 잘리지 않게 아래로 이동
OUT = (20, 14, 28, 255)

def hexc(h, a=255):
    h = h.lstrip('#'); return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)
def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (c[3],)

class Cv:
    def __init__(s, w, h, oy=0): s.w, s.h, s.oy = w, h, oy; s.px = {}
    def p(s, x, y, c):
        y += s.oy
        if 0 <= x < s.w and 0 <= y < s.h and c: s.px[(x, y)] = c
    def rect(s, x0, y0, x1, y1, c):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1): s.p(x, y, c)
    def ell(s, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x - cx) / max(rx, .5)) ** 2 + ((y - cy) / max(ry, .5)) ** 2 <= 1.0: s.p(x, y, c)
    def trap(s, y0, y1, xa0, xa1, xb0, xb1, c):  # 위 폭 xa0..xa1 → 아래 폭 xb0..xb1
        for y in range(y0, y1 + 1):
            k = (y - y0) / max(1, y1 - y0)
            s.rect(round(xa0 + (xb0 - xa0) * k), y, round(xa1 + (xb1 - xa1) * k), y, c)
    def line(s, x0, y0, x1, y1, c):
        n = max(abs(x1 - x0), abs(y1 - y0), 1)
        for i in range(n + 1): s.p(round(x0 + (x1 - x0) * i / n), round(y0 + (y1 - y0) * i / n), c)
    def img(s, outline=True):
        im = Image.new('RGBA', (s.w, s.h), (0, 0, 0, 0)); P = im.load()
        for (x, y), c in s.px.items(): P[x, y] = c
        if outline:
            o = im.copy(); Q = o.load()
            for y in range(s.h):
                for x in range(s.w):
                    if P[x, y][3] == 0 and any(0 <= x + dx < s.w and 0 <= y + dy < s.h and P[x + dx, y + dy][3] > 0 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))): Q[x, y] = OUT
            im = o
        return im

SKIN = hexc('#ffe0cc'); TAN = hexc('#c98a5a'); PALE = hexc('#f4ecf4')

def girl(sp):
    c = Cv(W, H, OY)
    hair = hexc(sp['hair']); hs = shade(hair, 0.72); hl = shade(hair, 1.25)
    o1 = hexc(sp['o1']); o2 = hexc(sp.get('o2', sp['o1'])); o1s = shade(o1, 0.7)
    skin = hexc(sp['skin']) if 'skin' in sp else SKIN
    eye = hexc(sp.get('eye', '#3a6ad8'))
    style = sp.get('style', 'long'); body = sp.get('body', 'dress')
    acc = sp.get('acc', [])
    # 날개 / 뒤 장식 (가장 뒤)
    if 'wings' in acc:
        wc = hexc(sp.get('wing', '#e8f0ff'))
        for i in range(6): c.line(10 - i, 15 - i, 4 - i // 2, 22 - i // 3, wc); c.line(17 + i, 15 - i, 23 + i // 2, 22 - i // 3, wc)
    if 'batwings' in acc:
        wc = hexc(sp.get('wing', '#3a1020'))
        c.trap(12, 20, 2, 9, 0, 10, wc); c.trap(12, 20, 18, 25, 18, 27, wc)
    if 'tail' in acc:
        tc = hexc(sp.get('tailc', sp['o1'])); c.line(8, 26, 2, 30, tc); c.line(8, 27, 3, 31, tc); c.line(2, 30, 1, 26, tc)
    if 'feathers' in acc:
        fc = [hexc('#7ad8c8'), hexc('#4ab0e0'), hexc('#c8f0e0')]
        for i in range(5): c.line(9, 18, 1 + i, 9 + i * 2, fc[i % 3]); c.line(18, 18, 26 - i, 9 + i * 2, fc[i % 3])
    if 'fan' in acc:  # 공작 깃 부채 (용선녀)
        for i in range(7): c.line(20, 20, 27, 8 + i * 3, hexc('#f0e8d0') if i % 2 else hexc('#d0a040'))
    # 뒷머리
    if style in ('long', 'twin', 'pony', 'huge', 'wavy'):
        y1 = 27 if style in ('long', 'wavy') else 22
        if style == 'huge': c.ell(14, 14, 11, 12, hair); c.ell(14, 22, 10, 7, hair)
        else: c.trap(6, y1, 7, 20, 6 if style != 'pony' else 8, 21, hs)
    if style == 'twin':
        c.trap(6, 26, 3, 6, 2, 6, hair); c.trap(6, 26, 21, 24, 21, 25, hair)
        c.rect(5, 6, 6, 7, hexc(sp.get('ribbon', '#ff5a8a'))); c.rect(21, 6, 22, 7, hexc(sp.get('ribbon', '#ff5a8a')))
    if style == 'pony': c.trap(4, 20, 3, 6, 1, 5, hair)
    # 몸 (옷)
    if body == 'dress':
        c.rect(10, 15, 17, 20, o1); c.trap(21, 28, 9, 18, 6, 21, o2); c.rect(10, 20, 17, 20, o1s)
    elif body == 'suit':
        c.rect(10, 15, 17, 24, o1); c.rect(10, 25, 12, 32, o1); c.rect(15, 25, 17, 32, o1); c.rect(11, 18, 16, 19, o2)
    elif body == 'robe':
        c.trap(15, 32, 9, 18, 6, 21, o1); c.rect(13, 15, 14, 32, o2)
    elif body == 'armor':
        c.rect(9, 15, 18, 23, o1); c.rect(10, 16, 17, 17, o2); c.trap(24, 28, 9, 18, 8, 19, o2); c.rect(10, 29, 12, 32, o1); c.rect(15, 29, 17, 32, o1)
    elif body == 'crop':
        c.rect(10, 15, 17, 18, o1); c.rect(11, 19, 16, 21, skin); c.rect(10, 22, 17, 26, o2); c.rect(10, 27, 12, 32, o2); c.rect(15, 27, 17, 32, o2)
    elif body == 'gown':
        c.rect(10, 15, 17, 20, o1); c.trap(21, 32, 9, 18, 4, 23, o2); c.line(6, 31, 21, 31, shade(o2, 1.3))
    elif body == 'slime':
        c.ell(14, 26, 9, 7, o1); c.ell(14, 22, 5, 6, o2)
    # 다리 (치마 아래)
    if body in ('dress',):
        leg = hexc(sp.get('leg', '#ffffff')) if 'leg' in sp else skin
        c.rect(11, 29, 12, 32, leg); c.rect(15, 29, 16, 32, leg); c.rect(10, 33, 12, 34, hexc(sp.get('shoe', '#5a3a2a'))); c.rect(15, 33, 17, 34, hexc(sp.get('shoe', '#5a3a2a')))
    elif body in ('suit', 'crop', 'armor'):
        c.rect(10, 33, 12, 34, hexc(sp.get('shoe', '#2a2230'))); c.rect(15, 33, 17, 34, hexc(sp.get('shoe', '#2a2230')))
    elif body in ('robe', 'gown'):
        c.rect(10, 33, 12, 34, hexc(sp.get('shoe', '#2a2230'))); c.rect(15, 33, 17, 34, hexc(sp.get('shoe', '#2a2230')))
    # 팔
    arm = skin if sp.get('bareArms', True) else o1
    c.rect(8, 16, 9, 22, arm); c.rect(18, 16, 19, 22, arm)
    if 'veil' in acc: c.trap(0, 16, 6, 21, 4, 23, hexc(sp.get('veilc', '#2a2a30')))
    # 목 + 머리
    c.rect(13, 13, 14, 14, skin)
    c.ell(14, 8, 6, 6, skin)
    # 앞머리
    c.trap(1, 5, 8, 19, 7, 20, hair); c.rect(7, 5, 8, 10, hair); c.rect(20, 5, 20, 9, hair)
    c.p(12, 6, hair); c.p(16, 6, hair); c.rect(9, 2, 18, 2, hl)
    if style == 'short': c.rect(7, 10, 8, 12, hair); c.rect(19, 10, 20, 12, hair)
    if style in ('long', 'twin', 'pony', 'wavy'): c.rect(7, 10, 8, 15, hair); c.rect(19, 10, 20, 14, hair)
    # 얼굴
    c.rect(11, 8, 12, 9, eye); c.rect(16, 8, 17, 9, eye); c.p(11, 8, hexc('#ffffff')); c.p(16, 8, hexc('#ffffff'))
    c.p(14, 11, hexc('#d86a7a'))
    if sp.get('blush', True): c.p(10, 10, hexc('#ffaab8')); c.p(18, 10, hexc('#ffaab8'))
    if sp.get('wink'): c.rect(16, 9, 17, 9, OUT); c.p(16, 8, skin); c.p(17, 8, skin)
    if sp.get('closed'): c.rect(11, 9, 12, 9, OUT); c.rect(16, 9, 17, 9, OUT); c.p(11, 8, skin); c.p(12, 8, skin); c.p(16, 8, skin); c.p(17, 8, skin)
    # 머리 장식
    if 'witchhat' in acc:
        hc = hexc(sp.get('hat', '#3a2a5a')); c.rect(4, 2, 23, 3, hc); c.trap(-6, 1, 14, 14, 9, 19, hc); c.line(14, -6, 19, -6, hc); c.rect(9, 1, 19, 1, hexc(sp.get('hatband', '#ffd060')))
    if 'cap' in acc: hc = hexc(sp.get('hat', '#3a3a4a')); c.rect(7, 0, 20, 2, hc); c.rect(15, 3, 22, 3, hc)
    if 'halo' in acc: c.rect(9, -1, 18, -1, hexc('#fff0a0'));
    if 'halo' in acc: c.line(9, 0, 18, 0, hexc('#fff0a0'))
    if 'horns' in acc: hc = hexc(sp.get('horn', '#3a2a2a')); c.line(9, 2, 7, -1, hc); c.line(18, 2, 20, -1, hc); c.p(7, 0, hc); c.p(20, 0, hc)
    if 'catears' in acc: ec = hexc(sp.get('ear', sp['hair'])); c.trap(0, 2, 8, 8, 7, 10, ec); c.trap(0, 2, 19, 19, 17, 20, ec)
    if 'bunny' in acc: ec = hexc('#ffffff'); c.rect(9, -6, 10, 2, ec); c.rect(17, -6, 18, 2, ec); c.p(9, -6, hexc('#ffb0c8'))
    if 'veil' in acc: vc = hexc(sp.get('veilc', '#2a2a30')); c.trap(0, 4, 7, 20, 6, 21, vc); c.rect(8, 2, 19, 3, hexc(sp.get('veilb', '#ffffff')))
    if 'tiara' in acc: tc = hexc(sp.get('tiarac', '#ffd060')); c.rect(10, 2, 17, 2, tc); c.p(13, 1, tc); c.p(14, 0, tc); c.p(14, 1, hexc('#ff5a8a'))
    if 'crown' in acc: tc = hexc(sp.get('tiarac', '#2a1a1a')); c.rect(9, 1, 18, 2, tc); c.p(10, 0, tc); c.p(14, -1, tc); c.p(17, 0, tc)
    if 'mask' in acc: c.rect(10, 7, 18, 9, hexc(sp.get('maskc', '#e8e8f0')))
    if 'visor' in acc: c.rect(9, 7, 19, 9, hexc(sp.get('maskc', '#4ae0ff')))
    if 'sleepcap' in acc: c.trap(-3, 2, 12, 14, 6, 21, hexc('#f4e8f8')); c.p(4, 3, hexc('#ff9ad0'))
    if 'bow' in acc: bc = hexc(sp.get('ribbon', '#ffffff')); c.rect(15, 0, 21, 2, bc); c.p(18, 1, OUT)
    if 'flower' in acc: c.rect(18, 2, 20, 4, hexc(sp.get('ribbon', '#ff8ac0'))); c.p(19, 3, hexc('#fff0a0'))
    if 'headphones' in acc: c.rect(6, 6, 7, 10, hexc('#2a2a3a')); c.rect(20, 6, 21, 10, hexc('#2a2a3a')); c.rect(8, 1, 19, 1, hexc('#2a2a3a'))
    # 무기/소품 (오른손 앞)
    w = sp.get('weapon'); wc = hexc(sp.get('wc', '#c8c8d8'))
    if w == 'staff': c.line(21, 5, 21, 33, hexc(sp.get('wc', '#8a5a3a'))); c.ell(21, 4, 2, 2, hexc(sp.get('gem', '#ff5a5a')))
    elif w == 'spear': c.line(22, 0, 22, 33, wc); c.trap(-3, 1, 22, 22, 21, 23, hexc('#f0f0ff'))
    elif w == 'sword': c.line(20, 22, 26, 8, wc); c.line(21, 22, 27, 8, shade(wc, 1.2)); c.rect(19, 21, 21, 22, hexc('#ffd060'))
    elif w == 'bow': c.line(23, 8, 25, 20, wc); c.line(25, 20, 23, 32, wc); c.line(23, 8, 23, 32, hexc('#ffffff'))
    elif w == 'fork': c.line(21, 12, 26, 32, hexc('#c0c0c8')); c.rect(19, 9, 23, 9, hexc('#c0c0c8')); c.p(19, 8, hexc('#c0c0c8')); c.p(21, 8, hexc('#c0c0c8')); c.p(23, 8, hexc('#c0c0c8'))
    elif w == 'claw': [c.line(20 + i, 18, 25 + i, 24, hexc('#ff4a5a')) for i in range(3)]
    elif w == 'phone': c.rect(20, 14, 22, 18, hexc('#2a2a3a')); c.p(21, 15, hexc('#9ae0ff'))
    elif w == 'whip': c.line(20, 20, 24, 12, hexc('#6a3a2a')); c.line(24, 12, 27, 18, hexc('#ff5a8a')); c.line(27, 18, 25, 26, hexc('#ff5a8a'))
    elif w == 'scythe': c.line(21, 3, 21, 33, hexc('#3a3040')); c.line(21, 3, 27, 7, hexc('#d0d0e0')); c.line(21, 4, 26, 8, hexc('#d0d0e0'))
    elif w == 'candle': c.rect(20, 20, 23, 24, hexc('#f0f0ff')); c.p(21, 18, hexc('#ffb040')); c.p(21, 19, hexc('#ffe060'))
    elif w == 'baton': c.line(20, 18, 26, 10, hexc('#ffe060')); c.p(26, 9, hexc('#ffffff'))
    elif w == 'cannon': c.rect(19, 17, 27, 20, hexc('#7a8a9a')); c.rect(26, 16, 27, 21, hexc('#ff5a8a'))
    elif w == 'ball': c.ell(23, 30, 3, 3, hexc('#ffffff')); c.p(23, 30, OUT); c.p(22, 29, OUT)
    elif w == 'chains': c.line(20, 16, 27, 28, hexc('#c0c0d0')); c.line(21, 16, 27, 25, hexc('#c0c0d0'))
    elif w == 'orb': c.ell(22, 18, 2, 2, hexc(sp.get('gem', '#8ae0ff')))
    if 'cape' in acc:
        cc = hexc(sp.get('capec', '#5a1a2a')); c.trap(14, 31, 5, 7, 3, 6, cc); c.trap(14, 31, 20, 22, 21, 24, cc)
    if 'skirtfrill' in acc: c.line(6, 28, 21, 28, hexc('#ffffff'))
    if 'belt' in acc: c.rect(10, 21, 17, 21, hexc(sp.get('beltc', '#ffd060')))
    return c.img()

# 카드별 외형 (참고 이미지 기반: 머리색/의상색/특징 소품). ref 없는 카드는 이름에서 연상한 오리지널 디자인
SPECS = {
 'G01': dict(hair='#d8f04a', eye='#c850ff', o1='#2a3a6a', o2='#e83a4a', style='long', body='dress', acc=['witchhat','cape'], hat='#2a2a5a', capec='#e83a4a', weapon='staff', gem='#ff6a3a', leg='#2a2a4a'),
 'G02': dict(hair='#e8e0d0', o1='#f4f0e8', o2='#3a5a9a', style='twin', body='crop', acc=['belt'], weapon='phone', ribbon='#ffd060', eye='#d89a30', skin='#ffd8c0'),
 'G03': dict(hair='#d83a5a', eye='#5ae0ff', o1='#202430', o2='#40d8ff', style='long', body='suit', acc=['visor'], maskc='#bfefff', bareArms=False, weapon=None),
 'G04': dict(hair='#a8a8b0', eye='#ffd040', o1='#ffb020', o2='#2a1a3a', style='long', body='crop', acc=['catears','headphones'], ear='#3a2a4a'),
 'G05': dict(hair='#e8ecf4', eye='#c0304a', o1='#f0f0f8', o2='#d8dce8', style='wavy', body='gown', acc=['tiara','skirtfrill'], tiarac='#c8c8d8'),
 'G06': dict(hair='#f0e8d8', eye='#e03a3a', o1='#f4f0ec', o2='#2a2a30', style='long', body='dress', acc=['bow'], ribbon='#2a2a30', weapon='sword', wc='#ff3a3a', leg='#2a2a30'),
 'G07': dict(hair='#f0d890', eye='#4a8ae0', o1='#e8e8f0', o2='#c8ccd8', style='long', body='armor', acc=['tiara'], weapon='spear', tiarac='#c8c8d8'),
 'G08': dict(hair='#b8c8d8', eye='#6ad0ff', o1='#3a4aa0', o2='#6a5ab8', style='long', body='gown', acc=['crown'], tiarac='#5a6ab8', weapon='sword', wc='#8a6ad8'),
 'G09': dict(hair='#e8e8f0', eye='#ffd040', o1='#2a4a9a', o2='#e8e0d0', style='pony', body='robe', acc=['horns'], horn='#5a4a3a', weapon='sword', wc='#e0e8ff'),
 'G10': dict(hair='#f0f0f8', eye='#e0b040', o1='#f4f4fa', o2='#d0a040', style='short', body='robe', acc=['halo'], weapon='chains'),
 'G11': dict(hair='#e890a8', eye='#c03a5a', o1='#3a2a30', o2='#2a2028', style='long', body='suit', acc=[], bareArms=False),
 'G12': dict(hair='#5ad8e0', eye='#ffffff', o1='#3a5ad8', o2='#2a2a3a', style='short', body='crop', acc=['cap'], hat='#ffffff', wink=True),
 'G13': dict(hair='#ff4a8a', eye='#ffd040', o1='#ff6ab0', o2='#2a2a3a', style='twin', body='crop', acc=['horns'], horn='#2a2a3a', ribbon='#ffd040'),
 'G14': dict(hair='#ffffff', eye='#e03a3a', o1='#f4f0f0', o2='#e83a3a', style='long', body='robe', acc=['horns','tail'], horn='#e83a3a', tailc='#e83a3a', weapon='spear', wc='#d83a3a'),
 'G15': dict(hair='#c8d8f0', eye='#6a8ad8', o1='#f0e0e8', o2='#e8c8d8', style='long', body='dress', acc=['flower'], ribbon='#ff6a9a', skin='#b8805a', closed=False),
 'G16': dict(hair='#f4d8e0', eye='#e03a5a', o1='#ffffff', o2='#ff9ab8', style='long', body='dress', acc=['horns','bow'], horn='#ffa040', ribbon='#ff5a8a', wink=True),
 'G17': dict(hair='#4a3a30', eye='#c03a3a', o1='#2a3a3a', o2='#3a4a4a', style='long', body='robe', acc=['veil'], veilc='#2a2a30', veilb='#ffffff'),
 'G18': dict(hair='#2a1a2a', eye='#ff3a3a', o1='#2a3a5a', o2='#c83a5a', style='short', body='armor', acc=['tail','mask'], maskc='#ffffff', tailc='#8a4ab8', weapon='claw'),
 'G19': dict(hair='#3a8ae0', eye='#5ab0ff', o1='#2a5ab8', o2='#ffffff', style='long', body='robe', acc=['flower'], ribbon='#a8e0a0', weapon='staff', wc='#2a2a3a', gem='#ffe080'),
 'G20': dict(hair='#f0f0f4', eye='#40c080', o1='#a8202a', o2='#e8c040', style='long', body='armor', acc=['crown','cape'], tiarac='#a8202a', capec='#1a1a2a', weapon='spear', wc='#e8c040'),
 'G21': dict(hair='#c8a8e8', eye='#ffd040', o1='#5a3a8a', o2='#8a5ab8', style='wavy', body='gown', acc=['bow'], ribbon='#2a1a3a', weapon='baton'),
 'G22': dict(hair='#f0d890', eye='#3a8ae0', o1='#3a6ab8', o2='#6a4a9a', style='twin', body='dress', acc=['wings'], wing='#e8f0d8', weapon='whip', ribbon='#ff4a4a', leg='#2a2a3a'),
 'G23': dict(hair='#4a6ad8', eye='#ffd040', o1='#3a8ac8', o2='#7ad8c8', style='short', body='suit', acc=['feathers','mask'], maskc='#c8f0ff'),
 'G24': dict(hair='#2a3a8a', eye='#5ae0d0', o1='#c8306a', o2='#ffc040', style='twin', body='suit', acc=['batwings'], wing='#2a3a6a', ribbon='#c8306a', skin='#b8805a', bareArms=False),
 'G25': dict(hair='#ff8ab0', eye='#3a9a5a', o1='#7a3a8a', o2='#ff9ac8', style='long', body='dress', acc=['witchhat','bow'], hat='#8a6ab8', hatband='#ffffff', ribbon='#ffffff', weapon='fork', leg='#c8306a'),
 'G26': dict(hair='#7a4a3a', eye='#7a4a3a', o1='#f4e8f8', o2='#ffe8f4', style='long', body='dress', acc=['sleepcap'], closed=True, leg='#ffe8e0', shoe='#ffd0e0'),
 'G27': dict(hair='#7ab0f0', eye='#3a5ad8', o1='#2a2a5a', o2='#5a3a8a', style='long', body='dress', acc=['cape','skirtfrill'], capec='#5a3ab8', leg='#f0f0ff'),
 'G28': dict(hair='#e8fff8', eye='#2ad08a', o1='#c8f4e8', o2='#e8fff8', style='long', body='slime', acc=['tiara'], tiarac='#2ad08a', skin='#e8fff4', weapon='orb', gem='#3ae09a'),
 'G29': dict(hair='#5ab8f0', eye='#ffd040', o1='#ffffff', o2='#3a8ad8', style='twin', body='suit', acc=['visor'], maskc='#c8f0ff', ribbon='#ff5a8a', weapon='ball'),
 'G30': dict(hair='#4ac84a', eye='#3a8a3a', o1='#e8e0c8', o2='#5a7a3a', style='short', body='crop', acc=['flower'], ribbon='#ffffff', weapon='bow', wc='#3a8a3a', skin='#e8b890'),
 'G31': dict(hair='#e83a2a', eye='#3ad06a', o1='#3a3a40', o2='#7ad05a', style='long', body='armor', acc=['cape'], capec='#8a8a90', weapon='sword', wc='#d8d8e0', skin='#e8b890'),
 'G32': dict(hair='#c8c8d0', eye='#e03a3a', o1='#2a1a1a', o2='#c8303a', style='long', body='gown', acc=['witchhat','cape'], hat='#1a1a1a', hatband='#c8303a', capec='#1a1a1a', weapon='scythe'),
 'G33': dict(hair='#1a1a20', eye='#ffd040', o1='#1a1a20', o2='#ffd030', style='short', body='suit', acc=['cape','catears'], ear='#1a1a20', capec='#ffd030'),
 'G34': dict(hair='#ffffff', eye='#ff3a8a', o1='#8a6a9a', o2='#ff4a8a', style='short', body='armor', acc=['visor'], maskc='#ff7ab8', weapon='cannon'),
 'G35': dict(hair='#f0d040', eye='#e03a3a', o1='#1a1a20', o2='#c8203a', style='long', body='gown', acc=['horns','batwings'], horn='#2a1a2a', wing='#2a1a2a'),
 'G36': dict(hair='#d0d0d8', eye='#c03a3a', o1='#7a1a2a', o2='#3a2a30', style='long', body='robe', acc=['veil','crown'], veilc='#5a5a60', veilb='#2a2a30', tiarac='#2a2a30', weapon='staff', wc='#2a2a30', gem='#c03a3a'),
 'G37': dict(hair='#ffffff', eye='#e03a5a', o1='#ffffff', o2='#ff9ab8', style='long', body='dress', acc=['bunny','bow'], ribbon='#e03a5a', leg='#ffffff', weapon=None),
 'G38': dict(hair='#f0e8d0', eye='#ffd040', o1='#8a2a2a', o2='#5a1a1a', style='long', body='robe', acc=['horns','wings'], horn='#3a3a3a', wing='#c8c8c0', weapon='candle'),
 'G39': dict(hair='#2a2040', eye='#c8a0ff', o1='#5a3a8a', o2='#a87ad8', style='long', body='robe', acc=['fan','tiara'], tiarac='#d0a040'),
 'G40': dict(hair='#c8e8ff', eye='#e04a4a', o1='#2a4a7a', o2='#4ac8ff', style='long', body='suit', acc=['witchhat'], hat='#1a2a4a', hatband='#4ac8ff', weapon='staff', wc='#1a2a4a', gem='#4ac8ff'),
}

def ghoul(back=False):
    # 구울즈 (레어 헌터) : 검은 후드 로브, 그늘진 얼굴에 빛나는 눈, 금색 눈 문양, 왼팔 듀얼 디스크
    c = Cv(50, 75)
    robe = hexc('#26202e'); rs = hexc('#16121c'); trim = hexc('#6a3a8a'); gold = hexc('#e0b040')
    c.trap(30, 72, 15, 34, 8, 41, robe)            # 로브 몸통
    c.trap(30, 72, 15, 18, 8, 12, rs); c.trap(30, 72, 31, 34, 37, 41, rs)
    c.line(8, 72, 41, 72, trim); c.line(8, 71, 41, 71, trim)
    c.ell(25, 18, 13, 14, robe)                     # 후드
    c.trap(26, 34, 12, 38, 10, 40, robe)            # 어깨
    if not back:
        c.ell(25, 21, 8, 9, hexc('#08060c'))         # 그늘진 얼굴
        c.rect(20, 20, 22, 21, hexc('#ffd040')); c.rect(28, 20, 30, 21, hexc('#ffd040'))  # 빛나는 눈
        c.p(21, 20, hexc('#fff8c0')); c.p(29, 20, hexc('#fff8c0'))
        c.rect(23, 6, 27, 8, gold); c.p(25, 7, hexc('#c03030')); c.p(22, 7, gold); c.p(28, 7, gold); c.p(25, 9, gold); c.p(25, 10, gold)  # 이마 눈 문양
        c.line(25, 34, 25, 70, trim)                 # 앞 트임
        c.ell(25, 42, 3, 3, gold); c.p(25, 42, hexc('#c03030'))  # 가슴 문양
        # 듀얼 디스크 (왼팔 = 화면 오른쪽, 오른쪽을 봄)
        c.rect(34, 40, 47, 43, hexc('#9aa0b0')); c.rect(36, 38, 45, 39, hexc('#c8ccd8')); c.rect(44, 41, 47, 42, hexc('#40c0ff'))
        c.rect(32, 36, 36, 46, robe)                 # 소매
        c.rect(12, 36, 17, 50, robe); c.rect(12, 50, 16, 52, hexc('#e8d0c0'))  # 다른 팔 + 손
        c.rect(38, 33, 41, 37, hexc('#f4f0e8')); c.rect(39, 34, 40, 35, hexc('#c8306a'))  # 손에 든 카드
    else:
        c.line(25, 8, 25, 70, rs); c.ell(25, 40, 5, 5, trim); c.ell(25, 40, 3, 3, gold)
        c.rect(32, 36, 37, 50, robe); c.rect(12, 36, 17, 50, robe)
    return c.img()

def main():
    os.makedirs(os.path.join(ROOT, 'monsters'), exist_ok=True); os.makedirs(os.path.join(ROOT, 'character'), exist_ok=True)
    for k, sp in SPECS.items(): girl(sp).save(os.path.join(ROOT, 'monsters', k + '.png'))
    f = ghoul().resize((100, 150), Image.NEAREST); f.save(os.path.join(ROOT, 'character', 'front.png'))
    ghoul(True).resize((100, 150), Image.NEAREST).save(os.path.join(ROOT, 'character', 'back.png'))
    p = ghoul().crop((5, 0, 45, 40)).resize((96, 96), Image.NEAREST); bg = Image.new('RGBA', (96, 96), (58, 40, 80, 255)); bg.alpha_composite(p); bg.save(os.path.join(ROOT, 'character', 'portrait.png'))
    # 확인용 시트
    sheet = Image.new('RGBA', (10 * 34, 4 * 48), (230, 230, 240, 255))
    for i, k in enumerate(SPECS):
        im = Image.open(os.path.join(ROOT, 'monsters', k + '.png')); sheet.alpha_composite(im, ((i % 10) * 34 + 3, (i // 10) * 48 + 4))
    sheet.resize((sheet.width * 3, sheet.height * 3), Image.NEAREST).save('/tmp/ghoul_sheet.png')
main()
