import { useRouter } from 'expo-router';
import { Check, ImagePlus, Video } from 'lucide-react-native';
import { View } from 'react-native';

import { useCircle } from '@/features/circles/current';
import { placeHref } from '@/features/home/places';
import { pickForLibrary } from '@/features/library/adding/pick';
import { type AddingLine, useAdding } from '@/features/library/adding/useAdding';
import { viewerHref } from '@/features/library/narrow';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Lead } from '@/ui/Heading';
import { Photo } from '@/ui/Photo';
import { ProgressBar } from '@/ui/ProgressBar';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.library.adding;

/**
 * /new/photos, one of the ten things the + sheet opens: photos and videos chosen from this device go into
 * the current circle's Library at full size. On a phone that is the photo picker; in a browser, the file
 * chooser stands in for the camera roll. Each file's fingerprint is checked first, so one that is in the
 * Library already is said to be there instead of being sent again. They start as seen by whoever the +
 * sheet said, or else by what the circle's kind says.
 */
export default function NewPhotos() {
  const router = useRouter();
  const circle = useCircle();
  const [audience, setAudience] = useStartsAs(circle);
  const adding = useAdding(circle.id, audience);
  // Leaving while files are going up asks first: what is on its way would be dropped.
  const unsaved = useUnsaved(adding.busy);
  const { lines } = adding;
  const done = lines.length > 0 && !adding.busy;
  const settled = lines.filter((line) => line.state === 'added' || line.state === 'already' || line.state === 'failed').length;

  const choose = async () => adding.add(await pickForLibrary());

  return (
    <Screen
      header={<AppBar leading="close" title={says.title} trailing={<View style={{ width: 40 }} />} />}
      footer={
        lines.length === 0 ? (
          <Button label={says.choose} size="lg" block icon={(c) => <ImagePlus size={19} color={c} />} onPress={() => void choose()} />
        ) : (
          <>
            {done && adding.added + adding.already > 0 ? <Button label={says.seeWall} size="lg" block onPress={() => router.dismissTo(placeHref('library'))} /> : null}
            {done && adding.failed > 0 ? <Button label={says.retry} size="lg" block variant="line" onPress={adding.retry} /> : null}
            <Button label={says.more} size="lg" block variant="soft" disabled={adding.busy} onPress={() => void choose()} />
          </>
        )
      }>
      <Lead style={{ marginTop: 4 }}>{says.lead(circle.name)}</Lead>
      <Txt variant="footnote" color="muted" style={{ marginTop: 6 }}>
        {says.types}
      </Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <Txt variant="caption" color="muted">
          {words.things.seenBy}
        </Txt>
        {/* Who sees them is said when they are added: once the first is on its way, it stays as it is. */}
        <View pointerEvents={lines.length > 0 ? 'none' : 'auto'} style={{ opacity: lines.length > 0 ? 0.6 : 1 }}>
          <StartsAsPill circle={circle} value={audience} onChange={setAudience} />
        </View>
      </View>

      {lines.length > 0 ? (
        <View accessibilityLiveRegion="polite" style={{ marginTop: 18 }}>
          <Txt variant="item">{done ? says.summary(adding.added, adding.already, adding.failed) : says.progress(settled, lines.length)}</Txt>
        </View>
      ) : null}
      <View style={{ marginTop: 6 }}>
        {lines.map((line) => (
          <Line key={line.clientId} line={line} onOpen={line.itemId && (line.state === 'added' || line.state === 'already') ? () => router.push(viewerHref({ id: line.itemId ?? '', kind: line.picked.kind })) : undefined} />
        ))}
      </View>
      <ConfirmSheet visible={unsaved.asking} onClose={unsaved.stay} title={says.stopAsk.title} body={says.stopAsk.body} confirm={says.stopAsk.confirm} cancel={says.stopAsk.cancel} onConfirm={unsaved.leave} />
    </Screen>
  );
}

/** One chosen file: its picture, its name, how far it has got, and a way to open it once it is in the Library. */
function Line({ line, onOpen }: { line: AddingLine; onOpen?: () => void }) {
  const { colors } = useTheme();
  const { picked, state } = line;
  const said =
    state === 'failed'
      ? (line.problem ?? words.states.unknown)
      : state === 'uploading'
        ? says.state.uploading(Math.round(line.progress * 100))
        : state === 'waiting'
          ? says.state.waiting
          : state === 'checking'
            ? says.state.checking
            : state === 'adding'
              ? says.state.adding
              : state === 'added'
                ? says.state.added
                : says.state.already;
  const settled = state === 'added' || state === 'already';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7 }}>
      {picked.kind === 'photo' ? (
        <Photo uri={picked.uri} radius="thumb" style={{ width: 60, height: 60 }} />
      ) : (
        <View style={{ width: 60, height: 60, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>
          <Video size={22} color={colors.muted} />
        </View>
      )}
      <View style={{ flex: 1, gap: 3 }}>
        <Txt variant="item" numberOfLines={1}>
          {picked.name}
        </Txt>
        {state === 'uploading' || state === 'adding' ? (
          <View style={{ marginTop: 4, marginBottom: 2 }}>
            <ProgressBar fraction={line.progress} />
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          {settled ? <Check size={14} color={colors.ok} strokeWidth={2.6} /> : null}
          <Txt variant="footnote" numberOfLines={2} style={{ flex: 1, color: state === 'failed' ? colors.danger : colors.muted }}>
            {said}
          </Txt>
        </View>
      </View>
      {onOpen ? <Button label={words.library.adding.openShort} spoken={says.open(picked.name)} size="sm" variant="soft" inline onPress={onOpen} /> : null}
    </View>
  );
}
