import type { Metadata } from 'next';
import Concept from '@/components/concept/Concept';

export const metadata: Metadata = {
  title: 'On Record — Gallery Crypto',
  description: 'One of one, on record. How a Gallery Crypto piece carries its own history: the piece, the tag, the record and the story that stays with it.',
};

export default function ConceptPage() {
  return <Concept />;
}
