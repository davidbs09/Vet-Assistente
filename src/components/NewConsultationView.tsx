import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardList, Loader2, Mic, Save, Square, Upload, X } from 'lucide-react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { auth, db, addDoc, collection, Timestamp } from '../firebase';
import { getVeterinaryAdvice, DiagnosisResult } from '../services/geminiService';
import { assertActiveAccess, logoutFromAuth, mapAuthError } from '../services/authService';
import { cn } from '../lib/cn';
import { createBrowserSpeechRecognition, isBrowserSpeechSupported } from '../lib/speechToText';
import type { Consultation, Patient } from '../types/clinical';
import { Button, Textarea } from './ui';
import AiClinicalDisclaimer from './clinical/AiClinicalDisclaimer';

export default function NewConsultationView({ patient, onBack, onComplete }: { patient: Patient, onBack: () => void, onComplete: (c: Consultation) => void }) {
  const [symptoms, setSymptoms] = useState('');
  const [loading, setLoading] = useState(false);
  const [diagnoseError, setDiagnoseError] = useState('');
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [exams, setExams] = useState<{ data: string; mimeType: string; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof createBrowserSpeechRecognition>>(null);
  const keepListeningRef = useRef(false);
  const dictatedPrefixRef = useRef('');

  const stopRecording = () => {
    keepListeningRef.current = false;
    setIsRecording(false);
    recognitionRef.current?.stop();
  };

  const startRecording = () => {
    if (!isBrowserSpeechSupported()) {
      alert('Este navegador não reconhece voz sem IA. Use Chrome, Edge ou Brave com reconhecimento de voz ativo.');
      return;
    }

    const recognition = createBrowserSpeechRecognition();
    if (!recognition) return;

    recognitionRef.current?.abort();
    recognitionRef.current = recognition;
    keepListeningRef.current = true;
    dictatedPrefixRef.current = symptoms.trim() ? `${symptoms.trim()} ` : '';

    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let spoken = '';
      for (let index = 0; index < event.results.length; index += 1) {
        spoken += event.results[index][0].transcript;
      }
      setSymptoms(`${dictatedPrefixRef.current}${spoken}`.trim());
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted' || event.error === 'no-speech') return;
      keepListeningRef.current = false;
      setIsRecording(false);
      if (event.error === 'not-allowed') {
        alert('Permita o acesso ao microfone para ditar a anamnese.');
        return;
      }
      alert('Não foi possível ouvir o microfone. Tente novamente.');
    };

    recognition.onend = () => {
      if (!keepListeningRef.current) {
        setIsRecording(false);
        return;
      }
      try {
        recognition.start();
      } catch (_) {
        setIsRecording(false);
      }
    };

    try {
      recognition.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      keepListeningRef.current = false;
      alert('Não foi possível iniciar o microfone. Verifique as permissões.');
    }
  };

  useEffect(() => {
    return () => {
      keepListeningRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setExams(prev => [...prev, {
          data: event.target?.result as string,
          mimeType: file.type,
          name: file.name
        }]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeExam = (index: number) => {
    setExams(prev => prev.filter((_, i) => i !== index));
  };

  const handleDiagnose = async () => {
    if (!symptoms || !auth.currentUser) return;
    try {
      await assertActiveAccess(auth.currentUser.uid, auth.currentUser.email);
    } catch (error) {
      await logoutFromAuth();
      alert(mapAuthError(error));
      return;
    }
    setDiagnoseError('');
    setLoading(true);
    try {
      const advice = await getVeterinaryAdvice(
        { species: patient.species, breed: patient.breed, weight: patient.weight },
        symptoms,
        exams
      );
      setResult(advice);
    } catch (error) {
      console.error('AI error:', error);
      const message = error instanceof Error ? error.message : 'Erro não tratado ao processar o diagnóstico. Tente novamente.';
      setDiagnoseError(message);
      alert(message);
    } finally {
      setLoading(false);
    }
  };

  const saveConsultation = async () => {
    if (!result || !auth.currentUser) return;
    try {
      await assertActiveAccess(auth.currentUser.uid, auth.currentUser.email);
    } catch (error) {
      await logoutFromAuth();
      alert(mapAuthError(error));
      return;
    }
    const consultationData = {
      patientId: patient.id,
      date: Timestamp.now(),
      symptoms,
      diagnosis: result.diagnosis,
      differentials: result.differentials,
      treatment: result.treatment,
      medications: result.medications,
      suggestedExams: result.suggestedExams,
      createdBy: auth.currentUser.uid,
    };
    const docRef = await addDoc(collection(db, 'consultations'), consultationData);
    onComplete({ id: docRef.id, ...consultationData } as Consultation);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>Voltar</Button>
        <h2 className="text-2xl font-bold text-slate-900">Nova Consulta</h2>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="font-bold text-slate-900">Anamnese e Sintomas</h3>
            <div className="mt-4 space-y-4">
              <div className="relative">
                <Textarea 
                  placeholder="Descreva os sintomas, comportamento e histórico recente do paciente..." 
                  className="min-h-[200px] pr-12"
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                />
                <div className="absolute bottom-3 right-3 flex items-center gap-3">
                  {isRecording && (
                    <div className="flex items-center gap-2 text-xs font-medium text-rose-600 bg-rose-50 px-2 py-1 rounded-md border border-rose-100">
                      Ouvindo...
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={isRecording ? stopRecording : startRecording}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full transition-all duration-300",
                      isRecording 
                        ? "bg-red-500 text-white animate-pulse shadow-lg shadow-red-200 scale-110" 
                        : "bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 shadow-sm"
                    )}
                    title={isRecording ? "Parar ditado" : "Ditar anamnese"}
                  >
                    {isRecording ? <Square className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                  </button>
                </div>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Anexar Exames (JPEG/PDF)</label>
                <div 
                  className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-8 transition-colors hover:bg-slate-50"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-8 w-8 text-slate-400" />
                  <p className="mt-2 text-sm text-slate-500">Clique para fazer upload de exames</p>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    multiple 
                    accept="image/*,application/pdf"
                    onChange={handleFileUpload}
                  />
                </div>
                
                {exams.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {exams.map((exam, i) => (
                      <div key={i} className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                        <span className="max-w-[100px] truncate">{exam.name}</span>
                        <button onClick={() => removeExam(i)} className="text-slate-400 hover:text-rose-500">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {diagnoseError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {diagnoseError}
                </div>
              )}

              <Button 
                className="w-full" 
                size="lg" 
                onClick={handleDiagnose}
                disabled={loading || !symptoms}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Gerando relatório (pode levar até 1 minuto)...
                  </>
                ) : (
                  <>
                    <ClipboardList className="mr-2 h-4 w-4" />
                    Gerar Diagnóstico e Tratamento
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          {result ? (
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-6 shadow-sm"
            >
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <h3 className="font-bold">Análise VetAI Concluída</h3>
              </div>
              
              <div className="mt-6 space-y-6">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Diagnóstico Mais Provável</h4>
                  <p className="mt-1 text-lg font-bold text-slate-900">{result.diagnosis}</p>
                </div>

                {result.differentials && result.differentials.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Diagnósticos Diferenciais</h4>
                    <div className="mt-2 space-y-3">
                      {result.differentials.map((diff, i) => (
                        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="font-bold text-slate-900">{i + 1}. {diff.disease}</p>
                            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                              {diff.likelihood}
                            </span>
                          </div>
                          <p className="mt-2 text-sm leading-relaxed text-slate-600">{diff.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Tratamento e esclarecimento</h4>
                  <p className="mt-1 text-xs text-slate-500">Conduta até a recuperação e o que fazer para descobrir qual hipótese é o problema real.</p>
                  <div className="prose prose-sm mt-2 text-slate-700">
                    <ReactMarkdown>{result.treatment}</ReactMarkdown>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Medicamentos da conduta ({patient.weight}kg)</h4>
                  <p className="mt-1 text-xs text-slate-500">Tudo que o tratamento pediu, com dose — sem limitar a um por hipótese.</p>
                  <div className="mt-2 space-y-3">
                    {(result.medications ?? []).map((med, i) => (
                      <div key={i} className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="font-bold text-emerald-700">{med.name}</div>
                          {med.forDiagnosis && (
                            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">
                              {med.forDiagnosis}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-slate-500">
                          <div><span className="font-medium text-slate-700">Dose:</span> {med.dosage}</div>
                          <div><span className="font-medium text-slate-700">Freq:</span> {med.frequency}</div>
                          <div><span className="font-medium text-slate-700">Duração:</span> {med.duration}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Exames para diferenciar as hipóteses</h4>
                  <p className="mt-1 text-xs text-slate-500">Cada exame deve ajudar a confirmar ou afastar uma das doenças acima.</p>
                  <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
                    {(result.suggestedExams ?? []).map((exam, i) => <li key={i}>{typeof exam === 'string' ? exam : String(exam)}</li>)}
                  </ul>
                </div>

                <AiClinicalDisclaimer />

                <Button className="w-full" onClick={saveConsultation}>
                  <Save className="mr-2 h-4 w-4" /> Salvar Consulta e Prontuário
                </Button>
              </div>
            </motion.div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center text-slate-400">
              <AlertCircle className="h-12 w-12 opacity-20" />
              <p className="mt-4">Aguardando análise dos sintomas para gerar diagnóstico.</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}