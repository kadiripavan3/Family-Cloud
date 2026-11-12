import { useLocalSearchParams, useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { deleteThing, useGetVaultItem, type VaultItemResponse } from '@/api/generated/homeport';
import { placeHref } from '@/features/home/places';
import { useLeave } from '@/features/navigation/useLeave';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { PageProblem } from '@/features/states/PageProblem';
import { type ItemDraft, itemGone, type Opened, openItem, saveItem } from '@/features/vault/actions';
import { VaultScreen } from '@/features/vault/Gate';
import { ItemForm, readyToSave } from '@/features/vault/ItemForm';
import { problemOf } from '@/features/vault/problems';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { loadState } from '@/lib/loading';
import { useTheme } from '@/theme';
import { AppBar, BarLink } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Loading } from '@/ui/Loading';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * Changing an item of the Vault: the same form it was made with, filled with what is inside. Saving seals
 * the new inside with the same item key and sends it with the version that was read, so a change someone
 * else saved meanwhile is noticed instead of overwritten. Its owner can delete it from here.
 */
export default function EditVaultItem() {
  return (
    <VaultScreen leading="close">
      <Unlocked />
    </VaultScreen>
  );
}

function Unlocked() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const asked = useGetVaultItem(id);
  const load = loadState(asked);
  const item = asked.data;
  const [opened, setOpened] = useState<Opened | null>(null);
  const opening = useSecretAction();
  const { run } = opening;

  // Opened once for this visit. What comes out is this screen's alone, and its key is overwritten on the way out.
  const held = useRef<Opened | null>(null);
  const asking = useRef(false);
  useEffect(() => {
    if (!item || asking.current) return;
    asking.current = true;
    void run(async () => {
      held.current = await openItem(item);
      setOpened(held.current);
    });
  }, [item, run]);
  useEffect(
    () => () => {
      held.current?.itemKey.fill(0);
    },
    [],
  );

  if (item && opened) return <Form item={item} opened={opened} />;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar leading="close" title={words.vault.form.editTitle} />
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} inset={false} />
      ) : opening.error ? (
        <Txt variant="callout" color="danger" center accessibilityLiveRegion="polite" style={{ margin: 24 }}>
          {problemOf(opening.error)}
        </Txt>
      ) : (
        <Loading offline={load.offline} />
      )}
    </SafeAreaView>
  );
}

function Form({ item, opened }: { item: VaultItemResponse; opened: Opened }) {
  const router = useRouter();
  const cache = useCache();
  const leave = useLeave(placeHref('vault'));
  const [draft, setDraft] = useState<ItemDraft>(() => ({ category: item.category, title: opened.inside.title || item.title, site: opened.inside.site || item.site, fields: { ...opened.inside.fields }, expiresOn: item.expiresOn }));
  const [changed, setChanged] = useState(false);
  const [wrong, setWrong] = useState<'title' | 'totp' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const saving = useSecretAction();
  const removing = useSecretAction();
  const unsaved = useUnsaved(changed);
  const says = words.vault.form;

  const save = async () => {
    const ready = readyToSave(draft);
    if ('wrong' in ready) {
      setWrong(ready.wrong);
      return;
    }
    setWrong(null);
    const saved = await saving.run(async () => {
      void cache.vaultItemSaved(await saveItem(item, opened, ready.draft));
    });
    if (!saved) return;
    unsaved.release();
    leave();
  };
  const remove = async () => {
    const gone = await removing.run(async () => {
      await deleteThing(item.id);
      itemGone(item.id);
    });
    if (!gone) return;
    setDeleting(false);
    unsaved.release();
    // Its own page, underneath this one, has nothing left to show: both go, and the Vault is what is left.
    router.dismissAll();
    router.navigate(placeHref('vault'));
    void cache.vaultItemDeleted(item);
  };

  return (
    <Screen header={<AppBar leading="close" title={says.editTitle} trailing={<BarLink label={says.save} disabled={!changed || saving.busy} onPress={() => void save()} />} />}>
      <ItemForm
        draft={draft}
        onChange={(next) => {
          setDraft(next);
          setChanged(true);
        }}
        itemId={item.id}
        wrong={wrong}
        disabled={saving.busy}
      />
      {saving.error ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 12, marginHorizontal: 4 }}>
          {problemOf(saving.error)}
        </Txt>
      ) : null}
      {item.mine ? (
        <View style={{ alignItems: 'flex-start', marginTop: 28 }}>
          <Button label={says.delete} variant="soft" icon={(c) => <Trash2 size={18} color={c} />} onPress={() => setDeleting(true)} />
        </View>
      ) : null}
      <ConfirmSheet
        visible={deleting}
        onClose={() => setDeleting(false)}
        title={says.deleteAsk.title}
        body={says.deleteAsk.body}
        confirm={says.deleteAsk.confirm}
        busy={removing.busy}
        problem={removing.error ? messageFor(removing.error) : null}
        onConfirm={() => void remove()}
      />
      <ConfirmSheet visible={unsaved.asking} onClose={unsaved.stay} title={says.discard.title} body={says.discard.body} confirm={says.discard.confirm} cancel={says.discard.cancel} onConfirm={unsaved.leave} />
    </Screen>
  );
}
