import type { Patient } from '../../types/clinical';

export const PATIENT_PHONE_MAX_LENGTH = 11;

export function normalizePatientPhone(value: string): string {
  return value.replace(/\D/g, '').slice(0, PATIENT_PHONE_MAX_LENGTH);
}

export function isValidPatientPhone(value: string): boolean {
  return /^\d{10,11}$/.test(normalizePatientPhone(value));
}

export function formatPatientPhone(value: string): string {
  const digits = normalizePatientPhone(value);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function readPatientForm(form: HTMLFormElement): Pick<Patient, 'name' | 'species' | 'breed' | 'weight' | 'ownerName' | 'ownerPhone'> {
  const formData = new FormData(form);
  const weight = parseFloat(String(formData.get('weight') || ''));
  const species: Patient['species'] = formData.get('species') === 'cat' ? 'cat' : 'dog';
  return {
    name: String(formData.get('name') || '').trim(),
    species,
    breed: String(formData.get('breed') || '').trim(),
    weight,
    ownerName: String(formData.get('ownerName') || '').trim(),
    ownerPhone: normalizePatientPhone(String(formData.get('ownerPhone') || '')),
  };
}
