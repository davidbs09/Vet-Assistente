import type { FormEvent } from 'react';
import { AlertCircle, Loader2, Save, Trash2, X } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Patient } from '../../types/clinical';
import { Button, Input } from '../ui';
import { formatPatientPhone } from './patientForm';

const selectClass = 'flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

function restrictPhoneInput(event: FormEvent<HTMLInputElement>) {
  event.currentTarget.value = formatPatientPhone(event.currentTarget.value);
}

function SexField({ defaultValue }: { defaultValue?: string }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700" htmlFor="patient-sex">Sexo</label>
      <select
        id="patient-sex"
        name="sex"
        required
        defaultValue={defaultValue === 'male' || defaultValue === 'female' ? defaultValue : ''}
        className={selectClass}
      >
        <option value="" disabled>Selecione</option>
        <option value="female">Fêmea</option>
        <option value="male">Macho</option>
      </select>
    </div>
  );
}

function NeuteredField({ defaultValue }: { defaultValue?: boolean }) {
  const current = defaultValue === true ? 'yes' : defaultValue === false ? 'no' : '';
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-slate-700" htmlFor="patient-neutered">Castração</label>
      <select
        id="patient-neutered"
        name="neutered"
        required
        defaultValue={current}
        className={selectClass}
      >
        <option value="" disabled>Selecione</option>
        <option value="yes">Castrado</option>
        <option value="no">Não castrado</option>
      </select>
    </div>
  );
}

export function AddPatientModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Novo Paciente</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nome do Paciente</label>
            <Input name="name" required placeholder="Ex: Rex" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Espécie</label>
              <select name="species" className={selectClass}>
                <option value="dog">Cão</option>
                <option value="cat">Gato</option>
              </select>
            </div>
            <SexField />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Peso (kg)</label>
            <Input name="weight" type="number" step="0.1" required placeholder="Ex: 10.5" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Idade (anos)</label>
              <Input name="ageYears" type="number" step="0.1" min="0" required placeholder="Ex: 3 (0,5 = 6 meses)" />
            </div>
            <NeuteredField />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Raça</label>
            <Input name="breed" required placeholder="Ex: Golden Retriever" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Proprietário</label>
            <Input name="ownerName" required placeholder="Nome do dono" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Telefone</label>
            <Input
              name="ownerPhone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              required
              maxLength={15}
              minLength={14}
              pattern="\(\d{2}\) \d{4,5}-\d{4}"
              placeholder="(00) 00000-0000"
              onInput={restrictPhoneInput}
            />
          </div>
          <Button type="submit" className="w-full mt-4">
            Salvar Paciente
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

export function EditPatientModal({
  patient,
  saving,
  onClose,
  onSubmit,
}: {
  patient: Patient;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={() => !saving && onClose()}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Editar Paciente</h2>
          <Button variant="ghost" size="sm" disabled={saving} onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <form key={patient.id} onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Nome do Paciente</label>
            <Input name="name" required defaultValue={patient.name} placeholder="Ex: Rex" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Espécie</label>
              <select
                name="species"
                defaultValue={patient.species}
                className={selectClass}
              >
                <option value="dog">Cão</option>
                <option value="cat">Gato</option>
              </select>
            </div>
            <SexField defaultValue={patient.sex} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Peso (kg)</label>
            <Input name="weight" type="number" step="0.1" min="0.1" required defaultValue={patient.weight} placeholder="Ex: 10.5" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Idade (anos)</label>
              <Input
                name="ageYears"
                type="number"
                step="0.1"
                min="0"
                required
                defaultValue={patient.ageYears ?? ''}
                placeholder="Ex: 3 (0,5 = 6 meses)"
              />
            </div>
            <NeuteredField defaultValue={patient.neutered} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Raça</label>
            <Input name="breed" required defaultValue={patient.breed} placeholder="Ex: Golden Retriever" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Proprietário</label>
            <Input name="ownerName" required defaultValue={patient.ownerName} placeholder="Nome do dono" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Telefone</label>
            <Input
              name="ownerPhone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              required
              maxLength={15}
              minLength={14}
              pattern="\(\d{2}\) \d{4,5}-\d{4}"
              placeholder="(00) 00000-0000"
              defaultValue={formatPatientPhone(patient.ownerPhone)}
              onInput={restrictPhoneInput}
            />
          </div>
          <p className="text-xs text-slate-500">
            As consultas e o prontuário deste animal permanecem vinculados a esta ficha.
          </p>
          <Button type="submit" className="w-full mt-4" disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Salvar Alterações
              </>
            )}
          </Button>
        </form>
      </motion.div>
    </div>
  );
}

export function DeletePatientModal({
  patient,
  onClose,
  onConfirm,
}: {
  patient: Patient;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-xl font-bold text-rose-600 flex items-center gap-2">
            <Trash2 className="h-5 w-5" /> Excluir Paciente
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="mt-4">
          <p className="text-sm text-slate-600">
            Tem certeza de que deseja excluir a ficha do paciente <strong className="text-slate-900">{patient.name}</strong>?
          </p>
          <div className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 p-3 rounded-lg flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
            <span>
              Esta ação é permanente e todos os dados associados a esta ficha serão apagados definitivamente do banco de dados.
            </span>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Sim, Excluir Ficha
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
