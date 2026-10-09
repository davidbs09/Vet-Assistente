import { AI_CONFIG } from "../shared/aiConfig";
import instructions from "./instructions.json";

export interface DifferentialDiagnosis {
  disease: string;
  likelihood: string;
  reasoning: string;
}

export interface DiagnosisResult {
  diagnosis: string;
  differentials: DifferentialDiagnosis[];
  treatment: string;
  medications: {
    name: string;
    dosage: string;
    frequency: string;
    duration: string;
    forDiagnosis?: string;
  }[];
  suggestedExams: string[];
  sources: string[];
}

const { project_info, system_instruction, prompts } = instructions;

function bullets(items?: string[]): string {
  return (items ?? []).map((item) => `- ${item}`).join('\n');
}

function speciesLabel(species: string): string {
  if (species === 'dog') return 'Cão (canina)';
  if (species === 'cat') return 'Gato (felina)';
  return species;
}

function fillPromptTemplate(vars: Record<string, string>): string {
  return prompts.clinical_consultation_prompt_template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? 'Não informado');
}

function fillTestPrompt(vars: Record<string, string>): string {
  return `Paciente: ${vars.species} (Raça: ${vars.breed}), Peso: ${vars.weight} kg.
Idade/Sexo: ${vars.age_and_sex}.
Sintomas e anamnese: ${vars.symptoms}
Exames: ${vars.exams_data}

Responda APENAS um JSON válido, sem markdown e sem texto fora do JSON, com estas chaves em string/array plano:
- diagnosis: string
- differentials: [{disease, likelihood, reasoning}] — likelihood só: "Mais provável" | "Plausível" | "Menos provável". Nunca use "A descartar".
- treatment: string (markdown) — conduta até a recuperação E o plano para descobrir qual hipótese é a verdadeira. Este campo é o eixo: medications deve copiá-lo na risca.
- medications: [{name, dosage, frequency, duration, forDiagnosis}] — prescrição da CONDUTA, sem teto de 3 e sem um fármaco por hipótese. Tudo que o treatment pedir vira item com dose. forDiagnosis = objetivo da conduta (ex.: Controle da dor), não o nome da doença.
- suggestedExams: [string] — cada exame deve dizer qual hipótese confirma ou torna menos provável
- sources: [string]

Não aninhe diagnosis nem treatment como objeto. Inclua as 8 fontes obrigatórias.`;
}

const USE_TEST_SYSTEM_INSTRUCTION = true;

function buildTestSystemInstruction(patientInfo: { species: string; breed: string; weight: number }): string {
  return `Você é uma inteligência artificial veterinária de alta precisão, especializada em cães e gatos.
Sua tarefa é fornecer diagnósticos e tratamentos baseados em evidências, pesquisando obrigatoriamente no mínimo nas seguintes fontes:
1. Nelson & Couto - Medicina Interna de Pequenos Animais
2. Ettinger - Tratado de Medicina Interna Veterinária
3. Manual Merck Veterinário
4. Casos de Rotina em Medicina Veterinária de Pequenos Animais - Leandro Z. Crivellenti
5. Manual Saunders - Clínica de Pequenos Animais - Richard Sherding
6. Guia Terapêutico Veterinário — Fernando Antônio Bretas Viana, 3ª ed., 2014, Editora CEM (560 p.)
7. Vetsmart (para medicações, nomes comerciais e dosagens)
8. Vetalfa (para medicações, nomes comerciais e dosagens)

Para cada consulta, você deve:
1. Analisar os sintomas e informações do paciente (espécie, raça, peso: ${patientInfo.weight}kg).
2. Se houver exames (imagens ou PDFs convertidos em texto/imagem), analise-os cuidadosamente.
3. Fornecer um diagnóstico provável e diferenciais com likelihood "Mais provável", "Plausível" ou "Menos provável". Nunca use "A descartar".
4. No treatment: conduta até a recuperação e como desvendar qual hipótese é o problema real. O tratamento é o foco principal.
5. Calcular as doses exatas dos medicamentos com base no peso do paciente (${patientInfo.weight}kg), cruzando Bretas Viana com as diretrizes vigentes do Vetsmart e Vetalfa.
6. Apresentar as doses em comprimidos ou ml, dependendo do que for mais apropriado para o animal e o medicamento.
7. Em medications, transcreva a farmacologia do treatment. Se a conduta cita dor, êmese, fluido, antibiótico ou outro fármaco, cada um entra na lista. Sem teto de 3 e sem um por hipótese. forDiagnosis = objetivo da conduta. Complete o tratamento primeiro.
8. Em suggestedExams, liste exames que separem as hipóteses: cada item deve dizer o que confirma ou torna menos provável.
9. Listar as fontes bibliográficas e sites consultados (incluindo obrigatoriamente as fontes citadas acima).

Responda SEMPRE em formato JSON estruturado com as chaves: diagnosis, differentials, treatment, medications, suggestedExams, sources.`;
}

