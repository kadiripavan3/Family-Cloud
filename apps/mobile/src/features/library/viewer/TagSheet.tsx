import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type CircleResponse, type PersonBrief, saveAbout } from '@/api/generated/homeport';
import { membersOf } from '@/features/circles/members';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  /** The photo or video. */
  item: { id: string; circleId: string; canEdit?: boolean };
  /** Who is in it now. */
  about: readonly PersonBrief[];
  circle: CircleResponse;
  visible: boolean;
  onClose: () => void;
};

/**
 * Who is in it? Everyone in the circle, pets and children without a phone too, each with a box to tick.
 * This is how "every photo she is in" works: tags made by hand, never faces. Saving sends the whole list.
 */
export function TagSheet(props: Props) {
  // What was ticked belongs to this photo and to this opening of the sheet.
  return <Tagging key={`${props.item.id}-${props.visible}`} {...props} />;
}

function Tagging({ item, about, circle, visible, onClose }: Props) {
  const { colors } = useTheme();
  const cache = useCache();
  const says = words.library.viewer.tag;
  const [chosen, setChosen] = useState<string[]>(() => about.flatMap((one) => (one.memberId ? [one.memberId] : [])));
  const save = useMutation({
    mutationFn: () => saveAbout(item.id, { memberIds: chosen }),
    onSuccess: async () => {
      await cache.photoTagged(item);
      onClose();
    },
  });
  const toggle = (memberId: string) => setChosen((now) => (now.includes(memberId) ? now.filter((one) => one !== memberId) : [...now, memberId]));
  const may = item.canEdit !== false;

  return (
    <Sheet visible={visible} onClose={onClose} title={says.title} subtitle={may ? says.note : says.viewOnly}>
      {membersOf(circle).map((member, index) => {
        const on = chosen.includes(member.id);
        return (
          <Pressable
            key={member.id}
            accessibilityRole="checkbox"
            accessibilityLabel={member.name}
            accessibilityState={{ checked: on, disabled: !may }}
            // Said this way, a browser hears whether it is ticked as well: the web takes no `accessibilityState`.
            aria-checked={on}
            disabled={!may}
            onPress={() => toggle(member.id)}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 8, paddingHorizontal: layout.gutter, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line, backgroundColor: pressed ? colors.fill : 'transparent' })}>
            <Avatar uri={member.avatarUrl} name={member.name} size={40} />
            <Txt variant="headline" weight={600} numberOfLines={1} style={{ flex: 1 }}>
              {member.name}
            </Txt>
            <View style={{ width: 26, height: 26, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: on ? colors.accent : 'transparent' }}>
              {on ? <Check size={16} color={colors.onAccent} strokeWidth={3} /> : null}
            </View>
          </Pressable>
        );
      })}
      {save.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingTop: 10 }}>
          {messageFor(save.error)}
        </Txt>
      ) : null}
      {may ? (
        <View style={{ paddingHorizontal: layout.rowGutter, paddingTop: 14 }}>
          <Button label={says.save} size="lg" block loading={save.isPending} onPress={() => save.mutate()} />
        </View>
      ) : null}
    </Sheet>
  );
}
