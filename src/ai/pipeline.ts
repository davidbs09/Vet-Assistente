import { auditReport } from './audit';
import { requestStep } from './client';
import { buildKnowledgeQuery } from './knowledgeQuery';
import { emptyResult, mergeResult } from './normalize';
import { diagnosisSpecialist } from './specialists/diagnosis';
import { documentsSpecialist } from './specialists/documents';
import { examsSpecialist } from './specialists/exams';
import { medicationsSpecialist } from './specialists/medications';
import { treatmentSpecialist } from './specialists/treatment';
import { validatorSpecialist } from './specialists/validator';
import type { AdviceStep, DiagnosisResult, PatientContext, PipelineProgress, Specialist } from './types';

export const SPECIALISTS: Specialist[] = [
  diagnosisSpecialist,
  treatmentSpecialist,
  medicationsSpecialist,
  examsSpecialist,
  validatorSpecialist,
];

export function specialistsFor(hasExams: boolean): Specialist[] {
  return hasExams ? [documentsSpecialist, ...SPECIALISTS] : SPECIALISTS;
}

function toPipelineStep(specialist: Specialist) {
  return {
    id: specialist.id,
    label: specialist.label,
    detail: specialist.detail,
  };
}

export const PIPELINE_STEPS = SPECIALISTS.map(toPipelineStep);

export function pipelineStepsFor(hasExams: boolean) {
  return specialistsFor(hasExams).map(toPipelineStep);
}

export async function generateClinicalReport(
  patient: PatientContext,
  symptoms: string,
  exams?: { data: string; mimeType: string }[],
  onProgress?: (progress: PipelineProgress) => void,
): Promise<DiagnosisResult> {
  const examPayload = (exams || []).map((exam) => ({
    data: exam.data,
    mimeType: exam.mimeType,
  }));
  const hasExams = examPayload.length > 0;
  const queue = specialistsFor(hasExams);
  let examsNote = hasExams
    ? `${examPayload.length} exame(s) anexado(s). A leitura abaixo substitui o arquivo.`
    : 'Nenhum exame complementar anexado.';

  let draft = emptyResult();

  const runSpecialist = async (specialist: Specialist, fixNote?: string) => {
    onProgress?.({
      step: specialist.id,
      index: queue.indexOf(specialist),
      total: queue.length,
      label: specialist.label,
    });
    const prompts = specialist.buildPrompts({
      patient,
      symptoms,
      examsNote,
      draft,
      fixNote,
    });
    const partial = await requestStep(
      specialist.id,
      prompts,
      specialist.attachExams ? examPayload : [],
      buildKnowledgeQuery(specialist.id, patient, symptoms, draft),
    );
    draft = mergeResult(draft, partial);
    if (specialist.id === 'documents' && draft.examFindings) {
      examsNote = draft.examFindings;
    }
  };

  // 1ª passada: cada especialista roda e revê o próprio trabalho (teto de tentativas).
  const MAX_FIXES = 2;
  for (const specialist of queue) {
    await runSpecialist(specialist);
    for (let attempt = 0; attempt < MAX_FIXES; attempt++) {
      const issues = specialist.review?.(draft, symptoms) || [];
      if (!issues.length) break;
      await runSpecialist(specialist, issues.join('\n'));
    }
    specialist.assert(draft);
  }

  // Roteamento do chefe: o validador NÃO conserta sozinho. Ele detecta o problema,
  // atribui ao especialista que o deixou passar e devolve com "faltou isso".
  // O especialista refaz com o que já tinha + a correção.
  const byId = new Map(queue.map((specialist) => [specialist.id, specialist]));
  const MAX_ROUNDS = 2;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const issues = auditReport(symptoms, draft).filter(
      (issue) => issue.target !== 'validate' && byId.has(issue.target),
    );
    if (!issues.length) break;

    const notesByTarget = new Map<AdviceStep, string[]>();
    for (const { target, note } of issues) {
      const notes = notesByTarget.get(target) || [];
      notes.push(note);
      notesByTarget.set(target, notes);
    }

    // Reencaminha na ordem da fila, do especialista mais a montante ao mais a jusante.
    for (const specialist of queue) {
      const notes = notesByTarget.get(specialist.id);
      if (!notes?.length) continue;
      const fixNote = `O CHEFE revisou e apontou o que ficou errado/faltou:\n- ${notes.join('\n- ')}\n\nVocê JÁ tem o que produziu. Devolva a versão completa já corrigida (o que estava certo + o que faltou).`;
      await runSpecialist(specialist, fixNote);
      specialist.assert(draft);
    }
  }

  return draft;
}
