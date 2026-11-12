import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeMember, type MemberResponse, type Role } from '@/api/generated/homeport';
import { firstName } from '@/lib/names';
import { layout, useTheme } from '@/theme';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The roles someone in a family can be given. (The owner hands the circle over elsewhere; a guest comes by a pass.) */
export const GIVEN_ROLES = ['adult', 'teen', 'child'] as const satisfies readonly Role[];

/** Changes one person's role in a family: Adult, Teen or Child, each with what it means. */
export function RoleSheet({ member, visible, onClose }: { member: MemberResponse; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const cache = useCache();
  const change = useMutation({
    mutationFn: (role: Role) => changeMember(member.id, { role }),
    onSuccess: async (saved) => {
      await cache.memberSaved(saved);
      onClose();
    },
  });
  return (
    <Sheet visible={visible} onClose={onClose} title={words.setup.people.roleTitle(firstName(member.name))}>
      {GIVEN_ROLES.map((role, index) => (
        <SheetRow
          key={role}
          first={index === 0}
          label={words.people.roles[role]}
          note={words.setup.people.roleNotes[role]}
          trailing={member.role === role ? <Check size={20} color={colors.text} strokeWidth={2.6} /> : undefined}
          onPress={() => (member.role === role ? onClose() : change.mutate(role))}
        />
      ))}
      {change.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingTop: 8, paddingHorizontal: layout.gutter }}>
          {messageFor(change.error)}
        </Txt>
      ) : null}
    </Sheet>
  );
}
