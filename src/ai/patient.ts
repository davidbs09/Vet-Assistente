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

export type TemperatureBand = 'hypothermia' | 'normal' | 'fever';

export function readTemperatures(text: string): number[] {
  const found: number[] = [];
  const patterns = [
    /(\d{2}(?:[.,]\d+)?)\s*(?:°|º)?\s*(?:c\b|graus?\b)/gi,
    /temperatura(?:\s+de|\s+a)?\s+(\d{2}(?:[.,]\d+)?)/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const value = parseFloat(match[1].replace(',', '.'));
      if (value >= 32 && value <= 45 && !found.some((item) => Math.abs(item - value) < 0.05)) {
        found.push(value);
      }
    }
  }
  return found;
}

export function temperatureBand(celsius: number): TemperatureBand {
  if (celsius < 37.5) return 'hypothermia';
  if (celsius > 39) return 'fever';
  return 'normal';
}

function formatCelsius(value: number): string {
  return String(value).replace('.', ',');
}

export function temperatureFacts(text: string): string {
  const temps = readTemperatures(text);
  if (!temps.length) return '';
  const lines = temps.map((value) => {
    const band = temperatureBand(value);
    if (band === 'normal') return `${formatCelsius(value)} °C = normal (37,5 a 39). Não é febre.`;
    if (band === 'fever') return `${formatCelsius(value)} °C = acima de 39 (febre). Quanto mais acima de 39, mais grave.`;
    return `${formatCelsius(value)} °C = abaixo de 37,5 (hipotermia). Quanto mais abaixo de 37,5, mais grave.`;
  });
  return lines.join(' ');
}

const TEMPERATURE_RULE = `TEMPERATURA (cão e gato):
- 37,5 °C a 39 °C, inclusive: parâmetro normal. Não chame de febre e não trate como hipertermia.
- Abaixo de 37,5 °C: hipotermia. Quanto mais distante de 37,5 para baixo, mais grave.
- Acima de 39 °C: febre. Quanto mais distante de 39 para cima, mais grave.
Não invente temperatura que a anamnese não mediu.`;

export function patientBlock(patient: PatientContext, symptoms: string, examsNote: string): string {
  const reading = temperatureFacts(symptoms);
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
${TEMPERATURE_RULE}${reading ? `\nLeitura desta anamnese: ${reading}` : ''}

Idade e castração acima vêm do CADASTRO e são fatos válidos do paciente: use-os sempre, mesmo que a anamnese não os repita (não são invenção). Pese a idade nas hipóteses e nas doses (filhote/idoso mudam diferencial e ajuste); use a castração como filtro clínico (animal castrado não engravida; fêmea castrada, em geral sem útero, afasta piometra/gestação).
Use o sexo como filtro anatômico: macho não tem útero, ovário, piometra nem gestação; fêmea não tem próstata.
O que a anamnese afirma conta. O que ela NÃO afirma não existe no laudo (além da idade/castração do cadastro, que são válidas): não invente vacina, dieta, viagem, gestação, exame ou sinal.
Não cite livro, autor, editora nem página no texto. Consultamos; não falamos a fonte.
${/vacin/i.test(symptoms)
    ? 'A anamnese citou vacina. Se estiver em dia, não eleve parvovirose, cinomose nem hepatite infecciosa a principal.'
    : 'A anamnese NÃO citou vacina. Proibido escrever "vacinação em dia", "histórico vacinal" ou usar isso para excluir infecção.'}`;
}
