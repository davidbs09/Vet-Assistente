import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { DiagnosisResult, Specialist } from '../types';

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function examBlob(result: DiagnosisResult): string {
  return fold((result.suggestedExams || []).join(' '));
}

// Exames que a anamnese já pediu — não podem sumir da lista.
const ORDERED: Array<[string, RegExp, RegExp]> = [
  ['raio-x / radiografia', /raio-?x|radiograf/, /raio-?x|radiograf/],
  ['ultrassonografia', /ultrassom|ultrasson|\bus\b|us de/, /ultrassom|ultrasson/],
  ['hemograma', /hemograma/, /hemograma/],
  ['perfil / bioquímica', /perfil|bioquim/, /perfil|bioquim/],
];

export const examsSpecialist: Specialist = {
  id: 'exams',
  label: 'Exames',
  detail: 'Exames para esclarecer',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote, draft, fixNote }) {
    return {
      systemInstruction: `Você é o especialista em exames complementares. Recebeu diagnóstico, conduta e medicação. Não prescreva fármaco.

Você tem as fontes — CONSULTE para saber qual exame confirma ou afasta cada hipótese:
${listSources(['NELSON_COUTO', 'JERICO', 'MERCK_VET', 'CRIVELLENTI'])}

Como raciocinar (serve para qualquer caso):
- A partir do diagnóstico e das hipóteses, liste os exames que de fato confirmam ou afastam cada uma neste paciente. Inclua o marcador específico quando existir (ex.: um teste direcionado ao órgão/agente suspeito), não só o painel genérico.
- Mantenha o que a anamnese JÁ pediu e marque "já solicitada" + o que procurar nele.
- Formato de cada item: "Nome do exame (o que ele responde aqui)." / "Nome do exame (já solicitada — o que procurar)."
- Nome + o que responde, em uma linha. Sem parágrafo de tratado, sem citar livro, sem check-up genérico que o caso não pede.

Responda APENAS JSON com: suggestedExams, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

RELATÓRIO ATÉ AQUI
${JSON.stringify({
    diagnosis: draft.diagnosis,
    treatment: draft.treatment,
    medications: draft.medications,
  })}

Liste os exames. Se a anamnese já pediu algum, mantenha-o com "já solicitada".${fixNote ? `

LISTA ANTERIOR
${JSON.stringify(draft.suggestedExams)}

CORREÇÃO — devolva a lista COMPLETA (o que já estava certo + o que faltou):
${fixNote}` : ''}`,
    };
  },
  review(result: DiagnosisResult, symptoms: string) {
    const anamnesis = fold(symptoms);
    const blob = examBlob(result);
    const issues: string[] = [];
    if ((result.suggestedExams || []).length === 0) {
      issues.push('Nenhum exame sugerido. Liste ao menos os que confirmam ou afastam a hipótese principal.');
    }
    // Genérico: o que o tutor já pediu não pode sumir da lista.
    for (const [label, inAnamnesis, inList] of ORDERED) {
      if (inAnamnesis.test(anamnesis) && !inList.test(blob)) {
        issues.push(`A anamnese já pediu ${label} e a lista não trouxe. Inclua com "já solicitada" e o que procurar.`);
      }
    }
    return issues;
  },
  assert() {},
};
