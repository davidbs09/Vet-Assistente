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
- Conta de dose: mg totais = (mg/kg da fonte) × ${patient.weight}. Não arredonde para cima se passar do teto do livro.
Sintomas e anamnese: ${symptoms}
Exames anexados: ${examsNote}

Use o sexo como filtro anatômico: macho não tem útero, ovário, piometra nem gestação; fêmea não tem próstata.
O que a anamnese afirma conta. O que ela NÃO afirma não existe no laudo: não invente vacina, dieta, viagem, gestação, exame ou sinal.
${/vacin/i.test(symptoms)
    ? 'A anamnese citou vacina. Se estiver em dia, não eleve parvovirose, cinomose nem hepatite infecciosa a principal.'
    : 'A anamnese NÃO citou vacina. Proibido escrever "vacinação em dia", "histórico vacinal" ou usar isso para excluir infecção.'}`;
}
