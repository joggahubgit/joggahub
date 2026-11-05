// City autocomplete for the profile "Cidade" field (web + mobile).
// No imports: each platform loads the list (brCities.json) and passes it in.
//
// Profiles store the city as "Nome, UF" (e.g. "São Paulo, SP"). The city
// ranking in Comunidade groups players by exact string, so every way of
// entering a city (typing, picking a suggestion, "usar minha localização")
// must end in that same format.

export interface City {
  name: string;
  uf: string;
  label: string; // "São Paulo, SP"
  key: string;   // normalized name, for matching
  tier: number;  // capitals 0–26 by population, large cities 100, others 200 — orders suggestions
}

// State capitals, largest first, so "sao" shows São Paulo before São Luís.
const CAPITALS_BY_POPULATION = [
  'São Paulo', 'Rio de Janeiro', 'Brasília', 'Fortaleza', 'Salvador', 'Belo Horizonte', 'Manaus',
  'Curitiba', 'Recife', 'Goiânia', 'Porto Alegre', 'Belém', 'São Luís', 'Maceió', 'Campo Grande',
  'Teresina', 'João Pessoa', 'Natal', 'Cuiabá', 'Aracaju', 'Florianópolis', 'Porto Velho',
  'Macapá', 'Boa Vista', 'Vitória', 'Rio Branco', 'Palmas',
];

const UF_BY_STATE: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};
const UFS = new Set(Object.values(UF_BY_STATE));

// Largest non-capital cities, largest first, so "camp" shows Campinas before
// Campina Verde and "ca" shows Campinas before Canoas.
const LARGE_BY_POPULATION = [
  'Guarulhos|SP', 'Campinas|SP', 'São Gonçalo|RJ', 'Duque de Caxias|RJ', 'São Bernardo do Campo|SP',
  'Nova Iguaçu|RJ', 'Santo André|SP', 'Jaboatão dos Guararapes|PE', 'Osasco|SP', 'Uberlândia|MG',
  'Ribeirão Preto|SP', 'Sorocaba|SP', 'Contagem|MG', 'São José dos Campos|SP', 'Feira de Santana|BA',
  'Joinville|SC', 'Juiz de Fora|MG', 'Londrina|PR', 'Aparecida de Goiânia|GO', 'Serra|ES',
  'Niterói|RJ', 'Caxias do Sul|RS', 'Ananindeua|PA', 'Belford Roxo|RJ', 'Campos dos Goytacazes|RJ',
  'Vila Velha|ES', 'São João de Meriti|RJ', 'Mauá|SP', 'Santos|SP', 'Mogi das Cruzes|SP',
  'São José do Rio Preto|SP', 'Betim|MG', 'Diadema|SP', 'Maringá|PR', 'Jundiaí|SP',
  'Campina Grande|PB', 'Montes Claros|MG', 'Piracicaba|SP', 'Carapicuíba|SP', 'Olinda|PE',
  'Cariacica|ES', 'Bauru|SP', 'Anápolis|GO', 'Caucaia|CE', 'Vitória da Conquista|BA',
  'Canoas|RS', 'Pelotas|RS', 'Caruaru|PE', 'Blumenau|SC', 'Ponta Grossa|PR',
  'Petrolina|PE', 'Cascavel|PR', 'Santa Maria|RS', 'Uberaba|MG', 'Foz do Iguaçu|PR',
  'Juazeiro do Norte|CE', 'Mossoró|RN', 'Imperatriz|MA', 'Várzea Grande|MT', 'Praia Grande|SP',
  'São Vicente|SP', 'Santarém|PA', 'Camaçari|BA', 'Volta Redonda|RJ', 'Petrópolis|RJ',
  'Guarujá|SP', 'São José|SC', 'Balneário Camboriú|SC',
];

export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** brCities.json entries ("Nome|UF" or "Nome|UF|1") → City[] */
export function parseCities(raw: string[]): City[] {
  return raw.map(entry => {
    const [name, uf, capital] = entry.split('|');
    return {
      name, uf,
      label: `${name}, ${uf}`,
      key: normalizeText(name),
      tier: capital === '1' ? Math.max(0, CAPITALS_BY_POPULATION.indexOf(name))
        : LARGE_BY_POPULATION.includes(`${name}|${uf}`) ? 100 + LARGE_BY_POPULATION.indexOf(`${name}|${uf}`) : 200,
    };
  });
}

/** "Rio de Janeiro" / "RJ" / "rj" → "RJ"; unknown → null */
function toUf(state: string): string | null {
  const n = normalizeText(state);
  if (UFS.has(n.toUpperCase())) return n.toUpperCase();
  return UF_BY_STATE[n] ?? null;
}

/** Splits "campinas, sp" into name + optional UF filter. */
function splitQuery(query: string): { name: string; uf: string | null } {
  const i = query.lastIndexOf(',');
  if (i === -1) return { name: normalizeText(query), uf: null };
  return { name: normalizeText(query.slice(0, i)), uf: toUf(query.slice(i + 1)) };
}

/** Best matches for what the user typed (empty under 2 letters). */
export function searchCities(cities: City[], query: string, limit = 6): City[] {
  const { name, uf } = splitQuery(query);
  if (name.length < 2) return [];
  const scored: { c: City; score: number }[] = [];
  for (const c of cities) {
    if (uf && c.uf !== uf) continue;
    let score: number;
    if (c.key === name) score = 0;
    else if (c.key.startsWith(name)) score = 1;
    else if (c.key.includes(` ${name}`)) score = 2;
    else if (c.key.includes(name)) score = 3;
    else continue;
    scored.push({ c, score });
  }
  scored.sort((a, b) =>
    a.score - b.score || a.c.tier - b.c.tier || a.c.name.length - b.c.name.length || a.c.label.localeCompare(b.c.label, 'pt-BR'));
  return scored.slice(0, limit).map(s => s.c);
}

/**
 * Turns free text or a geolocation result into the stored "Nome, UF" label.
 * Accepts "São Paulo, SP", "sao paulo, São Paulo", "Campinas" (unique name).
 * Returns null when it can't tell which city it is.
 */
export function canonicalCity(cities: City[], text: string): string | null {
  const { name, uf } = splitQuery(text);
  if (!name) return null;
  const hits = cities.filter(c => c.key === name && (!uf || c.uf === uf));
  if (hits.length === 1) return hits[0].label;
  return null;
}
