import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { initials } from '@/lib/format';
import { colors, fonts } from '@/theme/tokens';

export function Avatar({ name, url, size = 40 }: { name: string | null | undefined; url?: string | null; size?: number }) {
  const box = { width: size, height: size, borderRadius: size / 2 };
  if (url) {
    return <Image source={{ uri: url }} style={box} contentFit="cover" cachePolicy="memory-disk" accessibilityIgnoresInvertColors />;
  }
  return (
    <View style={[styles.fallback, box]}>
      <Text style={[styles.text, { fontSize: size * 0.38 }]}>{initials(name)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: { backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  text: { fontFamily: fonts.bold, color: colors.primary },
});
