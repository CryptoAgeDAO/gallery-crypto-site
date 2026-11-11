# 最小の glb 書き出し（位置・法線・頂点色・インデックス、メッシュごとに名前）
import json, struct, numpy as np

def normals(P, T):
    n = np.zeros_like(P)
    fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
    for k in range(3): np.add.at(n, T[:, k], fn)
    l = np.linalg.norm(n, axis=1, keepdims=True); l[l == 0] = 1
    return n / l

def write(path, meshes):
    """meshes: list of dict(name, P (n,3), T (m,3) int, C optional (n,3) 0..1, UV optional)"""
    bin_ = bytearray(); views = []; accs = []; gm = []; nodes = []
    def add(arr, target, comp, typ, minmax=False):
        nonlocal bin_
        b = arr.tobytes(); off = len(bin_); bin_ += b
        while len(bin_) % 4: bin_ += b'\0'
        views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(b), **({'target': target} if target else {})})
        a = {'bufferView': len(views) - 1, 'componentType': comp, 'count': arr.shape[0], 'type': typ}
        if minmax: a['min'] = arr.min(0).tolist(); a['max'] = arr.max(0).tolist()
        accs.append(a); return len(accs) - 1
    for m in meshes:
        P = m['P'].astype(np.float32); T = m['T'].astype(np.uint32)
        N = m.get('N'); N = (N if N is not None else normals(m['P'], m['T'])).astype(np.float32)
        attrs = {'POSITION': add(P, 34962, 5126, 'VEC3', True), 'NORMAL': add(N, 34962, 5126, 'VEC3')}
        if m.get('C') is not None: attrs['COLOR_0'] = add(m['C'].astype(np.float32), 34962, 5126, 'VEC3')
        if m.get('UV') is not None: attrs['TEXCOORD_0'] = add(m['UV'].astype(np.float32), 34962, 5126, 'VEC2')
        ind = add(T.reshape(-1), 34963, 5125, 'SCALAR')
        gm.append({'name': m['name'], 'primitives': [{'attributes': attrs, 'indices': ind}]})
        nodes.append({'name': m['name'], 'mesh': len(gm) - 1})
    doc = {'asset': {'version': '2.0', 'generator': 'gallery-crypto mh', 'copyright': 'Body mesh: MakeHuman (CC0)'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': gm, 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}]}
    js = json.dumps(doc, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_)
    open(path, 'wb').write(out)
    return len(out)
