import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { DiagnosisResult, Specialist } from '../types';

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function validationBrief(draft: DiagnosisResult, symptoms: string, weight: number): string {
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
  const medBlob = fold(draft.medications.map((item) => `${item.name} ${item.dosage} ${item.frequency} ${item.duration} ${item.forDiagnosis || ''}`).join(' '));
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

  const anamnesis = fold(symptoms);
  const diagnosis = fold(draft.diagnosis);
  const vaxInAnamnesis = /vacin/.test(anamnesis);
  const vaxInvented = /vacin/.test(diagnosis) && !vaxInAnamnesis;
  const vaxOn = vaxInAnamnesis && /em dia|atualizad|completo/.test(anamnesis);
  const parvoUp = /parvov/.test(diagnosis);
  const closedEndocrine = /hipotireoid|hiperadreno|cushing|mucocele/.test(fold(draft.diagnosis));
  const confirmed = /tt4|t4 livre|estimulacao|estimulação|ultrassom|us abdominal/.test(fold(`${draft.examFindings || ''} ${symptoms}`));
  const caseBlob = fold(`${symptoms} ${draft.diagnosis} ${draft.treatment}`);
  const hospitalMed = /butorfanol|torbugesic|cerenia|maropitant|solucao injetavel|via subcut/.test(medBlob);
  const admitted = /internad|choque|incoercivel|uti/.test(fold(symptoms));
  const emesisStopped = /eme[sz]e|vomit/.test(fold(symptoms)) && /parou|cessou|nao teve mais|nao vomitou mais/.test(fold(symptoms));
  const standingAntiemetic = /maropitant|cerenia|ondansetron|vonau/.test(medBlob) && !/sos|se recidiv|se voltar|se apresentar|condicional/.test(medBlob);
  const gastritis = /gastrite|irritacao gastrica/.test(caseBlob);
  const rigidAbdomen = /abdome rigido|abdomen rigido|rigidez abdominal|colica/.test(caseBlob);
  const outpatient = !admitted;
  const examList = fold((draft.suggestedExams || []).join(' '));
  const abdominalGi = /abdome|abdomen|gastrite|pancreat|eme[sz]e|vomit|corpo estranho/.test(caseBlob);

  return [
    'CHECAGEM OBRIGATÓRIA DO CHEFE — corrija no JSON, não comente:',
    `- Objetivos na lista: ${objectives.join(' | ') || '(vazia)'}`,
    duplicates.length ? `- DUPLICATA DE OBJETIVO: ${duplicates.join(', ')}. Fique com UM por objetivo.` : '- Objetivos: sem duplicata óbvia.',
    missing.length ? `- TREATMENT pediu e a lista NÃO tem: ${missing.join(', ')}. INCLUA a primeira linha ORAL.` : '- Treatment vs lista: sem buraco óbvio de fluido/êmese/dor/antibiótico.',
    vaxInvented
      ? '- INVENTOU VACINA: o laudo cita vacinação em dia/histórico vacinal e a anamnese NÃO falou disso. APAGUE essa frase. Não exclua infecção por vacina fictícia.'
      : vaxOn && parvoUp
        ? '- ANAMNESE: vacinas em dia e ainda há parvovirose no topo. REBAIXE ou TROQUE.'
        : '- Anamnese vs laudo: só o que o tutor disse. Sem fato inventado.',
    closedEndocrine && !confirmed
      ? '- LAUDO: diagnosis fechou endocrinopatia/mucocele sem TT4/stimulação/US. Volte ao achado (ex.: hiperlipidemia mista) e deixe a etiologia só como "pode ser".'
      : '- Laudo vs evidência: conferir magnitude (leve ≠ significativo).',
    outpatient && hospitalMed
      ? '- RECEITA: injetável de hospital (Cerenia/Butorfanol/Torbugesic) em paciente ambulatorial. TROQUE por oral (dipirona, omeprazol, simeticona, ondansetrona SOS).'
      : '- Via da receita: conferir se é o que o tutor leva para casa.',
    emesisStopped && standingAntiemetic
      ? '- ÊMESE JÁ CESSOU: tire antiemético contínuo. Deixe ondansetrona SOS se recidivar.'
      : '- Antiemético vs anamnese: conferir.',
    gastritis && !/omeprazol|gaviz/.test(medBlob)
      ? '- GASTRITE sem omeprazol. INCLUA (Gaviz, jejum 30 min).'
      : '- Gastroproteção: conferir se o caso pede.',
    rigidAbdomen && !/dipiron/.test(medBlob)
      ? '- ABDOME RÍGIDO sem dipirona oral. INCLUA gotas. Sem opioide.'
      : '- Analgesia ambulatorial: conferir.',
    rigidAbdomen && !/simeticon/.test(medBlob)
      ? '- ABDOME RÍGIDO/cólica sem simeticona. INCLUA 5 gotas (não 0,5 mL).'
      : '- Gases: conferir se o caso pede.',
    `- PESO ${weight} kg. dosage TEM que mostrar: mg/kg × ${weight} = mg totais = gotas/mL/fração.`,
    /omeprazol/.test(medBlob) && /1 comprimido|10 mg total/.test(medBlob) && weight < 8
      ? `- OMEPRAZOL: 1 comprimido de 10 mg em ${weight} kg passa de 1,5 mg/kg (teto Bretas). Vire ${weight} mg = ${weight}/10 do comprimido de 10 mg.`
      : '- Omeprazol vs peso: conferir.',
    /ondansetron|vonau/.test(medBlob) && /comprimido de 4/.test(medBlob)
      ? `- ONDANSETRONA: comprimido de 4 mg não fecha a conta de ${weight} kg. Use Vonau 5 mg/mL: ${weight} × 0,5 mg = ${weight * 0.5} mg = ${(weight * 0.5) / 5} mL SOS.`
      : '- Ondansetrona vs peso: conferir.',
    /simeticon/.test(medBlob) && /0,\s*5 ml|0\.5 ml/.test(medBlob)
      ? '- SIMETICONA: troque mL inventado por 5 gotas VO.'
      : '- Simeticona: 5 gotas se o caso pede.',
    abdominalGi && !/hemograma/.test(examList)
      ? '- EXAMES: faltou hemograma.'
      : '- Hemograma: conferir se o caso pede.',
    abdominalGi && !/bioquim|ureia|creatin/.test(examList)
      ? '- EXAMES: faltou bioquímica (ALT, FA, ureia, creatinina, proteínas e frações).'
      : '- Bioquímica: conferir se o caso pede.',
    abdominalGi && !/cpli|lipase pancreat/.test(examList)
      ? '- EXAMES: faltou cPLI. INCLUA para confirmar ou afastar pancreatite.'
      : '- cPLI: conferir se o quadro abdominal pede.',
    abdominalGi && !/ultrassom|ultrasson/.test(examList)
      ? '- EXAMES: faltou US abdominal.'
      : '- US: conferir.',
    /raio-?x|radiograf/.test(anamnesis) && !/raio-?x|radiograf/.test(examList)
      ? '- EXAMES: a anamnese já pediu raio-x. INCLUA com "já solicitada".'
      : '- Raio-x: se já foi pedido, tem que aparecer na lista.',
  ].join('\n');
}

