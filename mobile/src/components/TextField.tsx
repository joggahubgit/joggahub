import { forwardRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { colors, fonts, MIN_TOUCH, radius, spacing, type } from '@/theme/tokens';

interface Props extends TextInputProps {
  label: string;
  error?: string | null;
}

export const TextField = forwardRef<TextInputInstance, Props>(function TextField({ label, error, style, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={type.label}>{label}</Text>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        placeholderTextColor={colors.textMuted}
        onFocus={e => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={e => { setFocused(false); rest.onBlur?.(e); }}
        style={[
          styles.input,
          focused && { borderColor: colors.primary },
          !!error && { borderColor: colors.danger },
          style,
        ]}
        {...rest}
      />
      {!!error && (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs + 2 },
  input: {
    minHeight: MIN_TOUCH,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  error: { fontFamily: fonts.medium, fontSize: 13, color: colors.danger },
});
