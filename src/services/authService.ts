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
  onSnapshot,
  serverTimestamp,
  User,
} from '../firebase';
import { isValidPhone, normalizePhone } from '../lib/phone';
import { validatePasswordPolicy } from '../shared/passwordPolicy';

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
  contato?: string;
  role: UserRole;
  status: UserStatus;
  mustResetPassword?: boolean;
  passwordResetRequested?: boolean;
  passwordResetRequestedAt?: unknown;
  passwordResetAt?: unknown;
  createdAt?: unknown;
  activatedAt?: unknown;
  revokedAt?: unknown;
}

export type LoginSuccess = {
  user: User;
  profile: UserProfile;
  token: string;
};

export type LoginResult = LoginSuccess | { needsPasswordReset: true; email: string };

export interface RegisterPayload {
  email: string;
  password: string;
  displayName: string;
  crmv: string;
  contato: string;
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

export function validateLoginIdentifier(identifier: string): string | null {
  if (!identifier.trim()) return 'Informe o usuário ou e-mail.';
  if (!isValidLoginIdentifier(identifier)) return 'Informe um e-mail válido.';
  return null;
}

export function validateLoginCredentials(identifier: string, password: string): string | null {
  const identifierError = validateLoginIdentifier(identifier);
  if (identifierError) return identifierError;
  if (!password) return 'Informe a senha.';
  if (password.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
  return null;
}

export function validateNewPassword(password: string, confirmPassword: string): string | null {
  const policyError = validatePasswordPolicy(password);
  if (policyError) return policyError === 'Informe a senha.' ? 'Informe a nova senha.' : policyError;
  if (password !== confirmPassword) return 'As senhas não coincidem.';
  return null;
}

export async function hashEmailKey(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(email.trim().toLowerCase());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function isPasswordResetLogin(result: LoginResult): result is { needsPasswordReset: true; email: string } {
  return 'needsPasswordReset' in result && result.needsPasswordReset === true;
}

export function requiresPasswordReset(profile?: UserProfile | null): boolean {
  return profile?.mustResetPassword === true;
}

export function requestedPasswordReset(profile?: UserProfile | null): boolean {
  return profile?.passwordResetRequested === true && !requiresPasswordReset(profile);
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
  if (requiresPasswordReset(profile)) return false;
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

  if (requiresPasswordReset(profile)) {
    throw authError(
      'Sua senha foi resetada. Siga as instruções do e-mail que enviamos para criar uma nova senha.',
      'auth/password-reset-required'
    );
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
  extras?: { displayName?: string; crmv?: string; contato?: string }
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
    contato: extras?.contato ? normalizePhone(extras.contato) : '',
    role: isAdmin ? 'admin' : 'user',
    status: isAdmin ? 'active' : 'pending',
    mustResetPassword: false,
    passwordResetRequested: false,
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

async function isPasswordResetRequired(identifier: string): Promise<boolean> {
  const email = resolveLoginEmail(identifier);
  const key = await hashEmailKey(email);
  const snap = await getDoc(doc(db, 'passwordResets', key));
  return snap.exists();
}

async function readApiError(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: string };
    if (payload?.error) return payload.error;
  } catch (_) {}
  return 'Não foi possível concluir o reset de senha.';
}

export async function requestPasswordReset(identifier: string): Promise<void> {
  const identifierError = validateLoginIdentifier(identifier);
  if (identifierError) {
    throw authError(identifierError, 'auth/invalid-email');
  }

  const response = await fetch('/api/auth/request-password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: resolveLoginEmail(identifier) }),
  });

  if (!response.ok) {
    throw authError(await readApiError(response), 'auth/reset-request-failed');
  }
}

export async function requestAdminPasswordReset(userId: string): Promise<void> {
  const token = await getAuthToken(true);
  if (!token) {
    throw authError('Sessão de administrador inválida. Entre novamente.', 'auth/unauthenticated');
  }

  const response = await fetch('/api/admin/reset-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ userId }),
  });

  if (!response.ok) {
    throw authError(await readApiError(response), 'auth/reset-failed');
  }
}

export async function completePasswordReset(email: string, password: string): Promise<LoginSuccess> {
  const identifierError = validateLoginIdentifier(email);
  if (identifierError) {
    throw authError(identifierError, 'auth/invalid-email');
  }
  const passwordError = validateNewPassword(password, password);
  if (passwordError) {
    throw authError(passwordError, 'auth/weak-password');
  }

  const resolvedEmail = resolveLoginEmail(email);
  const response = await fetch('/api/auth/complete-password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: resolvedEmail, password }),
  });

