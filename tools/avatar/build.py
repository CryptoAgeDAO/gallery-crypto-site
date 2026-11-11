# 試着モデル用の人体と服（MakeHuman CC0 の体から作る）を glb に書き出す
import numpy as np, json, sys
import load, glb

P, VT, F, FT, G, BW, H, T = load.build()
F = [np.array(f) for f in F]

def tris(face_ids):
    out = []
    for i in face_ids:
        f = F[i]
        out.append([f[0], f[1], f[2]])
        if len(f) == 4: out.append([f[0], f[2], f[3]])
    return np.array(out)

def sub(Tri):
    vs = np.unique(Tri); remap = -np.ones(len(P), int); remap[vs] = np.arange(len(vs))
    return vs, remap[Tri]

def wsum(names, n=len(P)):
    w = np.zeros(n)
    for b in names:
        for i, x in BW.get(b, {}).items(): w[i] += x
    return w

bodyF = [i for i, g in enumerate(G) if g == 'body']
bodyT = tris(bodyF)
NB = glb.normals(P, bodyT)

# 体の基準の高さ
floor = P[np.unique(bodyT)][:, 1].min()
neck_y = H['neck01'][1]
hip_y = H['pelvis.L'][1]
knee_y = H['lowerleg01.L'][1]
ankle_y = H['foot.L'][1]
chest_y = neck_y - 1.7
crotch_y = H['upperleg01.L'][1] - 0.35
print('floor', floor, 'neck', neck_y, 'hip', hip_y, 'crotch', crotch_y, 'knee', knee_y, 'ankle', ankle_y)

arm = wsum([f'{b}.{s}' for s in 'LR' for b in ['upperarm01', 'upperarm02', 'lowerarm01', 'lowerarm02', 'wrist', 'metacarpal1', 'metacarpal2', 'metacarpal3', 'metacarpal4'] + [f'finger{a}-{c}' for a in range(1, 6) for c in range(1, 4)]])
leg = wsum([f'{b}.{s}' for s in 'LR' for b in ['upperleg01', 'upperleg02', 'lowerleg01', 'lowerleg02']])
foot = wsum([f'{b}.{s}' for s in 'LR' for b in ['foot'] + [f'toe{a}-{c}' for a in range(1, 6) for c in range(1, 4)]])
headw = wsum(['head', 'neck02', 'neck03', 'jaw'] + [b for b in BW if b.startswith(('oris', 'oculi', 'orbicularis', 'levator', 'risorius', 'temporalis', 'special', 'tongue', 'eye'))])

def along(v, a, b):
    d = b - a; return ((v - a) @ d) / (d @ d)

# 袖：肩から肘の少し先まで（オーバーサイズ）
sleeve = np.zeros(len(P), bool)
for s in 'LR':
    a = H[f'upperarm01.{s}']; e = H[f'lowerarm01.{s}']
    t = along(P, a, e)
    sleeve |= (t < 1.05)
inT = (P[:, 1] < neck_y + 0.15) & (P[:, 1] > crotch_y - 0.7) & (headw < 0.5) & ((arm < 0.5) | sleeve) & (foot < 0.1)
inPants = (P[:, 1] < hip_y + 0.9) & (P[:, 1] > ankle_y - 0.05) & (arm < 0.3) & (foot < 0.5)
inShoe = (P[:, 1] < ankle_y + 0.45) & (leg + foot > 0.5)

def region(mask):
    keep = [i for i in bodyF if mask[F[i]].all()]
    return tris(keep)

def adjacency(Tri, n):
    nb = [set() for _ in range(n)]
    for a, b, c in Tri:
        nb[a] |= {b, c}; nb[b] |= {a, c}; nb[c] |= {a, b}
    return [np.array(sorted(x)) for x in nb]

def shell(mask, off, iters, push=None, keep_out=0.06):
    Tri = region(mask)
    vs, t = sub(Tri)
    Q = P[vs] + NB[vs] * off(P[vs])[:, None]
    base = P[vs]; nrm = NB[vs]
    nb = adjacency(t, len(vs))
    bnd = np.zeros(len(vs), bool)
    # ふち（穴の縁）は動かしすぎない
    from collections import Counter
    ec = Counter()
    for a, b, c in t:
        for e in ((a, b), (b, c), (c, a)): ec[tuple(sorted(e))] += 1
    for (a, b), k in ec.items():
        if k == 1: bnd[a] = bnd[b] = True
    for it in range(iters):
        avg = np.array([Q[x].mean(0) if len(x) else Q[i] for i, x in enumerate(nb)])
        lam = np.where(bnd, 0.25, 0.6)[:, None]
        Q = Q + lam * (avg - Q)
        if push is not None: Q = push(Q)
        # 体の中に入らないように
        d = ((Q - base) * nrm).sum(1)
        low = d < keep_out
        Q[low] += nrm[low] * (keep_out - d[low])[:, None]
    return vs, t, Q, bnd

