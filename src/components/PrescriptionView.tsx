import { useRef } from 'react';
import { Dog, Printer } from 'lucide-react';
import type { Consultation, Patient } from '../types/clinical';
import { Button } from './ui';

export default function PrescriptionView({ consultation, patient, onBack }: { consultation: Consultation, patient: Patient, onBack: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Receituário - ${patient.name}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 40px; }
            .patient-info { margin-bottom: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .medication { margin-bottom: 30px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; }
            .med-name { font-size: 1.2rem; font-weight: bold; color: #065f46; margin-bottom: 10px; }
            .med-details { font-size: 0.9rem; color: #4b5563; }
            .footer { margin-top: 80px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px; font-size: 0.8rem; color: #9ca3af; }
            .signature { margin-top: 60px; text-align: center; }
            .sig-line { width: 200px; border-top: 1px solid #333; margin: 0 auto 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Receituário Veterinário</h1>
            <p>VetAI Assistant - Inteligência Artificial Clínica</p>
          </div>
          <div class="patient-info">
            <div>
              <strong>Paciente:</strong> ${patient.name}<br>
              <strong>Espécie:</strong> ${patient.species === 'dog' ? 'Cão' : 'Gato'}<br>
              <strong>Peso:</strong> ${patient.weight} kg
            </div>
            <div style="text-align: right;">
              <strong>Data:</strong> ${new Date(consultation.date.seconds * 1000).toLocaleDateString('pt-BR')}<br>
              <strong>Proprietário:</strong> ${patient.ownerName}
            </div>
          </div>
          <div class="content">
            ${consultation.medications.map(med => `
              <div class="medication">
                <div class="med-name">${med.name}</div>
                <div class="med-details">
                  ${med.forDiagnosis ? `<strong>Indicação:</strong> ${med.forDiagnosis}<br>` : ''}
                  <strong>Dose:</strong> ${med.dosage}<br>
                  <strong>Frequência:</strong> ${med.frequency}<br>
                  <strong>Duração:</strong> ${med.duration}
                </div>
              </div>
            `).join('')}
          </div>
          <div class="signature">
            <div class="sig-line"></div>
            <p>Médico Veterinário</p>
          </div>
          <div class="footer">
            Documento gerado eletronicamente via VetAI Assistant.
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
          <h2 className="text-2xl font-bold text-slate-900">Receituário</h2>
        </div>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir Receita
        </Button>
      </div>

      <div ref={printRef} className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-12 shadow-sm">
        <div className="text-center">
          <Dog className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Receituário Veterinário</h1>
          <div className="mt-2 h-1 w-24 mx-auto bg-emerald-600 rounded-full" />
        </div>

        <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
          <div className="space-y-2">
            <p><span className="text-slate-500">Paciente:</span> <span className="font-bold">{patient.name}</span></p>
            <p><span className="text-slate-500">Espécie:</span> <span className="font-bold capitalize">{patient.species === 'dog' ? 'Cão' : 'Gato'}</span></p>
            <p><span className="text-slate-500">Peso:</span> <span className="font-bold">{patient.weight} kg</span></p>
          </div>
          <div className="space-y-2 text-right">
            <p><span className="text-slate-500">Data:</span> <span className="font-bold">{new Date(consultation.date.seconds * 1000).toLocaleDateString('pt-BR')}</span></p>
            <p><span className="text-slate-500">Proprietário:</span> <span className="font-bold">{patient.ownerName}</span></p>
          </div>
        </div>

        <div className="mt-12 space-y-8">
          {consultation.medications.map((med, i) => (
            <div key={i} className="border-l-4 border-emerald-500 pl-6">
              <h3 className="text-lg font-bold text-emerald-900">{med.name}</h3>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                {med.forDiagnosis && <p><strong>Indicação:</strong> {med.forDiagnosis}</p>}
                <p><strong>Dose:</strong> {med.dosage}</p>
                <p><strong>Frequência:</strong> {med.frequency}</p>
                <p><strong>Duração:</strong> {med.duration}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-24 text-center">
          <div className="mx-auto h-px w-48 bg-slate-300" />
          <p className="mt-4 text-sm font-medium text-slate-500">Assinatura do Médico Veterinário</p>
        </div>
      </div>
    </div>
  );
}