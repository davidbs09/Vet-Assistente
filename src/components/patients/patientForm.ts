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

export function readPatientForm(form: HTMLFormElement): Pick<Patient, 'name' | 'species' | 'sex' | 'breed' | 'weight' | 'ownerName' | 'ownerPhone'> {
  const formData = new FormData(form);
  const weight = parseFloat(String(formData.get('weight') || ''));
  const species: Patient['species'] = formData.get('species') === 'cat' ? 'cat' : 'dog';
  const sex = normalizePatientSex(formData.get('sex'));
  return {
    name: String(formData.get('name') || '').trim(),
    species,
    ...(sex ? { sex } : {}),
    breed: String(formData.get('breed') || '').trim(),
    weight,
    ownerName: String(formData.get('ownerName') || '').trim(),
    ownerPhone: normalizePhone(String(formData.get('ownerPhone') || '')),
  };
}
