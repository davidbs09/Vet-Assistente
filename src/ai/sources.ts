import instructions from '../services/instructions.json';

type Source = (typeof instructions.system_instruction.mandatory_sources)[number];

export function listSources(ids?: string[]): string {
  const sources = instructions.system_instruction.mandatory_sources as Source[];
  const filtered = ids ? sources.filter((source) => ids.includes(source.id)) : sources;
  return filtered.map((source, index) => {
    const authors = 'authors' in source && source.authors ? ` — ${source.authors}` : '';
    return `${index + 1}. ${source.title}${authors}`;
  }).join('\n');
}
