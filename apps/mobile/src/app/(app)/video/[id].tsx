import { Viewer } from '@/features/library/viewer/Viewer';

/** A video: `/video/<id>`, where a thing of the kind `video` opens from any list. It is the same viewer as a photo's (6.4), with a button that plays it. */
export default function Video() {
  return <Viewer />;
}
