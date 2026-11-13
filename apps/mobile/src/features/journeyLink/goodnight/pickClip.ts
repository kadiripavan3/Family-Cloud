import * as ImagePicker from 'expo-image-picker';

/** A video chosen or recorded on this device, not sent yet. */
export type Clip = { uri: string; name: string; contentType: string; durationSeconds?: number };

function fromAsset(asset: ImagePicker.ImagePickerAsset): Clip {
  // The phone gives a video's length in milliseconds.
  const seconds = asset.duration == null ? NaN : asset.duration / 1000;
  return { uri: asset.uri, name: asset.fileName ?? asset.uri.split('/').pop() ?? '', contentType: asset.mimeType ?? 'video/mp4', durationSeconds: Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.round(seconds)) : undefined };
}

/** One video from the phone's own library. Null when the person closes it without choosing. */
export async function chooseClip(): Promise<Clip | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1 });
  const asset = result.canceled ? undefined : result.assets[0];
  return asset ? fromAsset(asset) : null;
}

/**
 * Records a clip with the phone's camera, a minute at most. Null when the person closes the camera;
 * "unavailable" when there is no camera to use (the person said no, or this isn't a phone).
 */
export async function recordClip(): Promise<Clip | null | 'unavailable'> {
  const allowed = await ImagePicker.requestCameraPermissionsAsync();
  if (!allowed.granted) return 'unavailable';
  try {
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['videos'], videoMaxDuration: 60, quality: 1 });
    const asset = result.canceled ? undefined : result.assets[0];
    return asset ? fromAsset(asset) : null;
  } catch {
    return 'unavailable';
  }
}
