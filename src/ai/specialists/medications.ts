import { medicationGaps } from '../audit';
import { formularyBlock } from '../formulary';
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
    const formulary = formularyBlock(patient.species);
    const formularySection = formulary
      ? `

FORMULÁRIO — MEDICAMENTOS MAIS USADOS (CONSULTE AQUI PRIMEIRO, antes das fontes):
${formulary}

CICLO para cada objetivo:
a) Procure a classe correspondente ao objetivo neste FORMULÁRIO. SE existir e tiver opção aplicável à espécie, ESCOLHA um fármaco dele: o [RECOMENDADO] vira o medicamento PRINCIPAL; um [opcional] de substância diferente, quando houver, vira o campo "alternative" desse item.
b) Tendo escolhido (no formulário ou não), vá às fontes buscar a DOSE (mg/kg ou UI/kg), a via e a apresentação desse fármaco.
c) FALLBACK: se o objetivo NÃO tiver classe no formulário, ou a classe não tiver nenhuma opção aplicável a esta espécie/caso, vá DIRETO às fontes e escolha o fármaco de primeira linha normalmente — sem forçar um item do formulário e sem deixar o objetivo descoberto. O formulário é prioridade, não limite: o que importa é tratar o caso corretamente.`
      : '';
    return {
      systemInstruction: `Você é o farmacologista clínico. Escreve a LISTA de medicamentos deste paciente. Não reabra diagnóstico, não reescreva a conduta, não peça exame.

Você TEM as fontes abaixo. CONSULTE antes de prescrever — dose, via, apresentação e contraindicação saem delas, não da sua memória:
${listSources(['BRETAS_VIANA', 'SAUNDERS_SHERDING', 'MERCK_VET', 'VETSMART', 'ALFAVET'])}${formularySection}

COMO RACIOCINAR (serve para QUALQUER caso, não decore doença):
1. Leia o diagnóstico, a conduta E a anamnese. Extraia os OBJETIVOS terapêuticos deste paciente (ex.: combater a infecção, controlar a dor, baixar a febre, conter o vômito, repor fluido, proteger a mucosa). Cada objetivo real vira UM item. Sintoma descrito na anamnese é objetivo mesmo que a conduta não o tenha detalhado: se há DOR ou FEBRE no caso, a lista PRECISA de analgésico/antitérmico (ex.: dipirona), salvo contraindicação. Nunca deixe dor/febre sem cobertura.
2. Para cada objetivo, escolha o fármaco de PRIMEIRA LINHA${formulary ? ' (priorizando o FORMULÁRIO acima)' : ' na fatia'} para esta espécie, com a via que o estado do paciente permite (casa = oral; instável/internado/pré-cirúrgico = injetável).
3. Princípios que valem sempre:
   - Processo infeccioso/bacteriano é como a dor: NÃO pode faltar cobertura. Sinais de infecção (secreção/corrimento purulento ou fétido, pus, abscesso, supuração, sepse, febre com foco, cultura/antibiograma positivo, diagnóstico de origem bacteriana) tornam o antimicrobiano de primeira linha OBRIGATÓRIO. Hormônio, prostaglandina ou sintomático NÃO substituem o antibiótico. Nunca entregue um caso infeccioso sem antibiótico.
   - Dor presente exige analgésico; dor visceral/moderada a intensa pode somar analgésicos de classes diferentes (ex.: anti-inflamatório/dipirona + opioide) — classes diferentes não são duplicata.
   - Vômito ativo agora pede antiemético sistêmico; vômito que já cessou pede antiemético só SOS.
   - Febre alta/desidratação/instabilidade pedem a via e o suporte compatíveis.
   - Não repita o MESMO objetivo com dois fármacos equivalentes. Sem Unasyn. Sem dois antibióticos de espectro sobreposto. Sem dois soros.

DOSE (obrigatório em todo item):
- Pegue mg/kg (ou UI/kg) da fatia para a espécie certa (CAN/FEL).
- Multiplique pelo peso: ${kg} kg. Converta para a apresentação comercial (gotas, mL, fração de comprimido).
- Mostre a conta no campo dosage: "X mg/kg → ${kg} kg = Y → [Z gotas / Z mL / fração]". Não arredonde para cima acima do teto da fonte.
- 1 gota de solução 500 mg/mL = 25 mg (referência de conversão de gotas).

Formato de cada item:
- name: "Princípio (Marca + apresentação + concentração)"
- dosage: a conta acima + como administrar (via, jejum, seringa)
- frequency: "A cada N horas (SID/BID/TID)"; escreva SOS se for condicional
- duration: prazo
- forDiagnosis: o OBJETIVO (ex.: cobertura antimicrobiana, analgesia, antiemese) — nunca o nome da doença

- Se a conduta é puramente de suporte (dieta, água, jejum, repouso) e nenhum objetivo farmacológico existe: medications []. Não invente adjuvante (TCM, ômega, estatina, hepatoprotetor, simeticona sem indicação).
- Não cite livro, autor ou página no texto. sources = [].

Responda APENAS JSON com: medications, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

DIAGNÓSTICO
${JSON.stringify({ diagnosis: draft.diagnosis })}

CONDUTA JÁ DEFINIDA — tire dela os objetivos terapêuticos:
${draft.treatment}

Liste os medicamentos. Um por objetivo, dose calculada para ${kg} kg a partir da fatia. REGRAS QUE NÃO PODEM FALHAR: se há DOR/FEBRE, tem analgésico/antitérmico; se há INFECÇÃO/sinal bacteriano, tem antibiótico de primeira linha. Faltar qualquer um desses pode induzir a erro um veterinário em início de carreira — confira antes de responder.${fixNote ? `

LISTA ANTERIOR
${JSON.stringify(draft.medications)}

CORREÇÃO — a lista acima tem o problema abaixo. Devolva a lista COMPLETA já corrigida (o que estava certo + o que faltou):
${fixNote}` : ''}`,
    };
  },
  review(result: DiagnosisResult, symptoms: string) {
    // Mesmo detector que o chefe usa, para a lista já sair coerente na 1ª passada.
    return medicationGaps(symptoms, result);
  },
  assert() { },
};
