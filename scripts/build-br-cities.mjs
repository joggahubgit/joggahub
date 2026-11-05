// Regenerates src/app/lib/brCities.json (all 5.570 Brazilian municipalities,
// IBGE names) from the open dataset github.com/kelvins/municipios-brasileiros.
// Run: node scripts/build-br-cities.mjs <municipios.csv> <estados.csv>
// Output entries: "Nome|UF" or "Nome|UF|1" for state capitals.
import { readFileSync, writeFileSync } from 'node:fs';

const [munPath, ufPath] = process.argv.slice(2);
if (!munPath || !ufPath) throw new Error('usage: build-br-cities.mjs <municipios.csv> <estados.csv>');

const rows = (p) => readFileSync(p, 'utf8').replace(/^﻿/, '').trim().split(/\r?\n/).slice(1).map(l => l.split(','));
const ufByCode = Object.fromEntries(rows(ufPath).map(([code, uf]) => [code, uf]));
const cities = rows(munPath)
  .map(([, nome, , , capital, codigoUf]) => `${nome}|${ufByCode[codigoUf]}${capital === '1' ? '|1' : ''}`)
  .sort((a, b) => a.localeCompare(b, 'pt-BR'));
if (cities.length < 5500 || cities.some(c => c.includes('|undefined'))) throw new Error('unexpected data');
writeFileSync(new URL('../src/app/lib/brCities.json', import.meta.url), JSON.stringify(cities));
console.log(`${cities.length} municípios, ${cities.filter(c => c.endsWith('|1')).length} capitais`);
