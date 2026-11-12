import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Camera, ChevronRight, Globe, Image as ImageIcon, type LucideIcon, Mail, Map, MessageCircle } from 'lucide-react-native';
import { type ReactNode, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { changeChecklistItem, useGetWidgets, type WidgetLineResponse, type WidgetsResponse } from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { OnPhoto, OnPhotoNote } from '@/features/jot/OnPhoto';
import { phoneNow } from '@/features/jot/phone';
import { useJotting } from '@/features/jot/useJotting';
import { JotWidget, ListWidget, TodayWidget } from '@/features/jot/Widgets';
import { PageProblem } from '@/features/states/PageProblem';
import { useOpenThing } from '@/features/things/open';
import { newClientId } from '@/lib/ids';
import { loadState } from '@/lib/loading';
import { radius, useTheme, withAlpha } from '@/theme';
import { BrandMark, JourneyMark } from '@/ui/Brand';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * 14.1 Widgets on the Home Screen, as the app shows them: the three widgets drawn from what the real ones
 * get (`getWidgets`), on a picture of a Home Screen. They work here: a chip adds in one tap, a circle
 * ticks, and the line opens the jot bar (neither phone lets you type inside a widget). On the Home Screen
 * itself they are native code, written in native/jot and first run on a phone build; the quiet line says so.
 */
export default function Widgets() {
  const circle = useCircle();
  const asked = useGetWidgets(circle.id, phoneNow());
  const load = loadState(asked);
  return (
    <OnPhoto photo="lake" shade="light">
      {load.error ? <PageProblem tone="onPhoto" error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} /> : !asked.data ? <Loading tone="onPhoto" offline={load.offline} /> : <HomeScreen widgets={asked.data} />}
    </OnPhoto>
  );
}

function HomeScreen({ widgets }: { widgets: WidgetsResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const cache = useCache();
  const open = useOpenThing();
  const { file } = useJotting(circle.id);
  /** The chip that was added last, and where it went: said in the quiet line. */
  const [added, setAdded] = useState<{ chip: string; where: string } | null>(null);
  const clientId = useRef(newClientId());

  const addChip = (chip: string) =>
    file.mutate(
      { text: chip, source: 'widget', clientId: clientId.current },
      {
        onSuccess: (made) => {
          clientId.current = newClientId();
          setAdded({ chip, where: made[0]?.where ?? widgets.shopping?.title ?? words.jot.widgets.shopping });
        },
      },
    );
  const tick = useMutation({
    mutationFn: (line: WidgetLineResponse) => changeChecklistItem(line.id, { done: !line.done }),
    onSettled: () => (widgets.shopping ? cache.checklistLineChanged({ id: widgets.shopping.id, circleId: circle.id }) : undefined),
  });
  const problem = [file, tick].find((one) => one.isError)?.error;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingTop: 6, paddingBottom: 26 }}>
      <View style={{ gap: 16, marginHorizontal: 18 }}>
        <JotWidget circle={circle} chips={widgets.chips} justAdded={added?.chip} adding={file.isPending ? file.variables?.text : null} onChip={addChip} onLine={() => router.push('/jot')} onMic={() => router.push('/jot/voice')} />
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <ListWidget list={widgets.shopping} onTick={(line) => tick.mutate(line)} onOpen={() => (widgets.shopping ? open({ kind: 'checklist', id: widgets.shopping.id }) : undefined)} />
          <TodayWidget day={widgets.day} next={widgets.next} onOpen={(line) => open({ kind: line.kind, id: line.thingId })} />
        </View>
      </View>

      {/* The rest of the Home Screen is scenery: this app beside its sister, and two of the phone's own. */}
      <View accessible={false} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 34, marginHorizontal: 26 }}>
        <App label={words.jot.widgets.apps.own}>
          <BrandMark size={62} />
        </App>
        <App label={words.setup.bringIn.journey.label}>
          <JourneyMark size={62} />
        </App>
        <App label={words.jot.widgets.apps.camera} icon={Camera} />
        <App label={words.jot.widgets.apps.mail} icon={Mail} />
      </View>

      <View style={{ gap: 10, marginTop: 22, marginHorizontal: 18 }}>
        <OnPhotoNote>
          <Txt variant="footnote" color="onPhoto" accessibilityLiveRegion="polite">
            {problem ? messageFor(problem) : added ? words.jot.widgets.added(added.chip, added.where) : words.jot.widgets.standIn}
          </Txt>
        </OnPhotoNote>
        <Tap accessibilityRole="button" accessibilityLabel={words.jot.widgets.lock} onPress={() => router.push('/jot/lock')} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingLeft: 14, paddingRight: 10, borderRadius: radius.pill, backgroundColor: colors.photoGlass, borderWidth: 1, borderColor: colors.photoGlassLine }}>
          <Txt variant="caption" weight={700} color="onPhoto">
            {words.jot.widgets.lock}
          </Txt>
          <ChevronRight size={15} color={colors.onPhoto} />
        </Tap>
      </View>

      <View style={{ flex: 1, minHeight: 24 }} />
      <View accessible={false} style={{ flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: 12, paddingVertical: 14, paddingHorizontal: 8, borderRadius: radius.sheet, backgroundColor: withAlpha(colors.white, 0.16), borderWidth: 1, borderColor: withAlpha(colors.white, 0.16) }}>
        {[MessageCircle, Globe, ImageIcon, Map].map((Icon, index) => (
          <Glass key={index} icon={Icon} />
        ))}
      </View>
    </ScrollView>
  );
}

/** Another app's icon: a pane of glass with a picture on it. */
function Glass({ icon: Icon }: { icon: LucideIcon }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: 62, height: 62, borderRadius: radius.field, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(colors.white, 0.2) }}>
      <Icon size={30} color={colors.white} />
    </View>
  );
}

/** An app on the Home Screen: its icon over its name. */
function App({ label, icon, children }: { label: string; icon?: LucideIcon; children?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      {icon ? <Glass icon={icon} /> : children}
      <Txt variant="tiny" weight={600} color="onPhoto">
        {label}
      </Txt>
    </View>
  );
}
