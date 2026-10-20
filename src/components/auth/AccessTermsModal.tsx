import { useEffect, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';

const TERMS_UNLOCK_SECONDS = 5;

const PAGES = [
  {
    title: 'Antes de solicitar acesso, leia com atenção',
    subtitle: 'É obrigatório estar de acordo com estes termos para usar o Vet Assistente.',
    paragraphs: [
      'Atenção: as informações geradas por este sistema são exclusivamente de apoio à decisão clínica. Elas não substituem exame físico, anamnese, interpretação profissional nem o julgamento do Médico-Veterinário responsável pelo paciente.',
      'O diagnóstico, a conduta terapêutica, a prescrição, o cálculo de doses e qualquer decisão clínica devem ser realizados, conferidos e assumidos exclusivamente pelo profissional habilitado.',
      'O uso é destinado a médicos-veterinários. Profissionais em início de carreira devem tratar o relatório como um auxílio, nunca como conduta pronta. Em caso de dúvida, priorize a literatura, a legislação vigente e a reavaliação do paciente.',
    ],
  },
  {
    title: 'O quadro clínico informado é sua responsabilidade',
    subtitle: 'A qualidade do relatório depende do que você descreve. A IA não completa o que não foi dito.',
    paragraphs: [
      'O Vet Assistente não se responsabiliza pelos dados de entrada enviados à IA. É de total responsabilidade do médico-veterinário passar o quadro clínico completo daquele paciente: temperatura, sinais, evolução, exames já realizados e demais informações relevantes.',
      'Quanto menos dados do quadro clínico a IA receber, maior a chance de um resultado genérico. Ela não tem como avaliar o que não sabe. Um exemplo: sem a temperatura, o relatório não distingue um paciente dentro da faixa habitual de um caso com febre ou hipotermia, e a conduta tende a ficar ampla demais.',
      'Quanto mais preciso e completo for o quadro informado, melhor tende a ser o resultado entregue. Conferir o que foi descrito faz parte do uso responsável da ferramenta.',
      'Ao solicitar acesso, você declara que leu este aviso, compreende os limites da ferramenta e assume a responsabilidade ética e profissional pelo uso das informações e pelos dados clínicos que informar no atendimento.',
    ],
  },
];

export default function AccessTermsModal({
  open,
  onClose,
  onAccept,
}: {
  open: boolean;
  onClose: () => void;
  onAccept: () => void;
}) {
  const [page, setPage] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(TERMS_UNLOCK_SECONDS);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPage(0);
    setSecondsLeft(TERMS_UNLOCK_SECONDS);
    setAgreed(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(TERMS_UNLOCK_SECONDS);
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
  }, [open, page]);

  if (!open) return null;

  const locked = secondsLeft > 0;
  const current = PAGES[page];
  const isLast = page === PAGES.length - 1;

  const advance = () => {
    if (locked || isLast) return;
    setAgreed(false);
    setPage((currentPage) => currentPage + 1);
  };

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
              <p className="text-[11px] font-bold uppercase tracking-widest text-amber-800">
                Obrigatório · {page + 1} de {PAGES.length}
              </p>
              <h2 id="access-terms-title" className="mt-1 text-lg font-bold leading-snug text-slate-900">
                {current.title}
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
          <p className="text-sm font-semibold text-slate-800">{current.subtitle}</p>
          <div className="mt-4 space-y-3 text-sm leading-relaxed text-slate-600">
            {current.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>

        <div className="space-y-4 border-t border-slate-100 px-6 py-5">
          {isLast && (
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
                  ? `Aguarde ${secondsLeft} segundo${secondsLeft === 1 ? '' : 's'} para declarar que está ciente.`
                  : 'Declaro estar ciente: li e compreendi os termos, sei que o relatório é apenas um auxílio e que a responsabilidade clínica e pelos dados informados à IA é exclusivamente minha, como médico-veterinário.'}
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            {isLast ? (
              <button
                type="button"
                onClick={onAccept}
                disabled={!agreed || locked}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                Solicitar acesso
              </button>
            ) : (
              <button
                type="button"
                onClick={advance}
                disabled={locked}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
              >
                {locked ? `Aguarde ${secondsLeft}s` : 'Avançar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
