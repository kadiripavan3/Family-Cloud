import { keepPreviousData } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { ScanLine, Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { type DocumentCard, type DocumentCategory, useGetFilesInfinite, useGetFilesSummary } from '@/api/generated/homeport';
import { more, paged, rows } from '@/api/pages';
import { useCircle } from '@/features/circles/current';
import { DocRow, FolderRow } from '@/features/library/DocRow';
import { PageProblem } from '@/features/states/PageProblem';
import { thingHref } from '@/features/things/open';
import { today } from '@/lib/dates';
import { loadState } from '@/lib/loading';
import { layout, radius, textStyle, useTheme } from '@/theme';
import { AppBar } from '@/ui/AppBar';
import { Button } from '@/ui/Button';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { List } from '@/ui/List';
import { Loading } from '@/ui/Loading';
import { Tap } from '@/ui/Motion';
import { RoundButton } from '@/ui/RoundButton';
import { ListSkeleton } from '@/ui/Skeleton';
import { MAX_TEXT_SCALE, Txt } from '@/ui/Txt';
import { webNoOutline } from '@/ui/web';
import { words } from '@/words';

/** What was typed, a moment after the typing stops: a search isn't sent for every letter. */
function useSettled(value: string, afterMs: number = 300): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), afterMs);
    return () => clearTimeout(timer);
  }, [value, afterMs]);
  return settled;
}

/**
 * 6.7 Files: scans and documents, beside the photos. The box at the top searches their names and the words
 * inside them; the chips narrow to one kind. Each row says what matters about its document: the day it
 * runs out or renews, a receipt's total and warranty, what it is linked from. Folders stand under the files
 * that are in none.
 */
export default function Files() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const circle = useCircle();
  const says = words.library.files;
  const [typed, setTyped] = useState('');
  const [category, setCategory] = useState<DocumentCategory | null>(null);
  const q = useSettled(typed.trim());

  const summary = useGetFilesSummary(circle.id);
  const files = useGetFilesInfinite(circle.id, { category: category ?? undefined, q: q || undefined, day: today() }, { query: { ...paged, placeholderData: keepPreviousData } });
  const load = loadState(summary, files);
  const documents = rows(files.data)?.filter((one): one is DocumentCard & { id: string } => typeof one.id === 'string');
  // Folders stand under the files while nothing narrows the list.
  const folders = !category && !q ? (summary.data?.folders ?? []) : [];
  const open = (document: { id: string }) => router.push(thingHref({ kind: 'document', id: document.id }));

  const head = (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, marginTop: 2, marginBottom: 12, marginHorizontal: layout.barGutter, paddingLeft: 14, paddingRight: 12, borderRadius: radius.pill, backgroundColor: colors.fill }}>
        <Search size={19} color={colors.muted} />
        <TextInput
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
          accessibilityLabel={says.search}
          value={typed}
          onChangeText={setTyped}
          placeholder={says.search}
          placeholderTextColor={colors.muted}
          selectionColor={colors.accent}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[webNoOutline, textStyle('bodyLarge', typed ? 600 : 500, { oneLine: true }), { flex: 1, minHeight: 46, padding: 0, color: colors.text }]}
        />
        {typed ? (
          <Tap accessibilityRole="button" accessibilityLabel={says.clear} hitSlop={12} onPress={() => setTyped('')} style={{ width: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill2 }}>
            <X size={13} color={colors.text} strokeWidth={2.6} />
          </Tap>
        ) : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8, paddingHorizontal: layout.barGutter }} style={{ flexGrow: 0, marginBottom: 8 }}>
        <Chip tone="filter" label={says.all(summary.data?.total ?? 0)} selected={category === null} onPress={() => setCategory(null)} />
        {(summary.data?.categories ?? []).map((one) =>
          one.category ? <Chip key={one.category} tone="filter" label={says.category(one.category)} selected={category === one.category} onPress={() => setCategory(category === one.category ? null : (one.category ?? null))} /> : null,
        )}
      </ScrollView>
    </View>
  );

  const nothing = q ? says.noneFound(q) : null;
  const none = (
    <View style={{ paddingTop: 40 }}>
      {nothing ? (
        <EmptyState emoji="🔎" title={nothing.title} body={nothing.body} />
      ) : category ? (
        <Txt variant="bodySmall" color="muted" center>
          {says.noneOfKind}
        </Txt>
      ) : (
        <EmptyState emoji="📄" title={says.none.title} body={says.none.body} action={<Button label={says.none.add} inline onPress={() => router.push('/new/scan')} />} />
      )}
    </View>
  );
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={says.title} trailing={<RoundButton label={says.scan} onPress={() => router.push('/new/scan')} icon={(c) => <ScanLine size={20} color={c} />} />} />
      {/* The box stays put while what it finds changes underneath, so typing is never interrupted. */}
      {head}
      {load.error ? (
        <PageProblem error={load.error} onRetry={load.retry} retrying={load.retrying} />
      ) : !documents || !summary.data ? (
        load.offline ? (
          <Loading offline />
        ) : (
          <ListSkeleton />
        )
      ) : (
        <List
          data={documents}
          keyOf={(document) => document.id}
          row={(document) => <DocRow document={document} onPress={() => open(document)} />}
          footer={
            <View>
              {folders.map((folder) => (
                <FolderRow key={folder.id} folder={folder} onPress={() => router.push(thingHref({ kind: 'album', id: folder.id }))} />
              ))}
              {documents.length === 0 && folders.length === 0 ? none : null}
            </View>
          }
          bottom={insets.bottom + 40}
          loadingMore={files.isFetchingNextPage}
          {...more(files)}
        />
      )}
    </SafeAreaView>
  );
}
