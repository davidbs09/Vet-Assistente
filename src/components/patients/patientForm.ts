import type { Patient, PatientSex } from '../../types/clinical';
import { formatPhone, isValidPhone, normalizePhone, PHONE_MAX_DIGITS } from '../../lib/phone';

export const PATIENT_PHONE_MAX_LENGTH = PHONE_MAX_DIGITS;
export const normalizePatientPhone = normalizePhone;
export const isValidPatientPhone = isValidPhone;
export const formatPatientPhone = formatPhone;

export function normalizePatientSex(value: unknown): PatientSex | '' {
  return value === 'male' || value === 'female' ? value : '';
}

export function formatPatientSex(value?: string): string {
  if (value === 'male') return 'Macho';
  if (value === 'female') return 'Fêmea';
  return 'Não informado';
}

export function normalizePatientNeutered(value: unknown): boolean | undefined {
  if (value === 'yes') return true;
  if (value === 'no') return false;
  return undefined;
}

export function formatPatientNeutered(value?: boolean): string {
  if (value === true) return 'Castrado';
  if (value === false) return 'Não castrado';
  return 'Não informado';
}

export function formatPatientAge(value?: number): string {
  if (value == null || !Number.isFinite(value) || value < 0) return 'Não informada';
  if (value === 0) return 'Recém-nascido';
  if (value < 1) return `${Math.round(value * 12)} meses`;
  return `${value} ${value === 1 ? 'ano' : 'anos'}`;
}

export function readPatientForm(form: HTMLFormElement): Pick<Patient, 'name' | 'species' | 'sex' | 'breed' | 'weight' | 'ageYears' | 'neutered' | 'ownerName' | 'ownerPhone'> {
  const formData = new FormData(form);
  const weight = parseFloat(String(formData.get('weight') || ''));
  const species: Patient['species'] = formData.get('species') === 'cat' ? 'cat' : 'dog';
  const sex = normalizePatientSex(formData.get('sex'));
  const neutered = normalizePatientNeutered(formData.get('neutered'));
  const ageYears = parseFloat(String(formData.get('ageYears') || ''));
  return {
    name: String(formData.get('name') || '').trim(),
    species,
    ...(sex ? { sex } : {}),
    ...(neutered !== undefined ? { neutered } : {}),
    ...(Number.isFinite(ageYears) && ageYears >= 0 ? { ageYears } : {}),
    breed: String(formData.get('breed') || '').trim(),
    weight,
    ownerName: String(formData.get('ownerName') || '').trim(),
    ownerPhone: normalizePhone(String(formData.get('ownerPhone') || '')),
  };
}
