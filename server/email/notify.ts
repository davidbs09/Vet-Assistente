import {formatPhone} from '../../src/lib/phone';
import {PASSWORD_EXAMPLE, PASSWORD_REQUIREMENTS} from '../../src/shared/passwordPolicy';
import {
  adminNotifyEmail,
  appPublicUrl,
  sendBrevoEmail,
  type EnvMap,
  type SendResult,
} from './brevoClient';

type Person = {
  email?: string;
  displayName?: string;
  crmv?: string;
  contato?: string;
};

function personContato(person: Person): string {
  return formatPhone(person.contato || '') || person.contato || '';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function personName(person: Person): string {
  return (person.displayName || person.email || 'Veterinário').trim();
}

function field(label: string, value?: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;width:140px;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:10px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:600;">${escapeHtml(value || 'Não informado')}</td>
  </tr>`;
}

function cta(href: string, label: string): string {
  return `<p style="margin:28px 0 8px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#047857;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:700;font-size:14px;">${escapeHtml(label)}</a>
  </p>
  <p style="margin:0;font-size:12px;color:#64748b;">Se o botão não abrir, copie e cole este endereço:<br>${escapeHtml(href)}</p>`;
}

function layout(title: string, intro: string, bodyHtml: string, appUrl: string): {html: string; text: string} {
  const text = [
    'Ajuda Você',
    title,
    '',
    intro.replace(/<[^>]+>/g, ''),
    '',
    bodyHtml.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|h2|tr)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim(),
    '',
    appUrl,
  ].join('\n');

  return {
    text,
    html: `<!DOCTYPE html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <div style="max-width:600px;margin:0 auto;padding:24px 12px;">
    <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:20px;overflow:hidden;">
      <div style="background:#047857;padding:22px 28px;">
        <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#a7f3d0;font-weight:700;">Ajuda Você</p>
        <p style="margin:6px 0 0;font-size:22px;line-height:1.3;color:#ffffff;font-weight:700;">Vet Assistente</p>
      </div>
      <div style="padding:28px;">
        <h1 style="margin:0 0 12px;font-size:22px;line-height:1.35;">${escapeHtml(title)}</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#334155;">${intro}</p>
        ${bodyHtml}
      </div>
      <div style="padding:16px 28px 22px;border-top:1px solid #e2e8f0;background:#f8fafc;">
        <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">Este é um e-mail automático do Ajuda Você. Não compartilhe senha por e-mail.</p>
      </div>
    </div>
  </div>
</body>
</html>`,
  };
}

async function safeSend(env: EnvMap, label: string, to: string, subject: string, title: string, intro: string, bodyHtml: string): Promise<SendResult> {
  if (!to || !to.includes('@') || to.endsWith('.local')) {
    const error = `Destinatário inválido: ${to || '(vazio)'}. Confira BREVO_ADMIN_EMAIL no .env.`;
    console.warn(`Brevo: ${label} ignorado. ${error}`);
    return {sent: false, to, error};
  }
  try {
    const content = layout(title, intro, bodyHtml, appPublicUrl(env));
    const result = await sendBrevoEmail(env, {
      to: {email: to, name: to},
      subject,
      text: content.text,
      html: content.html,
    });
    if (result.sent) {
      console.log(`Brevo: ${label} enviado para ${to}`);
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Brevo: falha ao enviar ${label}:`, message);
    return {sent: false, to, error: message};
  }
}

export async function notifyAdminAccessRequested(env: EnvMap, person: Person): Promise<SendResult> {
  const adminEmail = adminNotifyEmail(env);
  const appUrl = appPublicUrl(env);
  const name = personName(person);
  return safeSend(
    env,
    'pedido de acesso',
    adminEmail,
    '[Ajuda Você] Nova solicitação de acesso',
    'Nova solicitação de acesso',
    `Um veterinário pediu liberação no Vet Assistente. Confira os dados abaixo e pesquise o CRMV antes de autorizar.`,
    `<table style="width:100%;border-collapse:collapse;">
      ${field('Nome completo', name)}
      ${field('E-mail', person.email)}
      ${field('CRMV', person.crmv)}
      ${field('Contato', personContato(person))}
    </table>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#334155;">Use o CRMV para confirmar a identidade no conselho regional. A senha cadastrada pelo cliente não é enviada neste e-mail.</p>
    ${cta(appUrl, 'Abrir o painel de acessos')}`
  );
}

