import * as Location from 'expo-location';

/**
 * City from the device location — native counterpart of the web's detectCity()
 * (which uses the browser geolocation + OpenStreetMap). Same "City, UF" format.
 */
export async function detectCity(): Promise<string> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') throw new Error('Permissão de localização negada.');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  const [place] = await Location.reverseGeocodeAsync(pos.coords);
  const city = place?.city || place?.subregion || '';
  const state = place?.region || '';
  const label = city && state ? `${city}, ${state}` : city || state;
  if (!label) throw new Error('Não foi possível identificar sua cidade.');
  return label;
}
