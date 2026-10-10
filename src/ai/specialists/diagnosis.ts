import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { DiagnosisResult, Specialist } from '../types';

export const diagnosisSpecialist: Specialist = {
  id: 'diagnosis',
  label: 'Diagnóstico',
  detail: 'Hipótese principal',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote, draft, fixNote }) {
    return {
      systemInstruction: `Você escreve UM parágrafo de laudo, no máximo dois. Não prescreva, não liste diferenciais, não sugira exame.
Consulte:
${listSources(['NELSON_COUTO', 'JERICO', 'MERCK_VET', 'CRIVELLENTI'])}

Formato obrigatório — copie a estrutura, não o caso:
"[Achado demonstrado] (componentes) acompanhado de [achados leves com magnitude certa] (o que sugerem). O quadro é fortemente sugestivo de [síndrome], que em [espécie/raça] pode ser [causa 1] ou [causa 2], [causa 3] ou [causa 4]."

Exemplo de tom (outro caso, só o ritmo):
"Hiperlipidemia mista (hipercolesterolemia e hipertrigliceridemia) acompanhada de elevação leve de Fosfatase Alcalina e hiperalbuminemia leve (sugestiva de desidratação subclínica). O quadro é fortemente sugestivo de dislipidemia, que em cães da raça Shih Tzu pode ser primária (familiar/genética) ou secundária a endocrinopatias (como hipotireoidismo ou hiperadrenocorticismo), estase biliar (lama/mucocele) ou dieta inadequada."

Proibido:
- Começar com "Leve." / "Moderado." como frase.
- "Achados clinicopatológicos demonstrando", "necessitam de investigação complementar", "alterações metabólicas sistêmicas".
- Fechar hipotireoidismo, Cushing, mucocele ou hepatopatia. Causa vai no "pode ser", nunca como diagnóstico.
- Chamar de leve o que está 1,5× acima (colesterol 509 não é leve) e de moderado o que está 4% acima (FA 156 é leve).
- Vacina, dieta, viagem ou exame que a anamnese não escreveu. Sem "vacinação em dia" se o tutor não falou disso.
- Se a anamnese DISSER vacinas em dia: parvo/cinomose não são o achado principal. Se não disser, ignore vacina.
- Citar Nelson, Jericó, Couto, Bretas ou qualquer livro no laudo.

Responda APENAS JSON com: diagnosis, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

Dois períodos. Achado + magnitude + "sugestivo de" + causas possíveis. Sem prefixo de gravidade. Só o que a anamnese e os exames anexados disseram.${fixNote ? `

LAUDO ANTERIOR
${draft.diagnosis}

CORREÇÃO — reescreva o laudo sem o erro:
${fixNote}` : ''}`,
    };
  },
  review(result: DiagnosisResult, symptoms: string) {
    const issues: string[] = [];
    if (/vacin/i.test(result.diagnosis) && !/vacin/i.test(symptoms)) {
      issues.push('O laudo citou vacina/vacinação em dia e a anamnese não falou disso. Apague essa frase. Não invente histórico.');
    }
    if (/^\s*(leve|moderado|grave|quadro cl[ií]nico leve)\b/i.test(result.diagnosis)) {
      issues.push('Não comece com grau (Leve / Quadro clínico leve). Comece pelo achado.');
    }
    return issues;
  },
  assert(result: DiagnosisResult) {
    if (!result.diagnosis) {
      throw new Error('O veterinário de diagnóstico não devolveu o diagnóstico. Gere novamente.');
    }
  },
};
