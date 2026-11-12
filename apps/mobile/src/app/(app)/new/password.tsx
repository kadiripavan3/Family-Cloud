import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';

import { useCache } from '@/api/cache';
import { useCircle } from '@/features/circles/current';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { thingHref } from '@/features/things/open';
import { createItem, type ItemDraft } from '@/features/vault/actions';
import { VaultScreen } from '@/features/vault/Gate';
import { emptyDraft, ItemForm, readyToSave } from '@/features/vault/ItemForm';
import { isDrawer } from '@/features/vault/look';
import { problemOf } from '@/features/vault/problems';
import { useSecretAction } from '@/features/vault/useSecretAction';
import { newClientId } from '@/lib/ids';
import { AppBar, BarLink } from '@/ui/AppBar';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/**
 * /new/password, one of the ten things the + sheet opens: a login, a card, an ID, a Wi‑Fi network, a code or
 * a secret note, made in the current circle. What is typed under the title and the label is scrambled on
 * this phone with a key of its own before anything is sent. It always starts as only its maker's, whatever
 * the + sheet or the circle's kind says: a password is never shared by default.
 */
export default function NewPassword() {
  return (
    <VaultScreen leading="close">
      <Form />
    </VaultScreen>
  );
}

function Form() {
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const asked = useLocalSearchParams<{ category?: string }>().category;
  const [draft, setDraft] = useState<ItemDraft>(() => emptyDraft(isDrawer(asked) ? asked : 'login'));
  const [wrong, setWrong] = useState<'title' | 'totp' | null>(null);
  const clientId = useRef(newClientId());
  const saving = useSecretAction();
  const typed = draft.title.trim().length > 0 || draft.site.trim().length > 0 || Object.values(draft.fields).some((value) => value);
  const unsaved = useUnsaved(typed);
  const says = words.vault.form;

  const save = async () => {
    const ready = readyToSave(draft);
    if ('wrong' in ready) {
      setWrong(ready.wrong);
      return;
    }
    setWrong(null);
    let id: string | null = null;
    const saved = await saving.run(async () => {
      const item = await createItem(circle.id, clientId.current, ready.draft);
      id = item.id;
      void cache.vaultItemMade(item);
    });
    if (!saved || !id) return;
    unsaved.release();
    router.replace(thingHref({ kind: 'vault_item', id }));
  };

  return (
    <Screen header={<AppBar leading="close" title={words.vault.drawers[draft.category].new} trailing={<BarLink label={says.create} disabled={!typed || saving.busy} onPress={() => void save()} />} />}>
      <ItemForm draft={draft} onChange={setDraft} onCategory={(category) => setDraft((old) => ({ ...old, category }))} itemId={null} wrong={wrong} disabled={saving.busy} />
      {saving.error ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 12, marginHorizontal: 4 }}>
          {problemOf(saving.error)}
        </Txt>
      ) : null}
      <ConfirmSheet visible={unsaved.asking} onClose={unsaved.stay} title={says.discard.title} body={says.discard.body} confirm={says.discard.confirm} cancel={says.discard.cancel} onConfirm={unsaved.leave} />
    </Screen>
  );
}
