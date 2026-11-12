import { Check, Heart, Route } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { CircleResponse, JourneyJobResponse, PersonBrief } from '@/api/generated/homeport';
import { membersOf } from '@/features/circles/members';
import { firstName } from '@/lib/names';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { JourneyMark } from '@/ui/Brand';
import { Button } from '@/ui/Button';
import { Frost } from '@/ui/Frost';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { ProgressBar } from '@/ui/ProgressBar';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** The label on a photo that says where something comes from: Journey's mark and a few words, on glass. */
export function FromJourney({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingVertical: 6, paddingLeft: 7, paddingRight: 13, borderRadius: radius.photo, overflow: 'hidden', backgroundColor: colors.photoGlass, borderWidth: 1, borderColor: colors.photoGlassLine }}>
      <Frost tone="dark" />
      <JourneyMark size={24} />
      <Txt variant="caption" weight={800} style={{ color: colors.onPhoto }}>
        {label}
      </Txt>
    </View>
  );
}

/**
 * How far a job has got (keeping a journey, sending one): what it is doing, in the API's words, a bar, and
 * "12 of 24". A job that failed says why, with a way to try again.
 */
export function JobProgress({ job, title, onRetry, retrying }: { job: JourneyJobResponse; title: string; onRetry?: () => void; retrying?: boolean }) {
  const { colors } = useTheme();
  const says = words.together.job;
  const failed = job.status === 'failed';
  const done = job.status === 'done';
  return (
    <View accessibilityLiveRegion="polite" style={{ gap: 12, marginHorizontal: layout.barGutter, paddingVertical: 16, paddingHorizontal: 16, borderRadius: radius.card, backgroundColor: colors.fill }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {failed ? null : done ? (
          <View style={{ width: 24, height: 24, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent }}>
            <Check size={14} color={colors.onAccent} strokeWidth={3} />
          </View>
        ) : (
          <ActivityIndicator color={colors.muted} />
        )}
        <View style={{ flex: 1, gap: 1 }}>
          <Txt variant="item" weight={800}>
            {failed ? says.failed : title}
          </Txt>
          <Txt variant="footnote" color="muted">
            {failed ? (job.problem ?? '') : job.status === 'waiting' ? says.waiting : job.step}
          </Txt>
        </View>
        {failed || job.total === 0 ? null : (
          <Txt variant="caption" weight={700} color="muted">
            {says.progress(job.done, job.total)}
          </Txt>
        )}
      </View>
      {failed ? onRetry ? <Button label={says.tryAgain} variant="line" block loading={retrying} onPress={onRetry} /> : null : <ProgressBar fraction={done ? 1 : job.total > 0 ? job.done / job.total : 0} />}
    </View>
  );
}

/** Someone a heart can be from: the person holding the phone, or someone of the circle who has none. */
type Giver = { memberId: string | null; name: string; avatarUrl?: string | null; loved: boolean };

/** The people of a circle who can't give a heart themselves: children and anyone else without a phone. Pets are left out. */
export function withoutAPhone(circle: CircleResponse | undefined): { id: string; name: string; avatarUrl?: string | null }[] {
  if (!circle) return [];
  return membersOf(circle)
    .filter((member) => !member.you && member.status === 'no_phone' && member.kind !== 'pet')
    .map((member) => ({ id: member.id, name: firstName(member.name), avatarUrl: member.avatarUrl }));
}

type HeartsProps = {
  visible: boolean;
  onClose: () => void;
  circle: CircleResponse | undefined;
  /** Who gave a heart so far, and whether the person holding the phone did. */
  lovedBy: readonly PersonBrief[];
  loved: boolean;
  /** Gives or takes back one heart: `as` is the member it is from, or null for the person holding the phone. */
  onChange: (as: string | null, loved: boolean) => void;
  busy?: boolean;
};

/**
 * "A heart from": in a home with children, a heart on something from far away can be theirs. The person
 * holding the phone, then everyone of the circle without one, each with their own heart to give or take back.
 */
export function HeartsSheet({ visible, onClose, circle, lovedBy, loved, onChange, busy }: HeartsProps) {
  const { colors } = useTheme();
  const says = words.together.atHome.hearts;
  const has = new Set(lovedBy.map((person) => person.memberId));
  const givers: Giver[] = [{ memberId: null, name: says.you, loved }, ...withoutAPhone(circle).map((one) => ({ memberId: one.id, name: one.name, avatarUrl: one.avatarUrl, loved: has.has(one.id) }))];
  return (
    <Sheet visible={visible} onClose={onClose} title={says.title} subtitle={says.note}>
      <View style={{ paddingBottom: 4 }}>
        {givers.map((giver, index) => (
          <Tap
            key={giver.memberId ?? 'you'}
            accessibilityRole="switch"
            accessibilityLabel={giver.name}
            aria-checked={giver.loved}
            disabled={busy}
            onPress={() => onChange(giver.memberId, !giver.loved)}
            scaleTo={0.985}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 10, paddingHorizontal: layout.gutter, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line }}>
            {giver.memberId ? <Avatar uri={giver.avatarUrl} name={giver.name} size={34} /> : null}
            <View style={{ flex: 1, gap: 1 }}>
              <Txt variant="headline" weight={600}>
                {giver.name}
              </Txt>
              <Txt variant="footnote" color="muted">
                {giver.loved ? says.on : says.off}
              </Txt>
            </View>
            <Heart size={24} color={giver.loved ? colors.like : colors.muted} fill={giver.loved ? colors.like : 'transparent'} />
          </Tap>
        ))}
      </View>
    </Sheet>
  );
}

/** A plain row inside a card on the keep sheet: an icon without a tile, a bold line and a note, and what stands at the end. */
export function PlainRow({ icon, title, note, first, children }: { icon: (color: string) => ReactNode; title: string; note?: string; first?: boolean; children?: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 11, paddingHorizontal: 14, borderTopWidth: first ? 0 : 1, borderTopColor: colors.line }}>
      {icon(colors.text)}
      <View style={{ flex: 1, gap: 1 }}>
        <Txt variant="item" weight={600}>
          {title}
        </Txt>
        {note ? (
          <Txt variant="footnote" color="muted">
            {note}
          </Txt>
        ) : null}
      </View>
      {children}
    </View>
  );
}

/**
 * A journey's cover as a small square: its photo, over Journey's route on a quiet ground, which is what
 * shows where it has no cover (a challenge), while it loads, or when the picture can't be had.
 */
export function JourneyCover({ uri, size }: { uri: string | null | undefined; size: number }) {
  const { colors } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: radius.thumb, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill2 }}>
      <Route size={size * 0.4} color={colors.muted} />
      {uri ? <Photo uri={uri} radius="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'transparent' }} /> : null}
    </View>
  );
}
