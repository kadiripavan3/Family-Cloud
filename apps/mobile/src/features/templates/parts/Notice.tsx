import { View } from 'react-native';

import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { words } from '@/words';

/**
 * A sentence in a small sheet, with one button to put it away: what a control says when it can't do its
 * work in this build (a microphone in a browser, a book that isn't made yet), so no tap is ever a dead one.
 * Shown while `text` is set.
 */
export function Notice({ title, text, onClose }: { title?: string; text: string | null; onClose: () => void }) {
  return (
    <Sheet visible={text !== null} onClose={onClose} title={title ?? words.templates.board.notYet} subtitle={text ?? undefined}>
      <View style={{ paddingHorizontal: layout.rowGutter, paddingTop: 6 }}>
        <Button label={words.templates.board.ok} variant="soft" size="lg" block onPress={onClose} />
      </View>
    </Sheet>
  );
}
