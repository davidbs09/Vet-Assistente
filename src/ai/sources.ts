import instructions from '../services/instructions.json';

type Source = (typeof instructions.system_instruction.mandatory_sources)[number];

export function listSources(ids?: string[]): string {
  const sources = instructions.system_instruction.mandatory_sources as Source[];
  const filtered = ids ? sources.filter((source) => ids.includes(source.id)) : sources;
  const lines = filtered.map((source, index) => {
    const authors = 'authors' in source && source.authors ? ` — ${source.authors}` : '';
    return `${index + 1}. ${source.title}${authors}`;
  }).join('\n');
  return `${lines}

Consulte só para raciocinar. Por direito autoral, NÃO cite título, autor, editora, página nem "Bretas CAN" / Vetsmart no texto. sources deve ser [].`;
}
