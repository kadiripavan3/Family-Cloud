import { RefreshCw } from 'lucide-react-native';
import { View } from 'react-native';

import { darkTheme, layout, radius, useTheme } from '@/theme';
import { words } from '@/words';

import { Button } from './Button';
import { Emoji } from './Emoji';
import { Txt } from './Txt';

type Props = {
  /** What happened, in a sentence. The API's own words where it sent some. */
  message: string;
  /** Asks again. Leave it out when asking again can't help (the thing isn't there). */
  onRetry?: () => void;
  retrying?: boolean;
  /**
   * The way out to Home. Given for a whole page that didn't load: the page then gets its picture, a title
   * and both buttons. Without it, this is the small note for one part of a page.
   */
  onHome?: () => void;
  /** The line above the sentence. */
  title?: string;
  /** "onPhoto" when it sits on a photo or on the dark stage, where the page's own colours can't be read. */
  tone?: 'page' | 'onPhoto';
};

/** Shown when something couldn't be fetched: what happened, in a sentence, and what to do next. */
export function Problem({ message, onRetry, retrying, onHome, title, tone = 'page' }: Props) {
  const theme = useTheme();
  const onPhoto = tone === 'onPhoto';
  const colors = onPhoto ? darkTheme.colors : theme.colors;

  if (!onHome) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 }}>
        <Txt variant="titleSmall" accessibilityRole="header" center style={{ color: colors.text }}>
          {title ?? words.states.problem.title}
        </Txt>
        <Txt variant="bodySmall" center style={{ color: colors.muted }}>
          {message}
        </Txt>
        {onRetry ? <Button label={words.common.tryAgain} variant={onPhoto ? 'glass' : 'line'} loading={retrying} onPress={onRetry} style={{ alignSelf: 'center', marginTop: 6 }} /> : null}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 34, paddingVertical: 24 }}>
        <View style={{ width: 116, height: 116, borderRadius: radius.pill, marginBottom: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: onPhoto ? colors.photoGlass : colors.accentSoft }}>
          <Emoji char="🛠️" size={64} />
        </View>
        <Txt variant="titleSmall" accessibilityRole="header" center style={{ color: colors.text }}>
          {title ?? words.states.problem.pageTitle}
        </Txt>
        <Txt variant="bodySmall" center style={{ color: colors.muted }}>
          {message}
        </Txt>
      </View>
      <View style={{ gap: 10, paddingHorizontal: layout.rowGutter, paddingBottom: 20 }}>
        {onRetry ? <Button label={words.common.tryAgain} size="lg" block loading={retrying} icon={(c) => <RefreshCw size={18} color={c} />} onPress={onRetry} /> : null}
        <Button label={words.common.goHome} size="lg" block variant={onPhoto ? 'glass' : 'line'} onPress={onHome} />
      </View>
    </View>
  );
}
