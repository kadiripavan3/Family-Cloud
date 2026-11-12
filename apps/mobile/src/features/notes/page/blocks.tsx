import { ChevronRight, Copy, EyeOff, Image as ImageIcon, Lock, MapPin, Paperclip, Plus } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Linking, Platform, TextInput, View } from 'react-native';

import type { BlockResponse, ChecklistResponse, Mark, ThingBrief } from '@/api/generated/homeport';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { kindOf } from '@/features/things/kinds';
import { useOpenThing } from '@/features/things/open';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { Button } from '@/ui/Button';
import { GroupLabel } from '@/ui/Heading';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Pill } from '@/ui/Pill';
import { RowGroup } from '@/ui/Rows';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

import { steadyKeys } from '../changes/apply';
import { LineRow } from '../LineRow';
import { LineSheet } from '../LineSheet';
import { useList } from '../list';
import { useCircleOf } from '../people';
import { WaitingMark } from '../WaitingMark';
import { pieces } from './marks';

/** The kinds of block that are words. One can become another. */
export type TextKind = 'paragraph' | 'heading' | 'bullet';
export const isText = (kind: string | undefined): kind is TextKind => kind === 'paragraph' || kind === 'heading' || kind === 'bullet';

/**
 * How a page is drawn. "page" is the page as its own drawing shows it (5.3). "surprise" is a page that is
 * hidden from someone (4.4): its headings are small labels over what belongs to them, as on a form.
 */
export type Look = 'page' | 'surprise';

/** A block's words with its marks drawn: bold, slanted, struck through, a link to press, someone's name on the accent's soft ground. */
export function Words({ text, marks }: { text: string; marks: readonly Mark[] | undefined }): ReactNode {
  const { colors } = useTheme();
  return pieces(text, marks).map((piece, index) => {
    const has = (kind: Mark['kind']) => piece.marks.find((mark) => mark.kind === kind);
    const link = has('link');
    if (piece.marks.length === 0) return piece.text;
    return (
      <Txt
        key={index}
        variant="body"
        weight={has('mention') ? 700 : has('bold') ? 800 : undefined}
        italic={!!has('italic') && !has('bold') && !has('mention')}
        accessibilityRole={link ? 'link' : undefined}
        onPress={link?.url ? () => void Linking.openURL(link.url ?? '') : undefined}
        style={[
          has('strike') || link ? { textDecorationLine: has('strike') && link ? 'underline line-through' : link ? 'underline' : 'line-through' } : null,
          link || has('mention') ? { color: colors.accentText } : null,
          has('mention') ? { backgroundColor: colors.accentSoft, borderRadius: radius.chip, paddingHorizontal: 4 } : null,
        ]}>
        {piece.text}
      </Txt>
    );
  });
}

type TextProps = {
  block: BlockResponse;
  look: Look;
  /** Pressing it starts typing in it; holding it opens its menu. Left out for someone who may only read. */
  onPress?: () => void;
  onMore?: () => void;
  waiting?: boolean;
};

/** A paragraph, a heading or a bullet, as it reads. */
export function TextBlock({ block, look, onPress, onMore, waiting }: TextProps) {
  const { colors } = useTheme();
  const kind: TextKind = isText(block.kind) ? block.kind : 'paragraph';
  const said =
    kind === 'heading' ? (
      look === 'surprise' ? (
        <GroupLabel style={{ marginHorizontal: 2 }}>{block.text}</GroupLabel>
      ) : (
        <Txt variant="subtitle" accessibilityRole="header" style={{ marginTop: 18, marginBottom: 4 }}>
          {block.text}
        </Txt>
      )
    ) : kind === 'bullet' ? (
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
        <Txt color="muted">{'•'}</Txt>
        <Txt selectable={!onPress} style={{ flex: 1 }}>
          <Words text={block.text} marks={block.marks} />
        </Txt>
      </View>
    ) : (
      <Txt selectable={!onPress} style={{ marginTop: 12 }}>
        <Words text={block.text} marks={block.marks} />
      </Txt>
    );
  return (
    <View style={{ marginHorizontal: layout.rowGutter }}>
      {onPress ? (
        <Tap accessibilityRole="button" accessibilityLabel={words.notes.page.edit(kind, block.text)} onPress={onPress} onLongPress={onMore} scaleTo={1} style={{ minHeight: kind === 'heading' ? undefined : 30, backgroundColor: colors.bg }}>
          {said}
        </Tap>
      ) : (
        said
      )}
      {waiting ? <Waits /> : null}
    </View>
  );
}

