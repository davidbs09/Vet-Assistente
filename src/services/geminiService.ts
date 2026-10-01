import { GoogleGenAI, Type } from "@google/genai";
import instructions from "./instructions.json";

function getApiKey(): string {
  if (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  const env = (import.meta as any).env || {};
  return env.VITE_GEMINI_API_KEY || "";
}

const FALLBACK_MODEL = 'gemini-3.5-flash-lite';

function uniqueModels(models: string[]): string[] {
  return [...new Set(models.filter(Boolean))];
}

function isModelMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('404') || message.includes('NOT_FOUND') || message.includes('no longer available');
}

function isOverloaded(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('503')
    || message.includes('UNAVAILABLE')
    || message.includes('high demand')
    || message.includes('Please try again later');
}

function isQuotaExceeded(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('429')
    || message.includes('RESOURCE_EXHAUSTED')
    || message.includes('quota');
}

function mapGeminiError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (isQuotaExceeded(error)) {
    return new Error(
      'A cota da API Gemini esgotou neste modelo. Aguarde um minuto e tente de novo, ou ative faturamento no Google AI Studio.'
    );
  }
  if (isOverloaded(error)) {
    return new Error('O Gemini está com alta demanda agora. Espere uns 20 segundos e gere o relatório de novo.');
  }
  if (isModelMissing(error)) {
    return new Error('O modelo Gemini configurado não está disponível nesta chave. Tente novamente em instantes.');
  }
  return error instanceof Error ? error : new Error(message);
}

const ai = new GoogleGenAI({ apiKey: getApiKey() });

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function thinkingConfigFor(model: string): Record<string, unknown> {
  const name = model.toLowerCase();
  if (name.includes('flash-lite')) {
    return {};
  }
  if (name.includes('gemini-3')) {
    return { thinkingConfig: { thinkingLevel: 'HIGH' } };
  }
  if (name.includes('2.5')) {
    return { thinkingConfig: { thinkingBudget: 8192 } };
  }
  return {};
}

function isInvalidRequest(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('400')
    || message.includes('INVALID_ARGUMENT')
    || message.includes('thinking');
}

async function generateContentWithFallback(
  params: Record<string, unknown>,
  models: string[],
  options?: { enableThinking?: boolean }
) {
  let lastError: unknown;
    modelLoop: for (const model of uniqueModels([...models, FALLBACK_MODEL])) {
    const baseConfig = (params.config as Record<string, unknown> | undefined) || {};
    const thinking = options?.enableThinking ? thinkingConfigFor(model) : {};
    const configs = Object.keys(thinking).length > 0
      ? [{ ...baseConfig, ...thinking }, baseConfig]
      : [baseConfig];

    for (const config of configs) {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          return await ai.models.generateContent({
            ...params,
            model,
            config,
          } as unknown as Parameters<typeof ai.models.generateContent>[0]);
        } catch (error) {
          lastError = error;
          if (isOverloaded(error) && attempt < 3) {
            await wait(attempt * 2000);
            continue;
          }
          if (isQuotaExceeded(error) || isModelMissing(error) || isOverloaded(error)) {
            continue modelLoop;
          }
          if (isInvalidRequest(error)) {
            break;
          }
          throw mapGeminiError(error);
        }
      }
    }
  }
  throw mapGeminiError(lastError);
}

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

const { project_info, model_parameters, system_instruction, json_output_schema, prompts } = instructions;
const schema = json_output_schema.properties;

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

PRESCRIÇÃO (SEM REDUNDÂNCIA, VIA E ANTIBIÓTICO)
${bullets(system_instruction.clinical_protocols.prescription_stewardship_rules)}

REQUISITOS DE SAÍDA
${bullets(system_instruction.output_requirements)}
- O campo "differentials" deve conter NO MÍNIMO 3 doenças distintas (não sinônimos da mesma entidade), da mais para a menos provável, com likelihood ("Mais provável" | "Plausível" | "A descartar") e raciocínio que justifique a POSIÇÃO de cada uma.

