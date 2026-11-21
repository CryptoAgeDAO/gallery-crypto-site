// 見本の作品の絵（背景なしの切り抜き）と、作品の種類の見分け方。ショップとショールームで共通に使う。
import { renderToStaticMarkup } from 'react-dom/server';
import { ProjectPic } from '../HubArt';
import { PROJECTS } from '@/lib/hub';
import type { ShopItem } from './types';
import { realGarment } from './garmentArt';
import { accArt } from './accArt';
import { LINE } from '@/lib/catalog';

export type Kind = 'garment' | 'cap' | 'art';

const svgUrl = (m: string) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m);
export function cutout(pid: string, side: 'front' | 'back' = 'front') {
  // 見本ライン（約100点）
  const li = LINE.findIndex((x) => x.id === pid);
  if (li >= 0) {
    const l = LINE[li];
    if (l.draw) return svgUrl(realGarment(l.draw, li + 40, side));
    return side === 'back' || !l.acc ? '' : svgUrl(accArt(l.acc, li + 40));
  }
  const p = PROJECTS.find((x) => x.id === pid);
  if (!p) return '';
  // 服は布の陰影つきの絵に、それ以外は元の図
  if (side === 'back' && !p.draw?.tour) return '';
  const m = p.draw ? realGarment(p.draw, PROJECTS.indexOf(p) + 3, side) : renderToStaticMarkup(<ProjectPic p={p} />).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="550" ');
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m);
}

export const kindOf = (i: ShopItem): Kind => (i.acc ? 'cap' : i.zone === 'art' ? 'art' : i.zone === 'rwa' || /cap/i.test(i.sub) ? 'cap' : 'garment');
