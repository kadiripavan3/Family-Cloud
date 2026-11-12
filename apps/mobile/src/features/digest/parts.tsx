import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight } from 'lucide-react-native';
import { View } from 'react-native';

import type { Hero, Row, Stat } from '@/api/generated/homeport';
import { kindOf } from '@/features/things/kinds';
import { useOpenThing } from '@/features/things/open';
import { layout, radius, useTheme, withAlpha } from '@/theme';
import { Emoji } from '@/ui/Emoji';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Pill } from '@/ui/Pill';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The week's best photo, across the page: a label on it, the week in one bold line, and a line under it. It opens the photo. */
export function WeekHero({ hero }: { hero: Hero }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const content = (
    <Photo uri={hero.imageUrl} radius="panel" style={{ height: 186, justifyContent: 'flex-end', paddingVertical: 14, paddingHorizontal: 16 }}>
      <LinearGradient colors={[withAlpha(colors.black, 0), withAlpha(colors.black, 0.72)]} locations={[0.35, 1]} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      {hero.pill ? <Pill label={hero.pill} style={{ position: 'absolute', top: 12, left: 12 }} /> : null}
      <Txt variant="titleSmall" style={{ color: colors.onPhoto }}>
        {hero.title}
      </Txt>
      {hero.line ? (
        <Txt variant="footnote" style={{ color: colors.onPhoto, opacity: 0.88 }}>
          {hero.line}
        </Txt>
      ) : null}
    </Photo>
  );
  const frame = { marginTop: 4, marginHorizontal: layout.barGutter } as const;
  const spoken = words.common.spoken([hero.pill, hero.title, hero.line]);
  if (!hero.thingId) {
    return (
      <View accessible accessibilityLabel={spoken} style={frame}>
        {content}
      </View>
    );
  }
  return (
    <Tap accessibilityRole="button" accessibilityLabel={spoken} scaleTo={0.985} onPress={() => open({ kind: hero.kind, id: hero.thingId })} style={frame}>
      {content}
    </Tap>
  );
}

/** The numbers across the week, side by side between two thin lines: photos, events, bills paid, saved. Only the ones above nothing. */
export function WeekStats({ stats }: { stats: readonly Stat[] }) {
  const { colors } = useTheme();
  if (stats.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', marginTop: 12, marginHorizontal: layout.barGutter, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line }}>
      {[...stats]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map((stat, index) => (
          <View key={`${stat.label}-${index}`} accessible accessibilityLabel={words.activity.digest.stat(stat.figure ?? '', stat.label ?? '')} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <Txt variant="title" numberOfLines={1}>
              {stat.figure}
            </Txt>
            <Txt variant="tiny" color="muted" numberOfLines={1}>
              {stat.label}
            </Txt>
          </View>
        ))}
    </View>
  );
}

/**
 * One row of the summary: what stands in front (a picture, the thing's emoji, or its kind's icon), a bold
 * line and a quiet one. A row with a picture is news from elsewhere (a journey) and carries an arrow. It
 * opens its thing, when it has one.
 */
export function WeekRow({ row }: { row: Row }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const Icon = kindOf(row.kind).icon;
  const content = (
    <>
      {row.imageUrl ? (
        <Photo uri={row.imageUrl} radius="field" style={{ width: 64, height: 64 }} />
      ) : (
        <View style={{ width: 48, height: 48, borderRadius: radius.thumb, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill }}>{row.emoji ? <Emoji char={row.emoji} size={26} /> : <Icon size={20} color={colors.text} />}</View>
      )}
      <View style={{ flex: 1 }}>
        <Txt variant="item" numberOfLines={2}>
          {row.title}
        </Txt>
        {row.line ? (
          <Txt variant="footnote" color="muted" numberOfLines={2} style={{ marginTop: 2 }}>
            {row.line}
          </Txt>
        ) : null}
      </View>
      {row.imageUrl && row.thingId ? <ChevronRight size={18} color={colors.muted} /> : null}
    </>
  );
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, paddingHorizontal: layout.rowGutter } as const;
  const spoken = words.common.spoken([row.title, row.line]);
  if (!row.thingId) {
    return (
      <View accessible accessibilityLabel={spoken} style={frame}>
        {content}
      </View>
    );
  }
  return (
    <Tap accessibilityRole="button" accessibilityLabel={spoken} scaleTo={0.985} onPress={() => open({ kind: row.kind, id: row.thingId })} style={frame}>
      {content}
    </Tap>
  );
}
