import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { DiagnosisResult, Specialist } from '../types';

export const diagnosisSpecialist: Specialist = {
  id: 'diagnosis',
  label: 'Diagnóstico',
  detail: 'Hipótese principal',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote }) {
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
- Vacinas em dia: parvo/cinomose não são o achado principal.

Responda APENAS JSON com: diagnosis, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

Dois períodos. Achado + magnitude + "sugestivo de" + causas possíveis. Sem prefixo de gravidade.`,
    };
  },
  assert(result: DiagnosisResult) {
    if (!result.diagnosis) {
      throw new Error('O veterinário de diagnóstico não devolveu o diagnóstico. Gere novamente.');
    }
  },
};
