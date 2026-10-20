import bretasCatalog from './knowledge/bretas.json';
import type { Medication } from './types';

type Drug = { name: string; can?: string; fel?: string };
type Catalog = { drugs?: Drug[]; aliases?: Record<string, string> };

type DoseUnit = 'mg' | 'ui' | 'ml';
type DoseRange = {
  min: number;
  max: number;
  unit: DoseUnit;
  routes: string[];
  indication: string;
  interval?: { min: number; max: number };
};

const catalog = bretasCatalog as Catalog;

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function parseNum(raw: string): number {
  return parseFloat(raw.replace(',', '.'));
}

function toCanonical(value: number, unit: string): { value: number; unit: DoseUnit } | null {
  const u = unit.toLowerCase().replace(/[μµ]/g, 'u');
  if (u === 'mcg' || u === 'ug') return { value: value / 1000, unit: 'mg' };
  if (u === 'ui') return { value, unit: 'ui' };
  if (u === 'ml') return { value, unit: 'ml' };
  if (u === 'mg') return { value, unit: 'mg' };
  return null;
}

function extractRoutes(text: string): string[] {
  const blob = fold(text).replace(/\biv\b/g, 'ev').replace(/\bpo\b/g, 'vo').replace(/\boral\b/g, 'vo')
    .replace(/intraven/g, 'ev').replace(/intramusc/g, 'im').replace(/subcut/g, 'sc');
  return ['im', 'sc', 'ev', 'vo', 'sl', 'ip', 'epidural'].filter((route) => new RegExp(`(?:^|[^a-z])${route}(?:[^a-z]|$)`).test(blob));
}

function extractInterval(text: string): { min: number; max: number } | undefined {
  const blob = fold(text);
  const range = blob.match(/q\s*(\d+(?:[.,]\d+)?)\s*(?:-|–|a)\s*(\d+(?:[.,]\d+)?)\s*h/);
  if (range) return { min: parseNum(range[1]), max: parseNum(range[2]) };
  const single = blob.match(/q\s*(\d+(?:[.,]\d+)?)\s*h/);
  if (single) {
    const n = parseNum(single[1]);
    return { min: n, max: n };
  }
  const cada = blob.match(/a cada\s*(\d+(?:[.,]\d+)?)\s*(?:-|–|a)?\s*(\d+(?:[.,]\d+)?)?\s*h/);
  if (cada) {
    const a = parseNum(cada[1]);
    const b = cada[2] ? parseNum(cada[2]) : a;
    return { min: a, max: b };
  }
  if (/\bsid\b|uma vez ao dia|1x\/dia/.test(blob)) return { min: 24, max: 24 };
  if (/\bbid\b|duas vezes|2x\/dia/.test(blob)) return { min: 12, max: 12 };
  if (/\btid\b|tres vezes|3x\/dia/.test(blob)) return { min: 8, max: 8 };
  return undefined;
}

function extractIndication(text: string): string {
  const matches = [...text.matchAll(/\(([^)]+)\)/g)];
  return fold(matches.map((item) => item[1]).join(' '));
}

const UNIT = '(mcg|μg|ug|µg|mg|ui|ml)';
const NUM = '(\\d+(?:[.,]\\d+)?)';

function parseBookDoses(text: string): DoseRange[] {
  if (!text?.trim()) return [];
  const chunks = text.split(/\s+ou\s+(?=\d|até|ate)/i);
  const ranges: DoseRange[] = [];

  for (const chunk of chunks) {
    const occupied: Array<{ start: number; end: number }> = [];
    const add = (min: number, max: number, unitRaw: string, start: number, end: number) => {
      const canonical = toCanonical(min, unitRaw);
      const high = toCanonical(max, unitRaw);
      if (!canonical || !high || canonical.unit !== high.unit) return;
      occupied.push({ start, end });
      ranges.push({
        min: Math.min(canonical.value, high.value),
        max: Math.max(canonical.value, high.value),
        unit: canonical.unit,
        routes: extractRoutes(chunk),
        indication: extractIndication(chunk),
        interval: extractInterval(chunk),
      });
    };

    const ate = new RegExp(`at[eé]\\s*${NUM}\\s*${UNIT}\\s*/\\s*kg`, 'gi');
    for (const match of chunk.matchAll(ate)) {
      if (match.index == null) continue;
      add(0, parseNum(match[1]), match[2], match.index, match.index + match[0].length);
    }

    const span = new RegExp(`${NUM}\\s*(?:-|–|a)\\s*${NUM}\\s*${UNIT}\\s*/\\s*kg`, 'gi');
    for (const match of chunk.matchAll(span)) {
      if (match.index == null) continue;
      add(parseNum(match[1]), parseNum(match[2]), match[3], match.index, match.index + match[0].length);
    }

    const single = new RegExp(`${NUM}\\s*${UNIT}\\s*/\\s*kg`, 'gi');
    for (const match of chunk.matchAll(single)) {
      if (match.index == null) continue;
      const start = match.index;
      const end = start + match[0].length;
      if (occupied.some((spanPos) => start >= spanPos.start && end <= spanPos.end)) continue;
      const n = parseNum(match[1]);
      add(n, n, match[2], start, end);
    }
  }
  return ranges;
}

