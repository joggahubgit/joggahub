import { Text as RNText, type TextProps } from 'react-native';

/**
 * Text that honours Tailwind font-weight classes with the Inter family, like
 * the web does. React Native can't pick a weight from one family name, so
 * `font-bold` etc. are mapped to the matching loaded Inter face.
 */
const WEIGHTS: [RegExp, string][] = [
  [/\bfont-(black|extrabold)\b/, 'Inter_800ExtraBold'],
  [/\bfont-bold\b/, 'Inter_700Bold'],
  [/\bfont-semibold\b/, 'Inter_600SemiBold'],
  [/\bfont-medium\b/, 'Inter_500Medium'],
];

export function fontFor(className?: string) {
  if (className) for (const [re, family] of WEIGHTS) if (re.test(className)) return family;
  return 'Inter_400Regular';
}

export function Text({ className, style, ...rest }: TextProps & { className?: string }) {
  // fontWeight reset: the face already carries the weight; a bold flag on top
  // makes Android synthesise a heavier, blurrier glyph.
  return <RNText className={className} style={[{ fontFamily: fontFor(className), fontWeight: 'normal' }, style]} maxFontSizeMultiplier={1.6} {...rest} />;
}
