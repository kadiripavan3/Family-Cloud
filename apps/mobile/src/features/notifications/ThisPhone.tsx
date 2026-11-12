import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { pushAllowed, turnOnPush } from './device';
import { pushSupport } from './support';

/**
 * Under the notification switches: whether this phone gets notifications at all, and a way to turn them on.
 * The switches above say what a person wants to hear about; this says whether the phone lets the app tell them.
 */
export function ThisPhone() {
  const support = pushSupport();
  const [state, setState] = useState<'checking' | 'on' | 'off' | 'blocked'>('checking');
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (support !== 'ready') return;
    let mounted = true;
    void pushAllowed().then((allowed) => {
      if (mounted) setState(allowed ? 'on' : 'off');
    });
    return () => {
      mounted = false;
    };
  }, [support]);

  const turnOn = async () => {
    setAsking(true);
    const answer = await turnOnPush();
    setAsking(false);
    // The phone asks only once. After a no, the way back is the phone's own settings.
    setState(answer === 'on' ? 'on' : 'blocked');
  };

  const says =
    support !== 'ready'
      ? words.notifications.whyNot[support]
      : state === 'on'
        ? words.notifications.thisPhone.on
        : state === 'blocked'
          ? words.notifications.thisPhone.blocked
          : state === 'off'
            ? words.notifications.thisPhone.off
            : '';

  return (
    <View style={{ marginTop: 14, marginHorizontal: layout.gutter, gap: 12 }}>
      <Txt variant="footnote" color="muted" accessibilityLiveRegion="polite">
        {says}
      </Txt>
      {support === 'ready' && state === 'off' ? <Button label={words.notifications.ask.turnOn} variant="soft" loading={asking} onPress={() => void turnOn()} /> : null}
      {support === 'ready' && state === 'blocked' ? <Button label={words.notifications.thisPhone.openSettings} variant="soft" onPress={() => void Linking.openSettings()} /> : null}
    </View>
  );
}
