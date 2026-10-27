import {readFileSync} from 'fs';
import {resolve} from 'path';
import nodemailer from 'nodemailer';

export type EnvMap = Record<string, string | undefined>;

function readDotEnvFile(): EnvMap {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    const fileEnv: EnvMap = {};
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      fileEnv[key] = value;
    }
    return fileEnv;
  } catch {
    return {};
  }
}

export function resolveEmailEnv(env: EnvMap): EnvMap {
  return {...env, ...readDotEnvFile()};
}

export type EmailAddress = {
  email: string;
  name?: string;
};

export type TransactionalEmail = {
  to: EmailAddress;
  subject: string;
  text: string;
  html: string;
};

export type SendResult = {
  sent: boolean;
  to: string;
  messageId?: string;
  response?: string;
  error?: string;
};

function clean(value: string | undefined): string {
  return (value || '').replace(/^["']|["']$/g, '').trim();
}

export function isBrevoConfigured(env: EnvMap): boolean {
  const merged = resolveEmailEnv(env);
  return Boolean(
    clean(merged.BREVO_SMTP_USER)
    && clean(merged.BREVO_SMTP_KEY)
    && clean(merged.BREVO_SENDER_EMAIL)
  );
}

export function adminNotifyEmail(env: EnvMap): string {
  const merged = resolveEmailEnv(env);
  const dedicated = clean(merged.BREVO_ADMIN_EMAIL);
  if (dedicated) return dedicated;
  const fallback = clean(merged.VITE_ADMIN_EMAIL);
  if (fallback && !fallback.endsWith('.local')) return fallback;
  return '';
}

export function appPublicUrl(env: EnvMap): string {
  const merged = resolveEmailEnv(env);
  return clean(merged.APP_PUBLIC_URL) || clean(merged.APP_URL) || 'https://ajudavoce.com.br';
}

export async function sendBrevoEmail(env: EnvMap, email: TransactionalEmail): Promise<SendResult> {
  const merged = resolveEmailEnv(env);
  const host = clean(merged.BREVO_SMTP_HOST) || 'smtp-relay.brevo.com';
  const port = Number(clean(merged.BREVO_SMTP_PORT) || '587');
  const user = clean(merged.BREVO_SMTP_USER);
  const pass = clean(merged.BREVO_SMTP_KEY);
  const senderEmail = clean(merged.BREVO_SENDER_EMAIL);
  const senderName = clean(merged.BREVO_SENDER_NAME) || 'Vet Assistente';
  const to = email.to.email.trim();

  if (!user || !pass || !senderEmail) {
    const error = 'SMTP do Brevo incompleto no .env.';
    console.warn(`Brevo: ${error}`);
    return {sent: false, to, error};
  }
  if (!to || !to.includes('@')) {
    const error = 'Destinatário inválido.';
    console.warn(`Brevo: ${error}`);
    return {sent: false, to, error};
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    requireTLS: port === 587,
    auth: {user, pass},
  });

  const info = await transporter.sendMail({
    from: `${senderName} <${senderEmail}>`,
    to: email.to.name ? `${email.to.name} <${to}>` : to,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  const rejected = info.rejected?.map(String).filter(Boolean) ?? [];
  if (rejected.length > 0) {
    const error = `Brevo recusou o destinatário: ${rejected.join(', ')}`;
    console.error(`Brevo: ${error}`);
    return {sent: false, to, messageId: info.messageId, response: info.response, error};
  }

  console.log(`Brevo: aceito para ${to} id=${info.messageId || '-'} resp=${info.response || '-'}`);
  return {
    sent: true,
    to,
    messageId: info.messageId,
    response: info.response,
  };
}
