import { FilePlus, History, Pencil, Printer, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Consultation, Patient } from '../../types/clinical';
import { Button } from '../ui';
import { formatPatientAge, formatPatientNeutered, formatPatientPhone, formatPatientSex } from './patientForm';

export default function PatientDetailView({
  patient,
  consultations,
  onBack,
  onEdit,
  onDelete,
  onNewConsultation,
  onPrintRecord,
  onOpenPrescription,
}: {
  patient: Patient;
  consultations: Consultation[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onNewConsultation: () => void;
  onPrintRecord: () => void;
  onOpenPrescription: (consultation: Consultation) => void;
}) {
  return (
    <motion.div
      key="patient"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Voltar
        </Button>
        <div className="h-4 w-px bg-slate-200" />
        <h2 className="text-2xl font-bold text-slate-900">Prontuário: {patient.name}</h2>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Informações</h3>
              <div className="flex items-center">
                <Button
                  variant="ghost"
                  size="sm"
                  title="Editar paciente"
                  aria-label="Editar paciente"
                  onClick={onEdit}
                >
                  <Pencil className="h-4 w-4 text-slate-500" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Excluir paciente"
                  aria-label="Excluir paciente"
                  onClick={onDelete}
                >
                  <Trash2 className="h-4 w-4 text-rose-500" />
                </Button>
              </div>
            </div>
            <div className="mt-6 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Espécie</span>
                <span className="font-medium capitalize">{patient.species === 'dog' ? 'Cão' : 'Gato'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Sexo</span>
                <span className="font-medium">{formatPatientSex(patient.sex)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Idade</span>
                <span className="font-medium">{formatPatientAge(patient.ageYears)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Castração</span>
                <span className="font-medium">{formatPatientNeutered(patient.neutered)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Raça</span>
                <span className="font-medium">{patient.breed}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Peso</span>
                <span className="font-medium text-emerald-600">{patient.weight} kg</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Proprietário</span>
                <span className="font-medium">{patient.ownerName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Telefone</span>
                <span className="font-medium">{formatPatientPhone(patient.ownerPhone) || patient.ownerPhone}</span>
              </div>
            </div>
            <div className="mt-8 flex flex-col gap-2">
              <Button className="w-full" onClick={onNewConsultation}>
                <FilePlus className="mr-2 h-4 w-4" /> Nova Consulta
              </Button>
              <Button variant="outline" className="w-full" onClick={onPrintRecord}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir Prontuário
              </Button>
              <Button variant="danger" className="w-full mt-2" onClick={onDelete}>
                <Trash2 className="mr-2 h-4 w-4" /> Deletar Ficha do Animal
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <History className="h-5 w-5 text-emerald-600" />
            Histórico de Consultas
          </h3>
          <div className="space-y-4">
            {consultations.map((consultation) => (
              <div key={consultation.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">
                    {new Date(consultation.date.seconds * 1000).toLocaleDateString('pt-BR')}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => onOpenPrescription(consultation)}>
                      <Printer className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  <h4 className="font-bold text-slate-900">{consultation.diagnosis}</h4>
                  <p className="text-sm text-slate-600 line-clamp-2">{consultation.symptoms}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {consultation.medications && consultation.medications.length > 0 ? consultation.medications.map((med, i) => (
                    <span key={i} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                      {med.name}
                    </span>
                  )) : (
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                      Sem medicamentos necessários
                    </span>
                  )}
                </div>
              </div>
            ))}
            {consultations.length === 0 && (
              <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                <p className="text-sm text-slate-500">Nenhuma consulta registrada.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
