import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { joinCircle, usePreviewJoin } from '@/api/generated/homeport';
import { switchCircle } from '@/features/circles/current';
import { useFinishSetup } from '@/features/circles/useFinishSetup';
import { PageProblem } from '@/features/states/PageProblem';
import { loadState } from '@/lib/loading';
import { layout, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Blob } from '@/ui/Blob';
import { Button } from '@/ui/Button';
import { Heading, Lead } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * An invitation to a circle, opened by its link (`/join/<code>`): which circle it is, how many are in it,
 * and one button to join. Joining makes it the current circle and opens Home on it; that is also the moment
 * the question about notifications waits for (`AskAboutNotifications`). A link for a circle the person is
 * in already just opens that circle.
 */
export default function Join() {
  const { colors } = useTheme();
  const cache = useCache();
  const finish = useFinishSetup();
  const { code } = useLocalSearchParams<{ code: string }>();
  const asked = usePreviewJoin(code);
  const load = loadState(asked);
  const preview = asked.data;

  const open = (circleId: string) => {
    switchCircle(circleId);
    finish();
  };
  const join = useMutation({
    mutationFn: () => joinCircle(code),
    onSuccess: async (circle) => {
      await cache.circleJoined(circle);
      open(circle.id);
    },
  });

  const kind = words.kinds[preview?.kind ?? 'family'];
  const name = preview?.name ?? '';
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar leading="close" />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : !preview ? (
        <Loading offline={load.offline} />
      ) : (
        <>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: layout.rowGutter, paddingBottom: 40 }}>
            <Blob emoji={kind.emoji} size={140} />
            <Heading center style={{ marginTop: 18 }}>
              {preview.alreadyIn ? words.setup.join.already(name) : words.setup.join.title(name)}
            </Heading>
            <Lead center>{preview.alreadyIn ? words.setup.join.alreadyBody : words.setup.join.lead(words.common.join([kind.name, words.circles.people(preview.people ?? 1)]))}</Lead>
          </View>
          <View style={{ gap: 10, paddingBottom: 12, paddingHorizontal: layout.rowGutter }}>
            {join.isError ? (
              <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite">
                {messageFor(join.error)}
              </Txt>
            ) : null}
            {preview.alreadyIn ? (
              <Button label={words.setup.join.open(name)} size="lg" block onPress={() => open(preview.circleId ?? '')} />
            ) : (
              <Button label={words.setup.join.join} size="lg" block loading={join.isPending} onPress={() => join.mutate()} />
            )}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}
