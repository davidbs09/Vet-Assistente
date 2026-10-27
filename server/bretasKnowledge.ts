import {existsSync, readFileSync} from 'fs';
import {resolve} from 'path';
import type {AdviceStep} from '../src/ai/types';

type Drug = {
  name: string;
  action: string;
  contra: string;
  adverse: string;
  can: string;
  fel: string;
  rx: string;
  acv: string;
};

type Catalog = {
  source?: {title?: string; authors?: string; edition?: string};
  aliases?: Record<string, string>;
  drugs?: Drug[];
};

const STOP = new Set([
  'a', 'o', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na',
  'para', 'por', 'com', 'sem', 'ou', 'e', 'que', 'se', 'nao', 'ao', 'aos', 'este',
  'esta', 'isso', 'mais', 'menos', 'como', 'apos', 'ate', 'pelo', 'pela', 'sua',
  'seu', 'animal', 'paciente', 'ver', 'abaixo',
]);

const LIMITS: Record<AdviceStep, {limit: number; mode: 'thin' | 'full'}> = {
  documents: {limit: 0, mode: 'thin'},
  diagnosis: {limit: 0, mode: 'thin'},
  treatment: {limit: 0, mode: 'thin'},
  medications: {limit: 16, mode: 'full'},
  exams: {limit: 0, mode: 'full'},
  validate: {limit: 16, mode: 'full'},
};

let catalog: Catalog | null = null;

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function tokens(value: string): string[] {
  return fold(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !STOP.has(token));
}

function hasWord(hay: string, token: string): boolean {
  if (token.length >= 6) return hay.includes(token);
  return new RegExp(`(?:^|[^a-z0-9])${token}(?:[^a-z0-9]|$)`).test(hay);
}

function loadCatalog(): Catalog {
  if (catalog) return catalog;
  const file = resolve(process.cwd(), 'src/ai/knowledge/bretas.json');
  if (!existsSync(file)) {
    catalog = {drugs: [], aliases: {}};
    return catalog;
  }
  try {
    catalog = JSON.parse(readFileSync(file, 'utf8')) as Catalog;
  } catch {
    catalog = {drugs: [], aliases: {}};
  }
  return catalog;
}

function haystack(drug: Drug, aliases: Record<string, string>): string {
  const aka = Object.entries(aliases)
    .filter(([, target]) => fold(target) === fold(drug.name))
    .map(([name]) => name);
  return fold([drug.name, ...aka, drug.action, drug.contra, drug.can, drug.fel].join(' '));
}

function scoreDrug(
  drug: Drug,
  queryTokens: string[],
  query: string,
  aliases: Record<string, string>,
  step: AdviceStep,
): number {
  const blob = haystack(drug, aliases);
  const name = fold(drug.name);
  const action = fold(drug.action);
  const contra = fold(drug.contra);
  let score = 0;

  for (const token of queryTokens) {
    if (hasWord(name, token) || (token.length >= 6 && name.includes(token))) {
      score += 8;
    } else if (hasWord(action, token)) {
      score += 3;
    } else if (hasWord(contra, token)) {
      score += 1;
    }
  }

  if (query.includes('gato') || query.includes('felin')) {
    if (drug.fel) score += 1;
    if (contra.includes('nao usar em felino') || contra.includes('nao usar em gato')) {
      score += step === 'diagnosis' ? 4 : 1;
    }
  }
  if (query.includes('cao') || query.includes('canin')) {
    if (drug.can) score += 1;
  }
  if ((query.includes('collie') || query.includes('pastor') || query.includes('mdr1')) && blob.includes('collie')) {
    score += 5;
  }
  if ((query.includes('gestant') || query.includes('piometra')) && (contra.includes('gestant') || action.includes('piometra'))) {
    score += 2;
  }

  return score;
}

function formatDrug(drug: Drug, mode: 'thin' | 'full'): string {
  const lines = [`- ${drug.name}`];
  if (drug.action) lines.push(`  Ação: ${drug.action}`);
  if (drug.contra) lines.push(`  Contra: ${drug.contra}`);
  if (mode === 'full') {
    if (drug.adverse) lines.push(`  Efeitos: ${drug.adverse}`);
    if (drug.can) lines.push(`  CAN: ${drug.can}`);
    if (drug.fel) lines.push(`  FEL: ${drug.fel}`);
    if (drug.rx) lines.push(`  Receita: ${drug.rx}`);
    if (drug.acv) lines.push(`  ACV: ${drug.acv}`);
  }
  return lines.join('\n');
}

export function retrieveBretasSlice(step: AdviceStep, query: string): string {
  const {limit, mode} = LIMITS[step];
  if (!limit || !query.trim()) return '';

  const data = loadCatalog();
  const drugs = data.drugs || [];
  if (drugs.length === 0) return '';

  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return '';

  const aliases = data.aliases || {};
  const ranked = drugs
    .map((drug) => ({drug, score: scoreDrug(drug, queryTokens, fold(query), aliases, step)}))
    .filter((item) => item.score >= 3)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  if (ranked.length === 0) return '';

  const source = data.source;
  const header = source
    ? `FATIA DO ${source.title || 'Guia Terapêutico Veterinário'} (${source.authors || 'Bretas Viana'}, ${source.edition || '4ª edição'}) — só o que bate com este caso. Cruze com Vetsmart/AlfaVet. Não invente página.`
    : 'FATIA DO GUIA TERAPÊUTICO VETERINÁRIO — só o que bate com este caso.';

  return `${header}\n${ranked.map((item) => formatDrug(item.drug, mode)).join('\n')}`;
}

export function withBretasSlice(systemInstruction: string, step: AdviceStep, query: string): string {
  const slice = retrieveBretasSlice(step, query);
  if (!slice) return systemInstruction;
  return `${systemInstruction}\n\n${slice}`;
}
