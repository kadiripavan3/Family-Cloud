import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { saveTrip } from '@/api/generated/homeport';
import { addDays, formatWeekdayDay, today } from '@/lib/dates';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { DayPicker } from '@/ui/DayPicker';
import { FieldButton } from '@/ui/Field';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The folder: a trip already, or about to become one. */
  folder: { id: string; circleId: string };
  /** The dates it has, when it is a trip already. */
  startsOn?: string;
  endsOn?: string;
};

/**
 * "When is the trip?": two days. A folder that is given them is a trip from then on (10.7); for one that is
 * a trip already, they change when its stages turn.
 */
export function TripDatesSheet({ visible, onClose, folder, startsOn, endsOn }: Props) {
  const says = words.together.trip.dates;
  return (
    <Sheet visible={visible} onClose={onClose} title={says.title} subtitle={says.lead}>
      {/* Each time it opens, it starts from the dates the trip has. */}
      {visible ? <Picking onClose={onClose} folder={folder} startsOn={startsOn} endsOn={endsOn} /> : null}
    </Sheet>
  );
}

function Picking({ onClose, folder, startsOn, endsOn }: Omit<Props, 'visible'>) {
  const cache = useCache();
  const says = words.together.trip.dates;
  const [first, setFirst] = useState(startsOn ?? today());
  const [last, setLast] = useState(endsOn ?? addDays(today(), 6));
  const [picking, setPicking] = useState<'first' | 'last' | null>(null);

  const save = useMutation({
    mutationFn: () => saveTrip(folder.id, { startsOn: first, endsOn: last }, { day: today() }),
    onSuccess: async (trip) => {
      await cache.tripSaved(trip);
      onClose();
    },
  });

  return (
    <>
      <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: layout.rowGutter }}>
        <FieldButton label={says.first} value={formatWeekdayDay(first)} onPress={() => setPicking('first')} />
        <FieldButton label={says.last} value={formatWeekdayDay(last)} onPress={() => setPicking('last')} />
      </View>
      {save.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
          {messageFor(save.error)}
        </Txt>
      ) : null}
      <View style={{ paddingTop: 16, paddingHorizontal: layout.rowGutter }}>
        <Button label={startsOn ? says.save : says.make} size="lg" block loading={save.isPending} onPress={() => save.mutate()} />
      </View>
      <DayPicker
        visible={picking !== null}
        onClose={() => setPicking(null)}
        title={picking === 'last' ? says.last : says.first}
        value={picking === 'last' ? last : first}
        min={picking === 'last' ? first : undefined}
        onChange={(day) => {
          if (picking === 'last') setLast(day);
          else {
            setFirst(day);
            // A trip can't end before it starts: the last day moves along with the first.
            if (day > last) setLast(day);
          }
          setPicking(null);
        }}
      />
    </>
  );
}
