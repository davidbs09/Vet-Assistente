import type { Patient } from '../../types/clinical';
import { formatPhone, isValidPhone, normalizePhone, PHONE_MAX_DIGITS } from '../../lib/phone';

export const PATIENT_PHONE_MAX_LENGTH = PHONE_MAX_DIGITS;
export const normalizePatientPhone = normalizePhone;
export const isValidPatientPhone = isValidPhone;
export const formatPatientPhone = formatPhone;

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
    ownerPhone: normalizePhone(String(formData.get('ownerPhone') || '')),
  };
}
