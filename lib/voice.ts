// 音声：読み上げ（ブラウザの音声合成）と、声での入力（ブラウザの音声認識）。
// 音声認識はブラウザの機能を使う。Chrome などでは音声がブラウザ提供元のサーバーで文字に変換される。
type Rec = { lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number; start: () => void; stop: () => void; abort: () => void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
type RecCtor = new () => Rec;

export const canSpeak = () => typeof window !== 'undefined' && 'speechSynthesis' in window;
export const canListen = () => typeof window !== 'undefined' && !!((window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor }).SpeechRecognition || (window as unknown as { webkitSpeechRecognition?: RecCtor }).webkitSpeechRecognition);

let last = { text: '', at: 0 };
let voice: SpeechSynthesisVoice | null = null;
const pickVoice = (lang: string) => { const vs = speechSynthesis.getVoices(); return vs.find((v) => v.lang === lang && /Kyoko|O-ren|Otoya|Google/.test(v.name)) || vs.find((v) => v.lang === lang) || vs.find((v) => v.lang.startsWith(lang.slice(0, 2))) || null; };

// iPhone はボタンを押したときに一度鳴らしておくと、その後も読み上げられる
export function unlockSpeech() { if (!canSpeak()) return; try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch { /* 無視 */ } }

// 読み上げ。同じ言葉は gap ミリ秒のあいだ繰り返さない。urgent は今の読み上げを止めて割り込む
export function speak(text: string, opt: { lang?: string; gap?: number; urgent?: boolean; rate?: number } = {}) {
  if (!canSpeak() || !text) return;
  const lang = opt.lang || (document.documentElement.lang === 'en' ? 'en-US' : 'ja-JP');
  const now = performance.now();
  if (text === last.text && now - last.at < (opt.gap ?? 4000)) return;
  if (speechSynthesis.speaking && !opt.urgent) { if (now - last.at < 1600) return; }
  last = { text, at: now };
  try {
    if (opt.urgent) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = opt.rate ?? 1.05;
    voice = voice && voice.lang === lang ? voice : pickVoice(lang); if (voice) u.voice = voice;
    speechSynthesis.speak(u);
  } catch { /* 無視 */ }
}
export const hush = () => { try { if (canSpeak()) speechSynthesis.cancel(); } catch { /* 無視 */ } };

// 声で入力：話し終わったら最終の文字を返す。途中の文字は onPart に
export function listen(onFinal: (t: string) => void, onPart?: (t: string) => void, onState?: (s: 'on' | 'off' | 'error', err?: string) => void, lang?: string) {
  const W = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  const C = W.SpeechRecognition || W.webkitSpeechRecognition; if (!C) { onState?.('error', 'unsupported'); return () => undefined; }
  const r = new C(); r.lang = lang || (document.documentElement.lang === 'en' ? 'en-US' : 'ja-JP'); r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
  r.onresult = (e) => { let fin = '', part = ''; for (let i = 0; i < e.results.length; i++) { const x = e.results[i]; if (x.isFinal) fin += x[0].transcript; else part += x[0].transcript; } if (part) onPart?.(part); if (fin) onFinal(fin); };
  r.onerror = (e) => onState?.('error', e.error);
  r.onend = () => onState?.('off');
  try { r.start(); onState?.('on'); } catch { onState?.('error', 'start'); }
  return () => { try { r.stop(); } catch { /* 無視 */ } };
}
