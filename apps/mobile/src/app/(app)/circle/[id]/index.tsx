import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Clock, Link, Shapes, Users } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { changeCircle, renewJoinLink } from '@/api/generated/homeport';
import { useCircles, useSwitchCircle } from '@/features/circles/current';
import { circleLine } from '@/features/circles/members';
import { NotFound } from '@/features/states/NotFound';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { GroupLabel } from '@/ui/Heading';
import { LinkBox } from '@/ui/LinkBox';
import { Row, RowGroup } from '@/ui/Rows';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * A circle's own settings, reached from "Your circles" on You: its name, its kind (2.6), its people, its
 * guest passes, and the link that lets someone join. The people who run the circle can change these;
 * everyone else in it can look.
 */
export default function CircleSettings() {
  const { colors } = useTheme();
  const router = useRouter();
  const cache = useCache();
  const switchTo = useSwitchCircle();
  const { id } = useLocalSearchParams<{ id: string }>();
  const circle = useCircles().find((one) => one.id === id);
  const [typed, setTyped] = useState<string | null>(null);
  const [renewing, setRenewing] = useState(false);
  const says = words.circles.settings;

  const rename = useMutation({
    mutationFn: (name: string) => changeCircle(id, { name }),
    onSuccess: async (saved) => {
      setTyped(null);
      await cache.circleChanged(saved);
    },
  });
  const renew = useMutation({
    mutationFn: () => renewJoinLink(id),
    onSuccess: async (saved) => {
      setRenewing(false);
      await cache.circleChanged(saved);
    },
  });
  if (!circle) return <NotFound />;

  const name = typed ?? circle.name;
  const failed = rename.error instanceof ApiError ? rename.error : null;
  const changed = name.trim().length > 0 && name.trim() !== circle.name;
  /** People and guest passes are about the current circle: opening them from here makes this one current. */
  const openIn = (to: Parameters<typeof router.push>[0]) => {
    switchTo(circle.id);
    router.push(to);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AvoidKeyboard style={{ flex: 1 }}>
        <AppBar title={says.title} subtitle={circleLine(circle)} />
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={{ gap: 10, paddingTop: 6, paddingHorizontal: layout.rowGutter }}>
            <Field label={says.name} value={name} onChangeText={setTyped} maxLength={40} autoCapitalize="words" editable={circle.iRunIt} error={failed?.fields.name ?? (rename.isError ? messageFor(rename.error) : null)} />
            {changed ? <Button label={says.save} loading={rename.isPending} onPress={() => rename.mutate(name.trim())} /> : null}
          </View>

          <View style={{ marginTop: 16 }}>
            <RowGroup>
              <Row first icon={(c) => <Shapes size={18} color={c} />} label={says.kind} value={words.kinds[circle.kind].name} onPress={() => router.push({ pathname: '/circle/[id]/kind', params: { id: circle.id } })} />
              <Row icon={(c) => <Users size={18} color={c} />} label={says.people} value={String(circle.members.filter((member) => member.status !== 'left').length)} onPress={() => openIn('/people')} />
              {circle.iRunIt ? <Row icon={(c) => <Clock size={18} color={c} />} label={says.passes.label} note={says.passes.note} onPress={() => openIn('/guest-passes')} /> : null}
            </RowGroup>
          </View>

          {circle.joinUrl ? (
            <>
              <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.link}</GroupLabel>
              <LinkBox url={circle.joinUrl} icon={(c) => <Link size={18} color={c} />} style={{ marginHorizontal: layout.barGutter }} />
              <Txt variant="footnote" color="muted" style={{ marginTop: 8, marginHorizontal: layout.gutter }}>
                {says.linkNote}
              </Txt>
              <Button label={says.newLink} variant="soft" size="sm" onPress={() => setRenewing(true)} style={{ marginTop: 10, marginLeft: layout.barGutter }} />
            </>
          ) : (
            <Txt variant="footnote" color="muted" style={{ marginTop: 14, marginHorizontal: layout.gutter }}>
              {says.notYours}
            </Txt>
          )}
        </ScrollView>
      </AvoidKeyboard>
      <ConfirmSheet
        visible={renewing}
        onClose={() => setRenewing(false)}
        title={says.newLinkAsk.title}
        body={says.newLinkAsk.body}
        confirm={says.newLinkAsk.confirm}
        busy={renew.isPending}
        problem={renew.isError ? messageFor(renew.error) : null}
        onConfirm={() => renew.mutate()}
      />
    </SafeAreaView>
  );
}
