import {GoogleGenAI} from '@google/genai';
import type {IncomingMessage, ServerResponse} from 'http';
import type {Plugin, ViteDevServer} from 'vite';
import {AI_CONFIG} from '../src/shared/aiConfig';
import instructions from '../src/services/instructions.json';

type EnvMap = Record<string, string | undefined>;

const BODY_LIMIT = 16 * 1024 * 1024;

const diagnosisOutputSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['diagnosis', 'differentials', 'treatment', 'medications', 'suggestedExams', 'sources'],
  properties: {
    diagnosis: {
      type: 'string',
      description: instructions.json_output_schema.properties.diagnosis.description,
    },
    differentials: {
      type: 'array',
      minItems: 3,
      description: instructions.json_output_schema.properties.differentials.description,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['disease', 'likelihood', 'reasoning'],
        properties: {
          disease: {type: 'string', description: instructions.json_output_schema.properties.differentials.items.properties.disease.description},
          likelihood: {type: 'string', description: instructions.json_output_schema.properties.differentials.items.properties.likelihood.description},
          reasoning: {type: 'string', description: instructions.json_output_schema.properties.differentials.items.properties.reasoning.description},
        },
      },
    },
    treatment: {
      type: 'string',
      description: instructions.json_output_schema.properties.treatment.description,
    },
    medications: {
      type: 'array',
      description: instructions.json_output_schema.properties.medications.description,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'dosage', 'frequency', 'duration', 'forDiagnosis'],
        properties: {
          name: {type: 'string', description: instructions.json_output_schema.properties.medications.items.properties.name.description},
          dosage: {type: 'string', description: instructions.json_output_schema.properties.medications.items.properties.dosage.description},
          frequency: {type: 'string', description: instructions.json_output_schema.properties.medications.items.properties.frequency.description},
          duration: {type: 'string', description: instructions.json_output_schema.properties.medications.items.properties.duration.description},
          forDiagnosis: {type: 'string', description: instructions.json_output_schema.properties.medications.items.properties.forDiagnosis.description},
        },
      },
    },
    suggestedExams: {
      type: 'array',
      description: instructions.json_output_schema.properties.suggestedExams.description,
      items: {type: 'string'},
    },
    sources: {
      type: 'array',
      description: instructions.json_output_schema.properties.sources.description,
      items: {type: 'string'},
    },
  },
};

function readApiKey(env: EnvMap): string {
  for (const name of AI_CONFIG.apiKeyEnv) {
    const raw = env[name] || '';
    const value = raw.replace(/^["']|["']$/g, '').trim();
    if (value) return value;
  }
  return '';
}

function readJsonBody(req: IncomingMessage, limit = BODY_LIMIT): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Payload muito grande.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  if (res.writableEnded) return;
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function requestPath(req: IncomingMessage): string {
  const url = req.url || '/';
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function stripBase64(data: string): string {
  const comma = data.indexOf(',');
  return comma >= 0 ? data.slice(comma + 1) : data;
}

function isTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('timed out')
    || message.includes('Timeout')
    || message.includes('timeout')
    || message.includes('aborted')
    || message.includes('tempo limite');
}

function mapAiError(error: unknown): {status: number; message: string} {
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as {status?: number}).status)
    : 0;
  const name = AI_CONFIG.displayName;

  if (message.includes('GEMINI_API_KEY não configurada')) {
    return {status: 503, message};
  }
  if (status === 401 || message.includes('API_KEY_INVALID') || message.includes('API key not valid') || message.includes('invalid api key')) {
    return {status: 401, message: `A chave do ${name} é inválida ou expirou. Confira GEMINI_API_KEY no .env.`};
  }
  if (status === 429 || message.includes('RESOURCE_EXHAUSTED') || message.includes('quota')) {
    return {status: 429, message: `A cota ou o limite do ${name} estourou. Aguarde um minuto e tente de novo.`};
  }
  if (status === 503 || message.includes('UNAVAILABLE') || message.includes('overloaded')) {
    return {status: 503, message: `O ${name} está com alta demanda agora. Espere uns 20 segundos e gere o relatório de novo.`};
  }
  if (status === 404 || message.includes('NOT_FOUND') || message.includes('not found')) {
    return {status: 404, message: `O modelo ${AI_CONFIG.model} não está disponível nesta chave.`};
  }
  if (isTimeoutError(error) || message.includes('tempo limite')) {
    return {status: 504, message: `O ${name} demorou demais para responder. Tente gerar o diagnóstico novamente.`};
  }
  if (status === 400) {
    return {status: 400, message: `O ${name} recusou o pedido. Confira a chave, o modelo e tente de novo sem anexos pesados.`};
  }
  return {status: status >= 400 && status < 600 ? status : 500, message: message || `Falha não tratada ao consultar o ${name}.`};
}

function createClient(env: EnvMap): GoogleGenAI {
  const apiKey = readApiKey(env);
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY não configurada no .env.');
  }
  return new GoogleGenAI({apiKey});
}

