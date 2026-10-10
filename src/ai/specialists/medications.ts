import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { DiagnosisResult, Specialist } from '../types';

export const medicationsSpecialist: Specialist = {
  id: 'medications',
  label: 'Medicamentos',
  detail: 'Prescrição da conduta',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote, draft, fixNote }) {
    const kg = patient.weight;
    return {
      systemInstruction: `Você escreve o RECEITUÁRIO que o tutor leva para casa. Não reabra diagnóstico, não reescreva treatment, não sugira exame.
A dose sai da FATIA DO BRETAS (campo CAN/FEL) cruzada com Vetsmart/AlfaVet. Sem fatia, não chute mg/kg.
Consulte:
${listSources(['BRETAS_VIANA', 'VETSMART', 'ALFAVET'])}

PESO DESTE PACIENTE: ${kg} kg. Toda conta usa esse número.

Formato de cada item:
- name: "Princípio (Marca + apresentação + concentração)"
- dosage: "Dose terapêutica de X mg/kg. ${kg} kg × X = Y mg. Administrar [gotas/mL/fração] (Y mg). [Como dar]."
- frequency: "A cada N horas (SID/BID/TID)" — SOS se condicional
- duration: prazo
- forDiagnosis: um objetivo (dor abdominal ≠ gases ≠ gastroproteção ≠ êmese SOS)

Contas-padrão (aplique em ${kg} kg, não copie o exemplo):
- Dipirona gotas 500 mg/mL: 25 mg/kg q 8 h VO. 1 gota = 25 mg. Gotas = ${kg}.
- Amoxicilina+clavulanato (Synulox): 12,5–25 mg/kg q 12 h VO. Em ${kg} kg use ~20 mg/kg e a apresentação que fecha (ex.: 250 mg se o total for ~250 mg).
- Tramadol (Cronidor): 2–5 mg/kg q 8 h VO. Escolha o comprimido que fecha este peso.
- Maropitant (Cerenia 10 mg/mL): 1 mg/kg SC. mL = ${kg} / 10. Só se vômito agora, febre sistêmica ou pré-cirurgia.
- Omeprazol 10 mg: 1 mg/kg q 24 h VO. Total = ${kg} mg. Fração do comprimido de 10 mg.
- Ondansetrona Vonau 5 mg/mL: 0,5 mg/kg VO SOS se a êmese JÁ PAROU e o caso é leve.
- Simeticona 75 mg/mL: 5 gotas VO só se o quadro for gás/gastrite, não útero.

Regras:
- Leia anamnese + diagnóstico. O objetivo "infecção" é ANTIBIÓTICO, não prostaglandina.
- Piometra / secreção vulvar / infecção uterina: amoxicilina+clavulanato (Synulox) é obrigatório, 10–14 dias. Sem Unasyn. Dinoprost/Lutalyse NÃO substitui o antibiótico e não entra se o caminho é estabilizar + cirurgia.
- Vômito AINDA presente, febre alta ou pré-OVH: Maropitant 1 mg/kg SC (Cerenia). Êmese que já parou em gastrite leve: ondansetrona SOS. Sem os dois.
- Dor + febre em piometra: Dipirona (febre/dor) E Tramadol oral (visceral). São dois objetivos. Sem Butorfanol/Torbugesic.
- Gastrite leve, estável, êmese cessou: receituário de casa (dipirona, omeprazol, simeticona, ondansetrona SOS). Sem Cerenia, sem antibiótico, sem tramadol.
- Simeticona só em gás/cólica de gastrite. Abdome rígido de piometra NÃO pede simeticona.
- Conduta só nutricional: medications []. Sem TCM, ômega, estatina, hepatoprotetor.
- Um por objetivo. Sem dois antibióticos. Sem dois soros.

Responda APENAS JSON com: medications, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

DIAGNÓSTICO
${JSON.stringify({ diagnosis: draft.diagnosis })}

TREATMENT — use os OBJETIVOS, não copie injetável.
${draft.treatment}

Conta obrigatória com ${kg} kg. dosage mostra mg/kg × peso = mg = apresentação. Sem treatment novo, sem exames.${fixNote ? `

LISTA ANTERIOR
${JSON.stringify(draft.medications)}

CORREÇÃO — a lista acima falhou. Devolva a lista COMPLETA já corrigida (o que estava certo + o que faltou), com a conta deste peso:
${fixNote}` : ''}`,
    };
  },
  review(result: DiagnosisResult, symptoms: string) {
    const clinical = `${symptoms} ${result.diagnosis} ${result.treatment}`;
    const meds = result.medications.map((item) => `${item.name} ${item.dosage}`).join(' ');
    const treatment = result.treatment || '';
    const pyometra = /piometra|secre[cç][aã]o vulvar|descarga vulvar|infec[cç][aã]o uterina/i.test(clinical);
    const gastritis = /gastrite|irritação gástrica|irritacao gastrica/i.test(clinical) && !pyometra;
    const needsList = /ringer|soro|fluido|mg|ml|antibiot|analges|antiemet|dipiron|omeprazol|simeticon|comprimido|dose|mg\/kg/i.test(treatment)
      || /gastrite|abdome r[ií]gido|abdomen r[ií]gido|piometra/i.test(clinical);
    const issues: string[] = [];
    if (result.medications.length === 0 && (needsList || !treatment)) {
      issues.push('A lista veio vazia e este caso pede prescrição.');
    }
    if (pyometra && !/amoxicil|clavulan|synulox/i.test(meds)) {
      issues.push('Piometra/infecção uterina SEM antibiótico. Inclua amoxicilina+clavulanato (Synulox) 12,5–25 mg/kg q 12 h, 10–14 dias. Dinoprost não substitui.');
    }
    if (pyometra && /dinoprost|lutalyse|prostagland/i.test(meds) && !/amoxicil|clavulan|synulox/i.test(meds)) {
      issues.push('Tire o dinoprost como “tratamento da infecção”. O item obrigatório é o antibiótico.');
    }
    if (pyometra && !/dipiron/i.test(meds)) {
      issues.push('Piometra com dor/febre sem dipirona. Inclua 25 mg/kg, 1 gota/kg, q 8 h.');
    }
    if (pyometra && !/tramadol|cronidor/i.test(meds)) {
      issues.push('Piometra: inclua tramadol oral (Cronidor) para dor visceral, além da dipirona.');
    }
    if (pyometra && /vomit|eme[sz]e/i.test(clinical) && !/parou|cessou/i.test(symptoms) && !/maropitant|cerenia/i.test(meds)) {
      issues.push('Vômito ainda presente na piometra: inclua maropitant 1 mg/kg SC (Cerenia), não só ondansetrona SOS.');
    }
    if (gastritis && !/omeprazol/i.test(meds)) {
      issues.push('Gastrite sem omeprazol (Gaviz). Inclua com 1 mg/kg × peso, jejum 30 min.');
    }
    if (gastritis && /abdome r[ií]gido|abdomen r[ií]gido|rigidez abdominal/i.test(clinical) && !/dipiron/i.test(meds)) {
      issues.push('Abdome rígido sem dipirona gotas. Inclua 25 mg/kg, 1 gota = 25 mg.');
    }
    if (gastritis && /abdome r[ií]gido|abdomen r[ií]gido|c[oó]lica/i.test(clinical) && !/simeticon/i.test(meds)) {
      issues.push('Abdome rígido de gastrite sem simeticona. Inclua 5 gotas VO, não 0,5 mL.');
    }
    return issues;
  },
  assert() {},
};
