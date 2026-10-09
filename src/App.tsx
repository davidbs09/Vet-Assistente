import React, { useState, useEffect } from 'react';
import {
  auth, db, signOut, onAuthStateChanged,
  collection, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, Timestamp, serverTimestamp, User
} from './firebase';
import { AnimatePresence, motion } from 'framer-motion';
import LoginPage, { RegisterFormValues } from './components/LoginPage';
import AdminUsersPage from './components/AdminUsersPage';
import DeployGuideModal from './components/DeployGuideModal';
import NewConsultationView from './components/NewConsultationView';
import PrescriptionView from './components/PrescriptionView';
import ProntuarioView from './components/ProntuarioView';
import AppHeader from './components/layout/AppHeader';
import DashboardView from './components/patients/DashboardView';
import PatientDetailView from './components/patients/PatientDetailView';
import { AddPatientModal, DeletePatientModal, EditPatientModal } from './components/patients/PatientModals';
import { isValidPatientPhone, readPatientForm } from './components/patients/patientForm';
import {
  AppLoadingScreen,
  SessionCheckingScreen,
  SessionConflictScreen,
  SessionRevokedScreen,
} from './components/session/SessionScreens';
import {
  clearAuthToken,
  ensureUserProfile,
  getUserProfile,
  isAdminEmail,
  isAdminProfile,
  isAuthListenerQuiet,
  canAccessApp,
  assertActiveAccess,
  isPermissionDenied,
  loginWithEmail,
  logoutFromAuth,
  mapAuthError,
  persistAuthToken,
  registerWithEmail,
  completePasswordReset,
  isPasswordResetLogin,
  requestPasswordReset,
  requiresPasswordReset,
  UserProfile,
} from './services/authService';
import { handleFirestoreError, OperationType, testConnection } from './lib/firestoreErrors';
import { clearBrowserSession, getOrCreateSessionId, hasBrowserSession, markBrowserSession } from './lib/session';
import type { AppView, Consultation, Patient, SessionStatus } from './types/clinical';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>('checking');
  const [conflictDetails, setConflictDetails] = useState<{ email: string; lastActive?: Date } | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [view, setView] = useState<AppView>('dashboard');
  const [currentConsultation, setCurrentConsultation] = useState<Consultation | null>(null);
  const [isAddingPatient, setIsAddingPatient] = useState(false);
  const [isEditingPatient, setIsEditingPatient] = useState(false);
  const [savingPatient, setSavingPatient] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [patientToDelete, setPatientToDelete] = useState<Patient | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);
  const [passwordResetEmail, setPasswordResetEmail] = useState<string | null>(null);
  const [passwordResetNonce, setPasswordResetNonce] = useState(0);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [showDeployGuide, setShowDeployGuide] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

  const checkSession = async (currentUser: User) => {
    setCheckingConflict(true);
    setSessionError(null);
    try {
      const localSid = getOrCreateSessionId();
      const sessionRef = doc(db, 'userSessions', currentUser.uid);
      const snap = await getDoc(sessionRef);

      const now = Date.now();
      let hasConflict = false;
      let lastActiveDate: Date | undefined;

      if (snap.exists()) {
        const data = snap.data();
        const lastActiveMillis = data.lastActive?.toMillis 
          ? data.lastActive.toMillis() 
          : (data.updatedAt?.toMillis ? data.updatedAt.toMillis() : 0);
        
        // 45 seconds tolerance for active heartbeat
        const isRecent = (now - lastActiveMillis) < 45000;
        
        if (data.isActive && isRecent && data.sessionId && data.sessionId !== localSid) {
          hasConflict = true;
          if (lastActiveMillis > 0) {
            lastActiveDate = new Date(lastActiveMillis);
          }
        }
      }

      if (hasConflict) {
        setConflictDetails({
          email: currentUser.email || 'Usuário',
          lastActive: lastActiveDate
        });
        setSessionStatus('conflict');
        return;
      }

      // Claim single active session
      await setDoc(sessionRef, {
        sessionId: localSid,
        userId: currentUser.uid,
        email: currentUser.email,
        isActive: true,
        lastActive: serverTimestamp(),
        updatedAt: serverTimestamp(),
        deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web'
      }, { merge: true });

      markBrowserSession();
      setConflictDetails(null);
      setSessionStatus('active');
    } catch (err: any) {
      console.error('Error verifying session:', err);
      handleFirestoreError(err, OperationType.WRITE, 'userSessions');
      setSessionError('Não foi possível validar o login único. Tente novamente.');
      setSessionStatus('conflict');
    } finally {
      setCheckingConflict(false);
    }
  };

  const forceClaimSession = async () => {
    if (!user) return;
    setCheckingConflict(true);
    setSessionError(null);
    try {
      const localSid = getOrCreateSessionId();
      const sessionRef = doc(db, 'userSessions', user.uid);
      await setDoc(sessionRef, {
        sessionId: localSid,
        userId: user.uid,
        email: user.email,
        isActive: true,
        lastActive: serverTimestamp(),
        updatedAt: serverTimestamp(),
        deviceInfo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Web'
      });
      markBrowserSession();
      setConflictDetails(null);
      setSessionStatus('active');
    } catch (err: any) {
      console.error('Failed to force claim session:', err);
      setSessionError('Não foi possível transferir a sessão. Tente novamente.');
    } finally {
      setCheckingConflict(false);
    }
  };

  const recheckSession = async () => {
    if (!user) return;
    await checkSession(user);
  };

  useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (isAuthListenerQuiet()) {
        setLoading(false);
        return;
      }

      if (!u) {
        clearAuthToken();
        setUser(null);
        setUserProfile(null);
        setSessionStatus('checking');
        setConflictDetails(null);
        setLoading(false);
        return;
      }

      if (!hasBrowserSession()) {
        try {
          await updateDoc(doc(db, 'userSessions', u.uid), { isActive: false });
        } catch (_) {}
        await logoutFromAuth();
        clearBrowserSession();
        setUser(null);
        setUserProfile(null);
        setSessionStatus('checking');
        setConflictDetails(null);
        setLoginError(null);
        setLoading(false);
        return;
      }

      try {
        let profile = await getUserProfile(u.uid);
        if (!profile && isAdminEmail(u.email)) {
          profile = await ensureUserProfile(u);
        }

        if (!profile || !canAccessApp(profile, u.email)) {
          const resetRequired = requiresPasswordReset(profile);
          const blockedMessage = resetRequired
            ? null
            : profile?.status === 'revoked'
              ? 'Seu acesso foi removido pelo administrador. Solicite uma nova liberação.'
              : profile?.status === 'pending'
                ? 'Sua conta ainda está pendente de ativação pelo administrador.'
                : null;
          await logoutFromAuth();
          setUser(null);
          setUserProfile(null);
          setPasswordResetEmail(resetRequired ? (profile?.email || u.email || null) : null);
          if (resetRequired) setPasswordResetNonce((current) => current + 1);
          setLoginError(blockedMessage);
          setSessionStatus('checking');
          setLoading(false);
          return;
        }

        await persistAuthToken(u);
        setUser(u);
        setUserProfile(profile);
        setSessionStatus('checking');
        await checkSession(u);
      } catch (err) {
        console.error('Error restoring authenticated session:', err);
        try {
          await logoutFromAuth();
        } catch (_) {}
        setUser(null);
        setUserProfile(null);
        setSessionStatus('checking');
        setConflictDetails(null);
        setLoginError(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), async (snapshot) => {
      if (isAuthListenerQuiet()) return;

      if (!snapshot.exists()) {
        return;
      }

      const profile = { id: snapshot.id, ...snapshot.data() } as UserProfile;
      setUserProfile(profile);

      if (!canAccessApp(profile, user.email)) {
        const resetRequired = requiresPasswordReset(profile);
        try {
          const sessionRef = doc(db, 'userSessions', user.uid);
          await updateDoc(sessionRef, { isActive: false });
        } catch (_) {}
        clearBrowserSession();
        await logoutFromAuth();
        setUser(null);
        setUserProfile(null);
        setSessionStatus('checking');
        setView('dashboard');
        setPasswordResetEmail(resetRequired ? (profile.email || user.email || null) : null);
        if (resetRequired) setPasswordResetNonce((current) => current + 1);
        setLoginError(
          resetRequired
            ? null
            : profile.status === 'revoked'
              ? 'Seu acesso foi removido pelo administrador. Solicite uma nova liberação.'
              : 'Sua conta ainda está pendente de ativação pelo administrador.'
        );
      }
    }, (error) => {
      console.error('Profile listener error:', error);
    });

    return () => unsubscribeProfile();
  }, [user]);

  const dropBlockedAccess = async (message: string, resetEmail?: string | null) => {
    const emailForReset = resetEmail || (message.includes('senha foi resetada') ? (user?.email || userProfile?.email || null) : null);
    try {
      if (user) {
        await updateDoc(doc(db, 'userSessions', user.uid), { isActive: false });
      }
    } catch (_) {}
    clearBrowserSession();
    await logoutFromAuth();
    setUser(null);
    setUserProfile(null);
    setSessionStatus('checking');
    setConflictDetails(null);
    setView('dashboard');
    setSelectedPatient(null);
    setPasswordResetEmail(emailForReset);
    if (emailForReset) setPasswordResetNonce((current) => current + 1);
    setLoginError(emailForReset ? null : message);
  };

  const enforceAccessOnRequest = async () => {
    if (!user) throw new Error('Usuário não autenticado.');
    const profile = await assertActiveAccess(user.uid, user.email);
    setUserProfile(profile);
    return profile;
  };

  // Heartbeat & Real-time conflict enforcement
  useEffect(() => {
    if (!user || sessionStatus !== 'active') return;

    const sessionRef = doc(db, 'userSessions', user.uid);
    const localSid = getOrCreateSessionId();

    // 1. Send heartbeat every 15 seconds
    const heartbeatInterval = setInterval(async () => {
      try {
        const profile = await assertActiveAccess(user.uid, user.email);
        setUserProfile(profile);
        await updateDoc(sessionRef, {
          lastActive: serverTimestamp(),
          isActive: true
        });
      } catch (err) {
        const code = typeof err === 'object' && err && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
        if (
          isPermissionDenied(err)
          || code.startsWith('auth/account-')
          || code === 'auth/password-reset-required'
        ) {
          await dropBlockedAccess(
            mapAuthError(err),
            code === 'auth/password-reset-required' ? user.email : null
          );
          return;
        }
        console.error('Heartbeat update failed:', err);
      }
    }, 15000);

    // 2. Real-time listener: if another device/tab takes over or invalidates this session
    const unsubscribeSnapshot = onSnapshot(sessionRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.sessionId && data.sessionId !== localSid && data.isActive) {
          console.warn('Session revoked: another active session detected for this email');
          setSessionStatus('revoked');
          signOut(auth);
        }
      }
    }, async (error) => {
      if (isPermissionDenied(error)) {
        await dropBlockedAccess('Seu acesso foi removido pelo administrador. Solicite uma nova liberação.');
        return;
      }
      console.error('Session listener error:', error);
    });

    return () => {
      clearInterval(heartbeatInterval);
      unsubscribeSnapshot();
    };
  }, [user, sessionStatus]);

  // Handle beforeunload to gracefully mark inactive if closed
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (user && sessionStatus === 'active') {
        const sessionRef = doc(db, 'userSessions', user.uid);
        try {
          updateDoc(sessionRef, { isActive: false });
        } catch (_) {}
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user, sessionStatus]);

  useEffect(() => {
    if (!user || sessionStatus !== 'active') return;
    const q = query(collection(db, 'patients'), where('createdBy', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Patient));
      // Sort by createdAt descending
      docs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setPatients(docs);
      setSelectedPatient((current) => {
        if (!current) return current;
        const updated = docs.find((patient) => patient.id === current.id);
        if (!updated) return current;
        if (
          updated.name === current.name
          && updated.species === current.species
          && updated.breed === current.breed
          && updated.weight === current.weight
          && updated.sex === current.sex
          && updated.ownerName === current.ownerName
          && updated.ownerPhone === current.ownerPhone
        ) {
          return current;
        }
        return updated;
      });
    }, async (error) => {
      handleFirestoreError(error, OperationType.LIST, 'patients');
      if (isPermissionDenied(error)) {
        await dropBlockedAccess('Seu acesso foi removido pelo administrador. Solicite uma nova liberação.');
      }
    });
    return () => unsubscribe();
  }, [user, sessionStatus]);

  useEffect(() => {
    if (!selectedPatient || !user || sessionStatus !== 'active') return;
    const q = query(
      collection(db, 'consultations'), 
      where('patientId', '==', selectedPatient.id),
      where('createdBy', '==', user.uid)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Consultation));
      // Sort by date descending
      docs.sort((a, b) => (b.date?.seconds || 0) - (a.date?.seconds || 0));
      setConsultations(docs);
    }, async (error) => {
      handleFirestoreError(error, OperationType.LIST, 'consultations');
      if (isPermissionDenied(error)) {
        await dropBlockedAccess('Seu acesso foi removido pelo administrador. Solicite uma nova liberação.');
      }
    });
    return () => unsubscribe();
  }, [selectedPatient, user, sessionStatus]);

  const handleLogin = async (email: string, password: string) => {
    try {
      setAuthSubmitting(true);
      setLoginError(null);
      setLoginSuccess(null);
      setSessionStatus('checking');
      markBrowserSession();
      const result = await loginWithEmail(email, password);
      if (isPasswordResetLogin(result)) {
        clearBrowserSession();
        setPasswordResetEmail(result.email);
        setPasswordResetNonce((current) => current + 1);
        return;
      }
      setPasswordResetEmail(null);
      setUser(result.user);
      setUserProfile(result.profile);
    } catch (error: unknown) {
      console.error('Login error:', error);
      clearBrowserSession();
      setSessionStatus('checking');
      setLoginError(mapAuthError(error));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleCompletePasswordReset = async (email: string, password: string) => {
    try {
      setAuthSubmitting(true);
      setLoginError(null);
      setLoginSuccess(null);
      setSessionStatus('checking');
      markBrowserSession();
      const result = await completePasswordReset(email, password);
      setPasswordResetEmail(null);
      setUser(result.user);
      setUserProfile(result.profile);
    } catch (error: unknown) {
      console.error('Password reset complete error:', error);
      clearBrowserSession();
      setSessionStatus('checking');
      setLoginError(mapAuthError(error));
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleRequestPasswordReset = async (email: string) => {
    try {
      setAuthSubmitting(true);
      setLoginError(null);
      setLoginSuccess(null);
      await requestPasswordReset(email);
    } catch (error: unknown) {
      console.error('Password reset request error:', error);
      setLoginError(mapAuthError(error));
      throw error;
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleRegister = async (values: RegisterFormValues) => {
    try {
      setAuthSubmitting(true);
      setLoginError(null);
      setLoginSuccess(null);
      await registerWithEmail(values);
      setLoginSuccess(
        'Cadastro enviado. Você receberá um e-mail quando o administrador liberar o acesso.'
      );
    } catch (error: unknown) {
      console.error('Register error:', error);
      setLoginError(mapAuthError(error));
      throw error;
    } finally {
      setAuthSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (user) {
      try {
        const localSid = getOrCreateSessionId();
        const sessionRef = doc(db, 'userSessions', user.uid);
        const snap = await getDoc(sessionRef);
        if (snap.exists() && snap.data().sessionId === localSid) {
          await updateDoc(sessionRef, { isActive: false });
        }
      } catch (err) {
        console.error('Error updating session on logout:', err);
      }
    }
    clearBrowserSession();
    await logoutFromAuth();
    setUser(null);
    setUserProfile(null);
    setSessionStatus('checking');
    setConflictDetails(null);
    setLoginError(null);
    setLoginSuccess(null);
    setPasswordResetEmail(null);
    setView('dashboard');
    setSelectedPatient(null);
    setIsEditingPatient(false);
  };

  const addPatient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const form = e.currentTarget;
    try {
      await enforceAccessOnRequest();
    } catch (err) {
      await dropBlockedAccess(mapAuthError(err));
      return;
    }
    const fields = readPatientForm(form);
    if (!fields.sex) {
      alert('Informe o sexo do animal.');
      return;
    }
    if (!isValidPatientPhone(fields.ownerPhone)) {
      alert('Informe o telefone com DDD e número, só dígitos. Ex: 11964646464');
      return;
    }
    const newPatient = {
      ...fields,
      createdAt: Timestamp.now(),
      createdBy: user.uid,
    };
    try {
      await addDoc(collection(db, 'patients'), newPatient);
      setIsAddingPatient(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'patients');
      if (isPermissionDenied(err)) {
        alert('O Firestore bloqueou a criação do paciente. Publique o arquivo firestore.rules completo no Console (Firestore > Regras).');
        return;
      }
      alert(err instanceof Error ? err.message : 'Não foi possível criar o paciente.');
    }
  };

  const deletePatient = async (id: string) => {
    try {
      await enforceAccessOnRequest();
    } catch (err) {
      await dropBlockedAccess(mapAuthError(err));
      return;
    }
    await deleteDoc(doc(db, 'patients', id));
    setSelectedPatient(null);
    setPatientToDelete(null);
    setIsEditingPatient(false);
    setView('dashboard');
  };

  const updatePatient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !selectedPatient) return;
    const form = e.currentTarget;
    try {
      await enforceAccessOnRequest();
    } catch (err) {
      await dropBlockedAccess(mapAuthError(err));
      return;
    }
    const fields = readPatientForm(form);
    if (!fields.name || !fields.breed || !fields.ownerName || !fields.sex || Number.isNaN(fields.weight) || fields.weight <= 0) {
      alert('Preencha nome, sexo, raça, peso, proprietário e telefone para salvar a ficha.');
      return;
    }
    if (!isValidPatientPhone(fields.ownerPhone)) {
      alert('Informe o telefone com DDD e número, só dígitos. Ex: 11964646464');
      return;
    }
    setSavingPatient(true);
    try {
      await updateDoc(doc(db, 'patients', selectedPatient.id), fields);
      setSelectedPatient({ ...selectedPatient, ...fields });
      setIsEditingPatient(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'patients');
      if (isPermissionDenied(err)) {
        alert('O Firestore bloqueou a edição do paciente. Publique o arquivo firestore.rules completo no Console (Firestore > Regras).');
        return;
      }
      alert(err instanceof Error ? err.message : 'Não foi possível atualizar o paciente.');
    } finally {
      setSavingPatient(false);
    }
  };

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.ownerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return <AppLoadingScreen />;
  }

  if (sessionStatus === 'revoked') {
    return (
      <SessionRevokedScreen
        onReenter={() => {
          setSessionStatus('checking');
          setConflictDetails(null);
        }}
      />
    );
  }

  if (!user) {
    return (
      <>
        <LoginPage
          onLogin={handleLogin}
          onRegister={handleRegister}
          onCompletePasswordReset={handleCompletePasswordReset}
          onRequestPasswordReset={handleRequestPasswordReset}
          passwordResetEmail={passwordResetEmail}
          passwordResetNonce={passwordResetNonce}
          error={loginError}
          success={loginSuccess}
          submitting={authSubmitting}
        />

        {/* Deploy Guide Modal when logged out */}
        <AnimatePresence>
          {showDeployGuide && (
            <DeployGuideModal 
              onClose={() => setShowDeployGuide(false)} 
              copiedSnippet={copiedSnippet} 
              setCopiedSnippet={setCopiedSnippet} 
            />
          )}
        </AnimatePresence>
      </>
    );
  }

  if (sessionStatus === 'conflict') {
    return (
      <SessionConflictScreen
        email={conflictDetails?.email || user.email}
        lastActive={conflictDetails?.lastActive}
        sessionError={sessionError}
        checkingConflict={checkingConflict}
        onRecheck={recheckSession}
        onForceClaim={forceClaimSession}
        onLogout={handleLogout}
      />
    );
  }

  if (sessionStatus === 'checking') {
    return <SessionCheckingScreen email={user.email} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader
        displayName={userProfile?.displayName}
        email={user.email}
        isAdmin={isAdminProfile(userProfile, user.email)}
        onGoHome={() => { setView('dashboard'); setSelectedPatient(null); }}
        onOpenAdmin={() => setView('admin')}
        onOpenDeployGuide={() => setShowDeployGuide(true)}
        onLogout={handleLogout}
      />

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AnimatePresence mode="wait">
          {view === 'admin' && isAdminProfile(userProfile, user.email) && (
            <motion.div
              key="admin"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              <AdminUsersPage currentUserId={user.uid} />
            </motion.div>
          )}

          {view === 'dashboard' && (
            <DashboardView
              key="dashboard"
              patients={filteredPatients}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              onAddPatient={() => setIsAddingPatient(true)}
              onSelectPatient={(patient) => { setSelectedPatient(patient); setView('patient'); }}
            />
          )}

          {view === 'patient' && selectedPatient && (
            <PatientDetailView
              key="patient"
              patient={selectedPatient}
              consultations={consultations}
              onBack={() => setView('dashboard')}
              onEdit={() => setIsEditingPatient(true)}
              onDelete={() => setPatientToDelete(selectedPatient)}
              onNewConsultation={() => setView('new-consultation')}
              onPrintRecord={() => setView('prontuario')}
              onOpenPrescription={(consultation) => { setCurrentConsultation(consultation); setView('prescription'); }}
            />
          )}

          {view === 'new-consultation' && selectedPatient && (
            <NewConsultationView 
              patient={selectedPatient} 
              onBack={() => setView('patient')} 
              onComplete={(consultation) => {
                setCurrentConsultation(consultation);
                setView('patient');
              }}
            />
          )}

          {view === 'prescription' && currentConsultation && selectedPatient && (
            <PrescriptionView 
              consultation={currentConsultation} 
              patient={selectedPatient} 
              onBack={() => setView('patient')} 
            />
          )}

          {view === 'prontuario' && selectedPatient && (
            <ProntuarioView 
              patient={selectedPatient} 
              consultations={consultations} 
              onBack={() => setView('patient')} 
            />
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {isAddingPatient && (
          <AddPatientModal
            onClose={() => setIsAddingPatient(false)}
            onSubmit={addPatient}
          />
        )}
        {isEditingPatient && selectedPatient && (
          <EditPatientModal
            patient={selectedPatient}
            saving={savingPatient}
            onClose={() => setIsEditingPatient(false)}
            onSubmit={updatePatient}
          />
        )}
        {patientToDelete && (
          <DeletePatientModal
            patient={patientToDelete}
            onClose={() => setPatientToDelete(null)}
            onConfirm={() => deletePatient(patientToDelete.id)}
          />
        )}

        {/* Deploy Guide Modal when logged in */}
        {showDeployGuide && (
          <DeployGuideModal 
            onClose={() => setShowDeployGuide(false)} 
            copiedSnippet={copiedSnippet} 
            setCopiedSnippet={setCopiedSnippet} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}
