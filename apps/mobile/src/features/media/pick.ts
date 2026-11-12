import * as ImagePicker from 'expo-image-picker';

import type { LocalPhoto } from '@/api/upload';

/** Opens the phone's photo library for one photo, cropped square by the person: for a profile picture. Null when they cancel. */
export async function pickSquarePhoto(): Promise<LocalPhoto | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? { uri: asset.uri, width: asset.width, height: asset.height } : null;
}
