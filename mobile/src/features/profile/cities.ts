// The IBGE municipality list shared with the web (src/app/lib/brCities.json).
import raw from '../../../../src/app/lib/brCities.json';
import { parseCities, type City } from '@/lib/shared';

let cache: City[] | null = null;
/** Parsed once, on the first city field shown. */
export function getCities(): City[] {
  cache ??= parseCities(raw as string[]);
  return cache;
}
