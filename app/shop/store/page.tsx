import { redirect } from 'next/navigation';

// ハンガーの売り場はやめ、ショールームひとつにまとめた。古いリンクはショールームへ送る
export default function Moved() {
  redirect('/shop/room');
}
