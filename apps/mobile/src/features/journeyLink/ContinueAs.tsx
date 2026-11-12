import { Route } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { messageFor } from '@/api/fetcher';
import { layout, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Button } from '@/ui/Button';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * Journey's sign-in, found on this phone and offered here: who it is, and how to take it. The account is one
 * account for both apps, so taking it signs the person in with nothing to type.
 */
export type JourneyOffer = { displayName: string; avatarUrl: string | null; accept: () => Promise<void> };

/**
 * 1.3 "Continue as Nora": the first choice on the sign-in screen when Journey is signed in on the same phone,
 * with the line that leads on to the other ways in. Nothing can make the offer yet: it needs both apps on
 * one phone, from the same developer account (docs/06-build-plan.md), so the screen only draws this when it
 * is handed one.
 */
export function ContinueAs({ offer }: { offer: JourneyOffer }) {
  const { colors, shadow } = useTheme();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const accept = () => {
    setBusy(true);
    setProblem(null);
    offer
      .accept()
      .catch((error: unknown) => setProblem(messageFor(error)))
      .finally(() => setBusy(false));
  };
  return (
    <View style={{ marginTop: 20, marginHorizontal: layout.rowGutter }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, borderRadius: radius.cardLarge, backgroundColor: colors.surface, boxShadow: shadow.sm }}>
        <Avatar uri={offer.avatarUrl} name={offer.displayName} size={46} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt variant="headline" weight={800} numberOfLines={1}>
            {offer.displayName}
          </Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Route size={13} color={colors.muted} />
            <Txt variant="footnote" color="muted" numberOfLines={1}>
              {words.signIn.choose.journeyAccount}
            </Txt>
          </View>
        </View>
        <Button label={words.common.continue} spoken={words.signIn.choose.continueAs(offer.displayName)} size="sm" inline loading={busy} onPress={accept} />
      </View>
      {problem ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 8, marginHorizontal: 4 }}>
          {problem}
        </Txt>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
        <Txt variant="footnote" weight={600} color="muted">
          {words.signIn.choose.orAnother}
        </Txt>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      </View>
    </View>
  );
}
