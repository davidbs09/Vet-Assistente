import {
  auth,
  db,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  serverTimestamp,
  User,
} from '../firebase';

export const AUTH_TOKEN_KEY = 'vetai_auth_token';

export type UserRole = 'admin' | 'user';
export type UserStatus = 'pending' | 'active';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  crmv?: string;
  role: UserRole;
  status: UserStatus;
  createdAt?: unknown;
  activatedAt?: unknown;
}

export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
  crmv?: string;
}

const adminEmail = String((import.meta as any).env?.VITE_ADMIN_EMAIL || '')
  .trim()
  .toLowerCase();

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(adminEmail && email && email.trim().toLowerCase() === adminEmail);
}

export function isAdminProfile(profile?: UserProfile | null, email?: string | null): boolean {
  return profile?.role === 'admin' || isAdminEmail(email || profile?.email);
}

export function getStoredAuthToken(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(AUTH_TOKEN_KEY);
}

export function clearAuthToken(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(AUTH_TOKEN_KEY);
}

export async function persistAuthToken(user: User): Promise<string> {
  const token = await user.getIdToken();
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  return token;
}

export async function getAuthToken(forceRefresh = false): Promise<string | null> {
  if (!auth.currentUser) {
    clearAuthToken();
    return null;
  }
  const token = await auth.currentUser.getIdToken(forceRefresh);
  sessionStorage.setItem(AUTH_TOKEN_KEY, token);
  return token;
}

function usersRef(uid: string) {
  return doc(db, 'users', uid);
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(usersRef(uid));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as UserProfile;
}

export async function ensureUserProfile(
  user: User,
  extras?: { displayName?: string; crmv?: string }
): Promise<UserProfile> {
  const existing = await getUserProfile(user.uid);
  if (existing) {
    if (isAdminEmail(user.email) && (existing.role !== 'admin' || existing.status !== 'active')) {
      await updateDoc(usersRef(user.uid), {
        role: 'admin',
        status: 'active',
        activatedAt: serverTimestamp(),
      });
      return { ...existing, role: 'admin', status: 'active' };
    }
    return existing;
  }

  const isAdmin = isAdminEmail(user.email);
  const profile: Omit<UserProfile, 'id' | 'createdAt' | 'activatedAt'> & {
    createdAt: unknown;
    activatedAt?: unknown;
  } = {
    email: user.email || extras?.displayName || '',
    displayName: extras?.displayName || user.displayName || user.email || 'Veterinário',
    crmv: extras?.crmv || '',
    role: isAdmin ? 'admin' : 'user',
    status: isAdmin ? 'active' : 'pending',
    createdAt: serverTimestamp(),
    ...(isAdmin ? { activatedAt: serverTimestamp() } : {}),
  };

  await setDoc(usersRef(user.uid), profile);
  return { id: user.uid, ...profile, email: user.email || profile.email };
}

export async function loginWithEmail(email: string, password: string): Promise<{
  user: User;
  profile: UserProfile;
  token: string;
}> {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  const profile = await ensureUserProfile(credential.user);

  if (profile.status !== 'active' && !isAdminProfile(profile, credential.user.email)) {
    clearAuthToken();
    await signOut(auth);
    const error = new Error(
      'Sua conta ainda está pendente de ativação pelo administrador. Você receberá acesso assim que for liberada.'
    );
    (error as Error & { code?: string }).code = 'auth/account-pending';
    throw error;
  }

  const token = await persistAuthToken(credential.user);
  return { user: credential.user, profile, token };
}

export async function registerWithEmail(payload: RegisterPayload): Promise<void> {
  const email = payload.email.trim();
  const credential = await createUserWithEmailAndPassword(auth, email, payload.password);

  if (payload.displayName) {
    await updateProfile(credential.user, { displayName: payload.displayName });
  }

  await ensureUserProfile(credential.user, {
    displayName: payload.displayName,
    crmv: payload.crmv,
  });

  clearAuthToken();
  await signOut(auth);
}

export async function listUsers(): Promise<UserProfile[]> {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() } as UserProfile))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      return (a.displayName || '').localeCompare(b.displayName || '');
    });
}

export async function activateUser(userId: string): Promise<void> {
  await updateDoc(usersRef(userId), {
    status: 'active',
    activatedAt: serverTimestamp(),
  });
}

export async function logoutFromAuth(): Promise<void> {
  clearAuthToken();
  await signOut(auth);
}

export function mapAuthError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code)
    : '';
  const message = error instanceof Error ? error.message : 'Não foi possível completar a operação.';

  switch (code) {
    case 'auth/account-pending':
      return message;
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'E-mail ou senha inválidos.';
    case 'auth/email-already-in-use':
      return 'Este e-mail já possui cadastro. Entre com sua senha ou aguarde a ativação.';
    case 'auth/weak-password':
      return 'A senha precisa ter pelo menos 6 caracteres.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas. Aguarde um momento e tente novamente.';
    case 'auth/network-request-failed':
      return 'Falha de rede ao autenticar. Verifique sua conexão.';
    case 'auth/operation-not-allowed':
      return 'O login por e-mail e senha ainda não está habilitado neste projeto Firebase.';
    default:
      return message;
  }
}
