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

export function ageLabel(ageYears?: number): string {
  if (ageYears == null || !Number.isFinite(ageYears) || ageYears < 0) return 'Não informada';
  if (ageYears === 0) return 'Recém-nascido';
  if (ageYears < 1) return `${Math.round(ageYears * 12)} meses`;
  return `${ageYears} ${ageYears === 1 ? 'ano' : 'anos'}`;
}

export function neuteredLabel(neutered?: boolean): string {
  if (neutered === true) return 'Castrado';
  if (neutered === false) return 'Não castrado (inteiro)';
  return 'Não informado';
}

export function patientBlock(patient: PatientContext, symptoms: string, examsNote: string): string {
  return `PACIENTE
- Espécie: ${speciesLabel(patient.species)}
- Raça: ${patient.breed}
- Sexo: ${sexLabel(patient.sex)}
- Idade: ${ageLabel(patient.ageYears)}
- Castração: ${neuteredLabel(patient.neutered)}
- Peso: ${patient.weight} kg
- Conta de dose: mg totais = (mg/kg da fonte) × ${patient.weight}. Não arredonde para cima se passar do teto do livro.
Sintomas e anamnese: ${symptoms}
Exames anexados: ${examsNote}

Idade e castração acima vêm do CADASTRO e são fatos válidos do paciente: use-os sempre, mesmo que a anamnese não os repita (não são invenção). Pese a idade nas hipóteses e nas doses (filhote/idoso mudam diferencial e ajuste); use a castração como filtro clínico (animal castrado não engravida; fêmea castrada, em geral sem útero, afasta piometra/gestação).
Use o sexo como filtro anatômico: macho não tem útero, ovário, piometra nem gestação; fêmea não tem próstata.
O que a anamnese afirma conta. O que ela NÃO afirma não existe no laudo (além da idade/castração do cadastro, que são válidas): não invente vacina, dieta, viagem, gestação, exame ou sinal.
Não cite livro, autor, editora nem página no texto. Consultamos; não falamos a fonte.
${/vacin/i.test(symptoms)
    ? 'A anamnese citou vacina. Se estiver em dia, não eleve parvovirose, cinomose nem hepatite infecciosa a principal.'
    : 'A anamnese NÃO citou vacina. Proibido escrever "vacinação em dia", "histórico vacinal" ou usar isso para excluir infecção.'}`;
}
