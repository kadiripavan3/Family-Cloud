import { useFocusEffect, useRouter } from 'expo-router';
import { ChevronRight, HeartHandshake, KeyRound, LifeBuoy, Lock, TriangleAlert } from 'lucide-react-native';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import {
  refuseEmergency,
  useGetEmergency,
  useGetMe,
  useGetVault,
  useGetVaultAttention,
  useGetVaultHome,
  type VaultAttentionResponse,
  type VaultCategory,
  type VaultHomeResponse,
  type VaultRecordResponse,
} from '@/api/generated/homeport';
import { useCircle } from '@/features/circles/current';
import { TAB_BAR_ROOM } from '@/features/home/places';
import { PHONE_SECURITY, type PhoneSecurity, phoneSecurityKey } from '@/features/settings/security';
import { thingHref } from '@/features/things/open';
import { timeAgo } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { firstName } from '@/lib/names';
import { useKept } from '@/lib/useKept';
import { layout, radius, useTheme } from '@/theme';
import { Blob } from '@/ui/Blob';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { Emoji } from '@/ui/Emoji';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { NoteBox } from '@/ui/NoteBox';
import { Problem } from '@/ui/Problem';
import { Row, RowGroup } from '@/ui/Rows';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { giveWaitingKeys } from './actions';
import { ItemRow } from './ItemRow';
import { Locked } from './Locked';
import { DRAWERS } from './look';
import { problemOf } from './problems';
import { lockVault, setLockAfterMinutes, useVaultUnlocked, vaultUsed } from './session';
import { LockToast, Toast } from './Toast';
import { useCopyFromList } from './useCopyFromList';
import { useSecretAction } from './useSecretAction';
import { momentOf } from './when';

/**
 * 9 The Vault on Home: what stands under the row of six places when Vault is chosen. Before a Vault exists
 * it offers to set one up; while it is locked it is the locked page (9.1); unlocked it is the six drawers,
 * what needs a look, and what other people shared (9.2), and it says when it will lock itself.
 */
export function VaultHome() {
  const unlocked = useVaultUnlocked();
  const asked = useGetVault();
  const account = useGetMe().data?.id;
  // "Lock the Vault after" on Privacy and security is remembered on the phone. Two minutes unless changed.
  const [security] = useKept<PhoneSecurity>(phoneSecurityKey(account), PHONE_SECURITY);
  useEffect(() => setLockAfterMinutes(security.lockAfterMinutes), [security.lockAfterMinutes]);

  const load = loadState(asked);
  const vault = asked.data;
  if (load.error) return <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />;
  if (!vault) return <Loading offline={load.offline} />;
  if (!vault.setUp) return <Start />;
  if (!unlocked) {
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: TAB_BAR_ROOM }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Attention locked />
        <View style={{ marginTop: 44 }}>
          <Locked vault={vault} />
        </View>
      </ScrollView>
    );
  }
  return <Open vault={vault} />;
}

/** Before a Vault exists: what it is, and the one way in. */
function Start() {
  const router = useRouter();
  const says = words.vault.setUp;
  return (
    <ScrollView contentContainerStyle={{ paddingTop: 44, paddingBottom: TAB_BAR_ROOM }} showsVerticalScrollIndicator={false}>
      <View style={{ alignItems: 'center', gap: 10, paddingHorizontal: 34 }}>
        <View style={{ marginBottom: 6 }}>
          <Blob emoji={says.emoji} />
        </View>
        <Txt variant="titleSmall" accessibilityRole="header" center>
          {says.start.title}
        </Txt>
        <Txt variant="bodySmall" color="muted" center>
          {says.start.body}
        </Txt>
        <Button label={says.start.button} size="lg" inline onPress={() => router.push('/vault/setup')} style={{ marginTop: 10 }} />
      </View>
    </ScrollView>
  );
}

