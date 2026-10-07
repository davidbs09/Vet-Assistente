import { useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';

const TERMS_UNLOCK_SECONDS = 5;

const ACCESS_TERMS_TITLE = 'Antes de solicitar acesso, leia com atenção';
const ACCESS_TERMS_SUBTITLE = 'É obrigatório estar de acordo com estes termos para usar o Vet Assistente.';
const ACCESS_TERMS_TEXT = [
  'Atenção: as informações geradas por este sistema são exclusivamente de apoio à decisão clínica. Elas não substituem exame físico, anamnese, interpretação profissional nem o julgamento do Médico-Veterinário responsável pelo paciente.',
  'O diagnóstico, a conduta terapêutica, a prescrição, o cálculo de doses e qualquer decisão clínica devem ser realizados, conferidos e assumidos exclusivamente pelo profissional habilitado.',
  'O uso é destinado a médicos-veterinários. Profissionais em início de carreira devem tratar o relatório como um auxílio, nunca como conduta pronta. Em caso de dúvida, priorize a literatura, a legislação vigente e a reavaliação do paciente.',
  'Ao continuar, você declara que leu este aviso, compreende os limites da ferramenta e assume a responsabilidade ética e profissional pelo uso das informações no atendimento.',
].join('\n\n');

export default function AccessTermsModal({
  open,
  onClose,
  onAccept,
}: {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState(TERMS_UNLOCK_SECONDS);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(TERMS_UNLOCK_SECONDS);
    setAgreed(false);
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [open]);

  if (!open) return null;
  const locked = secondsLeft > 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50"
        onClick={onClose}
        aria-label="Fechar termos"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="access-terms-title"
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-amber-100 bg-amber-50 px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-800">Obrigatório</p>
              <h2 id="access-terms-title" className="mt-1 text-lg font-bold leading-snug text-slate-900">
                {ACCESS_TERMS_TITLE}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-white hover:text-slate-700 cursor-pointer"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          <p className="text-sm font-semibold text-slate-800">{ACCESS_TERMS_SUBTITLE}</p>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600 whitespace-pre-line">
            {ACCESS_TERMS_TEXT}
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-100 px-6 py-5">
          <label className={`flex items-start gap-3 rounded-xl border p-3 ${locked ? 'cursor-not-allowed border-slate-200 bg-slate-50' : 'cursor-pointer border-emerald-200 bg-emerald-50/60'}`}>
            <input
              type="checkbox"
              checked={agreed}
              disabled={locked}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-700 focus:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="text-sm leading-relaxed text-slate-700">
              {locked
                ? `Aguarde ${secondsLeft} segundo${secondsLeft === 1 ? '' : 's'} para declarar que está de acordo.`
                : 'Declaro que li, compreendi e estou de acordo com os termos acima. Sei que o relatório da IA é apenas um auxílio e que a responsabilidade clínica é exclusivamente minha, como médico-veterinário.'}
            </span>
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={onAccept}
              disabled={!agreed || locked}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
            >
              Próximo
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
