import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { DiagnosisResult, Specialist } from '../types';

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function validationBrief(draft: DiagnosisResult, symptoms: string): string {
  const objectives = draft.medications.map((item) => (item.forDiagnosis || item.name || '').trim());
  const foldedObjectives = objectives.map((item) => fold(item));
  const counts = new Map<string, number>();
  for (const item of foldedObjectives) {
    if (!item) continue;
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  const duplicates = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([name, count]) => `${name} (${count}x)`);

  const treatment = fold(draft.treatment);
  const medBlob = fold(draft.medications.map((item) => `${item.name} ${item.forDiagnosis || ''}`).join(' '));
  const missing: string[] = [];
  const pairs: Array<[string, RegExp]> = [
    ['ringer / fluidoterapia', /ringer|fluidoterap|lactato/],
    ['antiemético', /ondansetron|maropitant|metoclopram|antiemet/],
    ['analgésico / dor', /tramadol|dipirona|analges|dor\b/],
    ['antibiótico', /amoxicil|clavulan|antibiot/],
    ['protetor gástrico', /omeprazol|pantoprazol|sucralfat|protetor/],
  ];
  for (const [label, pattern] of pairs) {
    if (pattern.test(treatment) && !pattern.test(medBlob)) {
      missing.push(label);
    }
  }

  const vaxOn = /vacina/.test(fold(symptoms)) && /em dia|atualizad|completo/.test(fold(symptoms));
  const parvoUp = /parvov/.test(fold(draft.diagnosis));
  const closedEndocrine = /hipotireoid|hiperadreno|cushing|mucocele/.test(fold(draft.diagnosis));
  const confirmed = /tt4|t4 livre|estimulacao|estimulação|ultrassom|us abdominal/.test(fold(`${draft.examFindings || ''} ${symptoms}`));

  return [
    'CHECAGEM OBRIGATÓRIA DO CHEFE — corrija no JSON, não comente:',
    `- Objetivos na lista: ${objectives.join(' | ') || '(vazia)'}`,
    duplicates.length ? `- DUPLICATA DE OBJETIVO: ${duplicates.join(', ')}. Fique com UM por objetivo.` : '- Objetivos: sem duplicata óbvia.',
    missing.length ? `- TREATMENT pediu e a lista NÃO tem: ${missing.join(', ')}. INCLUA.` : '- Treatment vs lista: sem buraco óbvio de fluido/êmese/dor/antibiótico.',
    vaxOn && parvoUp ? '- ANAMNESE: vacinas em dia e ainda há parvovirose no topo. REBAIXE ou TROQUE.' : '- Hipótese vs vacina: conferir.',
    closedEndocrine && !confirmed
      ? '- LAUDO: diagnosis fechou endocrinopatia/mucocele sem TT4/stimulação/US. Volte ao achado (ex.: hiperlipidemia mista) e deixe a etiologia só como "pode ser".'
      : '- Laudo vs evidência: conferir magnitude (leve ≠ significativo).',
  ].join('\n');
}

export const validatorSpecialist: Specialist = {
  id: 'validate',
  label: 'Validação',
  detail: 'Chefe: não deixa brecha',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote, draft }) {
    return {
      systemInstruction: `Você é o veterinário CHEFE. Não é revisor de texto: é o clínico que pega o prontuário e CORRIGE antes de assinar. Demore no raciocínio. Achou brecha, ALTERE o campo. Devolver igual quando está errado é falha.

Consulte TODAS as fontes:
${listSources()}

Checklist — execute um a um e corrija:
1. Anamnese na risca. Vacinas em dia: parvovirose/cinomose não podem ser o diagnóstico. Troque o laudo.
2. Sexo: apague hipótese anatomicamente impossível.
3. diagnosis é o que está DEMONSTRADO (achado/síndrome). Etiologia sem TT4/stimulação/US só como "pode ser" no laudo, sem fechar.
4. Magnitude do laboratório: leve não vira "significativa" nem "critérios preenchidos".
5. treatment cobre o ciclo até a recuperação e nomeia cada recurso.
6. medications: UM por objetivo. Dois antieméticos, dois soros, dois analgésicos ou dois antibióticos de espectro sobreposto: APAGUE o redundante e fique com o de primeira linha. Sem Unasyn.
7. Tudo que o treatment nomeou (Ringer, antibiótico, dor, êmese, protetor, probiótico) TEM que estar na lista. Faltou, INCLUA com dose, frequência, duração e forDiagnosis.
8. Dose compatível com peso, espécie e sexo. Se houver fatia do Bretas, confronte CAN/FEL.
9. suggestedExams úteis para confirmar ou afastar o diagnóstico deste paciente.
10. sources com o tema consultado. Sem inventar página.

Responda APENAS JSON completo já corrigido: diagnosis, treatment, medications, suggestedExams, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

${validationBrief(draft, symptoms)}

RASCUNHO
${JSON.stringify(draft)}

Assine só depois de corrigir. Se houver dois itens com o mesmo objetivo, a resposta ainda está errada.`,
    };
  },
  assert(result: DiagnosisResult) {
    if (!result.diagnosis) {
      throw new Error('O validador esvaziou o diagnóstico. Gere novamente.');
    }
  },
};
