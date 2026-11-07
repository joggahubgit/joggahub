// Port of src/app/components/SplashScreen.tsx (web): branded intro shown on
// every cold start, right after the native splash (same purple) is hidden.
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Image } from 'expo-image';
import { Text } from '@/components/ui/Text';
import palette from '../../tailwind.palette';

const HOLD_MS = 1100;
const EXIT_MS = 900;

export function AppSplash({ onFinish }: { onFinish: () => void }) {
  const screen = useRef(new Animated.Value(1)).current; // whole overlay opacity
  const content = useRef(new Animated.Value(0)).current; // 0 enter → 1 hold → 2 exit

  useEffect(() => {
    const ease = Easing.out(Easing.cubic);
    const anim = Animated.sequence([
      Animated.timing(content, { toValue: 1, duration: EXIT_MS, easing: ease, useNativeDriver: true }),
      Animated.delay(Math.max(0, HOLD_MS - EXIT_MS)),
      Animated.parallel([
        Animated.timing(content, { toValue: 2, duration: EXIT_MS, easing: ease, useNativeDriver: true }),
        Animated.timing(screen, { toValue: 0, duration: EXIT_MS, useNativeDriver: true }),
      ]),
    ]);
    anim.start(({ finished }) => finished && onFinish());
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const contentStyle = {
    opacity: content.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 1, 0] }),
    transform: [{ scale: content.interpolate({ inputRange: [0, 1, 2], outputRange: [0.9, 1, 1.05] }) }],
  };

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: screen, zIndex: 9999 }]}>
      <StatusBar style="light" />
      <LinearGradient colors={[palette.violet['600'], palette.violet['800']]} style={styles.fill}>
        <Animated.View style={[styles.center, contentStyle]}>
          <View style={styles.badge}>
            <Image source={require('../../assets/logo.png')} style={{ width: 56, height: 56 }} contentFit="contain" tintColor="#ffffff" />
          </View>
          <Text className="text-white font-bold text-lg tracking-wide">JoggaHub</Text>
        </Animated.View>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
  badge: { backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 999, padding: 20, marginBottom: 12 },
});
