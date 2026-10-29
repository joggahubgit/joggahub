/**
 * NativeWind only maps `className` to styles for React Native core components.
 * Third-party components must be registered, otherwise their classes are
 * silently dropped on iOS/Android (the web preview hides this, since there
 * className becomes real CSS). Imported once from the root layout.
 */
import { cssInterop } from 'nativewind';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

cssInterop(SafeAreaView, { className: 'style' });
cssInterop(LinearGradient, { className: 'style' });
cssInterop(Image, { className: 'style' });
