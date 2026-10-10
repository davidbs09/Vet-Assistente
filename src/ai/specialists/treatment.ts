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

Regras:
- Abra pelo pilar deste paciente (nutrição, fluido, cirurgia, isolamento — o que for o primeiro passo real).
- Como fazer: prazo, nome comercial ou princípio quando existir, o que cortar.
- Se o laudo trouxe achado associado (desidratação leve, dor, êmese), diga o manejo caseiro ou clínico daquilo.
- Nomeie fármaco/fluido só se este caso precisar. Sem adjuvante inventado (TCM, ômega, estatina, hepatoprotetor) quando o pilar é dieta.
- Paciente estável que vai para casa: jejum e água oral, sem soro parenteral. Dor abdominal leve/moderada: dipirona, não opioide injetável. Gastrite: gastroproteção. Êmese que já parou: antiemético só se recidivar. Abdome rígido/gases: simeticona.
- Reavaliar a conduta pode entrar (quando voltar, jejum para repetir o mesmo exame). Pedir TT4, US, stimulação ou "investigar etiologia" é tarefa do veterinário de exames.
- Tom de clínica, não de tratado. Sem "o plano terapêutico visa", "institui-se", "emprega-se".
- Sem teto. Sem UTI. Citações em colchetes só se usar a fatia. Sem Unasyn. Sem dois soros. Respeite o sexo.

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
