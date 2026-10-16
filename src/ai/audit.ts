import type { AdviceStep, DiagnosisResult } from './types';

export type AuditIssue = { target: AdviceStep; note: string };

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const BOOK_NAMES = /nelson|couto|jeric|crivellenti|bretas|viana|saunders|sherding|elsevier|moraillon|merck|vetsmart|alfavet|tratado|papich/;

function medFold(draft: DiagnosisResult): string {
  return fold(draft.medications.map((m) => `${m.name} ${m.forDiagnosis || ''} ${m.dosage}`).join(' '));
}

function isTopicalCleaning(med: { name: string; dosage?: string; forDiagnosis?: string }): boolean {
  return /clorexid|clorhex|povidon|pvpi|antissept|rifamicin|nitrofurazon|peroxido de hidrogen|agua oxigenad|sulfadiazina de prata|topic|local|lavag|irrigac|dilu/.test(
    fold(`${med.name} ${med.forDiagnosis || ''} ${med.dosage || ''}`),
  );
}

// Lacunas da PRESCRIÇÃO — princípios clínicos gerais (sintoma/achado → objetivo), não mapa de doença.
export function medicationGaps(symptoms: string, draft: DiagnosisResult): string[] {
  const issues: string[] = [];
  const anamnese = fold(symptoms);
  const clinical = fold(`${symptoms} ${draft.diagnosis} ${draft.examFindings || ''} ${draft.treatment}`);
  const treatment = fold(draft.treatment);
  const meds = medFold(draft);
  const hasMeds = draft.medications.length > 0;

  const treatmentImpliesDrugs = /mg|ml|antibiot|antimicrob|analges|antiemet|anti-?inflamat|fluidoterap|ringer|soro|cristaloid|dose|mg\/kg|comprimido|gotas|antiterm|antipiret|clorexid|antissept|lavagem/.test(treatment);
  if (!hasMeds && treatmentImpliesDrugs) {
    issues.push('A conduta nomeia recursos farmacológicos e a lista veio vazia. Transcreva cada objetivo em um item com dose pelo peso.');
  }

  // Dor e febre são OBJETIVOS SEPARADOS. Opioide cobre dor; NÃO cobre febre.
  const pain = /\bdor\b|dolorid|algia|abdome rigido|abdomen rigido|rigidez abdominal|claudica|mialgia|nocicep|sensibilidade a palpac/.test(clinical);
  const temp = /\b(39[.,][5-9]|4[01](?:[.,]\d)?)\s*°?\s*c\b/.test(clinical);
  const fever = /febre|febril|hipertermia|pirexia/.test(clinical) || temp;
  const hasPainMed = /analges|antialg|anti-?inflamat|\baine\b|dipiron|metamizol|novalgina|tramadol|codein|morfin|metadon|butorf|buprenorf|gabapentin|meloxic|carprofen|cetoprofen|firocoxib|robenacox|flunixin/.test(meds);
  const hasAntipyretic = /antipiret|antiterm|dipiron|metamizol|novalgina|anti-?inflamat|\baine\b|meloxic|carprofen|cetoprofen|firocoxib|robenacox|flunixin/.test(meds);
  if (pain && !hasPainMed) {
    issues.push('Paciente com DOR e a lista NÃO tem analgésico. Inclua a primeira linha (ex.: dipirona) com dose pelo peso, salvo contraindicação.');
  }
  if (fever && !hasAntipyretic) {
    issues.push('Paciente com FEBRE e a lista NÃO tem antitérmico. Opioide/analgésico puro (tramadol, metadona, morfina) NÃO baixa febre. Inclua dipirona (ou AINE se indicado) com dose pelo peso — mesmo que já exista analgésico para a dor.');
  }

  // Infecção/sepse/supuração → antimicrobiano (mesma exigência da dor/febre).
  // Sinais clínicos gerais, não lista de doenças. Varre também os achados de exame.
  const infectionText = fold(`${symptoms} ${draft.diagnosis} ${draft.treatment} ${draft.examFindings || ''}`);
  const infection = /infec|supurat|septic|\bsepse\b|\bseptic|purulent|mucopurul|\bpus\b|piogen|piemi|bacteremia|abscesso|empiema|celulit|fleimao|flegmao|\bpio[a-z]|bacterian|antibiograma|cultura positiva|osteomielit|peritonit|secrecao fetid|corrimento fetid/.test(infectionText);
  const hasAntibiotic = /antibiot|antimicrob|amoxicil|clavulan|cefalex|cefalotin|cefazolin|cefovecin|ceftriax|ceforox|enrofloxac|marbofloxac|metronidazol|doxicic|doxiciclin|azitromic|claritromic|sulfa|trimetop|penicilin|ampicil|clindamic|gentamic|amicac|tetracic|florfenicol|cloranfenicol|ciprofloxac|norfloxac|tilosin/.test(meds);
  if (infection && !hasAntibiotic) {
    issues.push('Há sinais de processo infeccioso/bacteriano e a lista NÃO tem antimicrobiano. O antibiótico de primeira linha é OBRIGATÓRIO, com dose calculada pelo peso. Sintomático, hormônio ou prostaglandina NÃO substituem o antibiótico.');
  }

  // Vômito ativo → antiemético sistêmico
  const vomit = /vomit|eme[sz]e/.test(clinical);
  const vomitResolved = /parou|cessou|autolimitad|ja cessou|nao vomitou mais|nao teve mais|isolad/.test(anamnese);
  const hasAntiemetic = /antiemet|ondansetron|vonau|maropitant|cerenia|metoclopram|bromoprid|domperidon/.test(meds);
  if (vomit && !vomitResolved && !hasAntiemetic) {
    issues.push('Vômito ativo e sem antiemético sistêmico na lista. Inclua o antiemético (não apenas SOS).');
  }

  // Limpeza / antissepsia tópica — ferida, abscesso, otite, pele aberta. Não vale para infecção só interna (ITU, pneumonia).
  const needsCleaning = /ferida|lacerac|abscesso|debrid|lavagem|irrigac|antisseps|\botite\b|otolog|\bouvido\b|pioderm|hot.?spot|queimadur|mordedur|fistul|escara|ulcera cutane|ferida cirurg|dreno|banho medicin|cerumin| rasgo | rasgad|limpeza (da|do|de|otolog|auric|da ferida|do ouvido)|secrecao purulent.*(pele|ferida|ouvido|canal)/.test(clinical);
  const hasCleaning = /clorexid|clorhex|povidon|pvpi|antissept|rifamicin|nitrofurazon|peroxido de hidrogen|agua oxigenad|sulfadiazina de prata|ceruminol|(solucao|soro) fisiolog.*(ferida|lavag|topic|local|ouvido|irrig)|nacl 0[.,]?9.*(ferida|lavag|topic|ouvido)|cloreto de sodio 0[.,]?9.*(ferida|lavag|topic|ouvido)|uso (topic|local)|diluicao 0[.,]?0/.test(meds);
  if (needsCleaning && !hasCleaning) {
    issues.push('O caso pede LIMPEZA/antissepsia (ferida, abscesso, otite, pele aberta ou a conduta já falou em lavar) e a lista NÃO nomeia o que usar. Inclua o produto (clorexidina diluída e/ou solução fisiológica para lavagem) com concentração/diluição e o sítio de aplicação. Fluido IV não substitui limpeza tópica.');
  }

  // Classe citada na CONDUTA ausente da lista (lê as palavras da própria conduta)
  const classes: Array<[string, RegExp]> = [
    ['antimicrobiano', /antibiotic|antimicrob/],
    ['analgésico', /analges|antialg/],
    ['antitérmico', /antiterm|antipiret/],
    ['antiemético', /antiemet|antivomit/],
    ['fluidoterapia', /fluidoterap|cristaloid|ringer/],
    ['protetor gástrico', /gastroprote|protetor gastric/],
    ['limpeza/antissepsia', /antissept|clorexid|lavagem|limpeza/],
  ];
  for (const [label, pattern] of classes) {
    if (pattern.test(treatment) && !pattern.test(meds)) {
      issues.push(`A conduta indicou ${label} e a lista não tem. Inclua o fármaco de primeira linha com dose.`);
    }
  }

  // Dose: sistêmico precisa da conta pelo peso; tópico/limpeza precisa de concentração/diluição.
  for (const med of draft.medications) {
    const dose = fold(med.dosage || '');
    if (isTopicalCleaning(med)) {
      if (!/%|dilu|ml|gota|topic|local|lavag|aplic|concent/.test(dose)) {
        issues.push(`O item de limpeza "${med.name}" não diz concentração/diluição nem como aplicar no sítio. Informe (ex.: clorexidina 0,05% na ferida; SF 0,9% para lavagem).`);
      }
      continue;
    }
    if (!/kg|\bgota|\bml\b|comprimid|\bui\b/.test(dose)) {
      issues.push(`O item "${med.name}" não mostra a dose calculada pelo peso (mg/kg → total → apresentação). Refaça a conta.`);
    }
  }

  if (BOOK_NAMES.test(meds)) {
    issues.push('Há nome de livro/autor na prescrição. Remova — consultamos, não citamos.');
  }
  return issues;
}