function buildSystemInstruction(patientInfo: { species: string; breed: string; weight: number }): string {
  const sources = system_instruction.mandatory_sources
    .map((source, index) => {
      const authors = 'authors' in source && source.authors ? ` — ${source.authors}` : '';
      const edition = 'edition' in source && source.edition ? `, ${source.edition}` : '';
      return `${index + 1}. ${source.title}${authors}${edition}\n   Função: ${source.purpose}`;
    })
    .join('\n');

  return `${system_instruction.role}

MISSÃO: ${system_instruction.core_mission}
IDIOMA: ${project_info.language}. Espécies-alvo: ${project_info.target_species.join(', ')}.

FONTES OBRIGATÓRIAS — consulte e aplique TODAS como se estivessem abertas na mesa. Diagnóstico sai do livro; fármaco e dose saem da monografia atual do VetSmart e do AlfaVet. É proibido protocolo genérico de memória.
${sources}

CONSULTA ÀS FONTES (como se estivesse lendo)
${bullets(system_instruction.clinical_protocols.source_consultation_protocol)}
O array "sources" DEVE incluir as ${system_instruction.mandatory_sources.length} fontes com o tema consultado (pode acrescentar outras se realmente usadas). Não invente número de página.

PACIENTE DESTA CONSULTA
- Espécie: ${speciesLabel(patientInfo.species)}
- Raça: ${patientInfo.breed}
- Peso: ${patientInfo.weight} kg (toda dose: mg/kg da monografia atual VetSmart + AlfaVet × este peso; depois converta para comprimido ou mL da apresentação vigente no Brasil)

PROTOCOLO DE ANAMNESE
${bullets(system_instruction.clinical_protocols.anamnesis_analysis)}

FARMACOLOGIA E POSOLOGIA
${bullets(system_instruction.clinical_protocols.pharmacology_and_dosage_rules)}

INTERPRETAÇÃO DE EXAMES
${bullets(system_instruction.clinical_protocols.exam_interpretation_rules)}

RACIOCÍNIO E ORDEM DOS DIFERENCIAIS
${bullets(system_instruction.clinical_protocols.clinical_reasoning_rules)}

SUPORTE E FLUIDOTERAPIA
${bullets(system_instruction.clinical_protocols.supportive_therapy_rules)}

PLANO DE TRATAMENTO E CIRURGIA
${bullets(system_instruction.clinical_protocols.treatment_style_and_surgery_rules)}

PRESCRIÇÃO (SEM REDUNDÂNCIA, VIA E ANTIBIÓTICO)
${bullets(system_instruction.clinical_protocols.prescription_stewardship_rules)}

REQUISITOS DE SAÍDA
${bullets(system_instruction.output_requirements)}
- O campo "differentials" deve conter NO MÍNIMO 3 doenças distintas (não sinônimos da mesma entidade), da mais para a menos provável, com likelihood ("Mais provável" | "Plausível" | "Menos provável") e raciocínio que justifique a POSIÇÃO de cada uma. Nunca use "A descartar".

Responda SEMPRE em JSON válido no schema pedido.`;
}

