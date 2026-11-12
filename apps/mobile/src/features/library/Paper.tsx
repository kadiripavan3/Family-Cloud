import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { FileText } from 'lucide-react-native';
import { View } from 'react-native';

import type { DocumentResponse } from '@/api/generated/homeport';
import { layout, radius, themeFor, useTheme, withAlpha } from '@/theme';
import { Txt } from '@/ui/Txt';
import { words } from '@/words';

/** Paper is light whatever the theme: a scan lying on the page, by day or by night. */
const paper = themeFor('light').colors;
const FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

/**
 * A document as the card its scan became: a sheet of paper lying a little askew. When the file is a
 * picture, the picture is the paper, from its top edge down. A PDF has no picture, so its sheet says what
 * kind of file it is and what was read from it that isn't kept out of sight.
 */
export function Paper({ data }: { data: DocumentResponse }) {
  const { shadow } = useTheme();
  const document = data.document;
  const shown = data.facts.filter((fact) => !fact.secret && fact.label && fact.text).slice(0, 3);
  return (
    <View style={{ height: 196, marginTop: 4, marginBottom: 16, marginHorizontal: layout.gutter + 4, borderRadius: radius.field, overflow: 'hidden', backgroundColor: paper.fill, boxShadow: shadow.md, transform: [{ rotate: '-1.2deg' }] }}>
      {data.pictureUrl ? (
        <Image source={{ uri: data.pictureUrl }} recyclingKey={data.pictureUrl} style={FILL} contentFit="cover" contentPosition="top" transition={150} accessibilityLabel={document.title} />
      ) : (
        <>
          <LinearGradient colors={[paper.mapLand, paper.mapWater, paper.accentSoft]} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={FILL} />
          <View style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 18 }}>
            <Txt variant="micro" numberOfLines={1} style={{ color: paper.text, opacity: 0.7, textTransform: 'uppercase' }}>
              {words.common.join([words.library.document.paper(document.badge ?? '', document.pages ?? null), data.fileName])}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 14 }}>
              <View style={{ width: 78, height: 96, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(paper.text, 0.08) }}>
                <FileText size={28} color={paper.muted} />
              </View>
              <View style={{ flex: 1, gap: 7 }}>
                {shown.map((fact) => (
                  <View key={fact.label}>
                    <Txt variant="micro" numberOfLines={1} style={{ color: paper.text, opacity: 0.9, textTransform: 'uppercase' }}>
                      {fact.label}
                    </Txt>
                    <Txt variant="callout" weight={800} numberOfLines={1} style={{ color: paper.text }}>
                      {fact.text}
                    </Txt>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