/** 9.2 The Vault, unlocked. */
function Open({ vault }: { vault: VaultRecordResponse }) {
  const { colors } = useTheme();
  const router = useRouter();
  const circle = useCircle();
  const asked = useGetVaultHome(circle.id);
  const emergency = useGetEmergency().data;
  const { copyFrom, said, error: copyProblem } = useCopyFromList();
  const load = loadState(asked);
  const home = asked.data;
  // Other people share and take back while this page sits under another: coming back to it asks again.
  const { refetch } = asked;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (load.error) return <Problem message={messageFor(load.error)} onRetry={load.retry} retrying={load.retrying} />;
  if (!home) return <Loading offline={load.offline} />;

  const everyone = words.kinds[circle.kind].everyone(circle.name);
  const look = home.needsALook;
  const empty = home.drawers.every((drawer) => drawer.items === 0);
  const says = words.vault.home;

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponderCapture={() => {
        vaultUsed();
        return false;
      }}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: TAB_BAR_ROOM + 44 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={asked.isRefetching} onRefresh={() => void asked.refetch()} tintColor={colors.muted} />}>
        <Drawers home={home} onOpen={(category) => router.push({ pathname: '/vault/drawer/[category]', params: { category } })} />
        <Attention vault={vault} />
        {look.total > 0 ? (
          <Tap accessibilityRole="button" accessibilityLabel={words.common.spoken([says.look.title(look.total), says.look.body(look.weak, look.reused, look.leaked)])} onPress={() => router.push({ pathname: '/vault/drawer/[category]', params: { category: 'look' } })}>
            <NoteBox tone="warn" icon={(c) => <TriangleAlert size={20} color={c} />} title={says.look.title(look.total)} style={{ marginTop: 14, marginHorizontal: layout.barGutter }}>
              {says.look.body(look.weak, look.reused, look.leaked)}
            </NoteBox>
          </Tap>
        ) : null}

        {home.sharedWithYou.length > 0 ? (
          <>
            <Tap
              accessibilityRole="button"
              accessibilityLabel={words.common.seeAll(says.shared)}
              onPress={() => router.push({ pathname: '/vault/drawer/[category]', params: { category: 'shared' } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 18, marginBottom: 6, marginHorizontal: layout.barGutter }}>
              <Txt variant="subtitle">{says.shared}</Txt>
              <ChevronRight size={18} color={colors.text} strokeWidth={2.6} />
            </Tap>
            {home.sharedWithYou.map((item) => (
              <ItemRow key={item.id} item={item} everyone={everyone} onOpen={() => router.push(thingHref({ kind: 'vault_item', id: item.id }))} onCopy={() => copyFrom(item)} />
            ))}
          </>
        ) : null}

        {empty ? (
          <View style={{ alignItems: 'center', gap: 6, marginTop: 30, paddingHorizontal: 34 }}>
            <Txt variant="titleSmall" accessibilityRole="header" center>
              {says.empty.title}
            </Txt>
            <Txt variant="bodySmall" color="muted" center>
              {says.empty.body}
            </Txt>
            <Button label={says.empty.button} inline onPress={() => router.push('/new/password')} style={{ marginTop: 8 }} />
          </View>
        ) : null}

        <View style={{ marginTop: 24 }}>
          <RowGroup>
            <Row first icon={(c) => <KeyRound size={18} color={c} />} label={says.more.key} note={says.more.keyNote(vault.keySaved)} onPress={() => router.push('/vault/key')} />
            <Row
              icon={(c) => <LifeBuoy size={18} color={c} />}
              label={says.more.emergency}
              note={says.more.emergencyNote(emergency && emergency.state !== 'off' && emergency.trusted ? firstName(emergency.trusted.name) : null, emergency?.waitHours ?? 48)}
              onPress={() => router.push('/vault/emergency')}
            />
            <Row icon={(c) => <HeartHandshake size={18} color={c} />} label={says.more.helping} onPress={() => router.push('/vault/helping')} />
            <Row icon={(c) => <Lock size={18} color={c} />} label={says.more.lock} onPress={lockVault} trailing={<View />} />
          </RowGroup>
        </View>
        {copyProblem ? (
          <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite" style={{ marginTop: 12, marginHorizontal: layout.gutter }}>
            {problemOf(copyProblem)}
          </Txt>
        ) : null}
      </ScrollView>
      {said ? <Toast text={said} /> : <LockToast />}
    </View>
  );
}