/** The "waiting" mark under a block that has a change on the phone. */
function Waits() {
  return (
    <View style={{ flexDirection: 'row', marginTop: 4 }}>
      <WaitingMark />
    </View>
  );
}

type TypingProps = {
  kind: TextKind;
  value: string;
  onChange: (typed: string) => void;
  /** Return was pressed: this block is done, and the next one begins. */
  onNext: () => void;
};

/**
 * A text block while it is typed in: the same place, the same size, a box with no frame. Its marks are
 * written the way people write them in a message (`marks.ts`), and a quiet line under it says how. The box
 * stays a box when the cursor leaves it (to press a button of the bar, say): "Done" in the bar ends it.
 */
export function TypingBlock({ kind, value, onChange, onNext }: TypingProps) {
  const { colors } = useTheme();
  const [height, setHeight] = useState(0);
  return (
    <View style={{ marginHorizontal: layout.rowGutter, marginTop: kind === 'heading' ? 18 : kind === 'bullet' ? 6 : 12 }}>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {kind === 'bullet' ? <Txt color="muted">{'•'}</Txt> : null}
        <TextInput
          accessibilityLabel={words.notes.page.text[kind]}
          autoFocus
          multiline
          rows={1}
          scrollEnabled={false}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          placeholder={words.things.page.bodyPlaceholder}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          value={value}
          onChangeText={onChange}
          maxLength={100000}
          // Return ends this block and begins the next one. (A browser's box takes Return as a new row, so it is caught there.)
          submitBehavior="submit"
          onSubmitEditing={Platform.OS === 'web' ? undefined : onNext}
          onKeyPress={
            Platform.OS === 'web'
              ? (event) => {
                  const pressed = event.nativeEvent as { key: string; shiftKey?: boolean };
                  if (pressed.key.toLowerCase() !== 'enter' || pressed.shiftKey) return;
                  event.preventDefault();
                  onNext();
                }
              : undefined
          }
          textAlignVertical="top"
          onContentSizeChange={(event) => setHeight(Math.ceil(event.nativeEvent.contentSize.height))}
          style={[webNoOutline, textStyle(kind === 'heading' ? 'subtitle' : 'body'), { flex: 1, padding: 0, color: colors.text, height: height > 0 ? height : undefined }]}
        />
      </View>
      <Txt variant="small" weight={500} color="muted" style={{ marginTop: 6 }}>
        {words.notes.page.marksHint}
      </Txt>
    </View>
  );
}

/** The soft card several kinds of block share: an icon, a bold line, a quiet line, and something at the end. */
function Card({ icon, title, line, lineIcon, trailing, onPress, onMore, spoken, waiting }: { icon: ReactNode; title: string; line?: string | null; lineIcon?: ReactNode; trailing?: ReactNode; onPress?: () => void; onMore?: () => void; spoken?: string; waiting?: boolean }) {
  const { colors } = useTheme();
  const inside = (
    <>
      {icon}
      <View style={{ flex: 1 }}>
        <Txt variant="item" weight={800} numberOfLines={2}>
          {title}
        </Txt>
        {line ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {lineIcon}
            <Txt variant="footnote" color="muted" numberOfLines={2} style={{ flexShrink: 1 }}>
              {line}
            </Txt>
          </View>
        ) : null}
      </View>
      {trailing}
    </>
  );
  const frame = { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingVertical: 12, paddingLeft: 14, paddingRight: 12, borderRadius: radius.photo, backgroundColor: colors.fill } as const;
  return (
    <View style={{ marginTop: 12, marginHorizontal: layout.rowGutter }}>
      {onPress || onMore ? (
        <Tap accessibilityRole="button" accessibilityLabel={spoken ?? words.common.spoken([title, line])} onPress={onPress} onLongPress={onMore} scaleTo={0.99} style={frame}>
          {inside}
        </Tap>
      ) : (
        <View accessible accessibilityLabel={spoken ?? words.common.spoken([title, line])} style={frame}>
          {inside}
        </View>
      )}
      {waiting ? <Waits /> : null}
    </View>
  );
}

