import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, fonts, MIN_TOUCH, radius, spacing } from '@/theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  title: string;
  onPress: () => void;
  variant?: Variant;
  /** Shows a spinner and blocks presses — use for every network action to avoid double submits. */
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, style, accessibilityHint }: Props) {
  const blocked = disabled || loading;
  const v = variants[variant];
  return (
    <Pressable
      onPress={blocked ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!blocked, busy: !!loading }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: pressed && !blocked ? v.pressed : v.bg, borderColor: v.border },
        blocked && styles.blocked,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <Text style={[styles.text, { color: v.fg }]} maxFontSizeMultiplier={1.6}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const variants: Record<Variant, { bg: string; pressed: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, pressed: colors.primaryPressed, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.surface, pressed: colors.primarySoft, fg: colors.primary, border: colors.primary },
  ghost: { bg: 'transparent', pressed: colors.primarySoft, fg: colors.primary, border: 'transparent' },
  danger: { bg: colors.surface, pressed: colors.dangerSoft, fg: colors.danger, border: colors.danger },
};

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH + 4,
    borderRadius: radius.lg,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  blocked: { opacity: 0.55 },
  text: { fontFamily: fonts.bold, fontSize: 16 },
});
