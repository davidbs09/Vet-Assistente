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
- dosage: "Dose terapêutica de X mg/kg (Bretas CAN). ${kg} kg × X = Y mg. Administrar [gotas/mL/fração] (Y mg). [Como dar]."
- frequency: "A cada N horas (SID/BID/TID)" — SOS se condicional
- duration: prazo
- forDiagnosis: um objetivo (dor abdominal ≠ gases ≠ gastroproteção ≠ êmese SOS)

Contas-padrão (aplique em ${kg} kg, não copie o exemplo):
- Dipirona gotas 500 mg/mL: CAN até 25 mg/kg q 8 h VO. Use 25 mg/kg. 1 gota = 25 mg. Gotas = (${kg} × 25) / 25 = ${kg} gotas.
- Omeprazol 10 mg (Gaviz V): CAN 0,7–1,5 mg/kg q 24 h VO. Use 1 mg/kg. Total = ${kg} mg. Comprimidos = ${kg} / 10 (pode ser 1/2). Não dê 1 comprimido de 10 mg se o total for menor que 10 mg.
- Ondansetrona em CASA: Vonau Vet 5 mg/mL VO 0,5 mg/kg (Vetsmart/AlfaVet). Total = ${kg} × 0,5 mg. mL = total / 5. NÃO use a dose EV do Bretas (0,1–0,22) nem comprimido de 4 mg que não fecha esta conta.
- Simeticona 75 mg/mL: não está no Bretas. Empírico: 5 gotas VO, não invente 0,5 mL.

Regras:
- Leia anamnese + diagnóstico + objetivos. Primeira linha AMBULATORIAL. Sem Cerenia injetável, Butorfanol/Torbugesic ou soro, salvo internado/choque/êmese incoercível agora.
- Abdome rígido / cólica: Dipirona (dor) E Simeticona (gases). São dois objetivos. Sem opioide.
- Gastrite / irritação gástrica: Omeprazol (Gaviz) é obrigatório, em jejum 30 min.
- Êmese que já parou: Ondansetrona SOS (Vonau 5 mg/mL). Sem Maropitant de rotina.
- Conduta só nutricional: medications []. Sem TCM, ômega, estatina, hepatoprotetor.
- Um por objetivo. Sem Unasyn. Sem dois antieméticos, dois analgésicos ou dois soros.
- Se o treatment pediu opioide e o quadro é leve/moderado em casa: dipirona oral.

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
  review(result: DiagnosisResult, _symptoms: string) {
    const clinical = `${result.diagnosis} ${result.treatment}`;
    const meds = result.medications.map((item) => `${item.name} ${item.dosage}`).join(' ');
    const treatment = result.treatment || '';
    const needsList = /ringer|soro|fluido|mg|ml|antibiot|analges|antiemet|dipiron|omeprazol|simeticon|comprimido|dose|mg\/kg/i.test(treatment)
      || /gastrite|abdome r[ií]gido|abdomen r[ií]gido/i.test(clinical);
    const issues: string[] = [];
    if (result.medications.length === 0 && (needsList || !treatment)) {
      issues.push('A lista veio vazia e este caso pede prescrição.');
    }
    if (/gastrite|irritação gástrica|irritacao gastrica/i.test(clinical) && !/omeprazol/i.test(meds)) {
      issues.push('Gastrite sem omeprazol (Gaviz). Inclua com 1 mg/kg × peso, jejum 30 min.');
    }
    if (/abdome r[ií]gido|abdomen r[ií]gido|rigidez abdominal/i.test(clinical) && !/dipiron/i.test(meds)) {
      issues.push('Abdome rígido sem dipirona gotas. Inclua 25 mg/kg, 1 gota = 25 mg.');
    }
    if (/abdome r[ií]gido|abdomen r[ií]gido|c[oó]lica/i.test(clinical) && !/simeticon/i.test(meds)) {
      issues.push('Abdome rígido sem simeticona. Inclua 5 gotas VO, não 0,5 mL.');
    }
    return issues;
  },
  assert() {},
};
