// Development-only stand-in for screens still being ported from the web.
// Every usage must be replaced before release (grep PortingNotice).
import { View } from 'react-native';
import { Text } from './Text';
import { PageHeader } from './PageHeader';

export function PortingNotice({ title }: { title: string }) {
  return (
    <View className="flex-1 bg-gray-50">
      <PageHeader title={title} />
      <View className="mx-6 mt-4 bg-gray-100 border border-gray-200 rounded-xl p-4">
        <Text className="text-sm text-gray-600">Esta tela ainda está sendo portada do site para o app.</Text>
      </View>
    </View>
  );
}