export async function notifyAdminPasswordResetRequested(env: EnvMap, person: Person): Promise<SendResult> {
  const adminEmail = adminNotifyEmail(env);
  const appUrl = appPublicUrl(env);
  const name = personName(person);
  return safeSend(
    env,
    'pedido de reset',
    adminEmail,
    '[Ajuda Você] Pedido de reset de senha',
    'Pedido de reset de senha',
    `${escapeHtml(name)} informou que esqueceu a senha e pediu um reset da conta.`,
    `<table style="width:100%;border-collapse:collapse;">
      ${field('Nome', name)}
      ${field('E-mail', person.email)}
      ${field('CRMV', person.crmv)}
      ${field('Contato', personContato(person))}
    </table>
    <p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:#334155;">Confirme o e-mail no painel de acessos e execute o reset. O cliente só recebe as instruções depois que você concluir essa etapa.</p>
    ${cta(appUrl, 'Abrir o painel de acessos')}`
  );
}

export async function notifyUserAccessChanged(env: EnvMap, person: Person, action: 'activate' | 'revoke'): Promise<SendResult> {
  const email = (person.email || '').trim();
  if (!email) return {sent: false, to: '', error: 'O usuário não tem e-mail cadastrado.'};
  const appUrl = appPublicUrl(env);
  const name = personName(person);

  if (action === 'activate') {
    return safeSend(
      env,
      'acesso liberado',
      email,
      'Seu acesso ao Ajuda Você foi liberado',
      'Acesso liberado. Seja bem-vindo.',
      `Olá, ${escapeHtml(name)}. Obrigado por solicitar o Vet Assistente. Seu acesso foi concedido e você já pode usar o sistema.`,
      `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">Entre com o mesmo e-mail e a senha que você cadastrou na solicitação.</p>
      ${cta(appUrl, 'Acessar ajudavoce.com.br')}`
    );
  }

  return safeSend(
    env,
    'acesso revogado',
    email,
    'Seu acesso ao Ajuda Você foi revogado',
    'Acesso revogado',
    `Olá, ${escapeHtml(name)}. O administrador removeu o seu acesso ao Vet Assistente.`,
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#334155;">Você não conseguirá entrar até uma nova liberação. Se isso foi um engano, fale com o administrador da clínica.</p>`
  );
}

export async function notifyUserPasswordResetByAdmin(env: EnvMap, person: Person): Promise<SendResult> {
  const email = (person.email || '').trim();
  if (!email) return {sent: false, to: '', error: 'O usuário não tem e-mail cadastrado.'};
  const appUrl = appPublicUrl(env);
  const name = personName(person);
  const rules = PASSWORD_REQUIREMENTS.map((item) => `<li style="margin:0 0 6px;">${escapeHtml(item)}</li>`).join('');

  return safeSend(
    env,
    'senha resetada',
    email,
    'Sua senha do Ajuda Você foi resetada',
    'Senha resetada. Crie uma nova para entrar.',
    `Olá, ${escapeHtml(name)}. O administrador resetou a sua senha. A senha antiga não funciona mais. Siga as instruções abaixo para cadastrar a nova.`,
    `<ol style="margin:0 0 20px;padding-left:20px;color:#334155;font-size:15px;line-height:1.6;">
      <li style="margin:0 0 8px;">Acesse <a href="${escapeHtml(appUrl)}" style="color:#047857;font-weight:700;">ajudavoce.com.br</a> e clique em Entrar.</li>
      <li style="margin:0 0 8px;">Digite somente o e-mail desta conta: <strong>${escapeHtml(email)}</strong>.</li>
      <li style="margin:0 0 8px;">Deixe o campo de senha vazio e clique em Entrar.</li>
      <li style="margin:0 0 8px;">O sistema vai reconhecer que há um cadastro de senha pendente.</li>
      <li style="margin:0 0 8px;">Crie e confirme a nova senha respeitando as regras abaixo.</li>
    </ol>
    <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#0f172a;">Regras da nova senha</p>
    <ul style="margin:0 0 8px;padding-left:20px;color:#334155;font-size:14px;line-height:1.6;">${rules}</ul>
    <p style="margin:0 0 8px;font-size:13px;color:#64748b;">Exemplo: ${escapeHtml(PASSWORD_EXAMPLE)}</p>
    ${cta(appUrl, 'Criar minha nova senha')}`
  );
}
