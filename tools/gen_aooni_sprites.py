"""아오오니 스프라이트 생성기 — 사용자 제공 원본 시트(assets/aooni/아오오니.png, 256x512 = 4x4칸, 칸 64x128)를 잘라 게임용으로 변환
행: 0 앞(정면 걷기 4프레임) / 1 왼쪽 옆 / 2 오른쪽 옆 / 3 뒤.  열: 0 서기, 1 걸음, 2 서기, 3 걸음 (RPG 쯔꾸르 배치)
python3 tools/gen_aooni_sprites.py → assets/aooni/
  front.png  앞 걷기 4프레임 (선택 화면·잔상 기본 그림)      back.png      뒤 서기 1프레임 (엔진 기본 뒷모습)
  walk_back.png 뒤 걷기 4프레임    side_l.png / side_r.png  옆 걷기 4프레임 (원본 왼쪽·오른쪽 행 그대로)
  slam.png / hurt.png 는 팔·머리가 넓어져 칸 56x84 (발 중심 동일)
  slam.png   지면 내리치기: 앞 서기 그림에서 두 팔을 양옆으로 쫙 벌린 변형 (+ 코드의 웅크림·도약·내리찍기) 1프레임
  hurt.png   피격: 앞 서기 그림에서 머리를 살짝 젖힌 변형 1프레임
  portrait.png 얼굴 부분 (원본 해상도 56x56)
원본을 0.8배로 고품질 축소(알파 곱 Lanczos, 알파는 0/255로 정리) → 한 칸 48x84, 게임 배율 1 (내부 2배 캔버스에서 정수 배율)
원본 파일은 수정하지 않음"""
from PIL import Image
import numpy as np, os, sys, math
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) if len(sys.argv) < 2 else sys.argv[1]
SRC = os.path.join(ROOT, 'assets', 'aooni', '아오오니.png')
OUT = os.path.join(ROOT, 'assets', 'aooni')
CW, CH = 64, 128          # 원본 한 칸
WIN_W, TOP, BOT = 60, 22, 127   # 자를 창 (발 중심 기준 가로 60, 세로 22..127 = 105)
K = 0.8                   # 축소 배율 → 48 x 84
FW, FH = round(WIN_W * K), round((BOT - TOP) * K)
FOOTX = {0: 33, 1: 33, 2: 31, 3: 33}  # 행별 발 중심 (원본 칸 좌표)

sheet = Image.open(SRC).convert('RGBA')
def cell(r, c): return sheet.crop((c * CW, r * CH, c * CW + CW, r * CH + CH))
def window(img, r, ww=WIN_W, ox=0):
    x0 = FOOTX[r] + ox - ww // 2
    out = Image.new('RGBA', (ww, BOT - TOP), (0, 0, 0, 0))
    out.alpha_composite(img.crop((max(0, x0), TOP, min(img.width, x0 + ww), BOT)), (max(0, -x0), 0))
    return out
def shrink(img):
    a = np.asarray(img).astype(np.float64) / 255.0
    al = a[..., 3:4]; pre = np.concatenate([a[..., :3] * al, al], -1)
    chans = [np.asarray(Image.fromarray((pre[..., i] * 255).astype(np.float32), 'F').resize((round(img.width * K), FH), Image.LANCZOS)) / 255 for i in range(4)]
    p = np.clip(np.stack(chans, -1), 0, 1); A = p[..., 3:4]
    rgb = np.where(A > 1e-4, p[..., :3] / np.maximum(A, 1e-4), 0)
    out = np.concatenate([np.clip(rgb, 0, 1), (A >= 0.5).astype(np.float64)], -1)
    out[out[..., 3] == 0] = 0
    return Image.fromarray((out * 255 + 0.5).astype(np.uint8), 'RGBA')
def strip(frames):
    s = Image.new('RGBA', (FW * len(frames), FH), (0, 0, 0, 0))
    for i, f in enumerate(frames): s.alpha_composite(f, (i * FW, 0))
    return s

def swing_arm(img, side, deg, ox=0):
    """팔(어깨 포함)만 마스크로 떼어 어깨 관절을 축으로 회전해 몸 뒤에 다시 붙이고, 떼어낸 자리의 몸통 가장자리에 1px 외곽선을 그림 (원본 해상도)"""
    a = np.asarray(img).copy(); h, w = a.shape[:2]
    ys, xs = np.mgrid[0:h, 0:w]
    m = (a[..., 3] > 0) & (ys >= 77) & (ys <= 99) & ((xs <= 19 + ox) if side < 0 else (xs >= 46 + ox))
    piv = (18 + ox, 79) if side < 0 else (46 + ox, 79)
    part = np.zeros_like(a); part[m] = a[m]; a[m] = 0
    P = Image.fromarray(part, 'RGBA').rotate(deg, resample=Image.BICUBIC, center=piv)
    pa = np.asarray(P).copy(); pa[..., 3] = np.where(pa[..., 3] >= 128, 255, 0); pa[pa[..., 3] == 0] = 0
    edge = (a[..., 3] > 0) & np.roll(m, -side, axis=1)  # 떼어낸 팔 바로 옆의 몸통 픽셀
    a[edge, :3] = (18, 14, 40)
    out = Image.fromarray(pa, 'RGBA'); out.alpha_composite(Image.fromarray(a, 'RGBA')); return out  # 팔은 몸 뒤로

PAD = 8  # 팔이 칸 밖으로 나가도 잘리지 않게 좌우 여백
def padded(img):
    o = Image.new('RGBA', (CW + PAD * 2, CH), (0, 0, 0, 0)); o.alpha_composite(img, (PAD, 0)); return o
def slam_frame():
    f = padded(cell(0, 0))
    # 원본 칸 좌표: 왼팔 x<=19 / 오른팔 x>=46, 어깨 y77~손 y99. 어깨(18,79)/(46,79)를 축으로 양팔을 바깥으로 벌림
    f = swing_arm(f, -1, -38, PAD); f = swing_arm(f, 1, 38, PAD)
    return f
def hurt_frame():
    f = cell(0, 0); a = np.asarray(f).copy()
    head = np.zeros_like(a); head[0:79] = a[0:79]; a[0:79] = 0
    H = Image.fromarray(head, 'RGBA').rotate(11, resample=Image.BICUBIC, center=(33, 78), translate=(-2, 2))
    hb = np.asarray(H).copy(); hb[..., 3] = np.where(hb[..., 3] >= 128, 255, 0); H = Image.fromarray(hb, 'RGBA')
    base = Image.fromarray(a, 'RGBA'); base.alpha_composite(H); return base

if __name__ == '__main__':
    rows = {r: [shrink(window(cell(r, c), r)) for c in range(4)] for r in range(4)}
    strip(rows[0]).save(os.path.join(OUT, 'front.png'))
    rows[3][0].save(os.path.join(OUT, 'back.png'))
    strip(rows[3]).save(os.path.join(OUT, 'walk_back.png'))
    strip(rows[1]).save(os.path.join(OUT, 'side_l.png'))
    strip(rows[2]).save(os.path.join(OUT, 'side_r.png'))
    shrink(window(slam_frame(), 0, 70, PAD)).save(os.path.join(OUT, 'slam.png'))
    shrink(window(hurt_frame(), 0, 70)).save(os.path.join(OUT, 'hurt.png'))
    cell(0, 0).crop((5, 22, 61, 78)).save(os.path.join(OUT, 'portrait.png'))
    print('frame', FW, FH)
