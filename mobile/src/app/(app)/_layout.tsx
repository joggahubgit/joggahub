import { Stack } from 'expo-router';
import palette from '../../../tailwind.palette';

// Every screen draws its own web-style header (PageHeader / VioletHeader / custom),
// so the native header is off everywhere.
export default function AppLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.gray['50'] } }} />;
}
