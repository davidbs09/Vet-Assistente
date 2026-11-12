import { formatPhone } from './phone';
import { formatPatientAge, formatPatientNeutered, formatPatientSex } from '../components/patients/patientForm';

export interface BackupMedication {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  forDiagnosis: string;
}

export interface BackupConsultation {
  id: string;
  dateMillis: number;
  symptoms: string;
  diagnosis: string;
  treatment: string;
  notes: string;
  suggestedExams: string[];
  differentials: Array<{ disease: string; likelihood: string }>;
  medications: BackupMedication[];
}

export interface BackupPatient {
  id: string;
  name: string;
  species: string;
  sex: string;
  breed: string;
  weight: number | null;
  ageYears: number | null;
  neutered: boolean | null;
  ownerName: string;
  ownerPhone: string;
  consultations: BackupConsultation[];
}

export interface UserBackup {
  professional: {
    displayName: string;
    email: string;
    crmv: string;
    contato: string;
  };
  patients: BackupPatient[];
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function textBlock(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '<p>—</p>';
  return `<p>${escapeHtml(trimmed).replace(/\n/g, '<br>')}</p>`;
}

function formatDate(millis: number): string {
  if (!millis) return 'Data não informada';
  return new Date(millis).toLocaleDateString('pt-BR');
}

function speciesLabel(species: string): string {
  if (species === 'dog') return 'Cão';
  if (species === 'cat') return 'Gato';
  return 'Não informada';
}

function consultationHtml(consultation: BackupConsultation): string {
  const exams = consultation.suggestedExams.filter(Boolean);
  const differentials = consultation.differentials.filter((item) => item.disease);
  const medications = consultation.medications.filter((item) => item.name || item.dosage);
  const medicationHtml = medications.length
    ? `<ul>${medications.map((item) => {
        const detail = [item.dosage, item.frequency, item.duration].filter(Boolean).join(' — ');
        const indication = item.forDiagnosis ? ` [${item.forDiagnosis}]` : '';
        return `<li>${escapeHtml(item.name)}${escapeHtml(indication)}${detail ? `: ${escapeHtml(detail).replace(/\n/g, '<br>')}` : ''}</li>`;
      }).join('')}</ul>`
    : '<p>Medicamentos não são necessários neste caso. A conduta é de suporte, sem prescrição farmacológica.</p>';

  return `
    <div class="consultation">
      <div class="cons-date">${escapeHtml(formatDate(consultation.dateMillis))}</div>
      <div class="cons-diag">${escapeHtml(consultation.diagnosis || 'Diagnóstico não informado')}</div>
      <div class="section-title">Sintomas</div>
      ${textBlock(consultation.symptoms)}
      ${differentials.length ? `
        <div class="section-title">Diagnósticos diferenciais</div>
        <ul>${differentials.map((item) => `<li>${escapeHtml(item.disease)}${item.likelihood ? ` — ${escapeHtml(item.likelihood)}` : ''}</li>`).join('')}</ul>
      ` : ''}
      <div class="section-title">Tratamento</div>
      ${textBlock(consultation.treatment)}
      <div class="section-title">Medicamentos</div>
      ${medicationHtml}
      ${exams.length ? `
        <div class="section-title">Exames sugeridos</div>
        <ul>${exams.map((exam) => `<li>${escapeHtml(exam)}</li>`).join('')}</ul>
      ` : ''}
      ${consultation.notes.trim() ? `
        <div class="section-title">Observações</div>
        ${textBlock(consultation.notes)}
      ` : ''}
    </div>
  `;
}

function patientHtml(patient: BackupPatient): string {
  const orphan = patient.id === '__orphans__';
  const visits = patient.consultations.length
    ? patient.consultations.map(consultationHtml).join('')
    : '<p>Nenhum atendimento registrado.</p>';
  const identity = orphan
    ? `<strong>Paciente:</strong> ${escapeHtml(patient.name)}`
    : `
      <strong>Paciente:</strong> ${escapeHtml(patient.name || 'Sem nome')}<br>
      <strong>Espécie:</strong> ${escapeHtml(speciesLabel(patient.species))}<br>
      <strong>Sexo:</strong> ${escapeHtml(formatPatientSex(patient.sex))}<br>
      <strong>Idade:</strong> ${escapeHtml(formatPatientAge(patient.ageYears ?? undefined))}<br>
      <strong>Castração:</strong> ${escapeHtml(formatPatientNeutered(patient.neutered ?? undefined))}<br>
      <strong>Raça:</strong> ${escapeHtml(patient.breed || 'Não informada')}
    `;
  const side = orphan
    ? `<strong>Atendimentos:</strong> ${patient.consultations.length}`
    : `
      <strong>Peso:</strong> ${patient.weight == null ? 'Não informado' : `${escapeHtml(patient.weight)} kg`}<br>
      <strong>Proprietário:</strong> ${escapeHtml(patient.ownerName || 'Não informado')}<br>
      <strong>Telefone:</strong> ${escapeHtml(formatPhone(patient.ownerPhone) || patient.ownerPhone || 'Não informado')}
    `;

  return `
    <section class="patient-block">
      <div class="patient-card">
        <div>${identity}</div>
        <div style="text-align: right;">${side}</div>
      </div>
      <h2>Atendimentos</h2>
      ${visits}
    </section>
  `;
}

export function renderBackupDocument(backup: UserBackup): string {
  const professional = backup.professional;
  const name = professional.displayName || professional.email || 'Profissional não informado';
  const visitCount = backup.patients.reduce((total, patient) => total + patient.consultations.length, 0);
  const patients = backup.patients.length
    ? backup.patients.map(patientHtml).join('')
    : '<p>Nenhum paciente ou atendimento neste cadastro.</p>';

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Backup - ${escapeHtml(name)}</title>
    <style>
      body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.5; }
      .header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 40px; }
      .patient-card { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
      .consultation { margin-bottom: 40px; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; }
      .cons-date { font-weight: bold; color: #059669; margin-bottom: 10px; }
      .cons-diag { font-size: 1.1rem; font-weight: bold; margin-bottom: 10px; }
      .section-title { font-size: 0.8rem; font-weight: bold; text-transform: uppercase; color: #6b7280; margin-top: 15px; }
      .footer { margin-top: 80px; text-align: center; font-size: 0.8rem; color: #9ca3af; }
      .patient-block + .patient-block { break-before: page; page-break-before: always; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>Backup de prontuários</h1>
      <p>VetAI Assistant - Histórico Clínico</p>
    </div>
    <div class="patient-card">
      <div>
        <strong>Profissional responsável:</strong> ${escapeHtml(name)}<br>
        <strong>CRMV:</strong> ${escapeHtml(professional.crmv || 'Não informado')}<br>
        <strong>E-mail:</strong> ${escapeHtml(professional.email || 'Não informado')}<br>
        <strong>Contato:</strong> ${escapeHtml(formatPhone(professional.contato) || professional.contato || 'Não informado')}
      </div>
      <div style="text-align: right;">
        <strong>Gerado em:</strong> ${escapeHtml(new Date().toLocaleString('pt-BR'))}<br>
        <strong>Pacientes:</strong> ${backup.patients.filter((patient) => patient.id !== '__orphans__').length}<br>
        <strong>Atendimentos:</strong> ${visitCount}
      </div>
    </div>
    ${patients}
    <div class="footer">
      Documento gerado eletronicamente em ${escapeHtml(new Date().toLocaleString('pt-BR'))}.
    </div>
    <script>window.addEventListener('load', function () { window.print(); });</script>
  </body>
</html>`;
}

export function openBackupDocument(backup: UserBackup, printWindow: Window): void {
  printWindow.document.open();
  printWindow.document.write(renderBackupDocument(backup));
  printWindow.document.close();
  printWindow.focus();
}
