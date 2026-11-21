'use client';
// サイト全体のカート：どのページからでも入れられて、右下のボタンからいつでも開ける。
// 中身はこの端末に保存（商品の名前・価格・絵・色・サイズを一緒に覚えるので、どのページでも表示できる）。
// 見本は入れられるが購入はできない（販売は2027年から）。決済できる商品は、カートから一点ずつカード／Apple Pay で。
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useLang } from '../Lang';
import BuyButton from '../BuyButton';
import { sfx } from '@/lib/sfx';

export type CartLine = { id: string; title: string; price: string; yen: number; src: string; code?: string; buy: 'stripe' | 'demo' | 'sold' | 'local'; color?: string; hex?: string; size?: string; photo?: boolean };
type Ctx = { lines: CartLine[]; add: (l: CartLine, quiet?: boolean) => void; toast: CartLine | null; remove: (id: string) => void; has: (id: string) => boolean; open: () => void; close: () => void; isOpen: boolean };
const CartCtx = createContext<Ctx | null>(null);
const KEY = 'gc-cart-v2', OLD = 'gc-shop-cart';
export const yenOf = (s: string) => Number(String(s).replace(/[^0-9]/g, '')) || 0;

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [isOpen, setOpen] = useState(false);
  const [toast, setToast] = useState<CartLine | null>(null); // その場で入れたときの小さな知らせ
  useEffect(() => { if (!toast) return; const h = setTimeout(() => setToast(null), 2600); return () => clearTimeout(h); }, [toast]);
  // 読み込み・ほかのタブとの同期
  useEffect(() => {
    const read = () => { try { setLines(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { /* 無視 */ } };
    read(); try { localStorage.removeItem(OLD); } catch { /* 無視 */ }
    const on = (e: StorageEvent) => { if (e.key === KEY) read(); };
    addEventListener('storage', on); return () => removeEventListener('storage', on);
  }, []);
  const save = (next: CartLine[]) => { setLines(next); try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 容量オーバーは無視 */ } };
  const add = useCallback((l: CartLine, quiet = false) => {
    setLines((cur) => { const next = cur.some((x) => x.id === l.id) ? cur : [...cur, l]; try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 無視 */ } return next; });
    sfx('coin'); if (quiet) setToast(l); else setOpen(true);
  }, []);
  const remove = useCallback((id: string) => save(lines.filter((x) => x.id !== id)), [lines]); // eslint-disable-line react-hooks/exhaustive-deps
  const value = useMemo<Ctx>(() => ({ lines, add, toast, remove, has: (id) => lines.some((x) => x.id === id), open: () => setOpen(true), close: () => setOpen(false), isOpen }), [lines, add, toast, remove, isOpen]);
  return <CartCtx.Provider value={value}>{children}<CartUI /></CartCtx.Provider>;
}

export function useCart(): Ctx {
  const c = useContext(CartCtx);
  return c || { lines: [], toast: null, add: () => undefined, remove: () => undefined, has: () => false, open: () => undefined, close: () => undefined, isOpen: false };
}

