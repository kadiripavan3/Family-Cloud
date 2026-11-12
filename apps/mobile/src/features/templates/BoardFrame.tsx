import { useMutation } from '@tanstack/react-query';
import { Ellipsis, Pencil, Trash2, Users } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type AudienceChip as ChipAnswer, deleteThing } from '@/api/generated/homeport';
import { AudienceChip } from '@/features/sharing/AudienceChip';
import { AudienceSheet } from '@/features/sharing/AudienceSheet';
import { useGoHome } from '@/features/states/PageProblem';
import { darkTheme, layout, radius, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { AvoidKeyboard } from '@/ui/AvoidKeyboard';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Field } from '@/ui/Field';
import { LightStatusBar } from '@/ui/LightStatusBar';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { Sheet, SheetRow } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { useBoardChanges } from './useBoard';

/** As much of a board as its frame needs: every board the API sends has these. */
export type BoardHead = { id: string; circleId: string; title: string; mine: boolean; canEdit: boolean; chip: ChipAnswer };

/** One row of a template's own in the More sheet: "Add a job", "Another week". */
export type MenuRow = { icon: (color: string) => ReactNode; label: string; note?: string; onPress: () => void };

type Props = {
  board: BoardHead;
  /** The bar's middle, where the drawing has words there. Most boards leave it empty and say who they are in the page. */
  title?: string;
  subtitle?: string;
  /**
   * Where the audience chip stands. "bar" (the usual): in the bar, before More. "menu": only on the More
   * sheet, for a bar that is full already (a title and a search button). Either way the sheet behind it is
   * one tap from the bar.
   */
  chip?: 'bar' | 'menu';
  /** Drawn in the bar in place of the usual chip, where a template words it its own way ("For Mia"). It opens the same sheet. */
  chipLook?: { icon: (color: string) => ReactNode; label: string };
  /** Round buttons of the template's own, before More: search. */
  actions?: ReactNode;
  /**
   * Drawn in place of the bar, for a page whose top is the template's own (a box to ask in, with Cancel,
   * where the question is the page). The template then gives the way back itself and puts `BoardMore` in it.
   */
  bar?: ReactNode;
  /** The template's own rows on the More sheet, above Rename and Delete. */
  menu?: MenuRow[];
  /** Pinned under the page and above the keyboard: the one big button with its small print, or a box to type in. */
  footer?: ReactNode;
  /** Floats over the end of the page: the glass bar with one action. The page leaves room for it. */
  floating?: ReactNode;
  /** False for a board that scrolls by itself (a long list drawn with `List`). */
  scroll?: boolean;
  /** "stage" is the black of a camera or a photo: white icons, glass buttons. */
  tone?: 'page' | 'stage';
  /** Why the last change on the page didn't work, in a sentence: shown under the bar until the next one. */
  problem?: string | null;
  children: ReactNode;
};

/** Room a floating bar needs under the last thing on the page. */
const FLOATING_ROOM = 104;

/**
 * The frame every board's screen stands in: the bar with Back, the audience chip and More; the page, which
 * scrolls and can be pulled down to ask again; and what is pinned or floats at its end. More holds what
 * every board can do (who can see it, a new name, deleting it for its owner) and the template's own rows.
 * A template's screen draws only what is inside.
 */
export function BoardFrame({ board, title, subtitle, chip = 'bar', chipLook, actions, bar, menu, footer, floating, scroll = true, tone = 'page', problem, children }: Props) {
  const theme = useTheme();
  const stage = tone === 'stage';
  const colors = stage ? darkTheme.colors : theme.colors;
  const cache = useCache();
  const [refreshing, setRefreshing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);

  const refresh = () => {
    setRefreshing(true);
    void cache.boardTouched(board).finally(() => setRefreshing(false));
  };

  const trailing = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {chip === 'bar' ? (
        chipLook ? (
          <Tap
            accessibilityRole="button"
            accessibilityLabel={words.sharing.chip.spoken(chipLook.label)}
            hitSlop={9}
            scaleTo={0.94}
            onPress={() => setAudienceOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 26, paddingLeft: 7, paddingRight: 9, borderRadius: radius.pill, backgroundColor: colors.fill }}>
            {chipLook.icon(colors.text)}
            <Txt variant="small" weight={700} numberOfLines={1} style={{ color: colors.text }}>
              {chipLook.label}
            </Txt>
          </Tap>
        ) : (
          <AudienceChip thing={board} />
        )
      ) : null}
      {actions}
      <RoundButton label={words.templates.board.more} tone={stage ? 'photo' : 'soft'} onPress={() => setMenuOpen(true)} icon={(color) => <Ellipsis size={20} color={color} />} />
    </View>
  );

  const page = (
    <>
      {problem ? (
        <Txt variant="caption" color="danger" center accessibilityLiveRegion="polite" style={{ paddingHorizontal: layout.gutter, paddingBottom: 8 }}>
          {problem}
        </Txt>
      ) : null}
      {children}
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: stage ? colors.black : colors.bg }}>
      {stage ? <LightStatusBar /> : null}
      <AvoidKeyboard style={{ flex: 1 }}>
        {stage ? null : (bar ?? <AppBar title={title} subtitle={subtitle} trailing={trailing} />)}
        {scroll ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: floating ? FLOATING_ROOM : 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.muted} />}>
            {page}
          </ScrollView>
        ) : (
          <View style={{ flex: 1 }}>{page}</View>
        )}
        {floating ? <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12 }}>{floating}</View> : null}
        {footer}
      </AvoidKeyboard>
      <BoardMenu board={board} rows={menu} visible={menuOpen} onClose={() => setMenuOpen(false)} onAudience={() => setAudienceOpen(true)} />
      {/* The usual chip opens the sheet by itself; this one is for a chip drawn the template's way, and for More. */}
      <AudienceSheet thingId={board.id} visible={audienceOpen} onClose={() => setAudienceOpen(false)} />
    </SafeAreaView>
  );
}

