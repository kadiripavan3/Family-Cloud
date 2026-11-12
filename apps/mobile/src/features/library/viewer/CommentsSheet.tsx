import { useMutation } from '@tanstack/react-query';
import { Send, X } from 'lucide-react-native';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { addLibraryComment, type CommentResponse, removeLibraryComment, useGetLibraryCommentsInfinite, useGetMe } from '@/api/generated/homeport';
import { paged, rows } from '@/api/pages';
import { timeAgo } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Loading } from '@/ui/Loading';
import { MoreButton } from '@/ui/MoreButton';
import { Tap } from '@/ui/Motion';
import { Problem } from '@/ui/Problem';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet } from '@/ui/Sheet';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

type Props = {
  /** The photo, video or document the comments are under. */
  itemId: string;
  /** How many it has, as its own page says. */
  count: number;
  visible: boolean;
  onClose: () => void;
};

/**
 * What people said under a photo, the oldest first, and a box to say something. You can remove what you
 * wrote, and anything under a photo of your own. The sheet belongs to its photo: what was typed never
 * carries over to another one.
 */
export function CommentsSheet(props: Props) {
  return <Comments key={props.itemId} {...props} />;
}

function Comments({ itemId, count, visible, onClose }: Props) {
  const { colors } = useTheme();
  const cache = useCache();
  const me = useGetMe().data?.profile;
  const says = words.library.viewer.talk;
  const comments = useGetLibraryCommentsInfinite(itemId, undefined, { query: { ...paged, enabled: visible } });
  // One id per comment being written: sending it again after a lost answer still makes one comment.
  const [draftId, setDraftId] = useState(newClientId);
  const [text, setText] = useState('');
  const [removing, setRemoving] = useState<CommentResponse | null>(null);
  // Comments sent from here. A long thread loads a page at a time, so a new one may lie beyond what is
  // loaded: it is shown anyway, at the end, until its page arrives.
  const [sent, setSent] = useState<CommentResponse[]>([]);
  const [gone, setGone] = useState<string[]>([]);

  const add = useMutation({
    mutationFn: (body: string) => addLibraryComment(itemId, { clientId: draftId, body }),
    onSuccess: (comment) => {
      setSent((now) => [...now, comment]);
      setText('');
      setDraftId(newClientId());
      return cache.photoCommented(itemId);
    },
  });
  const remove = useMutation({
    mutationFn: (comment: CommentResponse) => removeLibraryComment(comment.id),
    onSuccess: (_, comment) => {
      setGone((now) => [...now, comment.id]);
      setRemoving(null);
      return cache.photoCommented(itemId);
    },
  });

  const known = new Set<string>(gone);
  const all = [...(rows(comments.data) ?? []), ...sent].filter((comment) => (known.has(comment.id) ? false : !!known.add(comment.id)));
  const send = () => {
    if (text.trim() && !add.isPending) add.mutate(text.trim());
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      tall
      title={says.title(Math.max(count, all.length))}
      action={<RoundButton label={says.close} onPress={onClose} icon={(c) => <X size={18} color={c} />} />}
      footer={
        <View>
          {add.isError ? (
            <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.barGutter, paddingTop: 8 }}>
              {messageFor(add.error)}
            </Txt>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: layout.barGutter, paddingTop: 12, paddingBottom: 4 }}>
            <Avatar uri={me?.avatarUrl} name={me?.displayName ?? ' '} size={34} />
            <TextInput
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
              accessibilityLabel={says.add}
              value={text}
              onChangeText={setText}
              placeholder={says.add}
              placeholderTextColor={colors.muted}
              selectionColor={colors.accent}
              maxLength={1000}
              returnKeyType="send"
              onSubmitEditing={send}
              style={[webNoOutline, textStyle('callout', 500, { oneLine: true }), { flex: 1, minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.fill, color: colors.text }]}
            />
            <Tap
              accessibilityRole="button"
              accessibilityLabel={says.send}
              accessibilityState={{ disabled: !text.trim() || add.isPending }}
              disabled={!text.trim() || add.isPending}
              hitSlop={4}
              scaleTo={0.9}
              onPress={send}
              style={{ width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, opacity: text.trim() ? 1 : 0.38 }}>
              <Send size={18} color={colors.onAccent} />
            </Tap>
          </View>
        </View>
      }>
      <ConfirmSheet
        visible={!!removing}
        onClose={() => setRemoving(null)}
        title={says.removeAsk.title}
        body={says.removeAsk.body}
        confirm={says.removeAsk.confirm}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => removing && remove.mutate(removing)}
      />
      <View style={{ paddingHorizontal: layout.rowGutter, paddingBottom: 20 }}>
        {comments.isPending ? (
          <View style={{ height: 160 }}>
            <Loading offline={comments.isPaused} />
          </View>
        ) : comments.isError && !comments.data ? (
          <View style={{ height: 240 }}>
            <Problem message={messageFor(comments.error)} onRetry={() => void comments.refetch()} retrying={comments.isRefetching} />
          </View>
        ) : all.length === 0 ? (
          <Txt variant="bodySmall" color="muted" center style={{ marginTop: 40 }}>
            {says.none}
          </Txt>
        ) : (
          <>
            {all.map((comment) => {
              const name = comment.by?.name ?? says.someone;
              return (
                <View key={comment.id} style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
                  <Avatar uri={comment.by?.avatarUrl} name={name} size={34} />
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Txt variant="note" numberOfLines={1} weight={800} style={{ flexShrink: 1 }}>
                        {name}
                      </Txt>
                      <Txt variant="small" weight={500} color="muted">
                        {timeAgo(comment.createdAt)}
                      </Txt>
                    </View>
                    <Txt variant="callout" style={{ marginTop: 2 }}>
                      {comment.body}
                    </Txt>
                    {comment.canRemove ? (
                      <Tap accessibilityRole="button" accessibilityLabel={says.removeBy(name)} hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }} onPress={() => setRemoving(comment)} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
                        <Txt variant="footnote" color="muted" weight={700}>
                          {says.remove}
                        </Txt>
                      </Tap>
                    ) : null}
                  </View>
                </View>
              );
            })}
            <MoreButton pages={comments} label={says.showMore} />
          </>
        )}
      </View>
    </Sheet>
  );
}
