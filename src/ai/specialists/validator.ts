import { auditReport, type AuditIssue } from '../audit';
import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { AdviceStep, DiagnosisResult, Specialist } from '../types';

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

const BOOK_NAMES = /nelson|couto|jeric|crivellenti|bretas|viana|saunders|sherding|elsevier|moraillon|merck|vetsmart|alfavet|tratado|papich/;

const OWNER_LABEL: Record<string, string> = {
  diagnosis: 'DIAGNÓSTICO',
  treatment: 'CONDUTA',
  medications: 'MEDICAMENTOS',
  exams: 'EXAMES',
};

// O chefe audita o rascunho e aponta cada brecha ao especialista que a deixou passar.
function validationBrief(draft: DiagnosisResult, symptoms: string): string {
  const issues = auditReport(symptoms, draft);
  if (!issues.length) {
    return 'RELATÓRIO DO CHEFE: nenhuma brecha estrutural detectada. Ainda assim, confira a coerência clínica (objetivo × fármaco × dose × via) antes de assinar.';
  }
  const byTarget = new Map<AdviceStep, AuditIssue[]>();
  for (const issue of issues) {
    const list = byTarget.get(issue.target) || [];
    list.push(issue);
    byTarget.set(issue.target, list);
  }
  const lines = ['RELATÓRIO DO CHEFE — cada problema pertence a um especialista. Corrija o campo correspondente:'];
  for (const [target, list] of byTarget) {
    lines.push(`[${OWNER_LABEL[target] || target.toUpperCase()}]`);
    for (const issue of list) lines.push(`  - ${issue.note}`);
  }
  return lines.join('\n');
}

export const validatorSpecialist: Specialist = {
  id: 'validate',
  label: 'Validação',
  detail: 'Chefe: revisa consulta e corrige',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote, draft, fixNote }) {
    return {
      systemInstruction: `Você é o veterinário CHEFE que assina o prontuário. Não é revisor de texto: é o clínico que reabre o caso, CONSULTA as fontes e CORRIGE antes de assinar. Pode demorar. Devolver um prontuário errado igual é falha grave.

Você tem todas as fontes. USE-AS para conferir cada decisão:
${listSources()}

RACIOCÍNIO OBRIGATÓRIO (serve para qualquer caso — não decore doença):
1. ANAMNESE: releia o que o tutor disse. Liste mentalmente os fatos. O laudo, a conduta e a lista só podem usar ESSES fatos + os exames anexados. Qualquer história inventada (vacina, viagem, trauma, gestação, dieta) que a anamnese não trouxe: APAGUE.
2. SEXO/ESPÉCIE: apague hipótese anatomicamente impossível.
3. DIAGNÓSTICO: é o que está demonstrado (achado/síndrome). Etiologia que exigiria exame ainda não feito fica como possibilidade ("pode ser"), não como diagnóstico fechado. Magnitude fiel (leve ≠ significativo).
4. PROBLEMAS → OBJETIVOS: a partir do diagnóstico, derive os objetivos terapêuticos que o caso EXIGE, consultando as fontes. Princípios que valem sempre:
   - DUAS falhas são inaceitáveis e você tem que caçar ativamente: (a) caso com DOR/FEBRE sem analgésico/antitérmico; (b) caso com sinal de INFECÇÃO/processo bacteriano (secreção purulenta/fétida, pus, abscesso, supuração, sepse, febre com foco, cultura positiva, etiologia bacteriana) SEM antimicrobiano. Processo infeccioso EXIGE antibiótico de primeira linha — hormônio, prostaglandina ou sintomático não substituem. Se faltar, INCLUA.
   - Vômito ativo → antiemético sistêmico; vômito cessado → antiemético SOS. Desidratação/choque → fluido pela via adequada.
   - Condição cirúrgica → registre o encaminhamento cirúrgico.
   Se o diagnóstico exige um objetivo que a conduta OU a lista não cobriu, INCLUA. Se há item sem objetivo real, remova.
5. VIA e CONTEXTO: paciente estável que vai para casa recebe prescrição oral; instável/internado/pré-cirúrgico pode receber injetável. Case a via ao estado descrito.
6. DOSE: para cada fármaco, confirme mg/kg (ou UI/kg) da fonte para a espécie e recalcule pelo peso deste paciente, mostrando a conta e a apresentação. Não arredonde acima do teto.
7. UM fármaco por objetivo. Sem Unasyn, sem dois antibióticos sobrepostos, sem dois soros. Dois analgésicos de classes diferentes são permitidos quando a dor justifica.
8. EXAMES: cada um diz o que confirma/afasta. O que a anamnese já pediu entra marcado como "já solicitada". Complete o que o diagnóstico exige para fechar ou descartar as hipóteses.
9. TEXTO: sem citar livro, autor ou página em nenhum campo. sources = [].

Corrija DE VERDADE: reescreva os campos. Responda APENAS JSON completo e já corrigido: diagnosis, treatment, medications, suggestedExams, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

${validationBrief(draft, symptoms)}

RASCUNHO A VALIDAR
${JSON.stringify(draft)}

Reabra o caso, confronte com as fontes e assine só depois de corrigir cada brecha acima e as que você mesmo encontrar.${fixNote ? `

AINDA PENDENTE — corrija antes de assinar:
${fixNote}` : ''}`,
    };
  },
  review(result: DiagnosisResult, symptoms: string) {
    const issues: string[] = [];
    const diagnosis = fold(result.diagnosis);
    const anamnesis = fold(symptoms);
    if (/vacin/.test(diagnosis) && !/vacin/.test(anamnesis)) {
      issues.push('O laudo ainda cita vacinação e a anamnese não falou disso. APAGUE do diagnosis.');
    }
    const leaked = [result.diagnosis, result.treatment, ...(result.suggestedExams || [])]
      .some((t) => BOOK_NAMES.test(fold(t)));
    if (leaked) {
      issues.push('Ainda há nome de livro/autor no texto. Remova de todos os campos.');
    }
    return issues;
  },
  assert(result: DiagnosisResult) {
    if (!result.diagnosis) {
      throw new Error('O validador esvaziou o diagnóstico. Gere novamente.');
    }
  },
};
