import { Route, Sparkle } from 'lucide-react-native';
import { View } from 'react-native';

import type { AlbumResponse } from '@/api/generated/homeport';
import { firstName } from '@/lib/names';
import { useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { Tap } from '@/ui/Motion';
import { Photo } from '@/ui/Photo';
import { Pill } from '@/ui/Pill';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** A few words on what an album is, after how many it holds: its own note, or what follows from how it fills. */
export function albumRest(album: AlbumResponse): string | null {
  const says = words.library.albums;
  if (album.note.trim()) return album.note.trim();
  if (album.origin === 'person' && album.person?.name) return says.ofPerson(firstName(album.person.name));
  if (album.everyoneAdds) return says.everyoneAdds;
  return null;
}

/** The line under an album's name: "544 · everyone adds to it", "214 originals". */
export function albumLine(album: AlbumResponse): string {
  const says = words.library.albums;
  return album.origin === 'journey' ? words.common.join([says.originals(album.count), album.note.trim() || null]) : says.line(album.count, albumRest(album));
}

/**
 * An album as a card: its cover, a small label on it (how many are new, that it fills itself, that it came
 * from Journey), the people who add to it when everyone does, its name and a line under it.
 */
export function AlbumCard({ album, onPress }: { album: AlbumResponse; onPress: () => void }) {
  const { colors } = useTheme();
  const says = words.library.albums;
  const line = albumLine(album);
  return (
    <Tap accessibilityRole="button" accessibilityLabel={says.card(album.title, line)} onPress={onPress} scaleTo={0.98}>
      <Photo uri={album.coverUrl} radius="card" style={{ height: 172, marginBottom: 8 }}>
        <View style={{ position: 'absolute', top: 12, left: 12 }}>
          {album.origin === 'person' ? (
            <Pill label={says.fills} icon={(c) => <Sparkle size={12} color={c} />} />
          ) : album.origin === 'journey' ? (
            <Pill label={says.journey} icon={(c) => <Route size={12} color={c} />} />
          ) : album.fresh > 0 ? (
            <Pill tone="accent" label={says.fresh(album.fresh)} />
          ) : null}
        </View>
        {album.everyoneAdds && album.contributors.length > 0 ? (
          <View style={{ position: 'absolute', left: 10, bottom: 10, flexDirection: 'row' }}>
            {album.contributors.slice(0, 3).map((person, index) => (
              <View key={person.memberId ?? index} style={{ marginLeft: index === 0 ? 0 : -8 }}>
                <Avatar uri={person.avatarUrl} name={person.name ?? ''} size={26} ring={colors.onPhoto} />
              </View>
            ))}
          </View>
        ) : null}
      </Photo>
      <Txt variant="control" numberOfLines={1}>
        {album.title}
      </Txt>
      <Txt variant="small" weight={500} color="muted" numberOfLines={1}>
        {line}
      </Txt>
    </Tap>
  );
}
