import { AI_CONFIG } from '../shared/aiConfig';
import { normalizeResult, parseModelJson } from './normalize';
import type { AdviceStep, DiagnosisResult, SpecialistPrompts } from './types';

const ADVICE_TIMEOUT_MS = 270_000;
const TRANSCRIBE_TIMEOUT_MS = 25_000;

function createTimeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function mapClientError(error: unknown, timeoutMs: number): Error {
  const name = AI_CONFIG.displayName;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`O ${name} demorou mais de ${Math.round(timeoutMs / 1000)}s e a consulta foi interrompida. Tente de novo.`);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('Network request failed')) {
    return new Error(`Não foi possível falar com o servidor do ${name}. Confirme que o npm run dev está no ar e tente de novo.`);
  }
  return error instanceof Error ? error : new Error(message || `Falha ao consultar o ${name}.`);
}

async function postJson<T>(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: createTimeoutSignal(timeoutMs),
    });
  } catch (error) {
    throw mapClientError(error, timeoutMs);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error('O servidor de diagnóstico não respondeu corretamente. Reinicie o npm run dev e tente de novo.');
  }

  const payload = await response.json().catch(() => ({})) as { error?: string; text?: string };
  if (!response.ok) {
    throw new Error(payload.error || `O ${AI_CONFIG.displayName} retornou erro ${response.status}. Tente novamente.`);
  }
  if (typeof payload.text !== 'string' && path.includes('advice')) {
    throw new Error(`A resposta do ${AI_CONFIG.displayName} veio vazia. Gere o diagnóstico novamente.`);
  }
  return payload as T;
}

export async function requestStep(
  step: AdviceStep,
  prompts: SpecialistPrompts,
  exams: { data: string; mimeType: string }[] = [],
  knowledgeQuery = '',
): Promise<DiagnosisResult> {
  try {
    const { text } = await postJson<{ text: string }>(AI_CONFIG.routes.advice, {
      step,
      systemInstruction: prompts.systemInstruction,
      userPrompt: prompts.userPrompt,
      exams,
      knowledgeQuery,
    }, ADVICE_TIMEOUT_MS);

    if (!text?.trim()) {
      throw new Error(`A resposta do ${AI_CONFIG.displayName} veio vazia. Gere o diagnóstico novamente.`);
    }
    return normalizeResult(parseModelJson(text));
  } catch (error) {
    throw mapClientError(error, ADVICE_TIMEOUT_MS);
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  try {
    const { text } = await postJson<{ text: string }>(AI_CONFIG.routes.transcribe, {
      audioBase64,
      mimeType,
    }, TRANSCRIBE_TIMEOUT_MS);
    return text || '';
  } catch (error) {
    throw mapClientError(error, TRANSCRIBE_TIMEOUT_MS);
  }
}