function examPart(exam: {data: string; mimeType: string}): {inlineData: {mimeType: string; data: string}} {
  const data = stripBase64(exam.data);
  const mimeType = exam.mimeType || 'image/jpeg';
  return {inlineData: {mimeType, data}};
}

function responseText(response: {text?: string}): string {
  return String(response.text || '').trim();
}

async function generateText(
  env: EnvMap,
  systemInstruction: string,
  parts: Array<{text: string} | {inlineData: {mimeType: string; data: string}}>,
  withSchema: boolean,
): Promise<string> {
  const client = createClient(env);
  const response = await client.models.generateContent({
    model: AI_CONFIG.model,
    contents: [{role: 'user', parts}],
    config: {
      systemInstruction,
      temperature: AI_CONFIG.temperature,
      topP: AI_CONFIG.topP,
      maxOutputTokens: AI_CONFIG.maxOutputTokens,
      responseMimeType: 'application/json',
      ...(withSchema ? {responseSchema: diagnosisOutputSchema} : {}),
    },
  });
  return responseText(response);
}

async function handleAdvice(req: IncomingMessage, res: ServerResponse, env: EnvMap): Promise<void> {
  const body = await readJsonBody(req);
  const systemInstruction = typeof body.systemInstruction === 'string' ? body.systemInstruction : '';
  const userPrompt = typeof body.userPrompt === 'string' ? body.userPrompt : '';
  const exams = Array.isArray(body.exams) ? body.exams as {data: string; mimeType: string}[] : [];

  if (!systemInstruction || !userPrompt) {
    sendJson(res, 400, {error: 'Prompt clínico incompleto.'});
    return;
  }

  const parts = [
    ...exams.slice(0, 8).map(examPart),
    {text: userPrompt},
  ];

  let text = '';
  try {
    text = await generateText(env, systemInstruction, parts, true);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('responseSchema') && !message.includes('response_schema')) {
      throw error;
    }
    text = await generateText(env, systemInstruction, parts, false);
  }

  if (!text) {
    sendJson(res, 502, {error: `${AI_CONFIG.displayName} não devolveu texto no diagnóstico.`});
    return;
  }
  sendJson(res, 200, {text});
}

async function handleTranscribe(req: IncomingMessage, res: ServerResponse, env: EnvMap): Promise<void> {
  const body = await readJsonBody(req);
  const audioBase64 = typeof body.audioBase64 === 'string' ? body.audioBase64 : '';
  const mimeType = typeof body.mimeType === 'string' ? body.mimeType : 'audio/webm';
  if (!audioBase64) {
    sendJson(res, 400, {error: 'Áudio não enviado.'});
    return;
  }

  const text = await generateText(
    env,
    'Transcreva o áudio em português do Brasil. Devolva JSON {"text":"..."}.',
    [{inlineData: {mimeType, data: stripBase64(audioBase64)}}, {text: 'Transcreva este áudio.'}],
    false,
  );
  sendJson(res, 200, {text});
}

function attachAiRoutes(server: ViteDevServer, env: EnvMap): void {
  server.middlewares.use(async (req, res, next) => {
    const path = requestPath(req);
    if (req.method !== 'POST' || (path !== AI_CONFIG.routes.advice && path !== AI_CONFIG.routes.transcribe)) {
      next();
      return;
    }

    req.setTimeout(AI_CONFIG.timeoutMs + 5_000);
    res.setTimeout(AI_CONFIG.timeoutMs + 5_000);

    try {
      if (path === AI_CONFIG.routes.advice) {
        await handleAdvice(req, res, env);
        return;
      }
      await handleTranscribe(req, res, env);
    } catch (error) {
      const mapped = mapAiError(error);
      console.error('AI API error:', mapped.message, error instanceof Error ? error.message : error);
      try {
        sendJson(res, mapped.status, {error: mapped.message});
      } catch (sendError) {
        console.error('Falha ao devolver erro da IA:', sendError);
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.end(JSON.stringify({error: `Falha não tratada ao consultar o ${AI_CONFIG.displayName}.`}));
        }
      }
    }
  });
}

function relaxHttpTimeouts(server: ViteDevServer): void {
  const apply = () => {
    const httpServer = server.httpServer as (typeof server.httpServer & {
      timeout?: number;
      headersTimeout?: number;
      requestTimeout?: number;
    }) | null;
    if (!httpServer) return;
    const wait = AI_CONFIG.timeoutMs + 30_000;
    httpServer.timeout = wait;
    httpServer.headersTimeout = wait;
    httpServer.requestTimeout = wait;
  };
  apply();
  server.httpServer?.once('listening', apply);
}

export function aiPlugin(env: EnvMap): Plugin {
  return {
    name: 'vet-ai-api',
    configureServer(server) {
      relaxHttpTimeouts(server);
      attachAiRoutes(server, env);
    },
    configurePreviewServer(server) {
      const preview = server as unknown as ViteDevServer;
      relaxHttpTimeouts(preview);
      attachAiRoutes(preview, env);
    },
  };
}