# ── Tシャツ（オーバーサイズ、胸から下はまっすぐ落ちる）──
axis_t = np.array([0, 0, 0.15])
cr = None
def push_tee(Q):
    y = Q[:, 1]
    # 胴：胸より下は、胸の太さのまま箱形に落とす
    torso = (np.abs(Q[:, 0]) < 2.15)
    dx = Q[:, 0]; dz = Q[:, 2] - axis_t[2]
    r = np.hypot(dx * 0.92, dz * 1.35)
    th = np.arctan2(dz, dx)
    want = np.where(y < chest_y, 1.95 + 0.18 * np.clip((chest_y - y) / 3, 0, 1), 0)
    m = torso & (r < want)
    k = want[m] / np.maximum(r[m], 1e-6)
    Q[m, 0] *= k; Q[m, 2] = axis_t[2] + dz[m] * k
    return Q
vs_t, t_t, Q_t, b_t = shell(inT, lambda B: 0.22 + 0.18 * np.clip((chest_y - B[:, 1]) / 4, 0, 1), 90, push_tee, 0.15)

# ── パンツ（ワイド、裾はくるぶし）──
def push_pants(Q):
    for s, sx in (('L', 1), ('R', -1)):
        a = H[f'upperleg01.{s}']; b = H[f'foot.{s}']
        m = (np.sign(Q[:, 0]) == sx) & (Q[:, 1] < crotch_y + 0.6)
        t = np.clip(along(Q[m], a, b), 0, 1)
        c = a + (b - a) * t[:, None]
        v = Q[m] - c; v[:, 1] = 0
        r = np.linalg.norm(v, axis=1)
        want = 1.06 + 0.06 * t
        k = np.maximum(1, want / np.maximum(r, 1e-6))
        Q[m] = c + v * k[:, None] + (Q[m] - c) * [0, 1, 0]
        # 内股が中心を越えないように
        Q[m, 0] = sx * np.maximum(sx * Q[m, 0], 0.04)
    return Q
vs_p, t_p, Q_p, b_p = shell(inPants, lambda B: 0.1 + 0.05 * np.clip((hip_y - B[:, 1]) / 6, 0, 1), 60, push_pants, 0.08)
# すそをまっすぐに
hem = b_t & (Q_t[:, 1] < crotch_y + 0.6)
Q_t[hem, 1] = Q_t[hem, 1].max() if hem.any() else 0
hp = b_p & (Q_p[:, 1] < knee_y)
Q_p[hp, 1] = ankle_y - 0.05
# 裾を床近くまで伸ばし、たまらせる
low = Q_p[:, 1] < ankle_y + 0.3
Q_p[low, 1] -= 0.25

# ── スニーカー（厚底）──
def push_shoe(Q): return Q
vs_s, t_s, Q_s, b_s = shell(inShoe, lambda B: np.full(len(B), 0.14), 6, None, 0.12)
for s, sx in (('L', 1), ('R', -1)):
    m = np.sign(Q_s[:, 0]) == sx
    c = P[np.unique(region(inShoe))][:, :].mean(0)
    fc = H[f'foot.{s}']
    Q_s[m, 0] = fc[0] + (Q_s[m, 0] - fc[0]) * 1.18
    Q_s[m, 2] = fc[2] + (Q_s[m, 2] - fc[2]) * 1.06 + 0.05
yb = Q_s[:, 1]
sole = yb < floor + 0.35
Q_s[:, 1] = np.where(yb < floor + 0.5, yb - 0.28 * (1 - np.clip((yb - floor) / 0.5, 0, 1)), yb)
new_floor = Q_s[:, 1].min()
C_s = np.where((Q_s[:, 1] < new_floor + 0.32)[:, None], [0.82, 0.8, 0.77], [0.38, 0.38, 0.4])