type BlockProps = { block: BlockResponse; onMore?: () => void; waiting?: boolean };

/** A photo across the page, with its words on a small label at its lower edge. */
export function PhotoBlock({ block, onMore, waiting }: BlockProps) {
  const { colors } = useTheme();
  const caption = block.text.trim();
  const photo = (
    <Photo uri={block.media?.url} radius="card" label={caption || words.notes.page.photo} style={{ height: 132 }}>
      {caption ? <Pill label={caption} icon={(c) => <ImageIcon size={13} color={c} />} style={{ position: 'absolute', left: 10, bottom: 10, maxWidth: '90%' }} /> : null}
    </Photo>
  );
  return (
    <View style={{ marginTop: 12, marginHorizontal: layout.rowGutter }}>
      {onMore ? (
        <Tap accessibilityRole="button" accessibilityLabel={words.things.list.line(caption || words.notes.page.photo)} onPress={onMore} onLongPress={onMore} scaleTo={0.99} style={{ borderRadius: radius.card, backgroundColor: colors.fill }}>
          {photo}
        </Tap>
      ) : (
        photo
      )}
      {waiting ? <Waits /> : null}
    </View>
  );
}

/** A file: its name and how big it is. Pressing it opens the file. */
export function FileBlock({ block, onMore, waiting }: BlockProps) {
  const { colors } = useTheme();
  const name = block.text.trim() || block.media?.fileName || words.notes.page.file;
  const address = block.media?.fileUrl || block.media?.url;
  return (
    <Card
      icon={<Paperclip size={20} color={colors.text} />}
      title={name}
      line={block.media?.bytes ? words.notes.page.size(block.media.bytes) : null}
      spoken={words.notes.page.openFile(name)}
      onPress={address ? () => void Linking.openURL(address) : undefined}
      onMore={onMore}
      waiting={waiting}
    />
  );
}

/** The address a place opens at: the phone's own maps on an iPhone, a map in the browser elsewhere. */
function mapOf(block: BlockResponse): string {
  const where = block.lat !== null && block.lng !== null ? `${block.lat},${block.lng}` : block.text;
  return Platform.OS === 'ios' ? `http://maps.apple.com/?q=${encodeURIComponent(where)}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(where)}`;
}

/** A place: where it is, in words. Pressing it opens a map there. */
export function PlaceBlock({ block, onMore, waiting }: BlockProps) {
  const { colors } = useTheme();
  return <Card icon={<MapPin size={20} color={colors.text} />} title={block.text} line={words.notes.page.place.opens} spoken={words.notes.page.place.open(block.text)} onPress={() => void Linking.openURL(mapOf(block))} onMore={onMore} waiting={waiting} />;
}

/** Stands where a list or a live block shows something the reader can't see: that something is there, and nothing of it. */
export function UnseenBlock() {
  const { colors } = useTheme();
  return <Card icon={<EyeOff size={20} color={colors.muted} />} title={words.notes.page.unseen.title} line={words.notes.page.unseen.body} />;
}

/**
 * A live block by itself: another thing as it stands today, with its title, a line on where it stands and
 * who sees it. Pressing it opens the thing. A password shows "Copy" instead of who sees it: that opens it in
 * the Vault, which asks to be unlocked and copies there. Nothing of a password is ever on a page.
 */
export function LiveBlock({ block, thing, onMore, waiting }: BlockProps & { thing: ThingBrief }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  const kind = kindOf(thing.kind);
  const Icon = kind.icon;
  const title = thing.title?.trim() || words.things.untitled;
  const secret = thing.kind === 'vault_item';
  return (
    <Card
      icon={<Icon size={20} color={colors.text} />}
      title={title}
      line={thing.glance}
      lineIcon={secret ? <Lock size={12} color={colors.muted} /> : undefined}
      spoken={words.things.row(title, kind.name, thing.glance)}
      onPress={() => open(thing)}
      onMore={onMore}
      waiting={waiting}
      trailing={secret ? <Button size="sm" variant="soft" inline label={words.notes.page.copy} icon={(c) => <Copy size={15} color={c} />} onPress={() => open(thing)} /> : <AudienceChip thing={thing} quiet />}
    />
  );
}

