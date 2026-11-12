import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { rich } from '@/ui/rich';

describe('rich', () => {
  it('draws a sentence in the order the catalog gives it, with each marked part its own way', async () => {
    const onPress = jest.fn();
    await render(
      <Text>
        {rich(['By continuing you agree to the ', { mark: 'terms', text: 'Terms' }, ' and ', { mark: 'privacy', text: 'Privacy Policy' }, '.'], {
          terms: (text) => (
            <Text accessibilityRole="link" onPress={onPress}>
              {text}
            </Text>
          ),
          privacy: (text) => <Text accessibilityRole="link">{text}</Text>,
        })}
      </Text>,
    );
    expect(screen.getByText('By continuing you agree to the Terms and Privacy Policy.')).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Terms' })).toBeOnTheScreen();
    expect(screen.getByRole('link', { name: 'Privacy Policy' })).toBeOnTheScreen();
  });

  it('draws a mark nobody named as plain text, so no word is lost', async () => {
    await render(<Text>{rich([{ mark: 'bold', text: 'Alex' }, ' invited you'], {})}</Text>);
    expect(screen.getByText('Alex invited you')).toBeOnTheScreen();
  });
});
