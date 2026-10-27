import {existsSync, readFileSync} from 'fs';
import {resolve} from 'path';
import type {AdviceStep} from '../src/ai/types';
import {retrieveBretasSlice} from './bretasKnowledge';

type CaseEntry = {
  name: string;
  system: string;
  description: string;
  diagnosis: string;
  treatment: string;
  preanes: string;
  protocols: string;
};

type CaseCatalog = {
  source?: {id?: string; title?: string; authors?: string};
  entries?: CaseEntry[];
};

type RankedCase = {
  entry: CaseEntry;
  score: number;
  title: string;
  authors: string;
  bookId: string;
};

const CASE_FILES = ['crivellenti.json', 'nelson.json', 'tratado.json', 'saunders.json', 'elsevier.json'];

const BOOKS_BY_STEP: Record<AdviceStep, readonly string[]> = {
  documents: [],
  diagnosis: ['NELSON_COUTO', 'JERICO', 'CRIVELLENTI', 'MERCK_VET'],
  treatment: ['NELSON_COUTO', 'JERICO', 'CRIVELLENTI', 'MERCK_VET'],
  medications: [],
  exams: ['NELSON_COUTO', 'JERICO', 'CRIVELLENTI', 'MERCK_VET'],
  validate: ['NELSON_COUTO', 'JERICO', 'CRIVELLENTI', 'MERCK_VET'],
};

const STOP = new Set([
  'a', 'o', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na',
  'para', 'por', 'com', 'sem', 'ou', 'e', 'que', 'se', 'nao', 'ao', 'aos', 'este',
  'esta', 'isso', 'mais', 'menos', 'como', 'apos', 'ate', 'pelo', 'pela', 'sua',
  'seu', 'animal', 'paciente', 'ver', 'abaixo', 'caso', 'rotina',
]);

const LIMITS: Record<AdviceStep, {limit: number; mode: 'thin' | 'exams' | 'full'}> = {
  documents: {limit: 0, mode: 'thin'},
  diagnosis: {limit: 10, mode: 'thin'},
  treatment: {limit: 8, mode: 'full'},
  medications: {limit: 0, mode: 'full'},
  exams: {limit: 10, mode: 'exams'},
  validate: {limit: 10, mode: 'full'},
};

let catalogs: CaseCatalog[] | null = null;

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

function loadCatalogs(): CaseCatalog[] {
  if (catalogs) return catalogs;
  catalogs = CASE_FILES.map((name) => {
    const file = resolve(process.cwd(), 'src/ai/knowledge', name);
    if (!existsSync(file)) return {entries: []};
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as CaseCatalog;
    } catch {
      return {entries: []};
    }
  });
  return catalogs;
}

function catalogsFor(step: AdviceStep): CaseCatalog[] {
  const allowed = new Set(BOOKS_BY_STEP[step]);
  return loadCatalogs().filter((catalog) => allowed.has(catalog.source?.id || ''));
}

function scoreEntry(entry: CaseEntry, queryTokens: string[], query: string): number {
  const name = fold(entry.name);
  const system = fold(entry.system);
  const description = fold(entry.description);
  const diagnosis = fold(entry.diagnosis);
  let score = 0;

  for (const token of queryTokens) {
    if (hasWord(name, token) || (token.length >= 6 && name.includes(token))) {
      score += 8;
    } else if (hasWord(system, token)) {
      score += 3;
    } else if (hasWord(description, token) || hasWord(diagnosis, token)) {
      score += 2;
    }
  }

  if ((query.includes('gato') || query.includes('felin')) && (name.includes('felin') || description.includes('felin') || description.includes('gato'))) {
    score += 2;
  }
  if ((query.includes('cao') || query.includes('canin')) && (name.includes('canin') || description.includes('canin') || description.includes('cao'))) {
    score += 2;
  }

  return score;
}

function formatEntry(entry: CaseEntry, mode: 'thin' | 'exams' | 'full'): string {
  const head = entry.system ? `- ${entry.name} (${entry.system})` : `- ${entry.name}`;
  const lines = [head];
  if (entry.description) lines.push(`  Quadro: ${entry.description}`);
  if (entry.diagnosis && mode !== 'thin') {
    lines.push(`  Diagnóstico/exames: ${entry.diagnosis}`);
  }
  if (entry.diagnosis && mode === 'thin') {
    lines.push(`  Como diferenciar: ${entry.diagnosis}`);
  }
  if (mode === 'full' || mode === 'exams') {
    if (mode === 'full' && entry.treatment) lines.push(`  Conduta: ${entry.treatment}`);
    if (entry.preanes) lines.push(`  Pré-anestésico: ${entry.preanes}`);
    if (entry.protocols) lines.push(`  Protocolos: ${entry.protocols}`);
  }
  return lines.join('\n');
}

export function retrieveCaseSlices(step: AdviceStep, query: string): string {
  const {limit, mode} = LIMITS[step];
  if (!limit || !query.trim()) return '';

  const queryTokens = tokens(query);
  if (queryTokens.length === 0) return '';

  const folded = fold(query);
  const ranked: RankedCase[] = [];
  for (const catalog of catalogsFor(step)) {
    const title = catalog.source?.title || 'Livro clínico';
    const authors = catalog.source?.authors || '';
    const bookId = catalog.source?.id || '';
    for (const entry of catalog.entries || []) {
      let score = scoreEntry(entry, queryTokens, folded);
      if ((bookId === 'NELSON_COUTO' || bookId === 'JERICO' || bookId === 'MERCK_VET') && score >= 4) score += 2;
      if (bookId === 'SAUNDERS_SHERDING' && (step === 'medications' || step === 'validate') && score >= 4) {
        score += 3;
      }
      if (score >= 4) {
        ranked.push({entry, score, title, authors, bookId});
      }
    }
  }

  const top = ranked.sort((a, b) => b.score - a.score).slice(0, limit);
  if (top.length === 0) return '';

  const groups = new Map<string, RankedCase[]>();
  for (const item of top) {
    const key = `${item.title}||${item.authors}`;
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([key, items]) => {
    const [title, authors] = key.split('||');
    const header = authors
      ? `FATIA DE ${title} (${authors}) — só o que bate com este caso. Não invente página.`
      : `FATIA DE ${title} — só o que bate com este caso.`;
    return `${header}\n${items.map((item) => formatEntry(item.entry, mode)).join('\n')}`;
  }).join('\n\n');
}

export function retrieveCrivellentiSlice(step: AdviceStep, query: string): string {
  return retrieveCaseSlices(step, query);
}

export function withBookSlices(systemInstruction: string, step: AdviceStep, query: string): string {
  const slices = [retrieveCaseSlices(step, query), retrieveBretasSlice(step, query)].filter(Boolean);
  if (slices.length === 0) return systemInstruction;
  return `${systemInstruction}\n\n${slices.join('\n\n')}`;
}
