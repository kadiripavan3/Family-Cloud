/** A recording on this device, picked or made, before it is sent up. */
export type LocalSound = {
  uri: string;
  /** What kind of file it is: "audio/mp4", "audio/wav". */
  contentType: string;
  /** How long it is, in whole seconds, when the device could tell. */
  seconds: number | null;
  /** What the file is called on the device. */
  name: string;
};
