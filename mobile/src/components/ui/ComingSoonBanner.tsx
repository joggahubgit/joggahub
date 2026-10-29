// Port of src/app/components/ComingSoonBanner.tsx (web).
import { View } from 'react-native';
import { Construction } from 'lucide-react-native';
import { Text } from './Text';
import palette from '../../../tailwind.palette';

export function ComingSoonBanner({ label = 'Em breve' }: { label?: string }) {
  return (
    <View className="mx-6 mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex-row items-center gap-3">
      <Construction size={20} color={palette.amber['600']} />
      <Text className="text-sm text-amber-800 flex-1">
        <Text className="text-sm font-semibold text-amber-800">{label}</Text> — esta funcionalidade ainda está em desenvolvimento.
      </Text>
    </View>
  );
}
