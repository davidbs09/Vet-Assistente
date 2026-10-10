import { patientBlock } from '../patient';
import type { DiagnosisResult, Specialist } from '../types';

export const documentsSpecialist: Specialist = {
  id: 'documents',
  label: 'Documentos',
  detail: 'Leitura dos anexos',
  attachExams: true,
  buildPrompts({ patient, symptoms, examsNote }) {
    return {
      systemInstruction: `Você só lê os documentos anexados. Não diagnostique doença, não prescreva, não sugira exame.

Regras:
- examFindings: transcrição profissional do que o arquivo mostra.
- Tipo de exame e, para cada analito alterado: valor, unidade, referência e MAGNITUDE (dentro / leve / moderado / acentuado) pela distância da faixa — 1–10% acima é leve, não "significativo".
- ALP 156 com ref até 150 é elevação LEVE. Colesterol 509 com ref até 270 é acentuado. Não inflar.
- Liste também o que está DENTRO da referência (para o próximo não inventar falência hepática/renal).
- Albumina no teto ou 0,1 acima: hiperalbuminemia leve, compatível com hemoconcentração/desidratação subclínica — não feche doença.
- O que estiver ilegível, diga ilegível. Sem hipótese de hipotireoidismo, Cushing ou mucocele.

Responda APENAS JSON com: examFindings.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

Transcreva valor, referência e magnitude. Não feche doença.`,
    };
  },
  assert(result: DiagnosisResult) {
    if (!result.examFindings) {
      throw new Error('O agente de documentos não devolveu a leitura dos anexos. Gere novamente.');
    }
  },
};
