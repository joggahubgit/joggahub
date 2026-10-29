import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts, radius, spacing } from '@/theme/tokens';

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

const tones: Record<Tone, { bg: string; fg: string }> = {
  primary: { bg: colors.primarySoft, fg: colors.primary },
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  neutral: { bg: colors.border, fg: colors.textSecondary },
};

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const t = tones[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: radius.full, paddingHorizontal: spacing.sm + 2, paddingVertical: 3 },
  text: { fontFamily: fonts.semibold, fontSize: 12 },
});
