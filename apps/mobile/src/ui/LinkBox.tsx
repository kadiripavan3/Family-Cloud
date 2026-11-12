import { Check, Copy } from 'lucide-react-native';
import { type ReactNode, useEffect, useState } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';

import { copyText, shortLink } from '@/lib/share';
import { radius, useTheme } from '@/theme';
import { words } from '@/words';

import { Button } from './Button';
import { Txt } from './Txt';

type Props = {
  /** The whole address. It is shown without "https://" and copied as it is. */
  url: string;
  /** Shown before the address, such as a link icon. */
  icon?: (color: string) => ReactNode;
  /** What the Copy button is called for screen readers, when there is more than one on the screen. */
  copyLabel?: string;
  style?: StyleProp<ViewStyle>;
};

/** A link in a box with a Copy button beside it. The button says "Copied" for a moment once it worked. */
export function LinkBox({ url, icon, copyLabel = words.common.copy, style }: Props) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingLeft: 14, paddingRight: 8, borderRadius: radius.field, borderWidth: 1.5, borderColor: colors.line }, style]}>
      {icon?.(colors.muted)}
      <Txt variant="caption" weight={600} numberOfLines={1} selectable style={{ flex: 1 }}>
        {shortLink(url)}
      </Txt>
      <View accessibilityLiveRegion="polite">
        <Button
          label={copied ? words.common.copied : copyLabel}
          size="sm"
          variant="soft"
          inline
          icon={(c) => (copied ? <Check size={15} color={c} strokeWidth={2.6} /> : <Copy size={15} color={c} />)}
          onPress={() => void copyText(url).then(setCopied)}
        />
      </View>
    </View>
  );
}