  if (!response.ok) {
    throw authError(await readApiError(response), 'auth/reset-complete-failed');
  }

  const result = await loginWithEmail(resolvedEmail, password);
  if (isPasswordResetLogin(result)) {
    throw authError(
      'A nova senha foi salva, mas o reset ainda aparece pendente. Tente entrar novamente.',
      'auth/password-reset-required'
    );
  }
  return result;
}

export async function loginWithEmail(email: string, password: string): Promise<LoginResult> {
  const identifierError = validateLoginIdentifier(email);
  if (identifierError) {
    throw authError(identifierError, identifierError.includes('e-mail válido') ? 'auth/invalid-email' : 'auth/invalid-credential');
  }

  const resolvedEmail = resolveLoginEmail(email);

  if (!password) {
    try {
      if (await isPasswordResetRequired(resolvedEmail)) {
        return { needsPasswordReset: true, email: resolvedEmail };
      }
    } catch (error: unknown) {
      if (isPermissionDenied(error)) {
        throw authError(
          'Não foi possível verificar o reset de senha. Publique as regras atualizadas do arquivo firestore.rules.',
          'permission-denied'
        );
      }
      throw error;
    }
    throw authError('Informe a senha.', 'auth/invalid-credential');
  }

  if (password.length < 6) {
    throw authError('A senha precisa ter pelo menos 6 caracteres.', 'auth/weak-password');
  }

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

  if (requiresPasswordReset(profile) && !isAdminProfile(profile, currentUser.email)) {
    clearAuthToken();
    await signOut(auth);
    throw authError('E-mail ou senha inválidos.', 'auth/invalid-credential');
  }

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
  if (!payload.displayName.trim()) {
    throw authError('Informe o nome completo.', 'auth/invalid-credential');
  }
  if (!payload.crmv.trim()) {
    throw authError('Informe o CRMV para solicitar o acesso.', 'auth/invalid-credential');
  }
  const contato = normalizePhone(payload.contato);
  if (!isValidPhone(contato)) {
    throw authError('Informe o contato com DDD e número. Ex: (11) 96464-6464', 'auth/invalid-credential');
  }
  const passwordError = validatePasswordPolicy(payload.password);
  if (passwordError) {
    throw authError(passwordError, 'auth/weak-password');
  }

  const response = await fetch('/api/auth/request-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password: payload.password,
      displayName: payload.displayName.trim(),
      crmv: payload.crmv.trim(),
      contato,
    }),
  });

  if (response.ok) return;

  const apiError = await readApiError(response);
  if (response.status === 409) {
    throw authError(
      apiError,
      apiError.includes('Aguarde a ativação') ? 'auth/account-pending' : 'auth/email-already-in-use'
    );
  }
  if (response.status !== 503) {
    throw authError(apiError, 'auth/register-failed');
  }

  beginAuthQuietPeriod();
  try {
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, payload.password);
      if (payload.displayName) {
        await updateProfile(credential.user, { displayName: payload.displayName });
      }
      await ensureUserProfile(credential.user, {
        displayName: payload.displayName,
        crmv: payload.crmv.trim(),
        contato,
      });
    } catch (error: unknown) {
      const code = typeof error === 'object' && error && 'code' in error
        ? String((error as { code?: string }).code)
        : '';
      if (code !== 'auth/email-already-in-use') throw error;
      await finishExistingRegister(email, payload);
    }

    clearAuthToken();
    await signOut(auth);
  } finally {
    endAuthQuietPeriod();
  }
}