# ── 肌の色（眉・唇・頭）──
vs_b, t_b = sub(bodyT)
Pb = P[vs_b]
lin = lambda c: np.power(np.array(c), 2.2)
skin = lin([0.70, 0.50, 0.39])
C_b = np.tile(skin, (len(vs_b), 1))
# 顔の基準（目）
eL = P[np.unique(tris([i for i, g in enumerate(G) if g == 'helper-l-eye']))]
ec = eL.mean(0); ey, ez = ec[1], ec[2]
lips = wsum(['oris01', 'oris02', 'oris03.L', 'oris03.R', 'oris04.L', 'oris04.R', 'oris05', 'oris06', 'oris06.L', 'oris06.R', 'oris07.L', 'oris07.R'])[vs_b]
C_b = C_b + (lin([0.66, 0.42, 0.38]) - C_b) * np.clip(lips * 0.7, 0, 0.55)[:, None]
# 眉
x, y, z = Pb[:, 0], Pb[:, 1], Pb[:, 2]
bx = np.abs(np.abs(x) - (ec[0] + 0.02))
browk = np.clip(1 - bx / 0.36, 0, 1) ** 0.5 * np.clip(1 - np.abs(y - (ey + 0.2 + 0.03 * (1 - bx / 0.36))) / 0.1, 0, 1) * (z > ez - 0.25)
print('brow verts', int((browk > 0.3).sum()))
C_b = C_b + (lin([0.07, 0.05, 0.04]) - C_b) * np.clip(browk * 1.4, 0, 0.95)[:, None]
# 刈り上げ（頭の横と後ろ、上から下へ薄くなる）
hc = Pb[Pb[:, 1] > Pb[:, 1].max() - 1.2].mean(0)
back = z < hc[2] + 0.25 - 0.9 * np.clip((y - (ey + 0.25)) / 0.4, 0, 1) * 0
face = (z > ez - 0.55) & (y < ey + 0.45)
fade = np.clip((y - (ey - 0.75)) / 0.55, 0, 1) * ~face * (np.abs(x) < 0.95) * (y > ey - 1.0)
ear = (np.abs(x) > 0.62) & (y < ey + 0.15) & (y > ey - 0.6) & (z > hc[2] - 0.35) & (z < hc[2] + 0.2)
fade = fade * ~ear
C_b = C_b + (lin([0.035, 0.03, 0.028]) - C_b) * np.clip(fade * 1.15, 0, 0.97)[:, None]
# ── 髪（短い刈り上げ）、まつ毛、目 ──
def group(name):
    return tris([i for i, g in enumerate(G) if g == name])
hairT = group('helper-hair')
vs_h, t_h = sub(hairT)
lashT = np.concatenate([group(f'helper-{s}-eyelashes-2') for s in 'lr'])
vs_l, t_l = sub(lashT)
eyes = []
for s in 'lr':
    eT = group(f'helper-{s}-eye'); vs_e, t_e = sub(eT)
    Pe = P[vs_e]; c = Pe.mean(0); r = np.linalg.norm(Pe - c, axis=1).max()
    eyes.append({'c': c.tolist(), 'r': float(r)})

meta = {
    'floor': float(new_floor), 'top': float(Pb[:, 1].max()),
    'headCenter': Pb[(Pb[:, 1] > Pb[:, 1].max() - 1.2)].mean(0).tolist(),
    'headWidth': float(np.ptp(Pb[(Pb[:, 1] > Pb[:, 1].max() - 1.0) & (Pb[:, 1] < Pb[:, 1].max() - 0.8)][:, 0])),
    'eyes': eyes, 'chest': [float(chest_y)],
}
print(json.dumps(meta))
size = glb.write(sys.argv[1] if len(sys.argv) > 1 else 'avatar.glb', [
    {'name': 'skin', 'P': Pb, 'T': t_b, 'C': C_b},
    {'name': 'lashes', 'P': P[vs_l], 'T': t_l},
    {'name': 'tee', 'P': Q_t, 'T': t_t},
    {'name': 'pants', 'P': Q_p, 'T': t_p},
    {'name': 'shoes', 'P': Q_s, 'T': t_s, 'C': C_s},
])
json.dump(meta, open('avatar.json', 'w'))
print('bytes', size, 'verts', len(Pb), len(Q_t), len(Q_p), len(Q_s))
