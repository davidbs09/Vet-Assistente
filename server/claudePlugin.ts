import Anthropic from '@anthropic-ai/sdk';
import type {IncomingMessage, ServerResponse} from 'http';
import type {Plugin, ViteDevServer} from 'vite';
import instructions from '../src/services/instructions.json';

type EnvMap = Record<string, string | undefined>;

const CLAUDE_MODEL = 'claude-sonnet-5-5';
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
      description: 'No mínimo 3 doenças nomeadas, da mais para a menos provável neste paciente.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['disease', 'likelihood', 'reasoning'],
        properties: {
          disease: {type: 'string', description: 'Nome da doença ou síndrome.'},
          likelihood: {type: 'string', description: 'Mais provável, Plausível ou A descartar.'},
          reasoning: {type: 'string', description: 'Por que esta posição, achados a favor/contra e como diferenciar.'},
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
        required: ['name', 'dosage', 'frequency', 'duration'],
        properties: {
          name: {type: 'string', description: instructions.json_output_schema.properties.medications.items.properties.name.description},
          dosage: {type: 'string', description: instructions.json_output_schema.properties.medications.items.properties.dosage.description},
          frequency: {type: 'string', description: instructions.json_output_schema.properties.medications.items.properties.frequency.description},
          duration: {type: 'string', description: instructions.json_output_schema.properties.medications.items.properties.duration.description},
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

function readClaudeKey(env: EnvMap): string {
  const raw = env.CLAUDE_API_KEY || env.ANTHROPIC_API_KEY || '';
  return raw.replace(/^["']|["']$/g, '').trim();
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

function mapClaudeError(error: unknown): {status: number; message: string} {
  const message = error instanceof Error ? error.message : String(error);
  const status = typeof error === 'object' && error && 'status' in error
    ? Number((error as {status?: number}).status)
    : 0;

  if (message.includes('CLAUDE_API_KEY não configurada')) {
    return {status: 503, message};
  }
  if (status === 401 || message.includes('invalid x-api-key') || message.includes('authentication')) {
    return {status: 401, message: 'A chave do Claude é inválida ou expirou. Confira CLAUDE_API_KEY no .env.'};
  }
  if (status === 429 || message.includes('rate_limit')) {
    return {status: 429, message: 'A cota ou o limite do Claude estourou. Aguarde um minuto e tente de novo.'};
  }
  if (status === 529 || status === 503 || message.includes('overloaded')) {
    return {status: 503, message: 'O Claude está com alta demanda agora. Espere uns 20 segundos e gere o relatório de novo.'};
  }
  if (status === 404 || message.includes('not_found')) {
    return {status: 404, message: 'O modelo Claude Sonnet 5.5 não está disponível nesta chave.'};
  }
  if (isTimeoutError(error) || message.includes('tempo limite')) {
    return {status: 504, message: 'O Claude demorou demais para responder. Tente gerar o diagnóstico novamente.'};
  }
  if (status === 400) {
    return {status: 400, message: 'O Claude recusou o pedido. Confira a chave, o modelo e tente de novo sem anexos pesados.'};
  }
  return {status: status >= 400 && status < 600 ? status : 500, message: message || 'Falha não tratada ao consultar o Claude.'};
}

function textFromMessage(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

function examBlock(exam: {data: string; mimeType: string}): Anthropic.ContentBlockParam {
  const data = stripBase64(exam.data);
  const mimeType = exam.mimeType || 'image/jpeg';
  if (mimeType === 'application/pdf') {
    return {
      type: 'document',
      source: {type: 'base64', media_type: 'application/pdf', data},
    };
  }
  const mediaType = (['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)
    ? mimeType
    : 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
  return {
    type: 'image',
    source: {type: 'base64', media_type: mediaType, data},
  };
}

const CLAUDE_REQUEST_TIMEOUT_MS = 240_000;

function createClient(env: EnvMap): Anthropic {
  const apiKey = readClaudeKey(env);
  if (!apiKey) {
    throw new Error('CLAUDE_API_KEY não configurada no .env.');
  }
  return new Anthropic({apiKey, timeout: CLAUDE_REQUEST_TIMEOUT_MS, maxRetries: 0});
}

function isStructuredOutputRejected(error: unknown): boolean {
  if (isTimeoutError(error)) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('output_config')
    || message.includes('json_schema')
    || message.includes('structured outputs');
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`O Claude excedeu o tempo limite de ${Math.round(ms / 1000)}s.`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function createAdviceMessage(
  client: Anthropic,
  systemInstruction: string,
  content: Anthropic.ContentBlockParam[],
  withSchema: boolean
): Promise<Anthropic.Message> {
  return withTimeout(client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 8192,
    system: systemInstruction,
    messages: [{role: 'user', content}],
    output_config: withSchema
      ? {
          effort: 'medium',
          format: {type: 'json_schema', schema: diagnosisOutputSchema},
        }
      : {effort: 'medium'},
  }), CLAUDE_REQUEST_TIMEOUT_MS);
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

  const client = createClient(env);
  const content: Anthropic.ContentBlockParam[] = [
    ...exams.slice(0, 8).map(examBlock),
    {type: 'text', text: userPrompt},
  ];

  let message: Anthropic.Message;
  try {
    message = await createAdviceMessage(client, systemInstruction, content, true);
  } catch (error) {
    if (!isStructuredOutputRejected(error)) {
      throw error;
    }
    message = await createAdviceMessage(client, systemInstruction, content, false);
  }

  const text = textFromMessage(message);
  if (!text) {
    sendJson(res, 502, {error: 'O Claude não devolveu texto no diagnóstico.'});
    return;
  }
  sendJson(res, 200, {text});
}

async function handleTranscribe(_req: IncomingMessage, res: ServerResponse, _env: EnvMap): Promise<void> {
  sendJson(res, 422, {
    error: 'O Claude Sonnet 5.5 não transcreve áudio neste fluxo. Digite os sintomas ou anexe exame em imagem/PDF.',
  });
}

function attachClaudeRoutes(server: ViteDevServer, env: EnvMap): void {
  server.middlewares.use(async (req, res, next) => {
    const path = requestPath(req);
    if (req.method !== 'POST' || (path !== '/api/claude/advice' && path !== '/api/claude/transcribe')) {
      next();
      return;
    }

    req.setTimeout(CLAUDE_REQUEST_TIMEOUT_MS + 5_000);
    res.setTimeout(CLAUDE_REQUEST_TIMEOUT_MS + 5_000);

    try {
      if (path === '/api/claude/advice') {
        await handleAdvice(req, res, env);
        return;
      }
      await handleTranscribe(req, res, env);
    } catch (error) {
      const mapped = mapClaudeError(error);
      console.error('Claude API error:', mapped.message);
      try {
        sendJson(res, mapped.status, {error: mapped.message});
      } catch (sendError) {
        console.error('Falha ao devolver erro do Claude:', sendError);
        if (!res.writableEnded) {
          res.statusCode = 500;
          res.end(JSON.stringify({error: 'Falha não tratada ao consultar o Claude.'}));
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
    const wait = CLAUDE_REQUEST_TIMEOUT_MS + 30_000;
    httpServer.timeout = wait;
    httpServer.headersTimeout = wait;
    httpServer.requestTimeout = wait;
  };
  apply();
  server.httpServer?.once('listening', apply);
}

export function claudePlugin(env: EnvMap): Plugin {
  return {
    name: 'vet-claude-api',
    configureServer(server) {
      relaxHttpTimeouts(server);
      attachClaudeRoutes(server, env);
    },
    configurePreviewServer(server) {
      const preview = server as unknown as ViteDevServer;
      relaxHttpTimeouts(preview);
      attachClaudeRoutes(preview, env);
    },
  };
}
