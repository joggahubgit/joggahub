import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { Text } from './Text';
import palette from '../../../tailwind.palette';

function goBack(fallback: string) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as never);
}

/** Web pattern: white sticky bar, gray back arrow, bold title (Terms, Privacy, Settings, Help…). */
export function PageHeader({ title, right, fallback = '/' }: { title: string; right?: ReactNode; fallback?: string }) {
  return (
    <SafeAreaView edges={['top']} className="bg-white border-b border-gray-200">
      <View className="px-6 py-4 flex-row items-center gap-4">
        <Pressable onPress={() => goBack(fallback)} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={12}>
          <ArrowLeft size={24} color={palette.gray['600']} />
        </Pressable>
        <Text className="text-xl font-bold text-gray-900 flex-1" numberOfLines={1} accessibilityRole="header">
          {title}
        </Text>
        {right}
      </View>
    </SafeAreaView>
  );
}

/** Web pattern: violet bar with white back arrow + title (FindGames, FindCourts, Notifications…). */
export function VioletHeader({ title, right, children, fallback = '/' }: { title: string; right?: ReactNode; children?: ReactNode; fallback?: string }) {
  return (
    <SafeAreaView edges={['top']} className="bg-violet-600">
      <View className="px-6 py-4">
        <View className={`flex-row items-center gap-4 ${children ? 'mb-4' : ''}`}>
          <Pressable onPress={() => goBack(fallback)} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={12}>
            <ArrowLeft size={24} color="#ffffff" />
          </Pressable>
          <Text className="text-xl font-bold text-white flex-1" numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {right}
        </View>
        {children}
      </View>
    </SafeAreaView>
  );
}