/**
 * Two or more live blocks in a row, drawn together as one card of links: the party's event, its budget and
 * its list. Each row is the thing as it stands today; pressing it opens the thing, holding it opens the
 * block's menu.
 */
export function LinkRows({ blocks, onMore }: { blocks: readonly BlockResponse[]; onMore?: (block: BlockResponse) => void }) {
  const { colors } = useTheme();
  const open = useOpenThing();
  return (
    <RowGroup>
      {blocks.map((block, index) => {
        const thing = block.thing;
        if (!thing) return null;
        const kind = kindOf(thing.kind);
        const Icon = kind.icon;
        const title = thing.title?.trim() || words.things.untitled;
        return (
          <Tap
            key={block.id}
            accessibilityRole="button"
            accessibilityLabel={words.things.row(title, kind.name, thing.glance)}
            onPress={() => open(thing)}
            onLongPress={onMore ? () => onMore(block) : undefined}
            scaleTo={0.99}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, paddingVertical: 14, paddingHorizontal: 16, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.line }}>
            <Icon size={22} color={colors.text} />
            <View style={{ flex: 1, gap: 1 }}>
              <Txt variant="item" weight={600} numberOfLines={1}>
                {title}
              </Txt>
              {thing.glance ? (
                <Txt variant="footnote" color="muted" numberOfLines={2}>
                  {thing.glance}
                </Txt>
              ) : null}
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Tap>
        );
      })}
    </RowGroup>
  );
}

/** A list that was started in a page without a connection: it has no lines to tick until the API has made it. */
export function WaitingList({ block }: { block: BlockResponse }) {
  const { colors } = useTheme();
  return <Card icon={<Plus size={20} color={colors.muted} />} title={block.text || words.things.kind('checklist').name} line={words.notes.page.listWaiting} waiting />;
}

type ListProps = {
  /** The list, as the page's answer carries it. */
  loaded: ChecklistResponse;
  look: Look;
  /** Holding a line's words in a page someone may change: the block's own menu is one of the line sheet's ways out. */
  onMore?: () => void;
};

/**
 * A list drawn inside a page, with its lines to tick right there. It is the same list as on its own screen:
 * ticks and changes go through the same queue, so they work without a connection and show up for everyone
 * who has the page or the list open. A list with no lines yet offers a box to add the first ones.
 */
export function ListBlock({ loaded, look, onMore }: ListProps) {
  const { colors } = useTheme();
  const circle = useCircleOf(loaded.circleId);
  const { list, marked, waiting, tick, add, change, remove } = useList(loaded);
  const [lineId, setLineId] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const line = list.items.find((item) => item.id === lineId) ?? null;
  const steady = steadyKeys(waiting.aliases);
  return (
    <View style={{ marginHorizontal: layout.rowGutter, marginTop: look === 'surprise' ? 0 : 2 }}>
      {list.items.map((item) => (
        <LineRow key={steady(item.id)} item={item} look={look === 'surprise' ? 'form' : 'page'} canEdit={list.canEdit} waiting={waiting.held && marked.has(item.id)} currency={list.currency} myMemberId={circle?.myMemberId} onTick={() => tick(item)} onMore={() => setLineId(item.id)} onHold={onMore} />
      ))}
      {list.items.length === 0 && list.canEdit ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 }}>
          <Plus size={20} color={colors.muted} />
          <TextInput
            accessibilityLabel={words.notes.page.addLine}
            placeholder={words.notes.page.addLine}
            placeholderTextColor={colors.muted}
            selectionColor={colors.accent}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
            value={typed}
            onChangeText={setTyped}
            maxLength={300}
            returnKeyType="done"
            submitBehavior="submit"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (!typed.trim()) return;
              add(typed.trim());
              setTyped('');
            }}
            style={[webNoOutline, textStyle('body', 600, { oneLine: true }), { flex: 1, minHeight: 24, padding: 0, color: colors.text }]}
          />
        </View>
      ) : null}
      <LineSheet item={line} list={list} circle={circle} onClose={() => setLineId(null)} onChange={change} onRemove={remove} />
    </View>
  );
}
