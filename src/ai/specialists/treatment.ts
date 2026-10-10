import { patientBlock } from '../patient';
import { listSources } from '../sources';
import type { DiagnosisResult, Specialist } from '../types';

export const treatmentSpecialist: Specialist = {
  id: 'treatment',
  label: 'Tratamento',
  detail: 'Conduta até a recuperação',
  attachExams: false,
  buildPrompts({ patient, symptoms, examsNote, draft }) {
    return {
      systemInstruction: `Você só escreve a CONDUTA que começa HOJE. Não feche diagnóstico, não monte medications, não peça exame.
Consulte:
${listSources(['NELSON_COUTO', 'JERICO', 'MERCK_VET', 'CRIVELLENTI'])}

Formato — copie a estrutura, não o caso:
"[Pilar desta conduta]. [Como fazer: prazo, recurso nomeado, o que suspender]. [Manejo do achado associado, se houver]. [O que o tutor faz em casa e quando reavaliar ESTA conduta]."

Exemplo de tom (outro caso, só o ritmo):
"O pilar do tratamento inicial é o manejo nutricional. Recomenda-se a transição gradual (ao longo de 7 dias) para uma dieta terapêutica restrita em gorduras (ex: Royal Canin Gastrointestinal Low Fat ou Hill's Prescription Diet i/d Low Fat). É imperativa a suspensão de qualquer petisco, ração úmida comum ou alimentação humana. Para a leve desidratação (albumina alta), estimular ingestão hídrica: mais potes de água fresca ou água na ração. Repouso relativo só se houver prostração; exercício leve diário ajuda o metabolismo lipídico se o animal estiver bem. Jejum rigoroso de 12 horas antes dos próximos exames de sangue, para evitar lipemia pós-prandial. Repetir o perfil lipídico após estabilizar a dieta."

Como raciocinar (serve para QUALQUER caso, consulte as fontes):
- Abra pelo PILAR real deste paciente (estabilização, nutrição, fluido, cirurgia, isolamento, controle do foco). Decida pelo diagnóstico + estado descrito, não por um molde fixo.
- A partir do diagnóstico, nomeie os OBJETIVOS que o caso exige e como executá-los: processo infeccioso/supurativo precisa de antimicrobiano; dor precisa de analgesia; febre, antitérmico; vômito ativo, antiemese; desidratação/instabilidade, fluido; condição cirúrgica, o encaminhamento.
- Via conforme o estado: paciente estável que vai para casa recebe manejo oral/caseiro; instável/internado/pré-cirúrgico recebe suporte parenteral.
- Nomeie cada recurso (classe ou princípio) que a conduta usa — quem monta a lista vai transcrever esses objetivos. Não invente adjuvante sem indicação (TCM, ômega, estatina, hepatoprotetor).
- Diga o que o tutor faz em casa e quando reavaliar. Pedir exame novo é tarefa do especialista de exames.
- Tom de clínica, não de tratado. Sem "o plano terapêutico visa", "institui-se", "emprega-se". Sem citar livro. Sem Unasyn. Sem dois soros. Respeite o sexo.

Responda APENAS JSON com: treatment, sources.`,
      userPrompt: `${patientBlock(patient, symptoms, examsNote)}

DIAGNÓSTICO JÁ FEITO
${JSON.stringify({
    diagnosis: draft.diagnosis,
    examFindings: draft.examFindings || '',
  })}

Conduta de hoje: pilar + como fazer + manejo associado + tutor. Sem exame novo, sem adjuvante inventado, sem reabrir o diagnóstico.`,
    };
  },
  assert(result: DiagnosisResult) {
    if (!result.treatment) {
      throw new Error('O veterinário de tratamento não devolveu a conduta. Gere novamente.');
    }
  },
};
