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

let authListenerQuietCount = 0;

export function beginAuthQuietPeriod(): void {
  authListenerQuietCount += 1;
}

export function endAuthQuietPeriod(): void {
  authListenerQuietCount = Math.max(0, authListenerQuietCount - 1);
}

export function isAuthListenerQuiet(): boolean {
  return authListenerQuietCount > 0;
}

export type UserRole = 'admin' | 'user';
export type UserStatus = 'pending' | 'active' | 'revoked';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  crmv?: string;
  role: UserRole;
  status: UserStatus;
  createdAt?: unknown;
  activatedAt?: unknown;
  revokedAt?: unknown;
}

export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
  crmv?: string;
}

const env = (import.meta as any).env || {};
const adminEmail = String(env.VITE_ADMIN_EMAIL || 'admin@vetassistente.local')
  .trim()
  .toLowerCase();
const adminUsername = String(env.VITE_ADMIN_USERNAME || 'admin').trim().toLowerCase();
const adminBootstrapPassword = String(env.VITE_ADMIN_BOOTSTRAP_PASSWORD || 'adm123');

export function isAdminEmail(email?: string | null): boolean {
  return Boolean(adminEmail && email && email.trim().toLowerCase() === adminEmail);
}

export function resolveLoginEmail(identifier: string): string {
  const value = identifier.trim().toLowerCase();
  if (!value) return value;
  if (value === adminUsername || value === 'admin') return adminEmail;
  return identifier.trim();
}

export function isValidLoginIdentifier(identifier: string): boolean {
  const value = identifier.trim();
  if (!value) return false;
  if (value.toLowerCase() === adminUsername || value.toLowerCase() === 'admin') return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateLoginCredentials(identifier: string, password: string): string | null {
  if (!identifier.trim()) return 'Informe o usuário ou e-mail.';
  if (!password) return 'Informe a senha.';
  if (!isValidLoginIdentifier(identifier)) return 'Informe um e-mail válido.';
  if (password.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  return null;
}

function authError(message: string, code: string): Error {
  const error = new Error(message);
  (error as Error & { code?: string }).code = code;
  return error;
}

export function isAdminProfile(profile?: UserProfile | null, email?: string | null): boolean {
  return profile?.role === 'admin' || isAdminEmail(email || profile?.email);
}

export function canAccessApp(profile: UserProfile | null | undefined, email?: string | null): boolean {
  if (!profile) return false;
  if (isAdminProfile(profile, email)) return true;
  return profile.status === 'active';
}

export function isPermissionDenied(error: unknown): boolean {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code?: string }).code)
    : '';
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return code === 'permission-denied' || message.includes('insufficient permissions');
}

export async function assertActiveAccess(uid: string, email?: string | null): Promise<UserProfile> {
  const profile = await getUserProfile(uid);
  if (canAccessApp(profile, email) && profile) {
    return profile;
  }

  const revoked = profile?.status === 'revoked';
  throw authError(
    revoked
      ? 'Seu acesso foi removido pelo administrador. Solicite uma nova liberação.'
      : 'Sua conta ainda está pendente de ativação pelo administrador.',
    revoked ? 'auth/account-revoked' : 'auth/account-pending'
  );
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

async function ensureBootstrapAdmin(email: string, password: string): Promise<void> {
  const isBootstrapAdmin =
    email.trim().toLowerCase() === adminEmail && password === adminBootstrapPassword;
  if (!isBootstrapAdmin) return;

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: 'Administrador' });
    await ensureUserProfile(credential.user, { displayName: 'Administrador' });
  } catch (error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
    if (code !== 'auth/email-already-in-use') throw error;
  }
}

export async function loginWithEmail(email: string, password: string): Promise<{
  user: User;
  profile: UserProfile;
  token: string;
}> {
  const validationError = validateLoginCredentials(email, password);
  if (validationError) {
    throw authError(validationError, validationError.includes('e-mail válido') ? 'auth/invalid-email' : 'auth/invalid-credential');
  }

  const resolvedEmail = resolveLoginEmail(email);
  try {
    await signInWithEmailAndPassword(auth, resolvedEmail, password);
  } catch (error: unknown) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code?: string }).code)
      : '';
    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
      await ensureBootstrapAdmin(resolvedEmail, password);
      await signInWithEmailAndPassword(auth, resolvedEmail, password);
    } else {
      throw error;
    }
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw authError('Não foi possível autenticar. Tente novamente.', 'auth/invalid-credential');
  }

  const profile = await ensureUserProfile(currentUser);

  if (profile.status === 'revoked' && !isAdminProfile(profile, currentUser.email)) {
    clearAuthToken();
    await signOut(auth);
    throw authError(
      'Seu acesso foi removido pelo administrador. Solicite uma nova liberação.',
      'auth/account-revoked'
    );
  }

  if (profile.status !== 'active' && !isAdminProfile(profile, currentUser.email)) {
    clearAuthToken();
    await signOut(auth);
    throw authError(
      'Sua conta ainda está pendente de ativação pelo administrador. Você receberá acesso assim que for liberada.',
      'auth/account-pending'
    );
  }

  const token = await persistAuthToken(currentUser);
  return { user: currentUser, profile, token };
}

export async function registerWithEmail(payload: RegisterPayload): Promise<void> {
  const email = payload.email.trim();
  beginAuthQuietPeriod();
  try {
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
  } finally {
    endAuthQuietPeriod();
  }
}

export async function listUsers(): Promise<UserProfile[]> {
  const snapshot = await getDocs(collection(db, 'users'));
  return snapshot.docs
    .map((item) => ({ id: item.id, ...item.data() } as UserProfile))
    .sort((a, b) => {
      const order = { pending: 0, active: 1, revoked: 2 };
      const statusDiff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
      if (statusDiff !== 0) return statusDiff;
      return (a.displayName || '').localeCompare(b.displayName || '');
    });
}

export async function activateUser(userId: string): Promise<void> {
  await updateDoc(usersRef(userId), {
    status: 'active',
    activatedAt: serverTimestamp(),
    revokedAt: null,
  });
}

export async function revokeUserAccess(userId: string): Promise<void> {
  await updateDoc(usersRef(userId), {
    status: 'revoked',
    revokedAt: serverTimestamp(),
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

  if (code === 'permission-denied' || message.toLowerCase().includes('insufficient permissions')) {
    return 'O login autenticou, mas o Firestore bloqueou a gravação do perfil. Publique as regras de security do arquivo firestore.rules no Console (Firestore > Regras).';
  }

  switch (code) {
    case 'auth/account-pending':
      return message;
    case 'auth/account-revoked':
      return 'Seu acesso foi removido pelo administrador. Solicite uma nova liberação.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha inválidos.';
    case 'auth/invalid-email':
      return 'Informe um e-mail válido.';
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
    case 'auth/configuration-not-found':
      return 'O Authentication ainda não foi iniciado neste projeto Firebase. No Console, abra Authentication, clique em Começar e habilite o provedor E-mail/senha.';
    default:
      return message;
  }
}
