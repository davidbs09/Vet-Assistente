import type { DiagnosisResult, DifferentialDiagnosis } from './types';

function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (value == null) return fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => asText(item)).filter(Boolean).join('\n');
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferred = asText(
      record.provavel
      || record.doenca
      || record.medicamento
      || record.dose_final
      || record.exam
      || record.source
      || record.title
      || record.name
      || record.disease
      || record.topic
      || record.justification
    );
    if (preferred) {
      const extra = asText(record.justification || record.topic || record.reason || record.gravidade_geral);
      return extra && extra !== preferred ? `${preferred}: ${extra}` : preferred;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function pickText(record: Record<string, unknown>, keys: string[], fallback = ''): string {
  for (const key of keys) {
    const value = asText(record[key]);
    if (value) return value;
  }
  return fallback;
}

function extractFrequency(text: string): string {
  const match = text.match(/a cada\s+[\d.,–\-]+\s*(?:h|horas?|dias?)(?:\s*\([^)]+\))?/i);
  return match?.[0] ?? '';
}

function likelihoodFromPosition(position: unknown): string {
  const n = Number(position);
  if (n === 1) return 'Mais provável';
  if (n === 2) return 'Plausível';
  if (n >= 3) return 'Menos provável';
  return '';
}

function normalizeLikelihood(value: string): string {
  if (/descart/i.test(value)) return 'Menos provável';
  return value;
}

function flattenDiagnosis(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return asText(value);
  const record = value as Record<string, unknown>;
  const main = pickText(record, ['provavel', 'principal', 'diagnostico', 'summary', 'diagnosis']);
  const severity = pickText(record, ['gravidade_geral', 'gravidade']);
  if (main && severity) return `${main} (${severity})`;
  return main || asText(value);
}

function flattenTreatment(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map((item) => `- ${asText(item)}`).filter((item) => item !== '- ').join('\n');
  if (!value || typeof value !== 'object') return asText(value);

  const lines: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const title = key.replace(/^\d+_/, '').replace(/_/g, ' ');
    lines.push(`**${title}**`);
    if (Array.isArray(nested)) {
      for (const item of nested) lines.push(`- ${asText(item)}`);
    } else if (nested && typeof nested === 'object') {
      for (const [childKey, childValue] of Object.entries(nested as Record<string, unknown>)) {
        if (Array.isArray(childValue)) {
          lines.push(`- **${childKey.replace(/_/g, ' ')}**`);
          for (const item of childValue) lines.push(`  - ${asText(item)}`);
        } else {
          lines.push(`- **${childKey.replace(/_/g, ' ')}:** ${asText(childValue)}`);
        }
      }
    } else {
      const text = asText(nested);
      if (text) lines.push(text);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

function extractJsonPayload(text: string): string {
  const unfenced = (text || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const start = unfenced.indexOf('{');
  return start >= 0 ? unfenced.slice(start) : unfenced;
}

function repairTruncatedJson(raw: string): string {
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const ch of raw) {
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if ((ch === '}' || ch === ']') && stack.length) stack.pop();
  }

  let repaired = raw.trimEnd();
  if (escaped) repaired += '\\';
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, '');
  while (stack.length) repaired += stack.pop();
  return repaired;
}

function tryParseObject(candidate: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(candidate || '{}') as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export function parseModelJson(text: string): Record<string, unknown> {
  const payload = extractJsonPayload(text);
  const candidates = [payload, repairTruncatedJson(payload)];
  const lastComma = payload.lastIndexOf(',');
  if (lastComma > 0) candidates.push(repairTruncatedJson(payload.slice(0, lastComma)));
  const lastQuote = payload.lastIndexOf('"');
  if (lastQuote > 0) candidates.push(repairTruncatedJson(payload.slice(0, lastQuote + 1)));

  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (parsed) return parsed;
  }

  const walkStart = Math.max(20, payload.length - 500);
  for (let i = payload.length - 1; i >= walkStart; i--) {
    const parsed = tryParseObject(repairTruncatedJson(payload.slice(0, i)));
    if (parsed) return parsed;
  }

  throw new Error('A resposta do modelo não veio em JSON válido. Gere o diagnóstico novamente.');
}

function asList(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>);
  return [];
}

function pickList(record: Record<string, unknown>, keys: string[]): unknown[] {
  for (const key of keys) {
    const list = asList(record[key]);
    if (list.length) return list;
  }
  return [];
}

function normalizeMedication(item: unknown): DiagnosisResult['medications'][number] {
  const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  const dosage = pickText(record, ['dosage', 'dose_final', 'dose', 'presentation']);
  const frequency = pickText(record, ['frequency', 'freq', 'interval'])
    || extractFrequency(pickText(record, ['dose_final', 'dose_referencia', 'observacoes', 'instructions']));
  const duration = pickText(record, ['duration', 'duracao', 'instructions', 'indication']);
  return {
    name: pickText(record, ['name', 'medicamento'], 'Medicamento'),
    dosage: dosage || 'Não informado',
    frequency: frequency || 'Conforme orientação',
    duration: duration || 'Conforme reavaliação',
    forDiagnosis: pickText(record, ['forDiagnosis', 'indication', 'objetivo']) || undefined,
  };
}

function normalizeDifferential(item: unknown): DifferentialDiagnosis {
  const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
  return {
    disease: pickText(record, ['disease', 'doenca', 'name'], 'Hipótese não nomeada'),
    likelihood: normalizeLikelihood(pickText(record, ['likelihood']) || likelihoodFromPosition(record.posicao) || 'Plausível'),
    reasoning: pickText(record, ['reasoning', 'justificativa']),
  };
}

export function normalizeResult(parsed: Record<string, unknown>): DiagnosisResult {
  return {
    diagnosis: flattenDiagnosis(parsed.diagnosis),
    differentials: Array.isArray(parsed.differentials) ? parsed.differentials.map(normalizeDifferential) : [],
    treatment: flattenTreatment(parsed.treatment),
    medications: pickList(parsed, ['medications', 'medicacoes', 'prescription', 'prescricao', 'lista']).map(normalizeMedication),
    suggestedExams: Array.isArray(parsed.suggestedExams) ? parsed.suggestedExams.map((item) => asText(item)).filter(Boolean) : [],
    sources: Array.isArray(parsed.sources) ? parsed.sources.map((item) => asText(item)).filter(Boolean) : [],
    examFindings: pickText(parsed, ['examFindings', 'achados', 'leitura']),
  };
}

export function emptyResult(): DiagnosisResult {
  return {
    diagnosis: '',
    differentials: [],
    treatment: '',
    medications: [],
    suggestedExams: [],
    sources: [],
    examFindings: '',
  };
}

export function mergeResult(base: DiagnosisResult, next: DiagnosisResult): DiagnosisResult {
  return {
    diagnosis: next.diagnosis && !(base.diagnosis && next.diagnosis.length + 80 < base.diagnosis.length)
      ? next.diagnosis
      : base.diagnosis,
    differentials: [],
    treatment: next.treatment || base.treatment,
    medications: next.medications.length ? next.medications : base.medications,
    suggestedExams: next.suggestedExams.length ? next.suggestedExams : base.suggestedExams,
    sources: Array.from(new Set([...base.sources, ...next.sources])),
    examFindings: next.examFindings || base.examFindings,
  };
}
