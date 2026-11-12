import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Clock, Sparkles } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { useCache } from '@/api/cache';
import { messageFor } from '@/api/fetcher';
import { type CircleResponse, startTemplate, type TemplateCard, useGetBoards } from '@/api/generated/homeport';
import { StartsAsPill } from '@/features/sharing/StartsAsPill';
import { useStartsAs } from '@/features/sharing/useStartsAs';
import { thingHref } from '@/features/things/open';
import { today } from '@/lib/dates';
import { newClientId } from '@/lib/ids';
import { layout } from '@/theme';
import { Button } from '@/ui/Button';
import { GroupLabel } from '@/ui/Heading';
import { NoteBox } from '@/ui/NoteBox';
import { RowGroup } from '@/ui/Rows';
import { Sheet } from '@/ui/Sheet';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

import { opensAfterStart } from './gallery';
import { Arrow, BoardRow, Tile } from './parts/Rows';
import { SETUPS } from './templates';
import type { Start } from './types';

type Props = {
  /** The card that was pressed, or null while the sheet is put away. */
  card: TemplateCard | null;
  circle: CircleResponse;
  onClose: () => void;
};

/**
 * What a card in the gallery opens: what starting the template makes, what it needs to begin (a template
 * that does work may ask: who the letters are for, the day a capsule opens), the ones of it the circle has
 * already, and Start. A plain template makes its pages and lists and opens the first; one that does work
 * makes its board and opens it; one whose rules aren't ready says so and can't be started.
 */
export function StartSheet({ card, circle, onClose }: Props) {
  return (
    <Sheet visible={card !== null} onClose={onClose} title={card?.name} subtitle={card?.line}>
      {/* Another card is another draft: nothing chosen for the last one is carried over. */}
      {card ? <Starting key={card.template} card={card} circle={circle} onClose={onClose} /> : null}
    </Sheet>
  );
}

function Starting({ card, circle, onClose }: { card: TemplateCard; circle: CircleResponse; onClose: () => void }) {
  const router = useRouter();
  const cache = useCache();
  const say = words.templates.gallery.start;
  const code = card.template ?? '';
  const live = !!card.live;
  const ready = !!card.ready;
  const Setup = SETUPS[code];
  /** True for a template that asks something before it starts. */
  const asks = live && ready && Setup !== undefined;
  const [audience, setAudience] = useStartsAs(circle);
  /** What the template's own questions came to: null while one of them is still open. */
  const [asked, setAsked] = useState<Start | null>(asks ? null : {});
  const clientId = useRef(newClientId());

  const boards = useGetBoards(circle.id, card.template ? { template: card.template } : undefined, { query: { enabled: live && ready } });
  const already = boards.data?.items ?? [];

  const start = useMutation({
    mutationFn: () => startTemplate(circle.id, card.template!, { clientId: clientId.current, audience, title: asked?.title, settings: asked?.settings }, { day: today() }),
    onSuccess: (started) => {
      void cache.templateStarted(started, circle.id, today());
      onClose();
      const opens = opensAfterStart(started);
      // The gallery has done its work: what was made takes its place, so Back leads to where the person came from.
      if (opens) router.replace(thingHref(opens));
    },
  });

  if (!ready) {
    return (
      <View style={{ paddingHorizontal: layout.barGutter, paddingTop: 6 }}>
        <NoteBox icon={(color) => <Clock size={20} color={color} />} title={card.note ?? undefined}>
          {say.notReady}
        </NoteBox>
      </View>
    );
  }

  return (
    <View style={{ paddingTop: 6 }}>
      {live ? (
        <NoteBox soft icon={(color) => <Sparkles size={20} color={color} />} style={{ marginHorizontal: layout.barGutter }}>
          {say.liveNote}
        </NoteBox>
      ) : (
        <>
          <GroupLabel style={{ marginTop: 8, marginHorizontal: layout.gutter }}>{say.makes}</GroupLabel>
          <View style={{ gap: 6, paddingHorizontal: layout.gutter }}>
            {(card.makes ?? []).map((made) => (
              // The API's own words for what it makes: "Page · House manual".
              <Txt key={made} variant="item" weight={600}>
                {made}
              </Txt>
            ))}
          </View>
        </>
      )}

      {asks && Setup ? (
        <View style={{ paddingTop: 14 }}>
          <Setup circle={circle} onChange={setAsked} />
        </View>
      ) : null}

      {already.length ? (
        <>
          <GroupLabel style={{ marginHorizontal: layout.gutter }}>{say.already(circle.name)}</GroupLabel>
          <RowGroup>
            {already.map((board, index) => (
              <BoardRow
                key={board.id}
                first={index === 0}
                leading={<Tile emoji={board.emoji || card.emoji} />}
                title={board.title ?? ''}
                line={board.glance}
                trailing={<Arrow />}
                onPress={() => {
                  onClose();
                  router.replace(thingHref({ kind: 'board', id: board.id }));
                }}
              />
            ))}
          </RowGroup>
        </>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16, marginHorizontal: layout.gutter }}>
        <Txt variant="caption" color="muted">
          {words.things.seenBy}
        </Txt>
        <StartsAsPill circle={circle} value={audience} onChange={setAudience} />
      </View>
      {start.isError ? (
        <Txt variant="caption" color="danger" accessibilityLiveRegion="polite" style={{ marginTop: 10, marginHorizontal: layout.gutter }}>
          {messageFor(start.error)}
        </Txt>
      ) : null}
      <View style={{ paddingHorizontal: layout.rowGutter, paddingTop: 14 }}>
        <Button label={already.length ? say.another : say.button} size="lg" block disabled={asked === null} loading={start.isPending} onPress={() => start.mutate()} />
      </View>
    </View>
  );
}