export const validatorSpecialist: Specialist = {
  id: 'validate',
  label: 'Validação',
  detail: 'Chefe: não deixa brecha',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote, draft, fixNote }) {
    return {
      systemInstruction: `Você é o veterinário CHEFE. Não é revisor de texto: é o clínico que pega o prontuário e CORRIGE antes de assinar. Demore no raciocínio. Achou brecha, ALTERE o campo. Devolver igual quando está errado é falha.

Consulte TODAS as fontes:
${listSources()}

Checklist — execute um a um e corrija:
1. Anamnese na risca. Se o laudo cita vacina, dieta, viagem ou exame que o tutor NÃO disse, APAGUE. Vacinas em dia só valem se a anamnese escreveu isso — aí parvo/cinomose não são o diagnóstico.
2. Sexo: apague hipótese anatomicamente impossível.
3. diagnosis é o que está DEMONSTRADO (achado/síndrome). Etiologia sem TT4/stimulação/US só como "pode ser" no laudo, sem fechar.
4. Magnitude do laboratório: leve não vira "significativa" nem "critérios preenchidos".
5. treatment é a conduta de HOJE (pilar + como fazer + tutor). Sem "plano visa", sem investigar etiologia, sem TT4/US no texto. Sem adjuvante inventado se o pilar é dieta.
6. medications é receituário de CASA: apresentação + mg/kg + conta deste peso. Um por objetivo. Sem Unasyn. Sem Cerenia/Butorfanol injetável se o paciente vai para casa.
7. Cubra os OBJETIVOS (dor, protetor, gases, êmese). Êmese cessou = ondansetrona SOS, não maropitant contínuo. Gastrite = omeprazol. Abdome rígido = dipirona + simeticona. Conduta só nutricional: medications []. Não invente TCM.
8. Dose: Bretas CAN/FEL × peso deste paciente. Mostre a conta. Não arredonde comprimido para cima se passar do teto. Dipirona 25 mg/kg, 1 gota = 25 mg. Omeprazol 1 mg/kg (não 10 mg fixos). Ondansetrona caseira: 0,5 mg/kg no Vonau 5 mg/mL, não a dose EV do Bretas.
9. suggestedExams: nome + o que responde. Abdome/gastrite/êmese: hemograma, bioquímica completa, cPLI, US e raio-x. O que a anamnese já pediu entra com "já solicitada". Sem ensaio de livro em cada item.
10. sources com o tema consultado. Sem inventar página.

Responda APENAS JSON completo já corrigido: diagnosis, treatment, medications, suggestedExams, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

${validationBrief(draft, symptoms, patient.weight)}

RASCUNHO
${JSON.stringify(draft)}

Assine só depois de corrigir. Se houver dois itens com o mesmo objetivo, a resposta ainda está errada.${fixNote ? `

CORREÇÃO — o rascunho ainda tem este erro. ALTERE o campo, não assine igual:
${fixNote}` : ''}`,
    };
  },
  review(result: DiagnosisResult, symptoms: string) {
    const issues: string[] = [];
    if (/vacin/i.test(result.diagnosis) && !/vacin/i.test(symptoms)) {
      issues.push('O laudo ainda cita vacina/vacinação e a anamnese não falou disso. APAGUE essa frase do diagnosis.');
    }
    const clinical = fold(`${symptoms} ${result.diagnosis}`);
    const examList = fold((result.suggestedExams || []).join(' '));
    const abdominalGi = /abdome|abdomen|gastrite|pancreat|eme[sz]e|vomit|corpo estranho/.test(clinical);
    if (abdominalGi && !/cpli|lipase pancreat/.test(examList)) {
      issues.push('suggestedExams ainda sem cPLI. INCLUA lipase pancreática específica para pancreatite.');
    }
    if (/raio-?x|radiograf/.test(fold(symptoms)) && !/raio-?x|radiograf/.test(examList)) {
      issues.push('A anamnese já pediu raio-x. INCLUA em suggestedExams com já solicitada.');
    }
    return issues;
  },
  assert(result: DiagnosisResult) {
    if (!result.diagnosis) {
      throw new Error('O validador esvaziou o diagnóstico. Gere novamente.');
    }
  },
};
