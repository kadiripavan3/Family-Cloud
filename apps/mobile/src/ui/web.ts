import { Platform, type TextStyle } from 'react-native';

/**
 * In a browser, a box you type in gets the browser's own focus ring on top of ours. This takes it off.
 * Put it first in the box's style. On a phone it is nothing.
 */
export const webNoOutline = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as unknown as TextStyle) : null;
