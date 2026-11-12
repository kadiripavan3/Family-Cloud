import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { type AlbumResponse, type Audience, type CircleResponse, createAlbum } from '@/api/generated/homeport';
import { membersOf } from '@/features/circles/members';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { newClientId } from '@/lib/ids';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Field } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  circle: CircleResponse;
  visible: boolean;
  onClose: () => void;
  /** The album exists: open it. */
  onMade: (album: AlbumResponse) => void;
};

/**
 * A new album: one filled by hand, or one that fills itself with every photo and video a person is in (a
 * child, a pet too), from who is tagged. It starts as seen by what the circle's kind says, and that can be
 * changed here.
 */
export function NewAlbumSheet(props: Props) {
  // What was typed belongs to one opening of the sheet.
  return <Making key={String(props.visible)} {...props} />;
}

function Making({ circle, visible, onClose, onMade }: Props) {
  const { colors } = useTheme();
  const cache = useCache();
  const says = words.library.albums.make;
  const draft = useRef(newClientId());
  const [name, setName] = useState('');
  const [how, setHow] = useState<'hand' | 'fills'>('hand');
  const [personId, setPersonId] = useState<string | null>(null);
  const [audience, setAudience] = useState<Audience>(circle.startsAs);
  const [missing, setMissing] = useState<string | null>(null);

  const make = useMutation({
    mutationFn: () => createAlbum({ clientId: draft.current, circleId: circle.id, title: name.trim(), audience, personId: how === 'fills' ? (personId ?? undefined) : undefined }),
    onSuccess: async (album) => {
      await cache.albumMade(album);
      onMade(album);
    },
  });
  const failed = make.error instanceof ApiError ? make.error : null;
  const create = () => {
    if (!name.trim()) return setMissing(says.needName);
    if (how === 'fills' && !personId) return setMissing(says.needPerson);
    setMissing(null);
    make.mutate();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={says.title}>
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter, paddingTop: 4 }}>
        <Field label={says.name} value={name} onChangeText={setName} maxLength={200} error={failed?.fields.title} />
        <Segmented
          label={says.how}
          options={[
            { id: 'hand', label: says.byHand },
            { id: 'fills', label: says.fills },
          ]}
          value={how}
          onChange={setHow}
          style={{ marginHorizontal: 0 }}
        />
        <Txt variant="footnote" color="muted" style={{ marginHorizontal: 4 }}>
          {how === 'hand' ? says.byHandNote : says.fillsNote}
        </Txt>
      </View>
      {how === 'fills' ? (
        <View accessibilityRole="radiogroup" accessibilityLabel={says.whose} style={{ marginTop: 6 }}>
          {membersOf(circle).map((member) => {
            const on = personId === member.id;
            return (
              <Pressable
                key={member.id}
                accessibilityRole="radio"
                accessibilityLabel={member.name}
                accessibilityState={{ checked: on }}
                // Said this way, a browser hears which one is chosen as well: the web takes no `accessibilityState`.
                aria-checked={on}
                onPress={() => {
                  setPersonId(member.id);
                  if (!name.trim()) setName(firstName(member.name));
                }}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingVertical: 6, paddingHorizontal: layout.gutter, backgroundColor: pressed ? colors.fill : 'transparent' })}>
                <Avatar uri={member.avatarUrl} name={member.name} size={34} />
                <Txt variant="item" weight={600} numberOfLines={1} style={{ flex: 1 }}>
                  {member.name}
                </Txt>
                <View style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 0 : 2, borderColor: colors.lineStrong, backgroundColor: on ? colors.accent : 'transparent' }}>
                  {on ? <Check size={15} color={colors.onAccent} strokeWidth={3} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      <View style={{ gap: 12, paddingHorizontal: layout.rowGutter, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4 }}>
          <Txt variant="caption" color="muted">
            {words.things.seenBy}
          </Txt>
          <StartsAsPill circle={circle} value={audience} onChange={setAudience} />
        </View>
        {missing || (make.isError && !failed?.fields.title) ? (
          <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: 4 }}>
            {missing ?? messageFor(make.error)}
          </Txt>
        ) : null}
        <Button label={says.create} size="lg" block loading={make.isPending} onPress={create} />
      </View>
    </Sheet>
  );
}
