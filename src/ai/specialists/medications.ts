import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { DiagnosisResult, Specialist } from '../types';

export const medicationsSpecialist: Specialist = {
  id: 'medications',
  label: 'Medicamentos',
  detail: 'Prescrição da conduta',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote, draft }) {
    return {
      systemInstruction: `Você só escreve a LISTA medications. O treatment já veio pronto: transcreva na risca. Não reabra diagnóstico, não reescreva treatment, não sugira exame.
A array medications NÃO pode vir vazia. Sem item, a resposta é inválida.
Consulte:
${listSources(['BRETAS_VIANA', 'SAUNDERS_SHERDING', 'MERCK_VET', 'VETSMART', 'ALFAVET'])}

Regras:
- Cada recurso nomeado no treatment TEM que virar um item: fluido, antibiótico, analgésico, antiemético, protetor, probiótico.
- Se o treatment pede Ringer / fluidoterapia, o item TEM que estar na lista. Se pede dor, êmese, antibiótico ou protetor, o fármaco TEM que estar.
- Sem teto de 3. Sem um fármaco por hipótese. Um por objetivo. Sem Unasyn/Ampicilina. Sem dois soros.
- Cada item: name, dosage (dose prática pelo peso), frequency (SID/BID/TID), duration, forDiagnosis (objetivo da conduta, não o nome da doença).
- Dose vigente no Brasil (Vetsmart/AlfaVet, cruzar Bretas).
- Se houver fatia do Bretas, do Saunders ou do Elsevier (Moraillon), use as doses/indicações dela e cruze com Vetsmart/AlfaVet.

Responda APENAS JSON com: medications, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

DIAGNÓSTICO
${JSON.stringify({ diagnosis: draft.diagnosis })}

TREATMENT JÁ FEITO — transcreva na lista. Se algo do texto não estiver em medications, a lista está errada.
${draft.treatment}

Escreva a array medications com pelo menos um item. Sem treatment novo, sem exames, sem reabrir o diagnóstico.`,
    };
  },
  assert(result: DiagnosisResult) {
    const treatment = result.treatment || '';
    const needsList = /ringer|soro|fluido|mg|ml|antibiot|analges|antiemet|comprimido|dose|mg\/kg/i.test(treatment);
    if (result.medications.length === 0 && (needsList || !treatment)) {
      throw new Error('O veterinário de medicamentos não devolveu a prescrição. Gere novamente.');
    }
  },
};
