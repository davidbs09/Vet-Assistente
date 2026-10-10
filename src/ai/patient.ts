import type { PatientContext } from './types';

export function speciesLabel(species: string): string {
  if (species === 'dog') return 'Cão (canina)';
  if (species === 'cat') return 'Gato (felina)';
  return species;
}

export function sexLabel(sex?: string): string {
  if (sex === 'male') return 'Macho';
  if (sex === 'female') return 'Fêmea';
  return 'Não informado';
}

export function patientBlock(patient: PatientContext, symptoms: string, examsNote: string): string {
  return `PACIENTE
- Espécie: ${speciesLabel(patient.species)}
- Raça: ${patient.breed}
- Sexo: ${sexLabel(patient.sex)}
- Peso: ${patient.weight} kg
Sintomas e anamnese: ${symptoms}
Exames anexados: ${examsNote}

Use o sexo como filtro anatômico: macho não tem útero, ovário, piometra nem gestação; fêmea não tem próstata.
O que a anamnese afirma conta. Se as vacinas estão em dia, não eleve doença imunoprevenível (parvovirose, cinomose, hepatite infecciosa) a principal. Parâmetros normais e quadro de dias pesam contra emergência viral hiperaguda.`;
}