function asText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => asText(item)).filter(Boolean).join("\n");
  }
  if (typeof value === "object") {
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

function pickText(record: Record<string, unknown>, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = asText(record[key]);
    if (value) return value;
  }
  return fallback;
}

function extractFrequency(text: string): string {
  const match = text.match(/a cada\s+[\d.,–\-]+\s*(?:h|horas?|dias?)(?:\s*\([^)]+\))?/i);
  return match?.[0] ?? "";
}

function likelihoodFromPosition(position: unknown): string {
  const n = Number(position);
  if (n === 1) return "Mais provável";
  if (n === 2) return "Plausível";
  if (n >= 3) return "Menos provável";
  return "";
}

function normalizeLikelihood(value: string): string {
  if (/descart/i.test(value)) return "Menos provável";
  return value;
}

function flattenDiagnosis(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return asText(value);
  const record = value as Record<string, unknown>;
  const main = pickText(record, ["provavel", "principal", "diagnostico", "summary", "diagnosis"]);
  const severity = pickText(record, ["gravidade_geral", "gravidade"]);
  if (main && severity) return `${main} (${severity})`;
  return main || asText(value);
}

function flattenTreatment(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((item) => `- ${asText(item)}`).filter((item) => item !== "- ").join("\n");
  if (!value || typeof value !== "object") return asText(value);

  const lines: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const title = key.replace(/^\d+_/, "").replace(/_/g, " ");
    lines.push(`**${title}**`);
    if (Array.isArray(nested)) {
      for (const item of nested) lines.push(`- ${asText(item)}`);
    } else if (nested && typeof nested === "object") {
      for (const [childKey, childValue] of Object.entries(nested as Record<string, unknown>)) {
        if (Array.isArray(childValue)) {
          lines.push(`- **${childKey.replace(/_/g, " ")}**`);
          for (const item of childValue) lines.push(`  - ${asText(item)}`);
        } else {
          lines.push(`- **${childKey.replace(/_/g, " ")}:** ${asText(childValue)}`);
        }
      }
    } else {
      const text = asText(nested);
      if (text) lines.push(text);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function extractJsonPayload(text: string): string {
  const unfenced = (text || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
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
      if (ch === "\\") {
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
    if (ch === "{") stack.push("}");
    else if (ch === "[") stack.push("]");
    else if ((ch === "}" || ch === "]") && stack.length) stack.pop();
  }

  let repaired = raw.trimEnd();
  if (escaped) repaired += "\\";
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, "");
  while (stack.length) repaired += stack.pop();
  return repaired;
}

function tryParseObject(candidate: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(candidate || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function parseModelJson(text: string): Record<string, unknown> {
  const payload = extractJsonPayload(text);
  const candidates = [
    payload,
    repairTruncatedJson(payload),
  ];
  const lastComma = payload.lastIndexOf(",");
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

  throw new Error("A resposta do modelo não veio em JSON válido. Gere o diagnóstico novamente.");
}

function normalizeMedication(item: unknown): DiagnosisResult["medications"][number] {
  const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
  const dosage = pickText(record, ["dosage", "dose_final", "dose", "presentation"]);
  const frequency = pickText(record, ["frequency", "freq", "interval"])
    || extractFrequency(pickText(record, ["dose_final", "dose_referencia", "observacoes", "instructions"]));
  const duration = pickText(record, ["duration", "duracao", "instructions", "indication"]);
  return {
    name: pickText(record, ["name", "medicamento"], "Medicamento"),
    dosage: dosage || "Não informado",
    frequency: frequency || "Conforme orientação",
    duration: duration || "Conforme reavaliação",
    forDiagnosis: pickText(record, ["forDiagnosis", "indication", "objetivo"]) || undefined,
  };
}

function normalizeDifferential(item: unknown): DifferentialDiagnosis {
  const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
  return {
    disease: pickText(record, ["disease", "doenca", "name"], "Hipótese não nomeada"),
    likelihood: normalizeLikelihood(pickText(record, ["likelihood"]) || likelihoodFromPosition(record.posicao) || "Plausível"),
    reasoning: pickText(record, ["reasoning", "justificativa"]),
  };
}

function normalizeResult(parsed: Record<string, unknown>): DiagnosisResult {
  return {
    diagnosis: flattenDiagnosis(parsed.diagnosis),
    differentials: Array.isArray(parsed.differentials) ? parsed.differentials.map(normalizeDifferential) : [],
    treatment: flattenTreatment(parsed.treatment),
    medications: Array.isArray(parsed.medications) ? parsed.medications.map(normalizeMedication) : [],
    suggestedExams: Array.isArray(parsed.suggestedExams) ? parsed.suggestedExams.map((item) => asText(item)).filter(Boolean) : [],
    sources: Array.isArray(parsed.sources) ? parsed.sources.map((item) => asText(item)).filter(Boolean) : [],
  };
}

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

async function postAi<T>(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
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

  const payload = await response.json().catch(() => ({})) as {error?: string; text?: string};
  if (!response.ok) {
    throw new Error(payload.error || `O ${AI_CONFIG.displayName} retornou erro ${response.status}. Tente novamente.`);
  }
  if (typeof (payload as {text?: unknown}).text !== 'string' && path.includes('advice')) {
    throw new Error(`A resposta do ${AI_CONFIG.displayName} veio vazia. Gere o diagnóstico novamente.`);
  }
  return payload as T;
}

export async function getVeterinaryAdvice(
  patientInfo: { species: string; breed: string; weight: number },
  symptoms: string,
  exams?: { data: string; mimeType: string }[]
): Promise<DiagnosisResult> {
  const systemInstruction = USE_TEST_SYSTEM_INSTRUCTION
    ? buildTestSystemInstruction(patientInfo)
    : buildSystemInstruction(patientInfo);
  const promptVars = {
    species: speciesLabel(patientInfo.species),
    breed: patientInfo.breed,
    weight: String(patientInfo.weight),
    age_and_sex: 'Não informado neste registro',
    symptoms,
    exams_data: exams && exams.length > 0
      ? `${exams.length} exame(s) anexado(s) nesta consulta (imagem ou PDF). Interprete os arquivos enviados e correlacione com a queixa.`
      : 'Nenhum exame complementar anexado.',
  };
  const userPrompt = USE_TEST_SYSTEM_INSTRUCTION
    ? fillTestPrompt(promptVars)
    : fillPromptTemplate(promptVars);

  try {
    const {text} = await postAi<{text: string}>(AI_CONFIG.routes.advice, {
      systemInstruction,
      userPrompt,
      exams: (exams || []).map((exam) => ({
        data: exam.data,
        mimeType: exam.mimeType,
      })),
    }, ADVICE_TIMEOUT_MS);

    if (!text?.trim()) {
      throw new Error(`A resposta do ${AI_CONFIG.displayName} veio vazia. Gere o diagnóstico novamente.`);
    }
    const result = normalizeResult(parseModelJson(text));
    if (!result.diagnosis && !result.treatment) {
      throw new Error(`O ${AI_CONFIG.displayName} não montou o diagnóstico. Tente gerar novamente.`);
    }
    return result;
  } catch (error) {
    throw mapClientError(error, ADVICE_TIMEOUT_MS);
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  try {
    const {text} = await postAi<{text: string}>(AI_CONFIG.routes.transcribe, {
      audioBase64,
      mimeType,
    }, TRANSCRIBE_TIMEOUT_MS);
    return text || "";
  } catch (error) {
    throw mapClientError(error, TRANSCRIBE_TIMEOUT_MS);
  }
}
