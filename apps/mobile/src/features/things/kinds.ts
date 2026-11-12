import { Bell, Calendar, File, FileText, Gift, IdCard, Image, Images, KeyRound, type LucideIcon, Receipt, SquareCheck, Table, Target, Video } from 'lucide-react-native';

import { words } from '@/words';

/**
 * The icon of each kind of thing, by the name the API gives the kind. The one small map behind `ThingRow`:
 * a kind that is missing here gets the plain file icon, so a place adds a line when its kind has its own
 * (and its word in `words.things`, which falls back the same way).
 */
const ICONS: Record<string, LucideIcon> = {
  page: FileText,
  checklist: SquareCheck,
  event: Calendar,
  reminder: Bell,
  goal: Target,
  photo: Image,
  video: Video,
  file: File,
  document: File,
  album: Images,
  moment: Images,
  bill: Receipt,
  sheet: Table,
  vault_item: KeyRound,
  password: KeyRound,
  id: IdCard,
  keepsake: Gift,
};

/** A kind's icon and what it is called: `name` on its own ("Page"), `a` in a sentence ("a page"). */
export function kindOf(kind: string | null | undefined): { icon: LucideIcon; name: string; a: string } {
  return { icon: ICONS[kind ?? ''] ?? File, ...words.things.kind(kind) };
}
