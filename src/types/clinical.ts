import type { DiagnosisResult } from '../ai';

export type PatientSex = 'male' | 'female';

export interface Patient {
  id: string;
  name: string;
  species: 'dog' | 'cat';
  sex?: PatientSex;
  breed: string;
  weight: number;
  ageYears?: number;
  neutered?: boolean;
  ownerName: string;
  ownerPhone: string;
  createdAt: any;
  createdBy: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  date: any;
  symptoms: string;
  diagnosis: string;
  differentials?: DiagnosisResult['differentials'];
  treatment: string;
  medications: DiagnosisResult['medications'];
  suggestedExams: string[];
  examUrls?: string[];
  notes?: string;
  createdBy: string;
}

export type AppView = 'dashboard' | 'patient' | 'new-consultation' | 'prescription' | 'prontuario' | 'admin';
export type SessionStatus = 'checking' | 'active' | 'conflict' | 'revoked';
