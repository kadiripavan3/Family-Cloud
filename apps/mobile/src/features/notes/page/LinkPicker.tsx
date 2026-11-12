import { Search } from 'lucide-react-native';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type ThingBrief, type ThingKind, useGetLinkableInfinite } from '@/api/generated/homeport';
import { kindOf } from '@/features/things/kinds';
import { ThingRow } from '@/features/things/ThingRow';
import { loadState } from '@/lib/loading';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Problem } from '@/ui/Problem';
import { Sheet } from '@/ui/Sheet';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

import { paged, rows } from '../pages';

type Props = {
  /** The kind of thing to choose. Null while the sheet is shut. */
  kind: ThingKind | null;
  circleId: string;
  /** Things that can't be chosen: the page itself can't be shown on itself. */
  except?: readonly string[];
  onClose: () => void;
  onChoose: (thing: ThingBrief) => void;
};

/**
 * Chooses the thing a live block shows (or the list a list block draws): the circle's things of one kind
 * that the person may see, last changed first, narrowed by words from their titles.
 */
export function LinkPicker({ kind, ...rest }: Props) {
  return (
    <Sheet visible={!!kind} onClose={rest.onClose} title={kind ? words.notes.blocks.pick.title(kindOf(kind).a) : undefined} tall>
      {kind ? <Choices kind={kind} {...rest} /> : null}
    </Sheet>
  );
}

function Choices({ kind, circleId, except = [], onChoose }: Omit<Props, 'kind'> & { kind: ThingKind }) {
  const { colors } = useTheme();
  const [typed, setTyped] = useState('');
  const q = typed.trim();
  const asked = useGetLinkableInfinite(circleId, q ? { kind, q } : { kind }, { query: paged });
  const load = loadState(asked);
  const things = rows(asked.data)?.filter((thing) => !except.includes(thing.id ?? ''));
  return (
    <View style={{ paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, marginTop: 4, marginBottom: 8, marginHorizontal: layout.barGutter, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.fill }}>
        <Search size={18} color={colors.muted} />
        <TextInput
          accessibilityLabel={words.notes.blocks.pick.search}
          placeholder={words.notes.blocks.pick.search}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          value={typed}
          onChangeText={setTyped}
          autoCorrect={false}
          returnKeyType="search"
          style={[webNoOutline, textStyle('control', 500, { oneLine: true }), { flex: 1, minHeight: 24, padding: 0, color: colors.text }]}
        />
      </View>
      {load.error ? (
        <View style={{ minHeight: 200 }}>
          <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />
        </View>
      ) : !things ? (
        <View style={{ minHeight: 200 }}>
          <Loading offline={load.offline} />
        </View>
      ) : things.length === 0 ? (
        <Txt variant="callout" color="muted" center style={{ paddingVertical: 36, paddingHorizontal: layout.gutter }}>
          {q ? words.notes.blocks.pick.nothingFor(q) : words.notes.blocks.pick.none}
        </Txt>
      ) : (
        <>
          {things.map((thing) => (
            <ThingRow key={thing.id} thing={thing} onPress={() => onChoose(thing)} />
          ))}
          <MoreButton pages={asked} />
        </>
      )}
    </View>
  );
}
