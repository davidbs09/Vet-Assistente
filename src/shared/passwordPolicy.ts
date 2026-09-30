export const PASSWORD_EXAMPLE = 'Senha@123';

export const PASSWORD_POLICY_MESSAGE =
  `A senha precisa ter letra maiúscula, minúscula, número e caractere especial. Exemplo: ${PASSWORD_EXAMPLE}`;

export function validatePasswordPolicy(password: string): string | null {
  if (!password) return 'Informe a senha.';
  if (password.length > 128) return 'A senha é longa demais.';

  const isStrong =
    password.length >= 8
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /[0-9]/.test(password)
    && /[^A-Za-z0-9]/.test(password);

  if (!isStrong) return PASSWORD_POLICY_MESSAGE;
  return null;
}
