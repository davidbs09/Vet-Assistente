import { Cat, ChevronRight, Dog, History, Plus, Search, User as UserIcon } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Patient } from '../../types/clinical';
import { Button, Input } from '../ui';

export default function DashboardView({
  patients,
  searchTerm,
  onSearchTermChange,
  onAddPatient,
  onSelectPatient,
}: {
  patients: Patient[];
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  onAddPatient: () => void;
  onSelectPatient: (patient: Patient) => void;
}) {
  return (
    <motion.div
      key="dashboard"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Pacientes</h2>
          <p className="text-sm text-slate-500">Gerencie seus pacientes e consultas.</p>
        </div>
        <Button onClick={onAddPatient}>
          <Plus className="mr-2 h-4 w-4" /> Novo Paciente
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input 
          placeholder="Buscar por nome do paciente ou proprietário..." 
          className="pl-10"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {patients.map((patient) => (
          <motion.div
            key={patient.id}
            whileHover={{ y: -4 }}
            className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
            onClick={() => onSelectPatient(patient)}
          >
            <div className="flex items-start justify-between">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 group-hover:bg-emerald-50">
                {patient.species === 'dog' ? (
                  <Dog className="h-6 w-6 text-slate-400 group-hover:text-emerald-600" />
                ) : (
                  <Cat className="h-6 w-6 text-slate-400 group-hover:text-emerald-600" />
                )}
              </div>
              <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-emerald-500" />
            </div>
            <div className="mt-4">
              <h3 className="font-bold text-slate-900">{patient.name}</h3>
              <p className="text-sm text-slate-500">{patient.breed} • {patient.weight}kg</p>
            </div>
            <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-400">
              <UserIcon className="h-3 w-3" />
              <span>{patient.ownerName}</span>
            </div>
          </motion.div>
        ))}
        {patients.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
            <History className="h-12 w-12 text-slate-300" />
            <h3 className="mt-4 text-lg font-medium text-slate-900">Nenhum paciente encontrado</h3>
            <p className="mt-1 text-sm text-slate-500">Comece adicionando seu primeiro paciente.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
