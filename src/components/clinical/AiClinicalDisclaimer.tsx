import { ShieldAlert } from 'lucide-react';
import { AI_REPORT_DISCLAIMER, AI_REPORT_DISCLAIMER_TITLE } from '../../shared/clinicalDisclaimer';

export default function AiClinicalDisclaimer() {
  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-200 text-amber-800">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-800">Aviso obrigatório</p>
          <h4 className="mt-1 text-sm font-bold text-slate-900">{AI_REPORT_DISCLAIMER_TITLE}</h4>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-700">
            {AI_REPORT_DISCLAIMER}
          </p>
        </div>
      </div>
    </div>
  );
}