/** The round More button of a board whose bar is drawn by the template itself (a camera): the same sheet behind it. */
export function BoardMore({ board, rows, tone }: { board: BoardHead; rows?: MenuRow[]; tone?: 'soft' | 'photo' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [audienceOpen, setAudienceOpen] = useState(false);
  return (
    <>
      <RoundButton label={words.templates.board.more} tone={tone} onPress={() => setMenuOpen(true)} icon={(color) => <Ellipsis size={20} color={color} />} />
      <BoardMenu board={board} rows={rows} visible={menuOpen} onClose={() => setMenuOpen(false)} onAudience={() => setAudienceOpen(true)} />
      <AudienceSheet thingId={board.id} visible={audienceOpen} onClose={() => setAudienceOpen(false)} />
    </>
  );
}

type MenuProps = { board: BoardHead; rows?: MenuRow[]; visible: boolean; onClose: () => void; onAudience: () => void };

/**
 * What More opens on every board: who can see it (the one audience sheet), the template's own rows, a new
 * name for anyone who may change it, and Delete for its owner, asked about first. One sheet with three
 * faces, so nothing has to close for the next thing to open.
 */
function BoardMenu({ board, rows = [], visible, onClose, onAudience }: MenuProps) {
  const cache = useCache();
  const goHome = useGoHome();
  const changes = useBoardChanges(board);
  const [face, setFace] = useState<'menu' | 'rename' | 'delete'>('menu');
  const [name, setName] = useState(board.title);

  const close = () => {
    setFace('menu');
    onClose();
  };
  const remove = useMutation({
    mutationFn: () => deleteThing(board.id),
    onSuccess: () => {
      close();
      void cache.thingDeleted(board);
      goHome();
    },
  });
  /** Closes the menu, then does what the row is for. */
  const then = (go: () => void) => () => {
    close();
    go();
  };

  if (face === 'rename') {
    return (
      <Sheet visible={visible} onClose={close} title={words.templates.board.rename.title}>
        <View style={{ paddingHorizontal: layout.rowGutter, paddingTop: 8, gap: 14 }}>
          <Field label={words.templates.board.rename.label} value={name} onChangeText={setName} maxLength={200} autoFocus returnKeyType="done" error={changes.problem} />
          <Button
            label={words.templates.board.rename.save}
            size="lg"
            block
            disabled={!name.trim() || name.trim() === board.title}
            loading={changes.busy}
            onPress={() => void changes.set(undefined, name.trim()).then((saved) => (saved ? close() : undefined))}
          />
        </View>
      </Sheet>
    );
  }
  if (face === 'delete') {
    return (
      <ConfirmSheet
        visible={visible}
        onClose={close}
        title={words.templates.board.delete.title(board.title)}
        body={words.templates.board.delete.body}
        confirm={words.templates.board.delete.confirm}
        busy={remove.isPending}
        problem={remove.isError ? messageFor(remove.error) : null}
        onConfirm={() => remove.mutate()}
      />
    );
  }
  return (
    <Sheet visible={visible} onClose={close} title={board.title}>
      <SheetRow first icon={(color) => <Users size={20} color={color} />} label={words.templates.board.menu.audience} trailing={<AudienceChip thing={board} quiet />} onPress={then(onAudience)} />
      {rows.map((row) => (
        <SheetRow key={row.label} icon={row.icon} label={row.label} note={row.note} onPress={then(row.onPress)} />
      ))}
      {board.canEdit ? (
        <SheetRow
          icon={(color) => <Pencil size={20} color={color} />}
          label={words.templates.board.menu.rename}
          onPress={() => {
            setName(board.title);
            changes.forget();
            setFace('rename');
          }}
        />
      ) : null}
      {board.mine ? (
        <SheetRow
          danger
          icon={(color) => <Trash2 size={20} color={color} />}
          label={words.templates.board.menu.delete}
          onPress={() => {
            remove.reset();
            setFace('delete');
          }}
        />
      ) : null}
    </Sheet>
  );
}
