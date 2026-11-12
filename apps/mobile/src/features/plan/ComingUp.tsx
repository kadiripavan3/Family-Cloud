import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { type MemberResponse, type PlanEntryResponse, useGetPlan } from '@/api/generated/homeport';
import { ThingRow } from '@/features/things/ThingRow';
import { formatComingDay, today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout } from '@/theme';
import { RowGroup } from '@/ui/Rows';
import { Sk } from '@/ui/Skeleton';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** How far ahead "coming up" looks, and how many things it names. */
const DAYS = 14;
const MOST = 4;

/** What is still ahead for one person: each thing once, at the next time it comes round, soonest first. */
export function upcoming(days: readonly { entries: readonly PlanEntryResponse[] }[]): PlanEntryResponse[] {
  const seen = new Set<string>();
  const ahead: PlanEntryResponse[] = [];
  for (const day of days) {
    for (const entry of day.entries) {
      if (!entry.thingId || entry.done === true || seen.has(entry.thingId)) continue;
      seen.add(entry.thingId);
      ahead.push(entry);
    }
  }
  return ahead.slice(0, MOST);
}

/**
 * "Coming up" on a person's page: the next events and reminders that concern them, from the calendar
 * (`getPlan` for that one person), each as a row that opens it: "Dentist · Mia. Today 15:30 · Trubarjeva 12".
 */
export function ComingUp({ member }: { member: MemberResponse }) {
  const asked = useGetPlan(member.circleId, { day: today(), days: DAYS, member: member.id });
  const load = loadState(asked);
  if (load.error) {
    return (
      <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
        {messageFor(load.error)}
      </Txt>
    );
  }
  if (!asked.data) {
    return (
      <View accessibilityLabel={words.states.loading}>
        <Sk height={108} radius="card" style={{ marginHorizontal: layout.barGutter }} />
      </View>
    );
  }
  const ahead = upcoming(asked.data.days);
  if (ahead.length === 0) {
    return (
      <Txt variant="callout" color="muted" style={{ marginHorizontal: layout.gutter }}>
        {words.plan.coming.nothing}
      </Txt>
    );
  }
  return (
    <RowGroup>
      {ahead.map((entry, index) => (
        <ThingRow
          key={`${entry.thingId}-${entry.day}`}
          look="grouped"
          first={index === 0}
          thing={{ id: entry.thingId ?? undefined, circleId: member.circleId, kind: entry.kind, title: entry.title }}
          line={words.common.join([words.plan.coming.when(formatComingDay(entry.day), entry.lead), entry.note])}
        />
      ))}
    </RowGroup>
  );
}