async function finishExistingRegister(email: string, payload: RegisterPayload): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, email, payload.password);
  } catch {
    throw authError(
      'Este e-mail já possui cadastro. Entre com sua senha ou aguarde a ativação.',
      'auth/email-already-in-use'
    );
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw authError(
      'Este e-mail já possui cadastro. Entre com sua senha ou aguarde a ativação.',
      'auth/email-already-in-use'
    );
  }

  const existing = await getUserProfile(currentUser.uid);
  if (!existing) {
    if (payload.displayName) {
      await updateProfile(currentUser, { displayName: payload.displayName });
    }
    await ensureUserProfile(currentUser, {
      displayName: payload.displayName,
      crmv: payload.crmv.trim(),
      contato: normalizePhone(payload.contato),
    });
    return;
  }

  if (existing.status === 'pending') {
    throw authError(
      'Este e-mail já possui cadastro. Aguarde a ativação pelo administrador.',
      'auth/account-pending'
    );
  }
  if (existing.status === 'revoked') {
    throw authError(
      'Seu acesso foi removido pelo administrador. Solicite uma nova liberação.',
      'auth/account-revoked'
    );
  }
  throw authError(
    'Este e-mail já possui cadastro. Entre com sua senha para acessar.',
    'auth/email-already-in-use'
  );
}

function sortUsers(users: UserProfile[]): UserProfile[] {
  return [...users].sort((a, b) => {
    const rank = (user: UserProfile) => {
      if (requestedPasswordReset(user)) return 0;
      if (requiresPasswordReset(user)) return 1;
      if (user.status === 'pending') return 2;
      if (user.status === 'active') return 3;
      return 4;
    };
    const rankDiff = rank(a) - rank(b);
    if (rankDiff !== 0) return rankDiff;
    return (a.displayName || '').localeCompare(b.displayName || '');
  });
}

export async function listUsers(): Promise<UserProfile[]> {
  const snapshot = await getDocs(collection(db, 'users'));
  return sortUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as UserProfile)));
}

export function subscribeUsers(
  onUsers: (users: UserProfile[]) => void,
  onError: (error: Error) => void
): () => void {
  return onSnapshot(
    collection(db, 'users'),
    (snapshot) => {
      onUsers(sortUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as UserProfile))));
    },
    (error) => {
      onError(error instanceof Error ? error : new Error('Não foi possível carregar os usuários.'));
    }
  );
}

export type AdminActionResult = {
  emailSent?: boolean;
  emailTo?: string;
  emailError?: string | null;
  emailId?: string | null;
};

async function postAdminAction(path: string, body: Record<string, unknown>): Promise<AdminActionResult> {
  const token = await getAuthToken(true);
  if (!token) {
    throw authError('Sessão de administrador inválida. Entre novamente.', 'auth/unauthenticated');
  }

  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({})) as AdminActionResult & {error?: string};
  if (!response.ok) {
    throw authError(payload.error || 'Não foi possível concluir a operação.', 'auth/admin-action-failed');
  }
  return payload;
}

export async function activateUser(userId: string): Promise<AdminActionResult> {
  return postAdminAction('/api/admin/set-access', {userId, action: 'activate'});
}

export async function revokeUserAccess(userId: string): Promise<AdminActionResult> {
  return postAdminAction('/api/admin/set-access', {userId, action: 'revoke'});
}

export async function sendAdminTestEmail(to?: string): Promise<AdminActionResult> {
  return postAdminAction('/api/admin/test-email', to ? {to} : {});
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
    if (message.toLowerCase().includes('reset de senha') || message.toLowerCase().includes('firestore.rules')) {
      return message;
    }
    return 'O login autenticou, mas o Firestore bloqueou a gravação do perfil. Publique as regras de security do arquivo firestore.rules no Console (Firestore > Regras).';
  }

  switch (code) {
    case 'auth/account-pending':
      return message;
    case 'auth/account-revoked':
      return 'Seu acesso foi removido pelo administrador. Solicite uma nova liberação.';
    case 'auth/password-reset-required':
    case 'auth/reset-failed':
    case 'auth/reset-complete-failed':
    case 'auth/reset-request-failed':
    case 'auth/register-failed':
    case 'auth/admin-action-failed':
      return message;
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mail ou senha inválidos.';
    case 'auth/invalid-email':
      return 'Informe um e-mail válido.';
    case 'auth/email-already-in-use':
      return 'Este e-mail já possui cadastro. Entre com sua senha ou aguarde a ativação.';
    case 'auth/weak-password':
      return message.includes('maiúscula') || message.includes('Exemplo')
        ? message
        : 'A senha precisa ter letra maiúscula, minúscula, número e caractere especial. Exemplo: Senha@123';
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
