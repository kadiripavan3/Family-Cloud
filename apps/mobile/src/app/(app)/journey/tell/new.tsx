import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { messageFor } from '@/api/fetcher';
import { changeJourneyDraft, draftJourney } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { takeOnly } from '@/features/journeyLink/tell/start';
import { NotFound } from '@/features/states/NotFound';
import { looksLikeId } from '@/features/things/open';
import { newClientId } from '@/lib/ids';
import { useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Problem } from '@/ui/Problem';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * The first step of "Tell it as a journey" (10.5): `/journey/tell/new?moment=<a photo of it>` or
 * `?album=<id>`. The API drafts the journey (the photos sorted into days, a title, a first line for each
 * day) and this screen gives way to the draft. When the select screen handed over what was picked, the rest
 * of the moment or album is left out of the draft. Nothing is sent to Journey here.
 */
export default function TellNew() {
  const { moment, album, circle: circleParam } = useLocalSearchParams<{ moment?: string; album?: string; circle?: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const current = useCircle();
  const clientId = useRef(newClientId());
  const only = useRef(takeOnly());
  // What it is drafted from: an album when one is named, else the moment a photo belongs to.
  const albumId = looksLikeId(album) ? album : undefined;
  const momentOf = !albumId && looksLikeId(moment) ? moment : undefined;
  const from = !!albumId || !!momentOf;
  const circleId = looksLikeId(circleParam) ? (circleParam ?? current.id) : current.id;

  const draft = useMutation({
    mutationFn: async () => {
      const made = await draftJourney({ clientId: clientId.current, circleId, albumId, momentOf });
      const picked = only.current;
      if (!picked) return { id: made.id, left: 0 };
      // Only what was picked stays in: the rest of the moment is left out, and what isn't in it is counted.
      const inDraft = made.days.flatMap((day) => day.items ?? []).flatMap((item) => (item.itemId ? [item.itemId] : []));
      const drop = inDraft.filter((itemId) => !picked.has(itemId));
      if (drop.length) await changeJourneyDraft(made.id, { drop });
      return { id: made.id, left: [...picked].filter((itemId) => !inDraft.includes(itemId)).length };
    },
    onSuccess: ({ id, left }) => router.replace({ pathname: '/journey/tell/[id]', params: left ? { id, left: String(left) } : { id } }),
  });
  const { mutate } = draft;
  const asked = useRef(false);
  useEffect(() => {
    if (from && !asked.current) {
      asked.current = true;
      mutate();
    }
  }, [from, mutate]);

  if (!from) return <NotFound />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar leading="close" title={words.together.tell.title} />
      {draft.isError ? (
        <Problem message={messageFor(draft.error)} onRetry={() => draft.mutate()} retrying={draft.isPending} />
      ) : (
        <View accessibilityLiveRegion="polite" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
          <ActivityIndicator color={colors.muted} />
          <Txt variant="callout" color="muted">
            {words.together.tell.sorting}
          </Txt>
        </View>
      )}
    </SafeAreaView>
  );
}
