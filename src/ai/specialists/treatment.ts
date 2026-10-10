import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { DiagnosisResult, Specialist } from '../types';

export const treatmentSpecialist: Specialist = {
  id: 'treatment',
  label: 'Tratamento',
  detail: 'Conduta até a recuperação',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote, draft }) {
    return {
      systemInstruction: `Você só escreve a CONDUTA. Não feche diagnóstico de novo, não monte a lista medications, não sugira exame.
Consulte:
${listSources(['NELSON_COUTO', 'JERICO', 'MERCK_VET', 'CRIVELLENTI'])}

Regras:
- treatment: conduta até a recuperação (estabilização, fluido, nutrição, manejo, cirurgia se couber, o que o tutor faz e como esclarecer a hipótese).
- Nomeie cada recurso da conduta (fluido, fármaco, procedimento). Se pedir Ringer, escreva Ringer. Se pedir analgésico, nomeie o princípio.
- Sem teto de itens na conduta. Sem relatório de UTI. Citações em colchetes quando usar a fatia.
- Se houver fatia do Nelson/Couto, do Tratado (Jericó), do Elsevier (Moraillon) ou do Crivellenti, use o protocolo da fonte.
- Respeite o sexo. Sem Unasyn/Ampicilina. Sem dois soros.

Responda APENAS JSON com: treatment, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

DIAGNÓSTICO JÁ FEITO
${JSON.stringify({
    diagnosis: draft.diagnosis,
    examFindings: draft.examFindings || '',
  })}

Escreva só o treatment deste caso. Sem medications, sem suggestedExams, sem reabrir o diagnóstico.`,
    };
  },
  assert(result: DiagnosisResult) {
    if (!result.treatment) {
      throw new Error('O veterinário de tratamento não devolveu a conduta. Gere novamente.');
    }
  },
};
