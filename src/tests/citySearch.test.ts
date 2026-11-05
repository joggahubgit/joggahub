import { describe, expect, it } from 'vitest';
import raw from '../app/lib/brCities.json';
import { canonicalCity, normalizeText, parseCities, searchCities } from '../app/lib/citySearch';

const cities = parseCities(raw as string[]);
const labels = (q: string, n = 6) => searchCities(cities, q, n).map(c => c.label);

describe('citySearch', () => {
  it('has every municipality', () => {
    expect(cities.length).toBeGreaterThan(5500);
  });

  it('ignores accents and case', () => {
    expect(normalizeText('  SÃO   Paulo ')).toBe('sao paulo');
    expect(labels('sao paulo')[0]).toBe('São Paulo, SP');
  });

  it('puts capitals and large cities first', () => {
    expect(labels('sao')[0]).toBe('São Paulo, SP');
    expect(labels('camp').slice(0, 2)).toEqual(['Campo Grande, MS', 'Campinas, SP']);
    expect(labels('rio de')[0]).toBe('Rio de Janeiro, RJ');
    expect(labels('ca').slice(0, 2)).toEqual(['Campo Grande, MS', 'Campinas, SP']);
    expect(labels('bh')).toEqual([]); // no magic abbreviations
  });

  it('filters by UF after a comma', () => {
    expect(labels('bom jesus, pi')).toEqual(['Bom Jesus, PI']);
    expect(labels('santa maria, rs')[0]).toBe('Santa Maria, RS');
  });

  it('needs 2 letters', () => {
    expect(labels('s')).toEqual([]);
  });

  it('matches words inside the name', () => {
    expect(labels('goytacazes')).toContain('Campos dos Goytacazes, RJ');
  });

  it('canonicalizes typed text and geolocation results', () => {
    expect(canonicalCity(cities, 'sao paulo, São Paulo')).toBe('São Paulo, SP');
    expect(canonicalCity(cities, 'São Paulo, SP')).toBe('São Paulo, SP');
    expect(canonicalCity(cities, 'campinas')).toBe('Campinas, SP');
    expect(canonicalCity(cities, 'Rio de Janeiro, Rio de Janeiro')).toBe('Rio de Janeiro, RJ');
    expect(canonicalCity(cities, 'Bom Jesus')).toBeNull(); // exists in several states
    expect(canonicalCity(cities, 'Dublin, Leinster')).toBeNull();
  });
});
