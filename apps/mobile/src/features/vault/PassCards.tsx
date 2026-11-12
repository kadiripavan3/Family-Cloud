import { useRouter } from 'expo-router';
import { KeyRound, Plus } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { type GuestPassResponse, useGetVault, useGetVaultItemsInfinite, type VaultItemRowResponse } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { placeHref } from '@/features/home/places';
import { layout, radius, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { GroupLabel } from '@/ui/Heading';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { ToggleRow } from '@/ui/Rows';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { addSealedCard, openItem, passKeyForMaker, passKeyOf } from './actions';
import { guestLink } from './crypto/guest';
import { guestTextOf } from './inside';
import { ItemTile } from './ItemTile';
import { problemOf } from './problems';
import { useVaultUnlocked } from './session';
import { useSecretAction } from './useSecretAction';

/**
 * The Vault's part of a guest pass (4.5): a door code or the Wi‑Fi for someone with no app and no key. The
 * text is sealed on this phone with a key made for the pass; the API gets the sealed card, and the key
 * travels only in the link, after the #. These are the three pieces the pass's two screens use.
 */

/**
 * For the screen that makes a pass: `keyForMaker()` gives what to send with the new pass, so codes can be
 * added to it later. It is a fresh key for the pass, sealed for its maker's own Vault; it needs only their
 * public key, so the Vault can be locked. Undefined for someone without a Vault.
 */
export function useKeyForMaker(): () => string | undefined {
  const vault = useGetVault().data;
  return () => passKeyForMaker(vault);
}

/**
 * The link to send for a pass: the address the API gave, with the pass's key after the # when it carries
 * sealed cards. The key comes out of the maker's own Vault, so it is there only while that is unlocked:
 * `sealed` says the pass has cards, `whole` that the link has its key.
 */
export function usePassLink(pass: Pick<GuestPassResponse, 'url' | 'cards' | 'keyForMaker'>): { url: string; sealed: boolean; whole: boolean } {
  const unlocked = useVaultUnlocked();
  const { url, keyForMaker } = pass;
  const sealed = pass.cards.length > 0;
  const key = useMemo(() => {
    if (!sealed || !unlocked || !keyForMaker) return null;
    try {
      return passKeyOf({ keyForMaker });
    } catch {
      return null;
    }
  }, [sealed, unlocked, keyForMaker]);
  return { url: key ? guestLink(url, key) : url, sealed, whole: !sealed || key !== null };
}

/** The sealed cards of a pass, and the row that adds one from the Vault. */
export function PassCards({ pass }: { pass: GuestPassResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const unlocked = useVaultUnlocked();
  const vault = useGetVault().data;
  const [choosing, setChoosing] = useState(false);
  const says = words.vault.pass;
  const why = !vault?.setUp ? says.noVault : !pass.keyForMaker ? says.notMaker : !unlocked ? says.locked : null;

  return (
    <>
      <GroupLabel style={{ marginHorizontal: layout.gutter }}>{says.label}</GroupLabel>
      <Card style={{ marginHorizontal: layout.barGutter, borderRadius: radius.card, overflow: 'hidden' }}>
        {pass.cards.map((card, index) => (
          <View key={card.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line }}>
            <KeyRound size={22} color={colors.text} />
            <View style={{ flex: 1, gap: 1 }}>
              <Txt variant="item" weight={600} numberOfLines={1}>
                {card.label}
              </Txt>
              <Txt variant="footnote" color="muted">
                {card.once ? says.card.once : says.card.many}
              </Txt>
            </View>
          </View>
        ))}
        <Tap
          accessibilityRole="button"
          accessibilityLabel={words.common.spoken([says.add, says.addNote])}
          disabled={why !== null}
          onPress={() => setChoosing(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: pass.cards.length === 0 ? 0 : 1, borderTopColor: colors.line, opacity: why === null ? 1 : 0.5 }}>
          <Plus size={22} color={colors.text} />
          <View style={{ flex: 1, gap: 1 }}>
            <Txt variant="item" weight={600}>
              {says.add}
            </Txt>
            <Txt variant="footnote" color="muted">
              {says.addNote}
            </Txt>
          </View>
        </Tap>
      </Card>
      {why ? (
        <View style={{ gap: 8, alignItems: 'flex-start', marginTop: 8, marginHorizontal: layout.gutter }}>
          <Txt variant="footnote" color="muted">
            {why}
          </Txt>
          {pass.keyForMaker || !vault?.setUp ? <Button label={says.toVault} variant="soft" size="sm" onPress={() => router.navigate(placeHref('vault'))} /> : null}
        </View>
      ) : null}
      <ChooseItem visible={choosing} onClose={() => setChoosing(false)} pass={pass} />
    </>
  );
}

/** An item with nothing in it that a guest could be shown. */
class NothingToShow extends Error {}

/** Which code or network goes on the pass: this person's own, in the pass's circle. */
function ChooseItem({ visible, onClose, pass }: { visible: boolean; onClose: () => void; pass: GuestPassResponse }) {
  const cache = useCache();
  const asked = useGetVaultItemsInfinite(pass.circleId, { mine: true }, { query: { ...paged, enabled: visible } });
  const [once, setOnce] = useState(false);
  const adding = useSecretAction();
  const says = words.vault.pass;
  const items = (rows(asked.data) ?? []).filter((item) => !item.sample && (item.category === 'code' || item.category === 'wifi'));

  const add = async (item: VaultItemRowResponse) => {
    const done = await adding.run(async () => {
      const opened = await openItem(item);
      const text = guestTextOf(opened.inside, says.wifi);
      opened.itemKey.fill(0);
      if (!text) throw new NothingToShow();
      await addSealedCard(pass, { label: item.title, text, once, thingId: item.id });
      await cache.guestPassChanged(pass.circleId);
    });
    if (done) onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={says.choose} subtitle={says.chooseNote}>
      {!asked.data ? (
        <View style={{ minHeight: 160 }}>
          <Loading />
        </View>
      ) : items.length === 0 ? (
        <Txt variant="callout" color="muted" style={{ paddingVertical: 12, paddingHorizontal: layout.gutter }}>
          {says.nothing}
        </Txt>
      ) : (
        <>
          <View style={{ marginHorizontal: 4 }}>
            <ToggleRow first label={says.once} value={once} onChange={setOnce} />
          </View>
          {items.map((item) => (
            <SheetRow key={item.id} icon={() => <ItemTile category={item.category} title={item.title} />} label={item.title} note={item.glance} onPress={() => void add(item)} />
          ))}
        </>
      )}
      {adding.error ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingTop: 8, paddingHorizontal: layout.gutter }}>
          {adding.error instanceof NothingToShow ? says.empty : problemOf(adding.error)}
        </Txt>
      ) : null}
    </Sheet>
  );
}
