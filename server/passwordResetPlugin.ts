import {createHash, randomBytes} from 'crypto';
import {readFileSync} from 'fs';
import type {IncomingMessage, ServerResponse} from 'http';
import {cert, getApps, initializeApp, type App} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {FieldValue, getFirestore} from 'firebase-admin/firestore';
import type {Plugin, ViteDevServer} from 'vite';

type EnvMap = Record<string, string>;

const RESET_COLLECTION = 'passwordResets';
const USERS_COLLECTION = 'users';
const SESSIONS_COLLECTION = 'userSessions';

export function hashEmailKey(email: string): string {
  return createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

function readJsonBody(req: IncomingMessage, limit = 64 * 1024): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Payload muito grande.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw) as Record<string, unknown>);
      } catch {
        reject(new Error('JSON inválido.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, payload: Record<string, unknown>): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

function requestPath(req: IncomingMessage): string {
  const url = req.url || '/';
  const q = url.indexOf('?');
  return q === -1 ? url : url.slice(0, q);
}

function bearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization || '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function initAdminApp(env: EnvMap): App {
  if (getApps().length > 0) {
    return getApps()[0]!;
  }

  const projectId =
    env.VITE_FIREBASE_PROJECT_ID ||
    env.GCLOUD_PROJECT ||
    env.GOOGLE_CLOUD_PROJECT ||
    'vetassistentai-b9378';
  const json = env.FIREBASE_SERVICE_ACCOUNT || env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const credentialPath = env.FIREBASE_SERVICE_ACCOUNT_PATH || env.GOOGLE_APPLICATION_CREDENTIALS;

  if (json) {
    const credentials = JSON.parse(json) as Record<string, string>;
    return initializeApp({
      credential: cert(credentials),
      projectId: credentials.project_id || projectId,
    });
  }

  if (credentialPath && credentialPath.trim()) {
    const credentials = JSON.parse(readFileSync(credentialPath, 'utf8')) as Record<string, string>;
    return initializeApp({
      credential: cert(credentials),
      projectId: credentials.project_id || projectId,
    });
  }

  throw new Error('Could not load the default credentials');
}

function isAdminProfile(data: { role?: string } | undefined): boolean {
  return data?.role === 'admin';
}

function validateNewPassword(password: unknown): string | null {
  if (typeof password !== 'string' || !password) {
    return 'Informe a nova senha.';
  }
  if (password.length > 128) {
    return 'A senha é longa demais.';
  }
  const isStrong =
    password.length >= 8
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[0-9]/.test(password)
    && /[^A-Za-z0-9]/.test(password);
  if (!isStrong) {
    return 'A senha precisa ter letra maiúscula, minúscula, número e caractere especial. Exemplo: Senha@123';
  }
  return null;
}

async function handleRequestAccess(req: IncomingMessage, res: ServerResponse, env: EnvMap): Promise<void> {
  const body = await readJsonBody(req);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const crmv = typeof body.crmv === 'string' ? body.crmv.trim() : '';
  const passwordError = validateNewPassword(body.password);
  const adminEmail = String(env.VITE_ADMIN_EMAIL || 'admin@vetassistente.local').trim().toLowerCase();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    sendJson(res, 400, {error: 'Informe um e-mail válido.'});
    return;
  }
  if (!displayName) {
    sendJson(res, 400, {error: 'Informe o nome completo.'});
    return;
  }
  if (!crmv) {
    sendJson(res, 400, {error: 'Informe o CRMV para solicitar o acesso.'});
    return;
  }
  if (passwordError) {
    sendJson(res, 400, {error: passwordError});
    return;
  }
  if (email === adminEmail) {
    sendJson(res, 400, {error: 'Este e-mail não pode ser usado para solicitar acesso.'});
    return;
  }

  const app = initAdminApp(env);
  const auth = getAuth(app);
  const db = getFirestore(app);

  let uid = '';
  try {
    const record = await auth.getUserByEmail(email);
    uid = record.uid;
  } catch {
    const created = await auth.createUser({
      email,
      password: String(body.password),
      displayName,
    });
    uid = created.uid;
  }

  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const userSnap = await userRef.get();
  if (userSnap.exists) {
    const status = userSnap.data()?.status;
    sendJson(res, 409, {
      error: status === 'pending'
        ? 'Este e-mail já possui cadastro. Aguarde a ativação pelo administrador.'
        : 'Este e-mail já possui cadastro. Entre com sua senha para acessar.',
      code: status === 'pending' ? 'pending' : 'exists',
    });
    return;
  }

  await auth.updateUser(uid, {
    displayName,
    password: String(body.password),
  });

  await userRef.set({
    email,
    displayName,
    crmv,
    role: 'user',
    status: 'pending',
    mustResetPassword: false,
    passwordResetRequested: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  sendJson(res, 200, {ok: true});
}

async function handleAdminReset(req: IncomingMessage, res: ServerResponse, env: EnvMap): Promise<void> {
  const token = bearerToken(req);
  if (!token) {
    sendJson(res, 401, {error: 'Sessão de administrador inválida.'});
    return;
  }

  const body = await readJsonBody(req);
  const userId = typeof body.userId === 'string' ? body.userId.trim() : '';
  if (!userId) {
    sendJson(res, 400, {error: 'Informe o usuário que terá a senha resetada.'});
    return;
  }

  const app = initAdminApp(env);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const decoded = await auth.verifyIdToken(token, true);
  const callerSnap = await db.collection(USERS_COLLECTION).doc(decoded.uid).get();
  if (!callerSnap.exists || !isAdminProfile(callerSnap.data())) {
    sendJson(res, 403, {error: 'Apenas o administrador pode resetar senhas.'});
    return;
  }

  if (userId === decoded.uid) {
    sendJson(res, 400, {error: 'Você não pode resetar a própria senha por aqui.'});
    return;
  }

  const targetRef = db.collection(USERS_COLLECTION).doc(userId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) {
    sendJson(res, 404, {error: 'Usuário não encontrado.'});
    return;
  }

  const target = targetSnap.data() || {};
  if (isAdminProfile(target)) {
    sendJson(res, 400, {error: 'Não é permitido resetar a senha de outro administrador.'});
    return;
  }

  if (target.status === 'revoked') {
    sendJson(res, 400, {error: 'Reative o acesso antes de resetar a senha desta conta.'});
    return;
  }

  const email = String(target.email || '').trim().toLowerCase();
  if (!email) {
    sendJson(res, 400, {error: 'Este usuário não possui e-mail para resetar a senha.'});
    return;
  }

  await targetRef.update({
    mustResetPassword: true,
    passwordResetRequested: false,
    passwordResetRequestedAt: FieldValue.delete(),
    passwordResetAt: FieldValue.serverTimestamp(),
    passwordResetBy: decoded.uid,
  });

  await db.collection(RESET_COLLECTION).doc(hashEmailKey(email)).set({
    uid: userId,
    email,
    requestedAt: FieldValue.serverTimestamp(),
    requestedBy: decoded.uid,
  });

  const unusablePassword = randomBytes(32).toString('base64url');
  await auth.updateUser(userId, {password: unusablePassword});
  await auth.revokeRefreshTokens(userId);

  await db.collection(SESSIONS_COLLECTION).doc(userId).set(
    {
      isActive: false,
      updatedAt: FieldValue.serverTimestamp(),
    },
    {merge: true}
  );

  sendJson(res, 200, {ok: true});
}

async function handleRequestReset(req: IncomingMessage, res: ServerResponse, env: EnvMap): Promise<void> {
  const body = await readJsonBody(req);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    sendJson(res, 400, {error: 'Informe um e-mail válido.'});
    return;
  }

  const app = initAdminApp(env);
  const auth = getAuth(app);
  const db = getFirestore(app);

  let uid = '';
  try {
    const record = await auth.getUserByEmail(email);
    uid = record.uid;
  } catch {
    sendJson(res, 200, {ok: true});
    return;
  }

  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const userSnap = await userRef.get();
  const profile = userSnap.data() || {};
  if (!userSnap.exists || isAdminProfile(profile)) {
    sendJson(res, 200, {ok: true});
    return;
  }

  await userRef.update({
    passwordResetRequested: true,
    passwordResetRequestedAt: FieldValue.serverTimestamp(),
  });

  sendJson(res, 200, {ok: true});
}

async function handleCompleteReset(req: IncomingMessage, res: ServerResponse, env: EnvMap): Promise<void> {
  const body = await readJsonBody(req);
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const passwordError = validateNewPassword(body.password);
  if (!email) {
    sendJson(res, 400, {error: 'Informe o e-mail da conta.'});
    return;
  }
  if (passwordError) {
    sendJson(res, 400, {error: passwordError});
    return;
  }

  const app = initAdminApp(env);
  const auth = getAuth(app);
  const db = getFirestore(app);
  const resetRef = db.collection(RESET_COLLECTION).doc(hashEmailKey(email));
  const resetSnap = await resetRef.get();
  if (!resetSnap.exists) {
    sendJson(res, 400, {error: 'Não há reset de senha pendente para esta conta.'});
    return;
  }

  const reset = resetSnap.data() || {};
  const uid = String(reset.uid || '');
  if (!uid) {
    sendJson(res, 400, {error: 'Reset de senha inválido. Peça ao administrador para resetar novamente.'});
    return;
  }

  const userRef = db.collection(USERS_COLLECTION).doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    sendJson(res, 404, {error: 'Usuário não encontrado.'});
    return;
  }

  const profile = userSnap.data() || {};
  if (isAdminProfile(profile)) {
    sendJson(res, 400, {error: 'Não é permitido redefinir a senha de administrador por este fluxo.'});
    return;
  }
  if (profile.status === 'revoked') {
    sendJson(res, 403, {error: 'Seu acesso foi removido pelo administrador. Solicite uma nova liberação.'});
    return;
  }
  if (profile.mustResetPassword !== true) {
    await resetRef.delete();
    sendJson(res, 400, {error: 'Não há reset de senha pendente para esta conta.'});
    return;
  }
  if (String(profile.email || '').trim().toLowerCase() !== email) {
    sendJson(res, 400, {error: 'Reset de senha inválido. Peça ao administrador para resetar novamente.'});
    return;
  }

  await auth.updateUser(uid, {password: String(body.password)});
  await auth.revokeRefreshTokens(uid);
  await userRef.update({
    mustResetPassword: false,
    passwordResetRequested: false,
    passwordResetRequestedAt: FieldValue.delete(),
    passwordResetAt: FieldValue.delete(),
    passwordResetBy: FieldValue.delete(),
  });
  await resetRef.delete();

  sendJson(res, 200, {ok: true});
}

function attachPasswordResetRoutes(server: ViteDevServer, env: EnvMap): void {
  server.middlewares.use(async (req, res, next) => {
    const path = requestPath(req);
    if (
      path !== '/api/admin/reset-password'
      && path !== '/api/auth/complete-password-reset'
      && path !== '/api/auth/request-password-reset'
      && path !== '/api/auth/request-access'
    ) {
      next();
      return;
    }

    if (req.method !== 'POST') {
      sendJson(res, 405, {error: 'Método não permitido.'});
      return;
    }

    try {
      if (path === '/api/admin/reset-password') {
        await handleAdminReset(req, res, env);
        return;
      }
      if (path === '/api/auth/request-password-reset') {
        await handleRequestReset(req, res, env);
        return;
      }
      if (path === '/api/auth/request-access') {
        await handleRequestAccess(req, res, env);
        return;
      }
      await handleCompleteReset(req, res, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const unauthorized =
        message.includes('Decoding Firebase ID token') ||
        message.includes('Firebase ID token has expired') ||
        message.includes('auth/id-token-revoked');
      const missingCredentials =
        message.includes('Could not load the default credentials') ||
        message.includes('Unable to detect a Project Id') ||
        message.includes('Failed to parse private key') ||
        message.includes('ENOENT') ||
        message.includes('UNAUTHENTICATED') ||
        message.includes('invalid_grant') ||
        message.includes('Could not refresh access token');

      if (message.includes('JSON inválido') || message.includes('Payload muito grande')) {
        sendJson(res, 400, {error: message});
        return;
      }
      if (unauthorized) {
        sendJson(res, 401, {error: 'Sessão de administrador inválida. Entre novamente.'});
        return;
      }
      if (missingCredentials) {
        sendJson(res, 503, {
          error:
            'O servidor não consegue apagar a senha no Firebase Auth. Configure FIREBASE_SERVICE_ACCOUNT_PATH no .env com o JSON da conta de serviço.',
        });
        return;
      }
      console.error('Password reset API error:', error);
      sendJson(res, 500, {error: 'Não foi possível concluir o reset de senha.'});
    }
  });
}

export function passwordResetPlugin(env: EnvMap): Plugin {
  return {
    name: 'vet-password-reset-api',
    configureServer(server) {
      attachPasswordResetRoutes(server, env);
    },
    configurePreviewServer(server) {
      attachPasswordResetRoutes(server as unknown as ViteDevServer, env);
    },
  };
}
