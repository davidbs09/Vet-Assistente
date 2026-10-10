import type { AdviceStep, DiagnosisResult, PatientContext } from './types';

const SYNONYMS: Record<string, string[]> = {
  vomito: ['emese', 'antiemetico'],
  emese: ['vomito', 'antiemetico'],
  nause: ['antiemetico'],
  dor: ['analges', 'antiinflamatorio'],
  febre: ['antiter'],
  diarreia: ['gastrointestinal'],
  prurido: ['antipruriginoso', 'alergia'],
  tosse: ['antitussigeno', 'broncodilatador'],
  convuls: ['anticonvuls', 'epilep'],
  diabetes: ['hipoglicemiante', 'insulina'],
  piometra: ['antibiotico', 'amoxicilina', 'clavulanato'],
  gestacao: ['gestante'],
  desidrat: ['fluido', 'cristaloid'],
  infeccao: ['antibiotico'],
  bacteria: ['antibiotico'],
  fungo: ['antifungico'],
  parasita: ['antiparasit', 'anti-helmint'],
  pulga: ['ectoparasit'],
  carrapato: ['ectoparasit'],
};

function fold(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function buildKnowledgeQuery(
  step: AdviceStep,
  patient: PatientContext,
  symptoms: string,
  draft: DiagnosisResult,
): string {
  const parts = [
    patient.species === 'dog' ? 'cao canina' : '',
    patient.species === 'cat' ? 'gato felina felino' : '',
    patient.breed,
    patient.sex === 'male' ? 'macho' : '',
    patient.sex === 'female' ? 'femea' : '',
    symptoms,
    draft.examFindings || '',
    draft.diagnosis,
    draft.treatment,
    ...draft.medications.map((item) => `${item.name} ${item.forDiagnosis || ''}`),
  ];

  if (step === 'diagnosis') {
    parts.push(symptoms);
  }
  if (step === 'treatment' || step === 'medications' || step === 'validate') {
    parts.push(draft.treatment);
  }
  let query = fold(parts.filter(Boolean).join(' '));
  for (const [token, extras] of Object.entries(SYNONYMS)) {
    if (query.includes(token)) {
      query += ` ${extras.join(' ')}`;
    }
  }
  return query;
}
