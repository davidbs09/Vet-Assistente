import { useRef } from 'react';
import { Printer } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Consultation, Patient } from '../types/clinical';
import { Button } from './ui';

export default function ProntuarioView({ patient, consultations, onBack }: { patient: Patient, consultations: Consultation[], onBack: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Prontuário - ${patient.name}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.5; }
            .header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 40px; }
            .patient-card { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .consultation { margin-bottom: 40px; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; }
            .cons-date { font-weight: bold; color: #059669; margin-bottom: 10px; }
            .cons-diag { font-size: 1.1rem; font-weight: bold; margin-bottom: 10px; }
            .section-title { font-size: 0.8rem; font-weight: bold; text-transform: uppercase; color: #6b7280; margin-top: 15px; }
            .footer { margin-top: 80px; text-align: center; font-size: 0.8rem; color: #9ca3af; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Prontuário Veterinário Completo</h1>
            <p>VetAI Assistant - Histórico Clínico</p>
          </div>
          <div class="patient-card">
            <div>
              <strong>Paciente:</strong> ${patient.name}<br>
              <strong>Espécie:</strong> ${patient.species === 'dog' ? 'Cão' : 'Gato'}<br>
              <strong>Raça:</strong> ${patient.breed}
            </div>
            <div style="text-align: right;">
              <strong>Peso:</strong> ${patient.weight} kg<br>
              <strong>Proprietário:</strong> ${patient.ownerName}<br>
              <strong>Telefone:</strong> ${patient.ownerPhone}
            </div>
          </div>
          <h2>Histórico de Consultas</h2>
          ${consultations.map(c => `
            <div class="consultation">
              <div class="cons-date">${new Date(c.date.seconds * 1000).toLocaleDateString('pt-BR')}</div>
              <div class="cons-diag">${c.diagnosis}</div>
              ${c.differentials && c.differentials.length ? `
              <div class="section-title">Diagnósticos diferenciais</div>
              <ul>
                ${c.differentials.map(d => `<li><strong>${d.disease}</strong>${d.likelihood ? ` (${d.likelihood})` : ''}: ${d.reasoning}</li>`).join('')}
              </ul>` : ''}
              <div class="section-title">Sintomas</div>
              <p>${c.symptoms}</p>
              <div class="section-title">Tratamento</div>
              <p>${c.treatment}</p>
              <div class="section-title">Medicamentos</div>
              <ul>
                ${c.medications.map(m => `<li>${m.name}: ${m.dosage} - ${m.frequency} (${m.duration})</li>`).join('')}
              </ul>
            </div>
          `).join('')}
          <div class="footer">
            Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}.
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>Voltar</Button>
          <h2 className="text-2xl font-bold text-slate-900">Prontuário Completo</h2>
        </div>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir Prontuário
        </Button>
      </div>

      <div ref={printRef} className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-12 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{patient.name}</h1>
            <p className="text-slate-500">{patient.species === 'dog' ? 'Cão' : 'Gato'} • {patient.breed}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-500">Proprietário</p>
            <p className="text-lg font-bold text-slate-900">{patient.ownerName}</p>
          </div>
        </div>

        <div className="mt-12 space-y-12">
          {consultations.map((c, i) => (
            <div key={c.id} className="relative pl-8">
              <div className="absolute left-0 top-0 h-full w-px bg-slate-100" />
              <div className="absolute left-[-4px] top-2 h-2 w-2 rounded-full bg-emerald-500" />
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-600">
                  {new Date(c.date.seconds * 1000).toLocaleDateString('pt-BR')}
                </span>
              </div>
              
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{c.diagnosis}</h3>
                  {c.differentials && c.differentials.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Diagnósticos diferenciais</h4>
                      {c.differentials.map((diff, d) => (
                        <p key={d} className="text-sm text-slate-600">
                          <span className="font-semibold text-slate-800">{diff.disease}</span>
                          {diff.likelihood ? ` (${diff.likelihood})` : ''}: {diff.reasoning}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="grid gap-8 md:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Sintomas</h4>
                    <p className="mt-2 text-sm text-slate-600">{c.symptoms}</p>
                    
                    {c.suggestedExams && c.suggestedExams.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Exames Sugeridos</h4>
                        <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                          {c.suggestedExams.map((exam, k) => <li key={k}>{exam}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Tratamento</h4>
                    <div className="prose prose-sm mt-2 text-slate-600">
                      <ReactMarkdown>{c.treatment}</ReactMarkdown>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Medicamentos</h4>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {c.medications.map((med, j) => (
                      <div key={j} className="rounded-lg bg-slate-50 p-3 text-xs">
                        <div className="font-bold text-slate-900">{med.name}</div>
                        <div className="mt-1 text-slate-500">{med.dosage} • {med.frequency}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}