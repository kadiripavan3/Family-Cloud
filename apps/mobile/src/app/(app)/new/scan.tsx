import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScanLine } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { ApiError, messageFor } from '@/api/fetcher';
import { addToLibrary, checkLibrary, completeUpload, startUpload } from '@/api/generated/homeport';
import { sendFile } from '@/api/transfer';
import { useCircle } from '@/features/circles/current';
import { bytesOf, pickDocument } from '@/features/library/adding/pick';
import { DOCUMENT_TYPES, fingerprint, nameWithoutEnding, type Picked } from '@/features/library/adding/picked';
import { DocThumb } from '@/features/library/DocRow';
import { formatBytes } from '@/features/library/sizes';
import { useUnsaved } from '@/features/navigation/useUnsaved';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { thingHref } from '@/features/things/open';
import { newClientId } from '@/lib/ids';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { Lead } from '@/ui/Heading';
import { ProgressBar } from '@/ui/ProgressBar';
import { Screen } from '@/ui/Screen';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

const says = words.library.scan;

/** The small label on a document's sheet of paper, by its type: PDF, JPG, PNG. */
function badgeOf(picked: Picked): string {
  return picked.contentType === 'application/pdf' ? 'PDF' : picked.contentType === 'image/png' ? 'PNG' : 'JPG';
}

/**
 * /new/scan, one of the ten things the + sheet opens: a document goes into the current circle's Library,
 * among its files. A phone scans it with the camera and reads the words by itself; until that is built, a
 * picture or a PDF is chosen and the words are typed or pasted, so the API can find its dates and it can
 * be searched. A file that is in the Library already is said to be there, with a way to open it.
 */
export default function NewScan() {
  const router = useRouter();
  const cache = useCache();
  const circle = useCircle();
  const [audience, setAudience] = useStartsAs(circle);
  const [file, setFile] = useState<Picked | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [pages, setPages] = useState('');
  const [progress, setProgress] = useState(0);
  const [refused, setRefused] = useState<string | null>(null);
  // What the same file is in the Library already, when it is.
  const [there, setThere] = useState<string | null>(null);
  const clientId = useRef(newClientId());
  const unsaved = useUnsaved(!!file || text.trim().length > 0);

  const choose = async () => {
    const picked = await pickDocument();
    if (!picked) return;
    setThere(null);
    if (!DOCUMENT_TYPES.includes(picked.contentType)) return setRefused(says.wrongType);
    setRefused(null);
    setFile(picked);
    if (!name.trim()) setName(nameWithoutEnding(picked.name));
  };

  const save = useMutation({
    mutationFn: async (picked: Picked) => {
      const hash = await fingerprint(await bytesOf(picked));
      const known = (await checkLibrary({ circleId: circle.id, hashes: [hash] })).known[0];
      if (known?.id) return { there: known.id };
      // A picture of a document goes up as a photo, kept as it arrives, and is said to be a document.
      const kind = picked.kind === 'photo' ? 'photo' : 'file';
      const target = await startUpload({ kind, contentType: picked.contentType, fileName: picked.name, keepOriginal: kind === 'photo' });
      const status = await sendFile(picked.uri, target, setProgress);
      if (status < 200 || status >= 300) throw new ApiError(status, status === 0 ? 'unreachable' : 'upload_failed', words.media.uploads.fileFailed);
      await completeUpload(target.mediaId);
      const count = Number(pages);
      const answer = await addToLibrary({
        circleId: circle.id,
        items: [{ clientId: clientId.current, mediaId: target.mediaId, kind: 'document', title: name.trim() || nameWithoutEnding(picked.name), text: text.trim() || undefined, pages: Number.isInteger(count) && count > 0 ? count : undefined, contentHash: hash, audience }],
      });
      const added = answer.items[0];
      if (added?.problem) throw new ApiError(400, added.problem.code ?? 'not_added', added.problem.message ?? says.notAdded);
      if (!added?.item?.id) throw new ApiError(500, 'not_added', says.notAdded);
      return added.alreadyThere ? { there: added.item.id } : { made: added.item.id };
    },
    onSuccess: async (result) => {
      if (result.there) return setThere(result.there);
      await cache.libraryAdded(circle.id);
      unsaved.release();
      router.replace(thingHref({ kind: 'document', id: result.made }));
    },
  });
  const failed = save.error instanceof ApiError ? save.error : null;

  return (
    <Screen
      header={<AppBar leading="close" title={says.title} trailing={<View style={{ width: 40 }} />} />}
      footer={file ? <Button label={says.save} size="lg" block loading={save.isPending} onPress={() => save.mutate(file)} /> : <Button label={says.choose} size="lg" block icon={(c) => <ScanLine size={19} color={c} />} onPress={() => void choose()} />}>
      <Lead style={{ marginTop: 4 }}>{says.lead}</Lead>
      {refused ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 12 }}>
          {refused}
        </Txt>
      ) : null}

      {file ? (
        <View style={{ gap: 12, marginTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <DocThumb badge={badgeOf(file)} />
            <View style={{ flex: 1, gap: 3 }}>
              <Txt variant="item" numberOfLines={1}>
                {file.name}
              </Txt>
              {file.bytes != null ? (
                <Txt variant="footnote" color="muted">
                  {formatBytes(file.bytes)}
                </Txt>
              ) : null}
              {save.isPending ? <ProgressBar fraction={progress} /> : null}
            </View>
            <Button label={says.change} size="sm" variant="soft" inline disabled={save.isPending} onPress={() => void choose()} />
          </View>
          <Field label={says.name} value={name} onChangeText={setName} maxLength={200} error={failed?.fields.title} />
          <Field label={says.words} value={text} onChangeText={setText} maxLength={200000} multiline placeholder={says.wordsPlaceholder} />
          <Field label={says.pages} value={pages} onChangeText={(value) => setPages(value.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 4 }}>
            <Txt variant="caption" color="muted">
              {words.things.seenBy}
            </Txt>
            <StartsAsPill circle={circle} value={audience} onChange={setAudience} />
          </View>
          {there ? (
            <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 4 }}>
              <Txt variant="caption" style={{ flex: 1 }}>
                {says.already}
              </Txt>
              <Button
                label={says.openIt}
                size="sm"
                variant="soft"
                inline
                onPress={() => {
                  unsaved.release();
                  router.replace(thingHref({ kind: 'document', id: there }));
                }}
              />
            </View>
          ) : null}
          {save.isError && !failed?.fields.title ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginHorizontal: 4 }}>
              {messageFor(save.error)}
            </Txt>
          ) : null}
        </View>
      ) : null}
      <ConfirmSheet visible={unsaved.asking} onClose={unsaved.stay} title={words.things.discard.title} body={words.things.discard.body} confirm={words.things.discard.confirm} cancel={words.things.discard.cancel} onConfirm={unsaved.leave} />
    </Screen>
  );
}