Responda SEMPRE em JSON válido no schema pedido.`;
}

function parseModelJson(text: string): DiagnosisResult {
  const trimmed = (text || "").trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  const payload = start >= 0 && end > start ? unfenced.slice(start, end + 1) : unfenced;
  try {
    return JSON.parse(payload || "{}") as DiagnosisResult;
  } catch {
    throw new Error("A resposta do modelo não veio em JSON válido. Gere o diagnóstico novamente.");
  }
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

  const parts: any[] = [{ text: userPrompt }];

  if (exams && exams.length > 0) {
    exams.forEach(exam => {
      parts.push({
        inlineData: {
          data: exam.data.split(',')[1] || exam.data,
          mimeType: exam.mimeType
        }
      });
    });
  }

  try {
    const response = await generateContentWithFallback({
      contents: { parts },
      config: {
        systemInstruction,
        temperature: model_parameters.temperature,
        topP: model_parameters.top_p,
        responseMimeType: model_parameters.response_mime_type,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            diagnosis: {
              type: Type.STRING,
              description: schema.diagnosis.description
            },
            differentials: {
              type: Type.ARRAY,
              minItems: 3,
              description: "No mínimo 3 doenças nomeadas, ordenadas pela probabilidade NESTE paciente (casuística brasileira + sinais presentes e ausentes), não por agrupamento de vetor.",
              items: {
                type: Type.OBJECT,
                properties: {
                  disease: {
                    type: Type.STRING,
                    description: "Nome da doença ou síndrome. Sem rótulos genéricos."
                  },
                  likelihood: {
                    type: Type.STRING,
                    description: "Mais provável, Plausível ou A descartar."
                  },
                  reasoning: {
                    type: Type.STRING,
                    description: "Por que esta POSIÇÃO na lista (2º vs 3º), 1 achado a favor, 1 contra e 1 exame/manobra que diferencia."
                  }
                },
                required: ["disease", "likelihood", "reasoning"]
              }
            },
            treatment: {
              type: Type.STRING,
              description: schema.treatment.description
            },
            medications: {
              type: Type.ARRAY,
              description: schema.medications.description,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: {
                    type: Type.STRING,
                    description: schema.medications.items.properties.name.description
                  },
                  dosage: {
                    type: Type.STRING,
                    description: schema.medications.items.properties.dosage.description
                  },
                  frequency: {
                    type: Type.STRING,
                    description: schema.medications.items.properties.frequency.description
                  },
                  duration: {
                    type: Type.STRING,
                    description: schema.medications.items.properties.duration.description
                  }
                },
                required: [...schema.medications.items.required]
              }
            },
            suggestedExams: {
              type: Type.ARRAY,
              description: schema.suggestedExams.description,
              items: { type: Type.STRING }
            },
            sources: {
              type: Type.ARRAY,
              description: schema.sources.description,
              items: { type: Type.STRING }
            }
          },
          required: ["diagnosis", "differentials", "treatment", "medications", "suggestedExams", "sources"]
        }
      }
    }, [...model_parameters.recommended_reasoning_models], { enableThinking: true });

    const parsed = parseModelJson(response.text || "");
    const differentials = Array.isArray(parsed.differentials) ? parsed.differentials : [];
    return {
      diagnosis: parsed.diagnosis || "",
      differentials,
      treatment: parsed.treatment || "",
      medications: Array.isArray(parsed.medications) ? parsed.medications : [],
      suggestedExams: Array.isArray(parsed.suggestedExams) ? parsed.suggestedExams : [],
      sources: Array.isArray(parsed.sources) ? parsed.sources : [],
    };
  } catch (error) {
    throw mapGeminiError(error);
  }
}

export async function transcribeAudio(audioBase64: string, mimeType: string): Promise<string> {
  try {
    const response = await generateContentWithFallback({
      contents: [
        {
          parts: [
            {
              inlineData: {
                data: audioBase64,
                mimeType: mimeType
              }
            },
            {
              text: prompts.audio_anamnesis_transcription_prompt
            }
          ]
        }
      ]
    }, [...model_parameters.recommended_multimodal_audio_models]);

    return response.text || "";
  } catch (error) {
    throw mapGeminiError(error);
  }
}
