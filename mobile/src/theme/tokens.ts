/**
 * Design tokens taken from the web app's Tailwind usage so both apps share
 * one visual identity (see docs/mobile/AUDIT.md §8).
 */
export const colors = {
  primary: '#7C3AED', // violet-600 — main brand colour
  primaryPressed: '#6D28D9', // violet-700
  primarySoft: '#F5F3FF', // violet-50
  primaryBorder: '#DDD6FE', // violet-200
  brandGradient: ['#9333EA', '#6D28D9', '#3730A3'] as const, // purple-600 → indigo-800

  background: '#F9FAFB', // gray-50
  surface: '#FFFFFF',
  border: '#F3F4F6', // gray-100
  borderStrong: '#E5E7EB', // gray-200

  text: '#111827', // gray-900
  textSecondary: '#6B7280', // gray-500
  textMuted: '#9CA3AF', // gray-400
  onPrimary: '#FFFFFF',

  success: '#16A34A', // green-600
  successSoft: '#DCFCE7',
  warning: '#D97706', // amber-600
  warningSoft: '#FEF3C7',
  danger: '#D4183D', // --destructive
  dangerSoft: '#FEE2E2',
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
