import formularyData from './formulary.json';

export type FormularyStatus = 'recomendado' | 'opcional';

export interface FormularyMedication {
  name: string;
  status: FormularyStatus;
  species?: string[];
  route?: string;
  notes?: string;
}

export interface FormularyClass {
  id: string;
  label: string;
  objective: string;
  medications: FormularyMedication[];
}

interface Formulary {
  version: number;
  description: string;
  classes: FormularyClass[];
}

export const FORMULARY = formularyData as Formulary;

/** Há algum medicamento cadastrado no formulário? (Enquanto não houver, o fluxo segue como antes.) */
export function hasFormulary(): boolean {
  return FORMULARY.classes.some((group) => (group.medications?.length ?? 0) > 0);
}

function appliesToSpecies(med: FormularyMedication, species?: string): boolean {
  if (!species || !med.species || med.species.length === 0) return true;
  return med.species.includes(species);
}

/**
 * Formata o formulário para injetar no prompt, só com classes que têm itens
 * aplicáveis à espécie. Recomendados vêm primeiro. Retorna '' quando vazio.
 */
export function formularyBlock(species?: string): string {
  if (!hasFormulary()) return '';

  const blocks: string[] = [];
  for (const group of FORMULARY.classes) {
    const meds = (group.medications || []).filter((med) => appliesToSpecies(med, species));
    if (!meds.length) continue;

    const ordered = [...meds].sort((a, b) => {
      if (a.status === b.status) return 0;
      return a.status === 'recomendado' ? -1 : 1;
    });

    const lines = ordered.map((med) => {
      const tag = med.status === 'recomendado' ? 'RECOMENDADO' : 'opcional';
      const route = med.route ? `, ${med.route}` : '';
      const notes = med.notes ? ` — ${med.notes}` : '';
      return `   • [${tag}] ${med.name}${route}${notes}`;
    });

    blocks.push(`- ${group.label} (${group.objective}):\n${lines.join('\n')}`);
  }

  if (!blocks.length) return '';
  return blocks.join('\n');
}
