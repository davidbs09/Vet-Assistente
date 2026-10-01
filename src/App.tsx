import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, db, signOut, onAuthStateChanged, 
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, 
  query, where, orderBy, onSnapshot, Timestamp, serverTimestamp, User 
} from './firebase';
import { getDocFromServer } from 'firebase/firestore';
import { getVeterinaryAdvice, DiagnosisResult, transcribeAudio } from './services/geminiService';
import { 
  Plus, Search, LogOut, User as UserIcon, Dog, Cat, FileText, 
  Printer, History, Upload, ChevronRight, Save, Trash2, X, 
  AlertCircle, CheckCircle2, Loader2, FilePlus, ClipboardList,
  Mic, Square, ShieldAlert, Lock, RefreshCw,
  Globe, Copy, Check, ExternalLink, Code2, Server, HelpCircle, ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import LoginPage, { RegisterFormValues } from './components/LoginPage';
import AdminUsersPage from './components/AdminUsersPage';
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
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SESSION_ID_COOKIE = 'vetai_session_id';
const SESSION_ALIVE_COOKIE = 'vetai_alive';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const found = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

function writeSessionCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

function clearSessionCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0`;
}

function hasBrowserSession(): boolean {
  return Boolean(readCookie(SESSION_ALIVE_COOKIE) && readCookie(SESSION_ID_COOKIE));
}

function markBrowserSession(): void {
  writeSessionCookie(SESSION_ALIVE_COOKIE, '1');
  getOrCreateSessionId();
}

function clearBrowserSession(): void {
  clearSessionCookie(SESSION_ALIVE_COOKIE);
  clearSessionCookie(SESSION_ID_COOKIE);
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('vetai_session_id');
  }
}

function getOrCreateSessionId(): string {
  let sid = readCookie(SESSION_ID_COOKIE);
  if (!sid && typeof sessionStorage !== 'undefined') {
    sid = sessionStorage.getItem('vetai_session_id');
  }
  if (!sid) {
    sid = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'sess_' + Math.random().toString(36).substring(2) + '_' + Date.now();
  }
  writeSessionCookie(SESSION_ID_COOKIE, sid);
  return sid;
}

// --- Types ---

interface Patient {
  id: string;
  name: string;
  species: 'dog' | 'cat';
  breed: string;
  weight: number;
  ownerName: string;
  ownerPhone: string;
  createdAt: any;
  createdBy: string;
}

interface Consultation {
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

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger', size?: 'sm' | 'md' | 'lg' }>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
      secondary: 'bg-slate-800 text-white hover:bg-slate-900 shadow-sm',
      outline: 'border border-slate-200 bg-transparent hover:bg-slate-50 text-slate-700',
      ghost: 'bg-transparent hover:bg-slate-100 text-slate-600',
      danger: 'bg-rose-500 text-white hover:bg-rose-600 shadow-sm',
    };
    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base',
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:pointer-events-none disabled:opacity-50',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  // We don't throw here to avoid crashing the whole app, but we log it clearly
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error) {
      if (error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration. ");
      } else if (error.message.includes('permission-denied')) {
        // Ignore permission-denied for the test connection as it might happen before rules propagate
        // or if the collection doesn't exist yet
        console.log("Test connection: permission-denied (expected if rules are still propagating)");
      }
    }
  }
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionStatus, setSessionStatus] = useState<'checking' | 'active' | 'conflict' | 'revoked'>('checking');
  const [conflictDetails, setConflictDetails] = useState<{ email: string; lastActive?: Date } | null>(null);
  const [checkingConflict, setCheckingConflict] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [consultations, setConsultations] = useState<Consultation[]>([]);
  const [view, setView] = useState<'dashboard' | 'patient' | 'new-consultation' | 'prescription' | 'prontuario' | 'admin'>('dashboard');
  const [currentConsultation, setCurrentConsultation] = useState<Consultation | null>(null);
  const [isAddingPatient, setIsAddingPatient] = useState(false);
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
        'Cadastro enviado. Sua conta ficará pendente até o administrador autorizar o acesso.'
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
    const formData = new FormData(form);
    const newPatient = {
      name: formData.get('name') as string,
      species: formData.get('species') as 'dog' | 'cat',
      breed: formData.get('breed') as string,
      weight: parseFloat(formData.get('weight') as string),
      ownerName: formData.get('ownerName') as string,
      ownerPhone: formData.get('ownerPhone') as string,
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
    setView('dashboard');
  };

  const filteredPatients = patients.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    p.ownerName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (sessionStatus === 'revoked') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md space-y-6 rounded-2xl bg-white p-8 shadow-xl border border-amber-200"
        >
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
              <ShieldAlert className="h-8 w-8 text-amber-600" />
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
              <Lock className="h-3.5 w-3.5" /> Sessão Finalizada
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">Sessão Desconectada</h2>
            <p className="mt-2 text-sm text-slate-600">
              Sua sessão foi desconectada porque este mesmo e-mail foi autenticado em outro dispositivo ou navegador.
            </p>
          </div>

          <div className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800 border border-amber-200 space-y-1.5">
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              Regra de Segurança: Login Exclusivo
            </div>
            <p>
              O sistema VetAI não permite logins simultâneos com o mesmo e-mail para preservar a integridade dos prontuários e diagnósticos.
            </p>
          </div>

          <Button 
            onClick={() => {
              setSessionStatus('checking');
              setConflictDetails(null);
            }} 
            className="w-full" 
            size="lg"
          >
            Entrar Novamente
          </Button>
        </motion.div>
      </div>
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg space-y-6 rounded-2xl bg-white p-8 shadow-xl border border-rose-200"
        >
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-rose-100">
              <ShieldAlert className="h-8 w-8 text-rose-600" />
            </div>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
              <Lock className="h-3.5 w-3.5" /> Login Simultâneo Bloqueado
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
              Sessão Já Ativa para Este E-mail
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              O e-mail <strong className="text-slate-900">{conflictDetails?.email || user.email}</strong> já possui uma sessão ativa em outro dispositivo, navegador ou aba neste momento.
            </p>
          </div>

          <div className="space-y-2.5 rounded-xl bg-slate-50 p-4 border border-slate-200 text-sm text-slate-600">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-500">Política de Acesso:</span>
              <span className="rounded bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">1 Login por E-mail</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-500">Status da Sessão Concorrente:</span>
              <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                Ativa e comunicando
              </span>
            </div>
            {conflictDetails?.lastActive && (
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-500">Última pulsação registrada:</span>
                <span className="font-mono text-slate-700">{conflictDetails.lastActive.toLocaleTimeString('pt-BR')}</span>
              </div>
            )}
            <p className="text-xs text-slate-500 pt-2 border-t border-slate-200 leading-relaxed">
              Para preservar a confidencialidade e integridade dos dados, você não pode operar a mesma conta em dois lugares ao mesmo tempo.
            </p>
          </div>

          {sessionError && (
            <div className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700 border border-rose-200">
              {sessionError}
            </div>
          )}

          <div className="space-y-3">
            <Button 
              onClick={recheckSession} 
              variant="outline" 
              className="w-full flex items-center justify-center gap-2"
              disabled={checkingConflict}
            >
              {checkingConflict ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Verificar se a outra sessão foi fechada
            </Button>

            <Button 
              onClick={forceClaimSession} 
              className="w-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2 shadow-sm"
              disabled={checkingConflict}
            >
              {checkingConflict ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              Desconectar outra sessão e acessar aqui
            </Button>

            <Button 
              onClick={handleLogout} 
              variant="ghost" 
              className="w-full text-slate-500 hover:text-slate-700"
            >
              Cancelar e Sair da Conta
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (sessionStatus === 'checking') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        <p className="mt-3 text-sm font-medium text-slate-600">Verificando exclusividade da sessão para {user.email}...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-10 border-bottom border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => { setView('dashboard'); setSelectedPatient(null); }}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
              <Dog className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-900 hidden sm:block">VetAI</span>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowDeployGuide(true)}
              className="hidden md:flex items-center gap-1.5 rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition-colors cursor-pointer border border-slate-200"
              title="Guia de Implantação e Domínio www.ajudavoce.com.br"
            >
              <Globe className="h-3.5 w-3.5 text-emerald-600" />
              <span>ajudavoce.com.br</span>
            </button>

            <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Login Único Ativo</span>
            </div>

            {isAdminProfile(userProfile, user.email) && (
              <button
                type="button"
                onClick={() => setView('admin')}
                className="hidden sm:flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-slate-800 cursor-pointer"
              >
                Acessos
              </button>
            )}

            <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
                {(userProfile?.displayName || user.email || 'U').slice(0, 1).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-slate-700 hidden sm:block">
                {userProfile?.displayName || user.email}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

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
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-6"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Pacientes</h2>
                  <p className="text-sm text-slate-500">Gerencie seus pacientes e consultas.</p>
                </div>
                <Button onClick={() => setIsAddingPatient(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Novo Paciente
                </Button>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input 
                  placeholder="Buscar por nome do paciente ou proprietário..." 
                  className="pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredPatients.map((patient) => (
                  <motion.div
                    key={patient.id}
                    whileHover={{ y: -4 }}
                    className="group cursor-pointer rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:border-emerald-200 hover:shadow-md"
                    onClick={() => { setSelectedPatient(patient); setView('patient'); }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 group-hover:bg-emerald-50">
                        {patient.species === 'dog' ? (
                          <Dog className="h-6 w-6 text-slate-400 group-hover:text-emerald-600" />
                        ) : (
                          <Cat className="h-6 w-6 text-slate-400 group-hover:text-emerald-600" />
                        )}
                      </div>
                      <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-emerald-500" />
                    </div>
                    <div className="mt-4">
                      <h3 className="font-bold text-slate-900">{patient.name}</h3>
                      <p className="text-sm text-slate-500">{patient.breed} • {patient.weight}kg</p>
                    </div>
                    <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-400">
                      <UserIcon className="h-3 w-3" />
                      <span>{patient.ownerName}</span>
                    </div>
                  </motion.div>
                ))}
                {filteredPatients.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                    <History className="h-12 w-12 text-slate-300" />
                    <h3 className="mt-4 text-lg font-medium text-slate-900">Nenhum paciente encontrado</h3>
                    <p className="mt-1 text-sm text-slate-500">Comece adicionando seu primeiro paciente.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'patient' && selectedPatient && (
            <motion.div
              key="patient"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" onClick={() => setView('dashboard')}>
                  Voltar
                </Button>
                <div className="h-4 w-px bg-slate-200" />
                <h2 className="text-2xl font-bold text-slate-900">Prontuário: {selectedPatient.name}</h2>
              </div>

              <div className="grid gap-8 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-1">
                  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-slate-900">Informações</h3>
                      <Button variant="ghost" size="sm" onClick={() => setPatientToDelete(selectedPatient)}>
                        <Trash2 className="h-4 w-4 text-rose-500" />
                      </Button>
                    </div>
                    <div className="mt-6 space-y-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Espécie</span>
                        <span className="font-medium capitalize">{selectedPatient.species === 'dog' ? 'Cão' : 'Gato'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Raça</span>
                        <span className="font-medium">{selectedPatient.breed}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Peso</span>
                        <span className="font-medium text-emerald-600">{selectedPatient.weight} kg</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Proprietário</span>
                        <span className="font-medium">{selectedPatient.ownerName}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Telefone</span>
                        <span className="font-medium">{selectedPatient.ownerPhone}</span>
                      </div>
                    </div>
                    <div className="mt-8 flex flex-col gap-2">
                      <Button className="w-full" onClick={() => setView('new-consultation')}>
                        <FilePlus className="mr-2 h-4 w-4" /> Nova Consulta
                      </Button>
                      <Button variant="outline" className="w-full" onClick={() => setView('prontuario')}>
                        <Printer className="mr-2 h-4 w-4" /> Imprimir Prontuário
                      </Button>
                      <Button variant="danger" className="w-full mt-2" onClick={() => setPatientToDelete(selectedPatient)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Deletar Ficha do Animal
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-6 lg:col-span-2">
                  <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                    <History className="h-5 w-5 text-emerald-600" />
                    Histórico de Consultas
                  </h3>
                  <div className="space-y-4">
                    {consultations.map((consultation) => (
                      <div key={consultation.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-slate-500">
                            {new Date(consultation.date.seconds * 1000).toLocaleDateString('pt-BR')}
                          </span>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => { setCurrentConsultation(consultation); setView('prescription'); }}>
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-4 space-y-2">
                          <h4 className="font-bold text-slate-900">{consultation.diagnosis}</h4>
                          <p className="text-sm text-slate-600 line-clamp-2">{consultation.symptoms}</p>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          {consultation.medications.map((med, i) => (
                            <span key={i} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                              {med.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                    {consultations.length === 0 && (
                      <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 py-12 text-center">
                        <p className="text-sm text-slate-500">Nenhuma consulta registrada.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
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

      {/* Add Patient Modal */}
      <AnimatePresence>
        {isAddingPatient && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setIsAddingPatient(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900">Novo Paciente</h2>
                <Button variant="ghost" size="sm" onClick={() => setIsAddingPatient(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <form onSubmit={addPatient} className="mt-6 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Nome do Paciente</label>
                  <Input name="name" required placeholder="Ex: Rex" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Espécie</label>
                    <select name="species" className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                      <option value="dog">Cão</option>
                      <option value="cat">Gato</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Peso (kg)</label>
                    <Input name="weight" type="number" step="0.1" required placeholder="Ex: 10.5" />
                  </div>
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
                  <Input name="ownerPhone" required placeholder="(00) 00000-0000" />
                </div>
                <Button type="submit" className="w-full mt-4">
                  Salvar Paciente
                </Button>
              </form>
            </motion.div>
          </div>
        )}
        {patientToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setPatientToDelete(null)}
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
                <Button variant="ghost" size="sm" onClick={() => setPatientToDelete(null)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="mt-4">
                <p className="text-sm text-slate-600">
                  Tem certeza de que deseja excluir a ficha do paciente <strong className="text-slate-900">{patientToDelete.name}</strong>?
                </p>
                <div className="mt-2 text-xs text-rose-600 bg-rose-50 border border-rose-100 p-3 rounded-lg flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
                  <span>
                    Esta ação é permanente e todos os dados associados a esta ficha serão apagados definitivamente do banco de dados.
                  </span>
                </div>
              </div>
              <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
                <Button variant="outline" onClick={() => setPatientToDelete(null)}>
                  Cancelar
                </Button>
                <Button variant="danger" onClick={() => deletePatient(patientToDelete.id)}>
                  Sim, Excluir Ficha
                </Button>
              </div>
            </motion.div>
          </div>
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

// --- Deploy Guide Modal ---

function DeployGuideModal({ 
  onClose, 
  copiedSnippet, 
  setCopiedSnippet 
}: { 
  onClose: () => void; 
  copiedSnippet: string | null; 
  setCopiedSnippet: (val: string | null) => void;
}) {
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isTargetDomain = currentHostname.includes('ajudavoce.com.br');

  const copyToClipboard = (text: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedSnippet(label);
      setTimeout(() => setCopiedSnippet(null), 3000);
    }
  };

  const iframeCode = `<iframe 
  src="${typeof window !== 'undefined' ? window.location.origin : 'https://www.ajudavoce.com.br'}" 
  width="100%" 
  height="900" 
  style="border: none; border-radius: 12px; width: 100%; min-height: 800px;" 
  allow="microphone; camera; clipboard-write; fullscreen">
</iframe>`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 sm:p-8 shadow-2xl space-y-6"
      >
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Implantação em www.ajudavoce.com.br</h2>
              <p className="text-xs text-slate-500">Guia de configuração para execução no seu domínio</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Current status banner */}
        <div className={cn(
          "rounded-xl p-4 border text-xs flex items-start gap-3",
          isTargetDomain 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : "bg-slate-50 border-slate-200 text-slate-700"
        )}>
          {isTargetDomain ? (
            <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <Globe className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-semibold text-slate-900">
              {isTargetDomain ? "Você já está acessando pelo seu domínio oficial!" : "Ambiente Atual: " + (currentHostname || "Local / Pré-visualização")}
            </div>
            <p className="text-slate-600">
              Domínio de destino: <strong className="text-slate-900">www.ajudavoce.com.br</strong> e <strong className="text-slate-900">ajudavoce.com.br</strong>
            </p>
          </div>
        </div>

        {/* Step 1: Firebase Auth Authorized Domains */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-amber-950">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-900">1</span>
              Autorizar Domínio no Firebase Authentication (Obrigatório)
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
              Essencial para Login
            </span>
          </div>
          <p className="text-xs text-amber-900/90 leading-relaxed">
            O Google exige que todo domínio que utilize o Login do Google esteja cadastrado na lista de domínios permitidos do Firebase. Sem este passo, o login retornará o erro <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">auth/unauthorized-domain</code>.
          </p>
          <div className="rounded-lg bg-white p-3 border border-amber-200 text-xs space-y-2">
            <div className="font-medium text-slate-800">Como autorizar em 1 minuto:</div>
            <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1">
              <li>Acesse o <strong>Firebase Console</strong> (console.firebase.google.com).</li>
              <li>Entre no projeto e clique em <strong>Authentication</strong> no menu lateral.</li>
              <li>Acesse a aba <strong>Settings (Configurações)</strong> e role até <strong>Authorized domains (Domínios Autorizados)</strong>.</li>
              <li>Clique em <strong>Adicionar domínio</strong> e insira separadamente:</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="rounded bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 border border-slate-200">
                ajudavoce.com.br
              </span>
              <span className="rounded bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 border border-slate-200">
                www.ajudavoce.com.br
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard('ajudavoce.com.br, www.ajudavoce.com.br', 'domains')}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors cursor-pointer"
              >
                {copiedSnippet === 'domains' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedSnippet === 'domains' ? 'Copiados!' : 'Copiar Domínios'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Step 2: Deployment options */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">2</span>
            Escolha Como Deseja Publicar no seu Domínio
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Option A */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-xs text-slate-900">
                <Server className="h-4 w-4 text-emerald-600" />
                Opção A: Hospedagem Direta dos Arquivos
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Gere os arquivos otimizados rodando <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">npm run build</code>. 
                Envie o conteúdo da pasta <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">dist/</code> para a raiz pública (<code className="font-mono">public_html</code>) de sua hospedagem no domínio <strong>www.ajudavoce.com.br</strong> (cPanel, Hostinger, Vercel, Apache, etc.).
              </p>
            </div>

            {/* Option B */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-xs text-slate-900">
                <Code2 className="h-4 w-4 text-emerald-600" />
                Opção B: Iframe em Página Existente
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Se você já possui um site (WordPress, Wix, etc.) e deseja incorporar este aplicativo dentro de uma página (ex: <code className="font-mono">ajudavoce.com.br/vet</code>), use a tag abaixo.
              </p>
            </div>
          </div>

          {/* Iframe snippet box */}
          <div className="rounded-xl border border-slate-200 bg-slate-900 p-3.5 text-xs text-slate-200 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-mono text-[11px]">Código para Iframe com Permissão de Microfone:</span>
              <button
                type="button"
                onClick={() => copyToClipboard(iframeCode, 'iframe')}
                className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-2 py-1 text-slate-200 text-[11px] transition-colors cursor-pointer"
              >
                {copiedSnippet === 'iframe' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedSnippet === 'iframe' ? 'Copiado!' : 'Copiar Código'}</span>
              </button>
            </div>
            <pre className="overflow-x-auto text-[11px] font-mono text-emerald-400 leading-relaxed p-2 bg-slate-950 rounded">
              {iframeCode}
            </pre>
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800">
              O atributo <code className="text-amber-300">allow="microphone; camera; clipboard-write"</code> garante que o recurso de gravação de áudio e anamnese por voz funcione sem bloqueios no seu site.
            </p>
          </div>
        </div>

        {/* Step 3: Security checks */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <ShieldAlert className="h-4 w-4 text-emerald-600" />
            Recursos Ativos e Protegidos no Domínio
          </div>
          <ul className="grid gap-1 sm:grid-cols-2 list-inside list-disc">
            <li>Banco de Dados Firestore em nuvem conectado</li>
            <li>Regras de segurança com isolamento por usuário</li>
            <li>Proteção de Login Único por e-mail ativa</li>
            <li>IA Gemini com literatura renomada e dosagem exata</li>
          </ul>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <Button onClick={onClose} className="px-6">
            Entendido
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// --- Sub-Views ---

function NewConsultationView({ patient, onBack, onComplete }: { patient: Patient, onBack: () => void, onComplete: (c: Consultation) => void }) {
  const [symptoms, setSymptoms] = useState('');
  const [loading, setLoading] = useState(false);
  const [diagnoseError, setDiagnoseError] = useState('');
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [exams, setExams] = useState<{ data: string; mimeType: string; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await handleAudioTranscription(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      alert("Erro ao acessar o microfone. Verifique as permissões.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleAudioTranscription = async (blob: Blob) => {
    setIsTranscribing(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        try {
          const base64Audio = (reader.result as string).split(',')[1];
          const transcription = await transcribeAudio(base64Audio, blob.type);
          if (transcription) {
            setSymptoms(prev => prev ? `${prev}\n${transcription}` : transcription);
          }
        } catch (error) {
          console.error("Transcription error:", error);
          alert(error instanceof Error ? error.message : "Erro ao transcrever áudio.");
        } finally {
          setIsTranscribing(false);
        }
      };
      reader.onerror = () => {
        setIsTranscribing(false);
        alert("Não foi possível ler o áudio gravado.");
      };
    } catch (error) {
      console.error("Transcription error:", error);
      setIsTranscribing(false);
      alert(error instanceof Error ? error.message : "Erro ao transcrever áudio.");
    }
  };

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
                  {isTranscribing && (
                    <div className="flex items-center gap-2 text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Processando áudio...
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
                    title={isRecording ? "Parar Gravação" : "Gravar Áudio"}
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
                    Consultando o Claude (pode levar 1 a 2 min)...
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
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Tratamento Recomendado</h4>
                  <div className="prose prose-sm mt-2 text-slate-700">
                    <ReactMarkdown>{result.treatment}</ReactMarkdown>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Medicamentos e Doses (Baseado em {patient.weight}kg)</h4>
                  <div className="mt-2 space-y-3">
                    {(result.medications ?? []).map((med, i) => (
                      <div key={i} className="rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
                        <div className="font-bold text-emerald-700">{med.name}</div>
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
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Exames Complementares Sugeridos</h4>
                  <ul className="mt-2 list-inside list-disc text-sm text-slate-700">
                    {(result.suggestedExams ?? []).map((exam, i) => <li key={i}>{typeof exam === 'string' ? exam : String(exam)}</li>)}
                  </ul>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Fontes Bibliográficas e Bases de Dados</h4>
                  <ul className="mt-2 list-inside list-disc text-xs text-slate-500">
                    {(result.sources ?? []).map((source, i) => <li key={i}>{typeof source === 'string' ? source : String(source)}</li>)}
                  </ul>
                </div>

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

function PrescriptionView({ consultation, patient, onBack }: { consultation: Consultation, patient: Patient, onBack: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Receituário - ${patient.name}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; }
            .header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 40px; }
            .patient-info { margin-bottom: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .medication { margin-bottom: 30px; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; }
            .med-name { font-size: 1.2rem; font-weight: bold; color: #065f46; margin-bottom: 10px; }
            .med-details { font-size: 0.9rem; color: #4b5563; }
            .footer { margin-top: 80px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px; font-size: 0.8rem; color: #9ca3af; }
            .signature { margin-top: 60px; text-align: center; }
            .sig-line { width: 200px; border-top: 1px solid #333; margin: 0 auto 10px; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Receituário Veterinário</h1>
            <p>VetAI Assistant - Inteligência Artificial Clínica</p>
          </div>
          <div class="patient-info">
            <div>
              <strong>Paciente:</strong> ${patient.name}<br>
              <strong>Espécie:</strong> ${patient.species === 'dog' ? 'Cão' : 'Gato'}<br>
              <strong>Peso:</strong> ${patient.weight} kg
            </div>
            <div style="text-align: right;">
              <strong>Data:</strong> ${new Date(consultation.date.seconds * 1000).toLocaleDateString('pt-BR')}<br>
              <strong>Proprietário:</strong> ${patient.ownerName}
            </div>
          </div>
          <div class="content">
            ${consultation.medications.map(med => `
              <div class="medication">
                <div class="med-name">${med.name}</div>
                <div class="med-details">
                  <strong>Dose:</strong> ${med.dosage}<br>
                  <strong>Frequência:</strong> ${med.frequency}<br>
                  <strong>Duração:</strong> ${med.duration}
                </div>
              </div>
            `).join('')}
          </div>
          <div class="signature">
            <div class="sig-line"></div>
            <p>Médico Veterinário</p>
          </div>
          <div class="footer">
            Documento gerado eletronicamente via VetAI Assistant.
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>Voltar</Button>
          <h2 className="text-2xl font-bold text-slate-900">Receituário</h2>
        </div>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir Receita
        </Button>
      </div>

      <div ref={printRef} className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-12 shadow-sm">
        <div className="text-center">
          <Dog className="mx-auto h-12 w-12 text-emerald-600" />
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Receituário Veterinário</h1>
          <div className="mt-2 h-1 w-24 mx-auto bg-emerald-600 rounded-full" />
        </div>

        <div className="mt-12 grid grid-cols-2 gap-8 text-sm">
          <div className="space-y-2">
            <p><span className="text-slate-500">Paciente:</span> <span className="font-bold">{patient.name}</span></p>
            <p><span className="text-slate-500">Espécie:</span> <span className="font-bold capitalize">{patient.species === 'dog' ? 'Cão' : 'Gato'}</span></p>
            <p><span className="text-slate-500">Peso:</span> <span className="font-bold">{patient.weight} kg</span></p>
          </div>
          <div className="space-y-2 text-right">
            <p><span className="text-slate-500">Data:</span> <span className="font-bold">{new Date(consultation.date.seconds * 1000).toLocaleDateString('pt-BR')}</span></p>
            <p><span className="text-slate-500">Proprietário:</span> <span className="font-bold">{patient.ownerName}</span></p>
          </div>
        </div>

        <div className="mt-12 space-y-8">
          {consultation.medications.map((med, i) => (
            <div key={i} className="border-l-4 border-emerald-500 pl-6">
              <h3 className="text-lg font-bold text-emerald-900">{med.name}</h3>
              <div className="mt-2 space-y-1 text-sm text-slate-600">
                <p><strong>Dose:</strong> {med.dosage}</p>
                <p><strong>Frequência:</strong> {med.frequency}</p>
                <p><strong>Duração:</strong> {med.duration}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-24 text-center">
          <div className="mx-auto h-px w-48 bg-slate-300" />
          <p className="mt-4 text-sm font-medium text-slate-500">Assinatura do Médico Veterinário</p>
        </div>
      </div>
    </div>
  );
}

function ProntuarioView({ patient, consultations, onBack }: { patient: Patient, consultations: Consultation[], onBack: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Prontuário - ${patient.name}</title>
          <style>
            body { font-family: sans-serif; padding: 40px; color: #333; line-height: 1.5; }
            .header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 40px; }
            .patient-card { background: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 40px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .consultation { margin-bottom: 40px; border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; }
            .cons-date { font-weight: bold; color: #059669; margin-bottom: 10px; }
            .cons-diag { font-size: 1.1rem; font-weight: bold; margin-bottom: 10px; }
            .section-title { font-size: 0.8rem; font-weight: bold; text-transform: uppercase; color: #6b7280; margin-top: 15px; }
            .footer { margin-top: 80px; text-align: center; font-size: 0.8rem; color: #9ca3af; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Prontuário Veterinário Completo</h1>
            <p>VetAI Assistant - Histórico Clínico</p>
          </div>
          <div class="patient-card">
            <div>
              <strong>Paciente:</strong> ${patient.name}<br>
              <strong>Espécie:</strong> ${patient.species === 'dog' ? 'Cão' : 'Gato'}<br>
              <strong>Raça:</strong> ${patient.breed}
            </div>
            <div style="text-align: right;">
              <strong>Peso:</strong> ${patient.weight} kg<br>
              <strong>Proprietário:</strong> ${patient.ownerName}<br>
              <strong>Telefone:</strong> ${patient.ownerPhone}
            </div>
          </div>
          <h2>Histórico de Consultas</h2>
          ${consultations.map(c => `
            <div class="consultation">
              <div class="cons-date">${new Date(c.date.seconds * 1000).toLocaleDateString('pt-BR')}</div>
              <div class="cons-diag">${c.diagnosis}</div>
              ${c.differentials && c.differentials.length ? `
              <div class="section-title">Diagnósticos diferenciais</div>
              <ul>
                ${c.differentials.map(d => `<li><strong>${d.disease}</strong>${d.likelihood ? ` (${d.likelihood})` : ''}: ${d.reasoning}</li>`).join('')}
              </ul>` : ''}
              <div class="section-title">Sintomas</div>
              <p>${c.symptoms}</p>
              <div class="section-title">Tratamento</div>
              <p>${c.treatment}</p>
              <div class="section-title">Medicamentos</div>
              <ul>
                ${c.medications.map(m => `<li>${m.name}: ${m.dosage} - ${m.frequency} (${m.duration})</li>`).join('')}
              </ul>
            </div>
          `).join('')}
          <div class="footer">
            Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}.
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack}>Voltar</Button>
          <h2 className="text-2xl font-bold text-slate-900">Prontuário Completo</h2>
        </div>
        <Button onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" /> Imprimir Prontuário
        </Button>
      </div>

      <div ref={printRef} className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-12 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">{patient.name}</h1>
            <p className="text-slate-500">{patient.species === 'dog' ? 'Cão' : 'Gato'} • {patient.breed}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-slate-500">Proprietário</p>
            <p className="text-lg font-bold text-slate-900">{patient.ownerName}</p>
          </div>
        </div>

        <div className="mt-12 space-y-12">
          {consultations.map((c, i) => (
            <div key={c.id} className="relative pl-8">
              <div className="absolute left-0 top-0 h-full w-px bg-slate-100" />
              <div className="absolute left-[-4px] top-2 h-2 w-2 rounded-full bg-emerald-500" />
              
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-emerald-600">
                  {new Date(c.date.seconds * 1000).toLocaleDateString('pt-BR')}
                </span>
              </div>
              
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{c.diagnosis}</h3>
                  {c.differentials && c.differentials.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Diagnósticos diferenciais</h4>
                      {c.differentials.map((diff, d) => (
                        <p key={d} className="text-sm text-slate-600">
                          <span className="font-semibold text-slate-800">{diff.disease}</span>
                          {diff.likelihood ? ` (${diff.likelihood})` : ''}: {diff.reasoning}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                
                <div className="grid gap-8 md:grid-cols-2">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Sintomas</h4>
                    <p className="mt-2 text-sm text-slate-600">{c.symptoms}</p>
                    
                    {c.suggestedExams && c.suggestedExams.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Exames Sugeridos</h4>
                        <ul className="mt-1 list-inside list-disc text-sm text-slate-600">
                          {c.suggestedExams.map((exam, k) => <li key={k}>{exam}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Tratamento</h4>
                    <div className="prose prose-sm mt-2 text-slate-600">
                      <ReactMarkdown>{c.treatment}</ReactMarkdown>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Medicamentos</h4>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {c.medications.map((med, j) => (
                      <div key={j} className="rounded-lg bg-slate-50 p-3 text-xs">
                        <div className="font-bold text-slate-900">{med.name}</div>
                        <div className="mt-1 text-slate-500">{med.dosage} • {med.frequency}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
