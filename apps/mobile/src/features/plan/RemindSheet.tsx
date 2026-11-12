import { Sheet } from '@/ui/Sheet';
import { words } from '@/words';

import { PickRow } from './PickRow';

/** How long ahead a reminder can come, in minutes: at the time, ten minutes, half an hour, an hour, two, a day, a week. */
export const REMIND_CHOICES: readonly number[] = [0, 10, 30, 60, 120, 1440, 10080];

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Minutes before. Null: no reminder. */
  value: number | null;
  onChange: (next: number | null) => void;
  /** An event may come without a reminder; a reminder always tells you at least when it is due. */
  allowNone?: boolean;
};

/** Picks how long ahead to be reminded. Picking one closes the sheet. */
export function RemindSheet({ visible, onClose, value, onChange, allowNone }: Props) {
  // What was read from a sentence ("20 minutes before") stays a choice, in its place among the others.
  const choices = value !== null && !REMIND_CHOICES.includes(value) ? [...REMIND_CHOICES, value].sort((a, b) => a - b) : REMIND_CHOICES;
  const pick = (next: number | null) => {
    onChange(next);
    onClose();
  };
  return (
    <Sheet visible={visible} onClose={onClose} title={words.plan.remind.title}>
      {allowNone ? <PickRow first label={words.plan.remind.none} chosen={value === null} onPress={() => pick(null)} /> : null}
      {choices.map((minutes, index) => (
        <PickRow key={minutes} first={!allowNone && index === 0} label={words.plan.remind.before(minutes)} chosen={value === minutes} onPress={() => pick(minutes)} />
      ))}
    </Sheet>
  );
}