// Relatório completo do chefe: cada problema etiquetado com o especialista dono.
export function auditReport(symptoms: string, draft: DiagnosisResult): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const anamnese = fold(symptoms);
  const diagnosis = fold(draft.diagnosis);

  for (const note of medicationGaps(symptoms, draft)) {
    issues.push({ target: 'medications', note });
  }

  // Diagnóstico: fato inventado + citação
  const facts: Array<[string, RegExp]> = [
    ['vacinação', /vacin/],
    ['viagem', /viagem|viajou/],
    ['trauma/atropelamento', /atropel|trauma/],
    ['gestação', /gestante|prenhez|gesta[cç]/],
  ];
  for (const [label, pattern] of facts) {
    if (pattern.test(diagnosis) && !pattern.test(anamnese)) {
      issues.push({ target: 'diagnosis', note: `O laudo cita ${label}, que a anamnese não trouxe. Reescreva sem esse fato inventado.` });
    }
  }
  if (BOOK_NAMES.test(diagnosis)) {
    issues.push({ target: 'diagnosis', note: 'Há nome de livro/autor no laudo. Remova.' });
  }

  // Exames: pedidos na anamnese que sumiram + lista vazia + citação
  const examList = fold((draft.suggestedExams || []).join(' '));
  if ((draft.suggestedExams || []).length === 0) {
    issues.push({ target: 'exams', note: 'Nenhum exame sugerido. Liste ao menos os que confirmam ou afastam a hipótese principal.' });
  }
  const ordered: Array<[string, RegExp, RegExp]> = [
    ['raio-x / radiografia', /raio-?x|radiograf/, /raio-?x|radiograf/],
    ['ultrassonografia', /ultrassom|ultrasson|\bus\b|us de/, /ultrassom|ultrasson/],
    ['hemograma', /hemograma/, /hemograma/],
    ['perfil / bioquímica', /perfil|bioquim/, /perfil|bioquim/],
  ];
  for (const [label, inAnamnese, inList] of ordered) {
    if (inAnamnese.test(anamnese) && !inList.test(examList)) {
      issues.push({ target: 'exams', note: `A anamnese já pediu ${label} e a lista não trouxe. Inclua com "já solicitada".` });
    }
  }
  if (BOOK_NAMES.test(examList)) {
    issues.push({ target: 'exams', note: 'Há nome de livro/autor nos exames. Remova.' });
  }

  // Conduta: citação
  if (BOOK_NAMES.test(fold(draft.treatment))) {
    issues.push({ target: 'treatment', note: 'Há nome de livro/autor na conduta. Remova.' });
  }

  return issues;
}
