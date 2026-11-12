import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { onAnswer } from '@/api/fetcher';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { words } from '@/words';

import { askedAboutPush, shouldAskAboutPush, turnOnPush } from './device';
import { pushSupport } from './support';

/** An API call that was just accepted: its method, and what its address looks like. */
export type Moment = [method: string, path: RegExp];

/**
 * The moments when the question makes sense: the person has just done something that others will answer, so
 * there is something worth hearing about. The first is joining a circle by its link. The next arrive with
 * their screens (asking someone to do a job): add the API call here when its screen is built.
 */
const GOOD_MOMENTS: Moment[] = [['PUT', /^\/v1\/join\/[^/]+$/]];

/** How long after the moment the question comes up, so the screen first shows what was just done. */
const A_MOMENT_MS = 900;

/**
 * The question about notifications. It is asked once per install, with the reason first and the phone's own
 * question only after a yes. Never when the app opens: it waits for a moment when notifications would have
 * something to say (`after`; the app's own list unless a test gives another). Where they can't work (a
 * browser, Expo Go) it does nothing.
 *
 * Sits in the root layout for everyone who is signed in with a profile, above every screen.
 */
export function AskAboutNotifications({ after = GOOD_MOMENTS }: { after?: readonly Moment[] }) {
  const [visible, setVisible] = useState(false);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    if (pushSupport() !== 'ready') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let checking = false;
    const stop = onAnswer((method, path) => {
      if (checking || !after.some(([wanted, address]) => wanted === method && address.test(path))) return;
      checking = true;
      void shouldAskAboutPush().then((ask) => {
        checking = false;
        if (!ask) return;
        void askedAboutPush(); // seen once on this phone, whatever the answer
        timer = setTimeout(() => setVisible(true), A_MOMENT_MS);
      });
    });
    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  }, [after]);

  const turnOn = async () => {
    setAsking(true);
    await turnOnPush();
    setAsking(false);
    setVisible(false);
  };
  const notNow = () => {
    if (!asking) setVisible(false);
  };

  return (
    <Sheet
      visible={visible}
      onClose={notNow}
      title={words.notifications.ask.title}
      subtitle={words.notifications.ask.body}>
      <View style={{ gap: 10, paddingHorizontal: layout.rowGutter, paddingTop: 6 }}>
        <Button label={words.notifications.ask.turnOn} size="lg" block loading={asking} onPress={() => void turnOn()} />
        <Button label={words.common.notNow} variant="soft" size="lg" block disabled={asking} onPress={notNow} />
      </View>
    </Sheet>
  );
}
