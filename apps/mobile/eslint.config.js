// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// The app must look like the designs and use only the tokens (design/tokens.json). These rules keep that true:
// text styles, corners and colours are never written by hand, and emoji are drawn by the Emoji component.
const EMOJI = '[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}]';

const type = {
  selector: 'Property[key.name=/^(fontSize|lineHeight|letterSpacing|fontWeight|fontFamily)$/]',
  message: 'Text styles come from the type scale. Use a Txt variant (and its weight prop), or textStyle() for a box you type in.',
};
const corners = [
  {
    selector: 'Property[key.name=/Radius$/][value.type="Literal"]',
    message: 'Corners come from the radius tokens: radius.card, radius.sheet, radius.pill for anything fully round.',
  },
  {
    selector: 'Property[key.name=/Radius$/] > :matches(ConditionalExpression, BinaryExpression) > Literal[raw=/^[0-9]/]',
    message: 'Corners come from the radius tokens: radius.card, radius.sheet, radius.pill for anything fully round.',
  },
];
const colours = [
  { selector: 'Literal[value=/^#[0-9a-fA-F]{3,8}$/]', message: 'Colours come from the theme: colors.text, colors.stage and so on.' },
  { selector: 'Literal[value=/rgba?\\(/]', message: 'Colours and shadows come from the theme. For a see-through shade of a token use withAlpha().' },
  { selector: 'TemplateElement[value.raw=/rgba?\\(|#[0-9a-fA-F]{6}/]', message: 'Colours and shadows come from the theme. For a see-through shade of a token use withAlpha().' },
];
const emoji = [
  { selector: `JSXText[value=/${EMOJI}/u]`, message: 'Draw emoji with the Emoji component, so they get their 3D icon.' },
  {
    selector: `JSXAttribute[name.name!=/^(emoji|char)$/] Literal[value=/${EMOJI}/u]`,
    message: 'Draw emoji with the Emoji component, so they get their 3D icon. Pass the emoji in an emoji prop, not inside a label.',
  },
  { selector: `TemplateElement[value.raw=/${EMOJI}/u]`, message: 'Draw emoji with the Emoji component, so they get their 3D icon.' },
];

// Every word a person reads or hears lives in the catalog (src/words/en), so the app can be translated. These
// rules keep sentences out of screens and components: there, text comes from `words` (import it from '@/words').
const SAY = 'Put words people read or hear in src/words/en and use words.… here. A sentence with a number or a name in it is a function there.';
// Props that hold words: any text in one of them belongs in the catalog. Add a prop here when a component gets one for text.
const WORDY =
  '^(label|title|subtitle|heading|placeholder|note|hint|body|message|text|caption|detail|line|badge|pill|tag|footnote|description|value|spoken|confirm|cancel|gone|problem|error|emptyTitle|emptyBody|confirmLabel|cancelLabel|copyLabel|dayTitle|titlePlaceholder|accessibilityLabel|accessibilityHint|aria-label)$';
