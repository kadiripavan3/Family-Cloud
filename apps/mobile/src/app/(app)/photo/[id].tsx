import { Viewer } from '@/features/library/viewer/Viewer';

/** 6.4 A photo: `/photo/<id>`, where a thing of the kind `photo` opens from any list. The screen itself is the Library's viewer. */
export default function Photo() {
  return <Viewer />;
}
