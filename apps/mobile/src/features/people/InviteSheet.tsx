import { useRouter } from 'expo-router';
import { ChevronRight, Clock, Link, UserPlus } from 'lucide-react-native';

import type { CircleResponse } from '@/api/generated/homeport';
import { layout, useTheme } from '@/theme';
import { GroupLabel } from '@/ui/Heading';
import { LinkBox } from '@/ui/LinkBox';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { words } from '@/words';

type Props = { circle: CircleResponse; visible: boolean; onClose: () => void; onAdd: () => void };

/**
 * "Invite someone": the ways in for someone new. Someone who belongs in the circle is added (by email, or a
 * child or a pet without a phone) or sent the link to join; someone who doesn't, a sitter for one evening,
 * gets a guest pass.
 */
export function InviteSheet({ circle, visible, onClose, onAdd }: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const arrow = <ChevronRight size={18} color={colors.muted} />;
  return (
    <Sheet visible={visible} onClose={onClose} title={words.people.invite}>
      <SheetRow
        first
        icon={(c) => <UserPlus size={22} color={c} />}
        label={words.setup.people.add.label}
        note={words.setup.people.add.note}
        trailing={arrow}
        onPress={() => {
          onClose();
          onAdd();
        }}
      />
      <SheetRow
        icon={(c) => <Clock size={22} color={c} />}
        label={words.people.pass.new.label}
        note={words.people.pass.new.note}
        trailing={arrow}
        onPress={() => {
          onClose();
          router.push('/guest-pass/new');
        }}
      />
      {circle.joinUrl ? (
        <>
          <GroupLabel style={{ marginTop: 14, marginHorizontal: layout.gutter }}>{words.circles.settings.link}</GroupLabel>
          <LinkBox url={circle.joinUrl} icon={(c) => <Link size={18} color={c} />} style={{ marginHorizontal: layout.barGutter }} />
        </>
      ) : null}
    </Sheet>
  );
}
