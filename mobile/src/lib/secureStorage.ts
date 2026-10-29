import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Supabase auth storage backed by the iOS Keychain / Android Keystore.
 *
 * SecureStore values are size-limited (~2 KB) and a Supabase session with
 * OAuth metadata can exceed that, so values are split into chunks. The chunk
 * count lives under the base key. SecureStore keys only allow [A-Za-z0-9._-],
 * so the Supabase key is sanitised first.
 */
const CHUNK_SIZE = 1800;

const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

async function removeChunks(base: string) {
  const count = Number(await SecureStore.getItemAsync(`${base}.n`)) || 0;
  await Promise.all(
    Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${base}.${i}`)),
  );
  await SecureStore.deleteItemAsync(`${base}.n`);
}

const nativeStorage = {
  async getItem(key: string): Promise<string | null> {
    const base = safeKey(key);
    const count = Number(await SecureStore.getItemAsync(`${base}.n`)) || 0;
    if (!count) return null;
    const parts = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${base}.${i}`)),
    );
    // A missing chunk means a partial write — treat the session as absent.
    if (parts.some(p => p === null)) return null;
    return parts.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    const base = safeKey(key);
    await removeChunks(base);
    const chunks = value.match(new RegExp(`[\\s\\S]{1,${CHUNK_SIZE}}`, 'g')) ?? [''];
    await Promise.all(chunks.map((c, i) => SecureStore.setItemAsync(`${base}.${i}`, c)));
    // Count is written last so a crash mid-write never exposes a partial value.
    await SecureStore.setItemAsync(`${base}.n`, String(chunks.length));
  },

  async removeItem(key: string): Promise<void> {
    await removeChunks(safeKey(key));
  },
};

// Browser preview only (`expo start --web`, used for quick feedback on a PC).
// SecureStore has no web implementation; the shipped apps are iOS/Android only.
const webStorage = {
  async getItem(key: string) {
    return globalThis.localStorage?.getItem(key) ?? null;
  },
  async setItem(key: string, value: string) {
    globalThis.localStorage?.setItem(key, value);
  },
  async removeItem(key: string) {
    globalThis.localStorage?.removeItem(key);
  },
};

export const secureStorage = Platform.OS === 'web' ? webStorage : nativeStorage;
