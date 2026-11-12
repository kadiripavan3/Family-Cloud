import { View } from 'react-native';

import { layout } from '@/theme';
import { words } from '@/words';

import { Button } from './Button';
import { Sheet } from './Sheet';
import { Txt } from './Txt';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The question: "Delete this page?" */
  title: string;
  /** What happens if the answer is yes, in a sentence. */
  body?: string;
  /** The button that goes ahead: "Delete page". */
  confirm: string;
  /** The button that changes nothing: "Keep it". */
  cancel?: string;
  onConfirm: () => void;
  /** The yes is on its way. */
  busy?: boolean;
  /** Why the yes didn't work, in a sentence. */
  problem?: string | null;
};

/** Asks before something that can't be taken back: one question, the button that does it, and the way out. */
export function ConfirmSheet({ visible, onClose, title, body, confirm, cancel = words.common.keepIt, onConfirm, busy, problem }: Props) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} subtitle={body}>
      {problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
          {problem}
        </Txt>
      ) : null}
      <View style={{ gap: 10, paddingHorizontal: layout.rowGutter, paddingTop: 6 }}>
        <Button label={confirm} variant="danger" size="lg" block loading={busy} onPress={onConfirm} />
        <Button label={cancel} variant="soft" size="lg" block onPress={onClose} />
      </View>
    </Sheet>
  );
}
