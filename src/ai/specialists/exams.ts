import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { Specialist } from '../types';

export const examsSpecialist: Specialist = {
  id: 'exams',
  label: 'Exames',
  detail: 'Exames para esclarecer',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote, draft }) {
    return {
      systemInstruction: `Você só indica exames. Recebeu diagnóstico, tratamento e medicação. Sua tarefa é EXAMES para confirmar ou afastar o diagnóstico básico.
Consulte:
${listSources(['NELSON_COUTO', 'JERICO', 'MERCK_VET', 'CRIVELLENTI'])}

Regras:
- Cada item de suggestedExams deve dizer o que confirma ou afasta o diagnóstico básico.
- Só exames úteis para este paciente.
- Se houver fatia do Nelson/Couto, do Tratado (Jericó), do Elsevier (Moraillon) ou do Crivellenti, use os exames que a fonte pede para este diagnóstico.
- Não prescreva medicamento.

Responda APENAS JSON com: suggestedExams, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

RELATÓRIO ATÉ AQUI
${JSON.stringify({
    diagnosis: draft.diagnosis,
    treatment: draft.treatment,
    medications: draft.medications,
  })}

Liste os exames complementares.`,
    };
  },
  assert() {},
};
