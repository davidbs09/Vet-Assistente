import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { DiagnosisResult, Specialist } from '../types';

function examBlob(result: DiagnosisResult): string {
  return (result.suggestedExams || []).join(' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function isAbdominalGi(text: string): boolean {
  return /abdome|abdomen|gastrite|pancreat|eme[sz]e|vomit|corpo estranho|colica/.test(
    text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(),
  );
}

export const examsSpecialist: Specialist = {
  id: 'exams',
  label: 'Exames',
  detail: 'Exames para esclarecer',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote, draft, fixNote }) {
    return {
      systemInstruction: `Você só indica exames. Recebeu diagnóstico, tratamento e medicação. Não prescreva fármaco.
Consulte:
${listSources(['NELSON_COUTO', 'JERICO', 'MERCK_VET', 'CRIVELLENTI'])}

Formato de cada item — copie a estrutura, não o caso:
"Nome do exame (para [o que este exame responde neste paciente])."
Se a anamnese já pediu esse exame: "Nome do exame (já solicitada — [o que procurar])."

Exemplo de tom (outro caso abdominal, só o ritmo):
"Hemograma completo (para avaliar leucocitose/infecção, desvio à esquerda ou desidratação)"
"Bioquímica sérica completa (ALT, FA, ureia, creatinina, proteínas totais e frações)"
"Lipase pancreática específica canina (cPLI) — essencial para confirmar ou descartar pancreatite aguda"
"Ultrassonografia abdominal (já solicitada — estômago, alças, pâncreas e corpo estranho)"
"Radiografia abdominal (já solicitada — padrão de gases, obstrução ou corpo estranho radiopaco)"

Regras:
- Junte o útil: nome + o que responde. Sem parágrafo de tratado. Sem citar livro em todo item.
- Inclua o que a anamnese já pediu (hemograma, perfil, US, raio-x) e diga "já solicitada" + o que olhar.
- Abdome rígido / gastrite / êmese: hemograma, bioquímica completa (nomeie ALT, FA, ureia, creatinina, proteínas e frações), cPLI, US e raio-x. Não pule o cPLI nem o raio-x se o quadro for abdominal.
- Só exames deste paciente. Sem painel genérico de check-up se o caso não pede.

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
    const clinical = `${symptoms} ${result.diagnosis}`;
    if (!isAbdominalGi(clinical)) return [];
    const blob = examBlob(result);
    const issues: string[] = [];
    if (!/hemograma/.test(blob)) {
      issues.push('Faltou hemograma completo (leucocitose, desvio à esquerda, desidratação).');
    }
    if (!/bioquim|ureia|creatin/.test(blob)) {
      issues.push('Faltou bioquímica sérica completa (ALT, FA, ureia, creatinina, proteínas e frações).');
    }
    if (!/cpli|lipase pancreat/.test(blob)) {
      issues.push('Faltou cPLI (lipase pancreática específica) para confirmar ou afastar pancreatite.');
    }
    if (!/ultrassom|ultrasson/.test(blob)) {
      issues.push('Faltou ultrassonografia abdominal (estômago, alças, pâncreas, corpo estranho).');
    }
    if (/raio-?x|radiograf/i.test(symptoms) && !/raio-?x|radiograf/.test(blob)) {
      issues.push('A anamnese já pediu raio-x. Inclua com "já solicitada" (gases, obstrução, corpo radiopaco).');
    }
    if (/ultrassom|us de abdomen/i.test(symptoms) && !/j[aá] solicit/.test(blob) && /ultrassom|ultrasson/.test(blob)) {
      issues.push('Marque a ultrassonografia como já solicitada e diga o que procurar.');
    }
    return issues;
  },
  assert() {},
};
