export type AdviceStep = 'documents' | 'diagnosis' | 'treatment' | 'medications' | 'exams' | 'validate';

export interface DifferentialDiagnosis {
  disease: string;
  likelihood: string;
  reasoning: string;
}

export interface Medication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  forDiagnosis?: string;
}

export interface DiagnosisResult {
  diagnosis: string;
  differentials: DifferentialDiagnosis[];
  treatment: string;
  medications: Medication[];
  suggestedExams: string[];
  sources: string[];
  examFindings?: string;
}

export type PatientContext = {
  species: string;
  breed: string;
  weight: number;
  sex?: string;
  ageYears?: number;
  neutered?: boolean;
};

export type PipelineProgress = {
  step: AdviceStep;
  index: number;
  total: number;
  label: string;
};

export type SpecialistPrompts = {
  systemInstruction: string;
  userPrompt: string;
};

export type SpecialistInput = {
  patient: PatientContext;
  symptoms: string;
  examsNote: string;
  draft: DiagnosisResult;
  fixNote?: string;
};

export type Specialist = {
  id: AdviceStep;
  label: string;
  detail: string;
  attachExams: boolean;
  buildPrompts: (input: SpecialistInput) => SpecialistPrompts;
  review?: (result: DiagnosisResult, symptoms: string) => string[];
  assert: (result: DiagnosisResult) => void;
};
