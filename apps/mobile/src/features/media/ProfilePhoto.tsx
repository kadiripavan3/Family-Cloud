import { Camera } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import type { LocalPhoto } from '@/api/upload';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/Avatar';
import { words } from '@/words';

import { pickSquarePhoto } from './pick';

type Props = {
  /** The picture to show: one just picked, the one on the profile, or none. */
  uri: string | null | undefined;
  /** For the initials shown while there is no picture. */
  name: string;
  onPicked: (photo: LocalPhoto) => void;
  /** The phone's photos couldn't be opened: a sentence saying so, for the form to show. */
  onProblem: (message: string) => void;
};

/**
 * The round picture at the top of a profile form, with the small camera on its edge: tap it to choose a
 * photo from the phone, cropped square. It is uploaded when the form is saved, not here.
 */
export function ProfilePhoto({ uri, name, onPicked, onProblem }: Props) {
  const { colors } = useTheme();
  const choose = async () => {
    try {
      const picked = await pickSquarePhoto();
      if (picked) onPicked(picked);
    } catch {
      onProblem(words.media.photosClosed);
    }
  };
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={uri ? words.profile.photo.change : words.profile.photo.add} onPress={() => void choose()} style={{ alignSelf: 'center' }}>
      <Avatar uri={uri} name={name || ' '} size={104} />
      <View
        style={{
          position: 'absolute',
          right: -2,
          bottom: 0,
          width: 36,
          height: 36,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.text,
          borderWidth: 3,
          borderColor: colors.bg,
        }}>
        <Camera size={16} color={colors.bg} />
      </View>
    </Pressable>
  );
}
