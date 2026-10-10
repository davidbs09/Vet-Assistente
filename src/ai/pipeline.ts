import { requestStep } from './client';
import { buildKnowledgeQuery } from './knowledgeQuery';
import { emptyResult, mergeResult } from './normalize';
import { diagnosisSpecialist } from './specialists/diagnosis';
import { documentsSpecialist } from './specialists/documents';
import { examsSpecialist } from './specialists/exams';
import { medicationsSpecialist } from './specialists/medications';
import { treatmentSpecialist } from './specialists/treatment';
import { validatorSpecialist } from './specialists/validator';
import type { DiagnosisResult, PatientContext, PipelineProgress, Specialist } from './types';

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

  for (const [index, specialist] of queue.entries()) {
    onProgress?.({
      step: specialist.id,
      index,
      total: queue.length,
      label: specialist.label,
    });

    const runStep = async (fixNote?: string) => {
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
    };

    await runStep();
    const issues = specialist.review?.(draft, symptoms) || [];
    if (issues.length) {
      await runStep(issues.join('\n'));
    }
    specialist.assert(draft);
    if (specialist.id === 'documents' && draft.examFindings) {
      examsNote = draft.examFindings;
    }
  }

  return draft;
}