// 「カートに入れる」ボタン（どのページでも同じもの）
export function AddToCart({ line, className = '' }: { line: CartLine; className?: string }) {
  const { t } = useLang();
  const { add, has, open } = useCart();
  if (line.buy === 'sold') return null;
  const inCart = has(line.id);
  return (
    <button className={`gc-add ${inCart ? 'in' : ''} ${className}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (inCart) open(); else add(line); }}>
      {inCart ? t('In your cart ✓', 'カートに入っています ✓') : t('Add to cart', 'カートに入れる')}
    </button>
  );
}

// 触れた場所ですぐ入れる小さなボタン（カードなどボタンの中にも置けるよう span で作る）（レールの服・カード・ホームの作品など）。カートは開かず、下に知らせを出す
export function QuickAdd({ line, className = '' }: { line: CartLine; className?: string }) {
  const { t } = useLang();
  const { add, has, open } = useCart();
  if (line.buy === 'sold') return null;
  const inCart = has(line.id);
  return (
    <span role="button" tabIndex={0} className={`gc-quick ${inCart ? 'in' : ''} ${className}`} aria-label={inCart ? t('In your cart — open cart', 'カートに入っています（開く）') : t(`Add ${line.title} to cart`, `${line.title} をカートに入れる`)}
      onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (inCart) open(); else add(line, true); }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); if (inCart) open(); else add(line, true); } }}>
      <svg viewBox="0 0 24 24" aria-hidden><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
      <span>{inCart ? '✓' : '+'}</span>
    </span>
  );
}

function CartUI() {
  const { t } = useLang();
  const { lines, remove, isOpen, open, close, toast } = useCart() as Ctx;
  const path = usePathname() || '';
  useEffect(() => { if (!isOpen) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); }; addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [isOpen, close]);
  // 管理画面では出さない
  if (path.startsWith('/admin')) return null;
  const total = lines.reduce((a, l) => a + l.yen, 0);
  const buyable = lines.filter((l) => l.buy === 'stripe');
  return (
    <>
      {path !== '/shop' && <button className={`gc-fab ${lines.length ? 'has' : ''}`} onClick={open} aria-label={t('Open cart', 'カートを開く')}>
        <svg viewBox="0 0 24 24" aria-hidden><path d="M5 8h14l-1.2 12H6.2z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></svg>
        {lines.length > 0 && <i>{lines.length}</i>}
      </button>}
      {toast && !isOpen && (
        <div className="gc-toast" role="status">
          <span className={`gc-timg ${toast.photo ? 'photo' : ''}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={toast.src} alt="" /></span>
          <span><b>{t('Added to cart', 'カートに入れました')}</b><small>{toast.title}</small></span>
          <button onClick={open}>{t('View', '見る')} ({lines.length})</button>
        </div>
      )}
      {isOpen && <div className="gc-dim" onClick={close} />}
      <aside className={`gc-cart ${isOpen ? 'on' : ''}`} aria-hidden={!isOpen} role="dialog" aria-label={t('Cart', 'カート')}>
        <div className="gc-ch"><b>{t('Cart', 'カート')} <span>({lines.length})</span></b><button onClick={close} aria-label={t('Close', '閉じる')}>×</button></div>
        {!lines.length && <p className="gc-empty">{t('Your cart is empty. Add pieces from the shop, the rail or the showroom.', 'カートは空です。ショップ・レール・ショールームのどこからでも入れられます。')}</p>}
        <div className="gc-lines">
          {lines.map((l) => (
            <div key={l.id} className="gc-line">
              <span className={`gc-limg ${l.photo ? 'photo' : ''}`}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={l.src} alt="" /></span>
              <span className="gc-linfo">
                <b>{l.title}</b>
                <small>{[l.code, l.color && <span key="c" className="gc-sw"><i style={{ background: l.hex }} />{l.color}</span>, l.size].filter(Boolean).map((x, k) => <span key={k}>{x}</span>)}</small>
                <em>{l.price}{l.buy === 'demo' || l.buy === 'local' ? <span className="gc-sample"> · {t('Sample', '見本')}</span> : null}</em>
              </span>
              <button className="gc-rm" onClick={() => remove(l.id)}>{t('Remove', '削除')}</button>
            </div>
          ))}
        </div>
        {lines.length > 0 && (
          <div className="gc-foot">
            <div className="gc-sum"><span>{t('Subtotal', '小計')}</span><b>¥{total.toLocaleString('ja-JP')}</b></div>
            {buyable.map((l) => <BuyButton key={l.id} itemId={l.id} label={t(`Checkout — ${l.title}`, `${l.title} を購入`)} />)}
            {lines.some((l) => l.buy !== 'stripe') && <p className="gc-note">{t('Samples cannot be bought. Checkout opens with sales in 2027 (card / Apple Pay).', '見本は購入できません。決済は2027年の販売開始から（カード／Apple Pay）。')}</p>}
            <a className="gc-shop" href="/shop" onClick={close}>{t('Keep shopping', '買い物を続ける')} →</a>
          </div>
        )}
      </aside>
    </>
  );
}
