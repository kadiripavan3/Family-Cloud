import { View } from 'react-native';

import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

type Props = {
  /** The sentence to say. Null while there is nothing to say. */
  text: string | null;
  title?: string;
  onClose: () => void;
};

/** Says one thing in a small sheet, with a button to close it: what an action did, or why a control can't do its job yet. */
export function SaySheet({ text, title, onClose }: Props) {
  return (
    <Sheet visible={text !== null} onClose={onClose} title={title}>
      <View style={{ gap: 16, paddingTop: title ? 4 : 12, paddingHorizontal: layout.gutter }}>
        <Txt variant="bodyLarge">{text}</Txt>
        <Button label={words.notes.waiting.ok} variant="soft" size="lg" block onPress={onClose} />
      </View>
    </Sheet>
  );
}