function matchDrug(medName: string): Drug | undefined {
  const drugs = catalog.drugs || [];
  const aliases = catalog.aliases || {};
  const med = fold(medName);
  let best: Drug | undefined;
  let bestScore = 0;

  for (const drug of drugs) {
    const core = fold(drug.name).replace(/,.*/, '').trim();
    const tokens = core.split(/[^a-z0-9]+/).filter((token) => token.length >= 4);
    if (!tokens.length) continue;
    const hits = tokens.filter((token) => med.includes(token));
    if (!hits.length || hits[0] !== tokens[0]) continue;
    const score = hits.reduce((sum, token) => sum + token.length, 0);
    if (score > bestScore) {
      best = drug;
      bestScore = score;
    }
  }

  for (const [alias, target] of Object.entries(aliases)) {
    const aka = fold(alias);
    if (aka.length < 5 || !med.includes(aka)) continue;
    const drug = drugs.find((item) => fold(item.name) === fold(target) || fold(item.name).startsWith(fold(target)));
    if (drug && aka.length > bestScore) {
      best = drug;
      bestScore = aka.length;
    }
  }
  return best;
}

function prescribedRate(dosage: string): { value: number; unit: DoseUnit } | null {
  const text = dosage;
  const span = text.match(new RegExp(`${NUM}\\s*(?:-|–|a)\\s*${NUM}\\s*${UNIT}\\s*/\\s*kg`, 'i'));
  if (span) {
    const high = toCanonical(parseNum(span[2]), span[3]);
    return high;
  }
  const ate = text.match(new RegExp(`at[eé]\\s*${NUM}\\s*${UNIT}\\s*/\\s*kg`, 'i'));
  if (ate) return toCanonical(parseNum(ate[1]), ate[2]);
  const single = text.match(new RegExp(`${NUM}\\s*${UNIT}\\s*/\\s*kg`, 'i'));
  if (single) return toCanonical(parseNum(single[1]), single[2]);
  return null;
}

function pickCeiling(ranges: DoseRange[], med: Medication, unit: DoseUnit): DoseRange | undefined {
  const sameUnit = ranges.filter((range) => range.unit === unit);
  if (!sameUnit.length) return undefined;

  const rxText = `${med.dosage} ${med.frequency} ${med.forDiagnosis || ''}`;
  const rxRoutes = extractRoutes(rxText);
  const rxInterval = extractInterval(rxText);
  const rxIndication = fold(med.forDiagnosis || '');

  const labeled = sameUnit.filter((range) => range.indication && rxIndication && rxIndication.includes(range.indication.split(' ')[0]));
  const pool = labeled.length ? labeled : sameUnit;

  const compatible = pool.filter((range) => {
    if (range.routes.length && rxRoutes.length && !range.routes.some((route) => rxRoutes.includes(route))) {
      return false;
    }
    if (range.interval && rxInterval) {
      const overlap = rxInterval.max >= range.interval.min - 0.6 && rxInterval.min <= range.interval.max + 0.6;
      if (!overlap) return false;
    }
    return true;
  });

  const chosen = compatible.length ? compatible : pool;
  const noIntervalRx = !rxInterval;
  const bolus = noIntervalRx ? chosen.filter((range) => !range.interval) : chosen;
  const finalists = bolus.length ? bolus : chosen;
  return finalists.reduce((best, range) => (!best || range.max < best.max ? range : best));
}

function isTopical(med: Medication): boolean {
  return /clorexid|clorhex|povidon|pvpi|antissept|rifamicin|nitrofurazon|topic|local|lavag|irrigac|dilu/.test(
    fold(`${med.name} ${med.forDiagnosis || ''} ${med.dosage || ''}`),
  );
}

function formatRange(range: DoseRange): string {
  const n = (value: number) => (Number.isInteger(value) ? String(value) : String(value).replace('.', ','));
  if (range.min === 0) return `até ${n(range.max)} ${range.unit}/kg`;
  if (range.min === range.max) return `${n(range.max)} ${range.unit}/kg`;
  return `${n(range.min)}–${n(range.max)} ${range.unit}/kg`;
}

/** Confere o mg/kg (ou UI/kg, ml/kg) prescrito com o teto da espécie no Bretas. */
export function doseCeilingIssues(medications: Medication[], species?: string): string[] {
  const issues: string[] = [];
  const speciesKey = species === 'cat' || species === 'gato' || species === 'felina' ? 'fel' : 'can';
  const speciesLabel = speciesKey === 'fel' ? 'FEL (gato)' : 'CAN (cão)';

  for (const med of medications) {
    if (isTopical(med)) continue;
    const prescribed = prescribedRate(med.dosage || '');
    if (!prescribed) continue;

    const drug = matchDrug(med.name);
    if (!drug) continue;

    const bookText = speciesKey === 'fel' ? (drug.fel || '') : (drug.can || '');
    if (!bookText.trim()) continue;

    const ranges = parseBookDoses(bookText);
    const ceiling = pickCeiling(ranges, med, prescribed.unit);
    if (!ceiling) continue;

    const slack = Math.max(ceiling.max * 0.05, 0.0005);
    if (prescribed.value > ceiling.max + slack) {
      const n = (value: number) => String(Number(value.toPrecision(6))).replace('.', ',');
      issues.push(
        `DOSE ACIMA DO TETO do livro para "${med.name}" nesta espécie (${speciesLabel}): passou ${n(prescribed.value)} ${prescribed.unit}/kg e a faixa aplicável é ${formatRange(ceiling)}. Recalcule pelo peso SEM ultrapassar o teto. Não use a faixa da outra espécie.`,
      );
    }
  }
  return issues;
}
