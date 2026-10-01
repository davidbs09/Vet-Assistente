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
  }[];
  suggestedExams: string[];
  sources: string[];
}

const { project_info, system_instruction, prompts } = instructions;

function bullets(items: string[]): string {
  return items.map((item) => `- ${item}`).join('\n');
}

function speciesLabel(species: string): string {
  if (species === 'dog') return 'Cão (canina)';
  if (species === 'cat') return 'Gato (felina)';
  return species;
}

function fillPromptTemplate(vars: Record<string, string>): string {
  return prompts.clinical_consultation_prompt_template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? 'Não informado');
}

function buildSystemInstruction(patientInfo: { species: string; breed: string; weight: number }): string {
  const sources = system_instruction.mandatory_sources
    .map((source, index) => {
      const authors = 'authors' in source && source.authors ? ` — ${source.authors}` : '';
      return `${index + 1}. ${source.title}${authors}\n   Função: ${source.purpose}`;
    })
    .join('\n');

  return `${system_instruction.role}

MISSÃO: ${system_instruction.core_mission}
IDIOMA: ${project_info.language}. Espécies-alvo: ${project_info.target_species.join(', ')}.

FONTES OBRIGATÓRIAS — consulte e aplique TODAS como se estivessem abertas na mesa. Diagnóstico sai do livro; fármaco e dose saem da monografia atual do VetSmart e do AlfaVet. É proibido protocolo genérico de memória.
${sources}

CONSULTA ÀS FONTES (como se estivesse lendo)
${bullets(system_instruction.clinical_protocols.source_consultation_protocol)}
O array "sources" DEVE incluir as 7 fontes com o tema consultado (pode acrescentar outras se realmente usadas). Não invente número de página.

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
- O campo "differentials" deve conter NO MÍNIMO 3 doenças distintas (não sinônimos da mesma entidade), da mais para a menos provável, com likelihood ("Mais provável" | "Plausível" | "A descartar") e raciocínio que justifique a POSIÇÃO de cada uma.

Responda SEMPRE em JSON válido no schema pedido.`;
}

function asText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;
  if (value == null) return fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => asText(item)).filter(Boolean).join(" — ");
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const preferred = asText(record.exam || record.source || record.title || record.name || record.topic || record.justification);
    if (preferred) {
      const extra = asText(record.justification || record.topic || record.reason);
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

function parseModelJson(text: string): Record<string, unknown> {
  const trimmed = (text || "").trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  const payload = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
  try {
    return JSON.parse(payload || "{}") as Record<string, unknown>;
  } catch {
    throw new Error("A resposta do modelo não veio em JSON válido. Gere o diagnóstico novamente.");
  }
}

function normalizeMedication(item: unknown): DiagnosisResult["medications"][number] {
  const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
  const dosage = asText(record.dosage || record.dose || record.presentation);
  const frequency = asText(record.frequency || record.freq || record.interval);
  const duration = asText(record.duration || record.instructions || record.indication);
  return {
    name: asText(record.name, "Medicamento"),
    dosage: dosage || "Não informado",
    frequency: frequency || asText(record.instructions, "Conforme orientação"),
    duration: duration || "Conforme reavaliação",
  };
}

function normalizeDifferential(item: unknown): DifferentialDiagnosis {
  const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
  return {
    disease: asText(record.disease || record.name, "Hipótese não nomeada"),
    likelihood: asText(record.likelihood, "Plausível"),
    reasoning: asText(record.reasoning || record.justification),
  };
}

function normalizeResult(parsed: Record<string, unknown>): DiagnosisResult {
  return {
    diagnosis: asText(parsed.diagnosis),
    differentials: Array.isArray(parsed.differentials) ? parsed.differentials.map(normalizeDifferential) : [],
    treatment: asText(parsed.treatment),
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
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new Error(`O Claude demorou mais de ${Math.round(timeoutMs / 1000)}s e a consulta foi interrompida. Tente de novo.`);
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('Failed to fetch') || message.includes('NetworkError') || message.includes('Network request failed')) {
    return new Error('Não foi possível falar com o servidor do Claude. Confirme que o npm run dev está no ar e tente de novo.');
  }
  return error instanceof Error ? error : new Error(message || 'Falha ao consultar o Claude.');
}

async function postClaude<T>(path: string, body: Record<string, unknown>, timeoutMs: number): Promise<T> {
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
    throw new Error(payload.error || `O Claude retornou erro ${response.status}. Tente novamente.`);
  }
  if (typeof (payload as {text?: unknown}).text !== 'string' && path.includes('advice')) {
    throw new Error('A resposta do Claude veio vazia. Gere o diagnóstico novamente.');
  }
  return payload as T;
}

export async function getVeterinaryAdvice(
  patientInfo: { species: string; breed: string; weight: number },
  symptoms: string,
  exams?: { data: string; mimeType: string }[]
): Promise<DiagnosisResult> {
  const systemInstruction = buildSystemInstruction(patientInfo);
  const userPrompt = fillPromptTemplate({
    species: speciesLabel(patientInfo.species),
    breed: patientInfo.breed,
    weight: String(patientInfo.weight),
    age_and_sex: 'Não informado neste registro',
    symptoms,
    exams_data: exams && exams.length > 0
      ? `${exams.length} exame(s) anexado(s) nesta consulta (imagem ou PDF). Interprete os arquivos enviados e correlacione com a queixa.`
      : 'Nenhum exame complementar anexado.',
  });

  try {
    const {text} = await postClaude<{text: string}>('/api/claude/advice', {
      systemInstruction,
      userPrompt,
      exams: (exams || []).map((exam) => ({
        data: exam.data,
        mimeType: exam.mimeType,
      })),
    }, ADVICE_TIMEOUT_MS);

    if (!text?.trim()) {
      throw new Error('A resposta do Claude veio vazia. Gere o diagnóstico novamente.');
    }
    const result = normalizeResult(parseModelJson(text));
    if (!result.diagnosis && !result.treatment) {
      throw new Error('O Claude não montou o diagnóstico. Tente gerar novamente.');
    }
    return result;
  } catch (error) {
    throw mapClientError(error, ADVICE_TIMEOUT_MS);
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  try {
    const {text} = await postClaude<{text: string}>('/api/claude/transcribe', {
      audioBase64,
      mimeType,
    }, TRANSCRIBE_TIMEOUT_MS);
    return text || "";
  } catch (error) {
    throw mapClientError(error, TRANSCRIBE_TIMEOUT_MS);
  }
}
