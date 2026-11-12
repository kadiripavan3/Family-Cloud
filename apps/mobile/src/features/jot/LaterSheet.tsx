import { View } from 'react-native';

import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { words } from '@/words';

/** What a row says when its part needs a phone, or a service that isn't connected yet: a title, a sentence or two, and "Got it". */
export function LaterSheet({ said, onClose }: { said: { title: string; body: string } | null; onClose: () => void }) {
  return (
    <Sheet visible={!!said} onClose={onClose} title={said?.title} subtitle={said?.body}>
      <View style={{ paddingHorizontal: layout.rowGutter, paddingTop: 6 }}>
        <Button label={words.jot.ways.later.ok} variant="soft" size="lg" block onPress={onClose} />
      </View>
    </Sheet>
  );
}
