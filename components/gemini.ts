// Gemini（Google の AI）で、服の写真から設計（Spec）を予測し、変換案をつくる。
// API キーは本人が入力し、この端末のブラウザにだけ保存する。サーバーには送らない。
import { SPEC_SCHEMA, specFromAI, type Spec } from './patternSpec';
import type { Measures } from './pattern';

export const DEFAULT_MODEL = 'gemini-3.5-flash';

async function call(key: string, model: string, parts: unknown[], schema: unknown, temperature: number) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: { message?: string } }).error?.message || `HTTP ${r.status}`);
  const text = (j as { candidates?: { content?: { parts?: { text?: string }[] } }[] }).candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  return JSON.parse(text);
}

function jpeg(c: HTMLCanvasElement, max = 1024) {
  const k = Math.min(1, max / Math.max(c.width, c.height));
  const d = document.createElement('canvas');
  d.width = Math.round(c.width * k); d.height = Math.round(c.height * k);
  d.getContext('2d')!.drawImage(c, 0, 0, d.width, d.height);
  return d.toDataURL('image/jpeg', 0.88).split(',')[1];
}

const FIELDS = 'length=着丈(HPS to hem), chest=身幅(flat, armpit to armpit), hem=裾幅(flat), shoulder=肩幅, armhole=袖ぐりの深さ(shoulder line to armpit, vertical), neckW=衿ぐり幅, neckF=前衿ぐりの深さ, neckB=後ろ衿ぐりの深さ, sleeve=袖丈(shoulder point to cuff), bicep=袖幅(flat), cuff=袖口幅(flat)';

// 写真から、作り（袖の付け方・衿・フード・ポケット・リブ）と寸法を予測する
export async function analyze(key: string, model: string, photo: HTMLCanvasElement, m: Measures): Promise<Spec | null> {
  const prompt = `You are an expert pattern maker. The photo shows one garment (flat lay or on a hanger).
1) Identify its construction: sleeve type (setin, raglan, drop shoulder, or none), neckline (crew, v, mock, boat), hood, pocket, rib hem, rib cuffs, hem shape.
2) Estimate flat measurements in cm. The real body length is ${m.length} cm — use it as the scale reference.
A rough automatic measurement from the outline is: ${JSON.stringify(m)}. Correct values that look wrong for this garment type (for example shoulder width, neck width, armhole depth, sleeve width are often off).
Fields: ${FIELDS}.
Return the garment as it is (name "Original", nameJa "原型"), with no splits, and a short Japanese note (nameJa/note in Japanese) describing what you identified.`;
  const raw = await call(key, model, [{ text: prompt }, { inline_data: { mime_type: 'image/jpeg', data: jpeg(photo) } }], SPEC_SCHEMA, 0.2);
  return specFromAI(raw, m);
}

// 変換案をつくる（指示があればそれに従う）
export async function propose(key: string, model: string, photo: HTMLCanvasElement | null, base: Spec, count: number, instruction: string): Promise<Spec[]> {
  const prompt = `You are the design director of GALLERY CRYPTO, a studio that takes vintage garments sourced in the US and deconstructs and reconstructs them into one-of-a-kind pieces (reference points: deconstruction and reconstruction, music culture, sculptural oversized silhouettes).
The base garment spec (measurements in cm) is: ${JSON.stringify(base)}.
${instruction ? `The designer asks: "${instruction}". Follow this request closely.` : `Propose ${count} distinct, wearable transformations that a skilled sewer can make from this base.`}
You may change: measurements, sleeve type (setin/raglan/drop/none; "drop" uses "drop" cm), neckline, hood, pocket, hem shape (straight/curved/asym/slits with hemAmount cm), rib hem/cuffs, and "splits" = seam lines that cut a pattern piece into panels (piece front/back/sleeve, dir h or v, at 0.1–0.9) — use splits for patchwork or panel reconstruction from several vintage garments.
Keep proportions realistic. For each design give a short English name, a Japanese name (nameJa), and a Japanese note (note) explaining the design intent and the key sewing steps in 2–3 sentences.
Return ${instruction ? 1 : count} design${instruction ? '' : 's'} as a JSON array.`;
  const parts: unknown[] = [{ text: prompt }];
  if (photo) parts.push({ inline_data: { mime_type: 'image/jpeg', data: jpeg(photo, 768) } });
  const raw = await call(key, model, parts, { type: 'ARRAY', items: SPEC_SCHEMA }, 0.9);
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.map((r) => specFromAI(r, base.m)).filter((x): x is Spec => !!x);
}

// 再構築デザイン（操作の組み合わせ）を AI に考えてもらう
import { DESIGN_SCHEMA, designFromAI, type Design } from './recon';
export async function proposeDesigns(key: string, model: string, photo: HTMLCanvasElement | null, summary: Record<string, number>, count: number, instruction: string, hasB: boolean): Promise<Design[]> {
  const prompt = `You are the design director of GALLERY CRYPTO, a Tokyo studio that deconstructs vintage garments sourced in the US and rebuilds them into one-of-a-kind pieces. References: deconstruction and reconstruction, raw edges, splicing several garments, music culture, sculptural and oversized silhouettes. Be bold but sewable.
The photo is garment A. Its pattern was traced from the photo: ${JSON.stringify(summary)} (cm). ${hasB ? 'The designer also has a second vintage garment B to splice in.' : 'Fabric B means any second vintage garment or contrast fabric.'}
Build each design as a list of operations applied to the traced pattern:
- scale {chest, length}: fractions, e.g. 0.15 = +15%
- crop {at 0.35–1 of length, angle degrees for a diagonal hem}
- split {piece front/back/sleeve, dir h (across) / v (down) / d (diagonal), at 0.1–0.9, fabric of the new panel A/B} — panels for patchwork
- half {fabric}: the left half of the front becomes fabric B
- widen {cm, fabric}: side panels that add width at each side seam
- godet {count, h cm, w cm, fabric}: triangles inserted into the hem to flare it
- extend {cm, fabric}: hem extension (layered look)
- sleeveExtend {cm, fabric}: lengthen the sleeves with another fabric
- sleeveless, hood {fabric}, pocket {fabric}, swap (use the back as the front)
${instruction ? `The designer asks: "${instruction}". Make exactly 1 design that follows it closely, combining as many operations as needed.` : `Make ${count} clearly different designs, each combining 2–5 operations.`}
For each design give an English name, a Japanese name (nameJa), and a Japanese note (2–3 sentences: the idea and the key sewing steps).
Return a JSON array.`;
  const parts: unknown[] = [{ text: prompt }];
  if (photo) parts.push({ inline_data: { mime_type: 'image/jpeg', data: jpeg(photo, 768) } });
  const raw = await call(key, model, parts, { type: 'ARRAY', items: DESIGN_SCHEMA }, 0.95);
  return (Array.isArray(raw) ? raw : [raw]).map(designFromAI).filter((d): d is Design => !!d);
}
