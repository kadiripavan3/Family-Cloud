import { Anchor, Route } from 'lucide-react-native';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/theme';
import { brand } from '@/theme/tokens';

type Icon = typeof Anchor;

/**
 * The icon the app's mark is drawn with, by its name in the tokens (`brand.icon`). The name of the app is
 * one setting there; a name with another icon doesn't compile until its icon is added here.
 */
const MARKS: Record<typeof brand.icon, Icon> = { anchor: Anchor };

/** A mark: an icon on a rounded tile in the accent colour. */
function Mark({ icon: Drawn, size }: { icon: Icon; size: number }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accent,
      }}>
      <Drawn size={size * 0.55} color={colors.onAccent} strokeWidth={2.2} />
    </View>
  );
}

/** The app's mark: an anchor, on the accent colour. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return <Mark icon={MARKS[brand.icon]} size={size} />;
}

/** The sister app's mark, where the two apps are named together: Journey's route between two points, on the same tile. */
export function JourneyMark({ size = 28 }: { size?: number }) {
  return <Mark icon={Route} size={size} />;
}

export function AppleLogo({ color, size = 20 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"
      />
    </Svg>
  );
}

export function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path fill="#4285F4" d="M23.04 12.26c0-.82-.07-1.6-.21-2.36H12v4.46h6.19a5.29 5.29 0 0 1-2.3 3.47v2.88h3.72c2.18-2 3.43-4.95 3.43-8.45z" />
      <Path fill="#34A853" d="M12 23.5c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.88c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.7v2.98A11.5 11.5 0 0 0 12 23.5z" />
      <Path fill="#FBBC05" d="M5.55 14.18a6.9 6.9 0 0 1 0-4.36V6.84H1.7a11.5 11.5 0 0 0 0 10.32l3.85-2.98z" />
      <Path fill="#EA4335" d="M12 4.57c1.69 0 3.21.58 4.4 1.72l3.3-3.3A11.47 11.47 0 0 0 12 .5 11.5 11.5 0 0 0 1.7 6.84l3.85 2.98C6.46 7.1 9 4.57 12 4.57z" />
    </Svg>
  );
}