/** The six drawers, three to a row, each with how many items this person may see in it. */
function Drawers({ home, onOpen }: { home: VaultHomeResponse; onOpen: (category: VaultCategory) => void }) {
  const counts = new Map(home.drawers.map((drawer) => [drawer.category, drawer.items]));
  const rows = [DRAWERS.slice(0, 3), DRAWERS.slice(3)];
  return (
    <View style={{ gap: 10, marginTop: 16, marginHorizontal: layout.barGutter }}>
      {rows.map((row) => (
        <View key={row.join()} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((category) => {
            const drawer = words.vault.drawers[category];
            const count = counts.get(category) ?? 0;
            return (
              <Tap key={category} accessibilityRole="button" accessibilityLabel={words.vault.drawerSpoken(drawer.name, count)} onPress={() => onOpen(category)} style={{ flex: 1 }}>
                <Card style={{ gap: 1, paddingVertical: 13, paddingHorizontal: 12, borderRadius: radius.card }}>
                  <View style={{ marginBottom: 6 }}>
                    <Emoji char={drawer.emoji} size={30} />
                  </View>
                  <Txt variant="control" weight={800} numberOfLines={1}>
                    {drawer.name}
                  </Txt>
                  <Txt variant="small" color="muted">
                    {count}
                  </Txt>
                </Card>
              </Tap>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** One thing that needs the person now: what it is, in a sentence, and the one thing to do about it. */
function Needs({ title, body, button, onPress, busy, warn }: { title: string; body: string; button: string; onPress: () => void; busy?: boolean; warn?: boolean }): ReactNode {
  return (
    <NoteBox
      tone={warn ? 'warn' : 'plain'}
      soft={!warn}
      icon={(c) => <TriangleAlert size={20} color={c} />}
      title={title}
      trailing={<Button label={button} spoken={words.common.spoken([button, title])} size="sm" variant={warn ? 'ink' : 'soft'} inline loading={busy} onPress={onPress} />}
      style={{ marginTop: 14, marginHorizontal: layout.barGutter }}>
      {body}
    </NoteBox>
  );
}

/**
 * What needs the person now, as the API reports it when the Vault is opened: nothing here depends on a push
 * having arrived. A request for their Vault, a recovery they may not have started, someone asking for help.
 * The ones that only say no or go somewhere are there while the Vault is locked too: saying no needs no key.
 */
function Attention({ vault, locked }: { vault?: VaultRecordResponse; locked?: boolean }) {
  const router = useRouter();
  const cache = useCache();
  const asked = useGetVaultAttention();
  const { refetch } = asked;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );
  const giving = useSecretAction();
  const [given, setGiven] = useState<number | null>(null);
  const [refusing, setRefusing] = useState(false);
  const attention: VaultAttentionResponse | undefined = asked.data;
  if (!attention) return null;
  const says = words.vault.home.attention;
  const { emergency, recovery } = attention;
  const trusted = firstName(emergency?.trusted?.name);

  const sayNo = async () => {
    setRefusing(true);
    try {
      await cache.vaultEmergencyChanged(await refuseEmergency());
    } catch {
      // The page behind "Look" says what went wrong.
      router.push('/vault/emergency');
    } finally {
      setRefusing(false);
    }
  };
  const give = () =>
    void giving.run(async () => {
      const count = await giveWaitingKeys();
      setGiven(count);
      await cache.vaultKeysGiven();
    });

  return (
    <>
      {emergency?.state === 'asked' ? (
        <Needs warn title={says.asked.title(trusted)} body={says.asked.body(emergency.opensAt ? momentOf(emergency.opensAt) : '')} button={words.vault.emergency.asked.no} busy={refusing} onPress={() => void sayNo()} />
      ) : null}
      {emergency?.state === 'open' ? <Needs warn title={says.open.title(trusted)} body={says.open.body} button={says.open.button} onPress={() => router.push('/vault/emergency')} /> : null}
      {recovery ? (
        <Needs
          warn
          title={words.vault.locked.recovery.title}
          body={words.vault.locked.recovery.body(timeAgo(recovery.startedAt))}
          button={words.vault.locked.recovery.open}
          onPress={() => router.push('/vault/recover')}
        />
      ) : null}
      {attention.helpNeeded.map((help) => (
        <Needs key={help.id} warn title={says.helpNeeded.title(firstName(help.person.name))} body={says.helpNeeded.body} button={says.helpNeeded.button} onPress={() => router.push('/vault/helping')} />
      ))}
      {attention.helperAsks.map((ask) => (
        <Needs key={ask.id} title={says.helperAsk.title(firstName(ask.person.name))} body={says.helperAsk.body} button={says.helperAsk.button} onPress={() => router.push('/vault/helping')} />
      ))}
      {attention.entrusted.map((one) =>
        one.state === 'open' ? (
          <Needs key={one.id} title={says.entrustedOpen.title(firstName(one.owner.name))} body={says.entrustedOpen.body} button={says.entrustedOpen.button} onPress={() => router.push({ pathname: '/vault/entrusted/[id]', params: { id: one.id } })} />
        ) : one.state === 'asked' ? (
          <Needs
            key={one.id}
            title={says.entrustedAsked.title(firstName(one.owner.name))}
            body={says.entrustedAsked.body(one.opensAt ? momentOf(one.opensAt) : '')}
            button={says.entrustedAsked.button}
            onPress={() => router.push({ pathname: '/vault/entrusted/[id]', params: { id: one.id } })}
          />
        ) : null,
      )}
      {locked ? null : (
        <>
          {attention.waitingForKeys > 0 ? <Needs title={says.waiting.title(attention.waitingForKeys)} body={says.waiting.body} button={says.waiting.button} busy={giving.busy} onPress={give} /> : null}
          {given !== null && attention.waitingForKeys === 0 ? (
            <Txt variant="caption" color="muted" center accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
              {says.waiting.done(given)}
            </Txt>
          ) : null}
          {giving.error ? (
            <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
              {problemOf(giving.error)}
            </Txt>
          ) : null}
          {attention.sharesDue ? <Needs title={says.sharesDue.title} body={says.sharesDue.body} button={says.sharesDue.button} onPress={() => router.push('/vault/key')} /> : null}
          {vault && !vault.keySaved ? <Needs title={says.notSaved.title} body={says.notSaved.body} button={says.notSaved.button} onPress={() => router.push('/vault/key')} /> : null}
        </>
      )}
    </>
  );
}
