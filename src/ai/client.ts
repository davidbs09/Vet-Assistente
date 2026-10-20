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

function publicReportError(message: string): string {
  const timedOut = /timeout|timed out|demorou|aborted|abort/i.test(message);
  const busy = /alta demanda|quota|limite|unavailable|overloaded|resource_exhausted|429|503/i.test(message);
  const leaksVendor = /google|gemini|ai studio|api[_ ]?key|npm run dev|modelo /i.test(message);
  if (timedOut) return 'O sistema demorou para responder. Por favor, gere o relatório novamente.';
  if (busy || leaksVendor) return 'O sistema está com alta demanda. Por favor, gere o relatório novamente.';
  return message;
}

function mapClientError(error: unknown, _timeoutMs: number): Error {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error('O sistema demorou para responder. Por favor, gere o relatório novamente.');
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('Network request failed')) {
    return new Error('Não foi possível concluir o relatório agora. Verifique sua conexão e gere novamente.');
  }
  return new Error(publicReportError(message) || 'Não foi possível gerar o relatório agora. Por favor, gere novamente.');
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
    throw new Error('Não foi possível gerar o relatório agora. Por favor, gere novamente.');
  }

  const payload = await response.json().catch(() => ({})) as { error?: string; text?: string };
  if (!response.ok) {
    throw new Error(publicReportError(payload.error || 'Não foi possível gerar o relatório agora. Por favor, gere novamente.'));
  }
  if (typeof payload.text !== 'string' && path.includes('advice')) {
    throw new Error('O sistema não conseguiu concluir o relatório. Por favor, gere novamente.');
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
      throw new Error('O sistema não conseguiu concluir o relatório. Por favor, gere novamente.');
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
