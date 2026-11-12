import * as ImagePicker from 'expo-image-picker';

import type { LocalPhoto } from '@/api/upload';

/** Opens the phone's photos for one wide picture, for the top of an event or a goal. Null when the person cancels. */
export async function pickCover(): Promise<LocalPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}