const LETTER = '[A-Za-z]';
// A string that reads like words: it starts with a capital letter and goes on in small ones ("Save", "Add a photo",
// "A bill"). Two words of HTTP look like that too and are let through.
const READS = "^(?!(Authorization|Bearer)\\b)([A-Z][a-z']+( |$)|[A-Z] [a-z])";
// A piece of a sentence in small letters, kept to be glued into one: 'photos or files', 'waiting to upload'.
const fragment = { selector: `Literal[value=/^[a-z']+ [a-z']+ [a-z']+/]:not(ImportDeclaration > *, NewExpression[callee.name=/Error$/] > *)`, message: SAY };
const words = [
  { selector: `JSXText[value=/${LETTER}{2,}/]`, message: SAY },
  // label="Save", label={'Save'}, label={`Save ${n}`}
  { selector: `JSXAttribute[name.name=/${WORDY}/] > Literal[value=/${LETTER}/]`, message: SAY },
  { selector: `JSXAttribute[name.name=/${WORDY}/] > JSXExpressionContainer > Literal[value=/${LETTER}/]`, message: SAY },
  { selector: `JSXAttribute[name.name=/${WORDY}/] > JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw=/${LETTER}/]`, message: SAY },
  // label={saving ? 'Saving…' : 'Save'}, title={title ?? 'Untitled'}: what a choice comes out as, however deep.
  { selector: `JSXAttribute[name.name=/${WORDY}/] ConditionalExpression > Literal.consequent[value=/${LETTER}/]`, message: SAY },
  { selector: `JSXAttribute[name.name=/${WORDY}/] ConditionalExpression > Literal.alternate[value=/${LETTER}/]`, message: SAY },
  { selector: `JSXAttribute[name.name=/${WORDY}/] LogicalExpression > Literal.right[value=/${LETTER}/]`, message: SAY },
  { selector: `JSXAttribute[name.name=/${WORDY}/] :matches(ConditionalExpression, LogicalExpression) > TemplateLiteral > TemplateElement[value.raw=/${LETTER}/]`, message: SAY },
  // Any other prop given something that reads like words: name="A bill". (A testID is for tests, not for people.)
  { selector: `JSXAttribute[name.name!=/${WORDY}|^testID$/] > Literal[value=/${READS}/]`, message: SAY },
  // Anything else that reads like words, wherever it is kept (a variable, a list, an object, a call):
  // 'Add a photo', { label: 'All' }, setProgress('Saving'), `Day ${n}`, `${n} new since your last visit`.
  // What a developer reads when the code itself is wrong (`throw new Error('…')`) is not for the catalog.
  { selector: `Literal[value=/${READS}/]:not(JSXAttribute > *, ImportDeclaration > *, NewExpression[callee.name=/Error$/] > *)`, message: SAY },
  { selector: `TemplateLiteral > TemplateElement:first-child[value.raw=/${READS}/]`, message: SAY },
  { selector: `TemplateLiteral > TemplateElement[value.raw=/ [a-z']{2,} [a-z']{2,}/]`, message: SAY },
  fragment,
];
// Only the catalog's index is for the rest of the app: a screen that reached into one language would never be translated.
const catalogOnly = {
  group: ['@/words/en', '@/words/en/*', '@/words/rich'],
  message: "Import `words` from '@/words'. The files under src/words/en are one language's catalog, chosen there.",
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'src/api/generated/*', 'expo-env.d.ts', '.expo/*'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/theme/**', 'src/**/__tests__/**'],
    rules: {
      'no-restricted-syntax': ['error', type, ...corners, ...colours, ...emoji, ...words],
      'no-restricted-imports': ['error', { patterns: [catalogOnly] }],
    },
  },
  {
    // The catalog itself is where the words are, and the helpers for tests make up people and what they keep.
    files: ['src/words/**/*.ts', 'src/test/**/*.{ts,tsx}'],
    rules: { 'no-restricted-syntax': ['error', type, ...corners, ...colours, ...emoji], 'no-restricted-imports': 'off' },
  },
  {
    // Sizes worked out from a size prop (an avatar's initials, an emoji without a picture) can't be a variant.
    files: ['src/ui/Avatar.tsx', 'src/ui/Emoji.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...corners, ...colours, ...emoji, ...words] },
  },
  {
    // Other companies' logos keep their own colours, and the app's mark its own proportions.
    files: ['src/ui/Brand.tsx'],
    rules: { 'no-restricted-syntax': ['error', type, ...emoji, ...words] },
  },
  {
    // The design system knows nothing about circles, people or the API. Features build on it, not the other way round.
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@/features/*', '@/api/*', '@/auth/*', '@/app/*'], message: 'src/ui is the design system: no features, no API, no session. Move this component to src/features.' },
            catalogOnly,
          ],
        },
      ],
    },
  },
  {
    files: ['src/features/**/*.{ts,tsx}', 'src/lib/**/*.ts', 'src/api/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: ['@/app/*'], message: 'Screens use features, not the other way round.' }, catalogOnly] }],
    },
  },
]);
