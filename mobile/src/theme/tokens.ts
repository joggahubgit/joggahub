/**
 * Named tokens for non-className props (icon colours, native header options).
 * Values come from the exact web palette (Tailwind v4, see tailwind.palette.js);
 * screens themselves use Tailwind classes, like the web.
 */
import palette from '../../tailwind.palette';

export const colors = {
  primary: palette.violet['600'],
  primaryPressed: palette.violet['700'],
  primarySoft: palette.violet['50'],
  primaryBorder: palette.violet['200'],

  background: palette.gray['50'],
  surface: '#FFFFFF',
  border: palette.gray['100'],
  borderStrong: palette.gray['200'],

  text: palette.gray['900'],
  textSecondary: palette.gray['500'],
  textMuted: palette.gray['400'],
  onPrimary: '#FFFFFF',

  success: palette.green['600'],
  successSoft: palette.green['100'],
  warning: palette.amber['600'],
  warningSoft: palette.amber['100'],
  danger: palette.red['600'],
  dangerSoft: palette.red['100'],
} as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  extrabold: 'Inter_800ExtraBold',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, full: 999 } as const;

export const type = {
  title: { fontFamily: fonts.bold, fontSize: 24, color: colors.text },
  heading: { fontFamily: fonts.semibold, fontSize: 18, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, color: colors.text },
  caption: { fontFamily: fonts.regular, fontSize: 13, color: colors.textSecondary },
  label: { fontFamily: fonts.semibold, fontSize: 14, color: colors.text },
} as const;

/** Minimum touch target (Apple HIG 44pt / Material 48dp). */
export const MIN_TOUCH = 48;
