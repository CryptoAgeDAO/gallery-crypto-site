# MakeHuman (CC0) の基本メッシュを読み、体型ターゲットを当て、腕を下ろしたポーズにする
import numpy as np, json, os
D = '/home/claude/makehumancommunity/makehuman/makehuman/data'

def read_obj():
    V = []; VT = []; F = []; FT = []; G = []; g = None
    for line in open(f'{D}/3dobjs/base.obj'):
        if line.startswith('v '): V.append([float(x) for x in line.split()[1:4]])
        elif line.startswith('vt '): VT.append([float(x) for x in line.split()[1:3]])
        elif line.startswith('g '): g = line.split()[1]
        elif line.startswith('f '):
            idx = [p.split('/') for p in line.split()[1:]]
            F.append([int(a[0]) - 1 for a in idx]); FT.append([int(a[1]) - 1 if len(a) > 1 and a[1] else -1 for a in idx]); G.append(g)
    return np.array(V), np.array(VT), F, FT, G

def target(name):
    d = {}
    for line in open(f'{D}/targets/{name}.target'):
        if line[0] in '#\n': continue
        p = line.split(); d[int(p[0])] = [float(x) for x in p[1:4]]
    return d

def apply(V, mix):
    V = V.copy()
    for name, w in mix:
        for i, dv in target(name).items(): V[i] += w * np.array(dv)
    return V

MIX = [
    ('macrodetails/universal-male-young-averagemuscle-averageweight', 0.55),
    ('macrodetails/universal-male-young-maxmuscle-averageweight', 0.45),
    ('macrodetails/asian-male-young', 0.5),
    ('macrodetails/caucasian-male-young', 0.5),
    ('macrodetails/height/male-young-averagemuscle-averageweight-maxheight', 0.2),
    ('macrodetails/proportions/male-young-averagemuscle-averageweight-idealproportions', 0.8),
]

def rot(axis, ang):
    a = axis / np.linalg.norm(axis); c, s = np.cos(ang), np.sin(ang); x, y, z = a
    return np.array([[c + x*x*(1-c), x*y*(1-c) - z*s, x*z*(1-c) + y*s], [y*x*(1-c) + z*s, c + y*y*(1-c), y*z*(1-c) - x*s], [z*x*(1-c) - y*s, z*y*(1-c) + x*s, c + z*z*(1-c)]])

def rot_to(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b); ax = np.cross(a, b)
    if np.linalg.norm(ax) < 1e-9: return np.eye(3)
    return rot(ax, np.arccos(np.clip(a @ b, -1, 1)))

def build():
    V0, VT, F, FT, G = read_obj()
    V = apply(V0, [(n, w) for n, w in MIX if os.path.exists(f'{D}/targets/{n}.target')])
    sk = json.load(open(f'{D}/rigs/default.mhskel'))
    J = {k: V[v].mean(0) for k, v in sk['joints'].items()}
    bones = sk['bones']
    head = {b: J[bones[b]['head']] for b in bones}; tail = {b: J[bones[b]['tail']] for b in bones}
    W = json.load(open(f'{D}/rigs/default_weights.mhw'))['weights']
    # 局所回転（骨の根元まわり）
    R = {}
    for s, sx in (('L', 1), ('R', -1)):
        ua = f'upperarm01.{s}'
        d = tail[f'upperarm02.{s}'] - head[ua]
        want = np.array([sx * 0.16, -1.0, -0.02])
        R[ua] = rot_to(d, want)
        dl = tail[f'lowerarm02.{s}'] - head[f'lowerarm01.{s}']
        R[f'lowerarm01.{s}'] = rot_to(dl, R[ua].T @ np.array([sx * 0.08, -1.0, 0.3]))  # 肘を少し曲げる
        R[f'shoulder01.{s}'] = rot(np.array([0, 0, 1.0]), -sx * 0.05)
    # 世界変換を親から順に
    M = {}
    order = []
    def visit(b):
        if b in M: return
        p = bones[b]['parent']
        if p: visit(p)
        A = np.eye(4)
        if b in R:
            Rm = np.eye(4); Rm[:3, :3] = R[b]
            T1 = np.eye(4); T1[:3, 3] = head[b]; T2 = np.eye(4); T2[:3, 3] = -head[b]
            A = T1 @ Rm @ T2
        M[b] = (M[p] if p else np.eye(4)) @ A
    for b in bones: visit(b)
    acc = np.zeros_like(V); ws = np.zeros(len(V))
    Vh = np.c_[V, np.ones(len(V))]
    for b, lst in W.items():
        if b not in M: continue
        idx = np.array([x[0] for x in lst]); w = np.array([x[1] for x in lst])
        acc[idx] += w[:, None] * (Vh[idx] @ M[b].T)[:, :3]; ws[idx] += w
    P = V.copy(); m = ws > 1e-6
    P[m] = acc[m] / ws[m, None]
    # 骨ごとの重み（服の範囲決めに使う）
    BW = {b: dict((int(i), float(w)) for i, w in lst) for b, lst in W.items()}
    return P, VT, F, FT, G, BW, {b: (M[b] @ np.r_[head[b], 1])[:3] for b in bones}, {b: (M[b] @ np.r_[tail[b], 1])[:3] for b in bones}

if __name__ == '__main__':
    P, VT, F, FT, G, BW, H, T = build()
    body = [i for i, g in enumerate(G) if g == 'body']
    vs = sorted({v for i in body for v in F[i]})
    print('body verts', len(vs), 'bbox', P[vs].min(0), P[vs].max(0))
    print('hand L', H['wrist.L'], 'shoulder', H['upperarm01.L'])
