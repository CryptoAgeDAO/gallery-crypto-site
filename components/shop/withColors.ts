// 色展開：開いている一着の色違いを、すぐ隣に並べる（レールで色を切り替えられるように）
export function withColors<T extends { id: string; group?: string }>(list: T[], pool: T[], focusId: string | null): T[] {
  const f = focusId ? (list.find((x) => x.id === focusId) || pool.find((x) => x.id === focusId)) : null;
  if (!f) return list;
  const base = list.some((x) => x.id === f.id) ? list : [f, ...list];
  if (!f.group) return base;
  const sib = pool.filter((x) => x.group === f.group && !base.some((y) => y.id === x.id));
  if (!sib.length) return base;
  const at = base.findIndex((x) => x.id === f.id);
  return [...base.slice(0, at + 1), ...sib, ...base.slice(at + 1)];
}
