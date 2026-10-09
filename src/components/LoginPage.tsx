import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock, Stethoscope, ShieldCheck } from 'lucide-react';
import fundoLogin from '../source/fundo-login.png';
import { formatPhone, isValidPhone, normalizePhone } from '../lib/phone';
import { validateLoginIdentifier, validateNewPassword } from '../services/authService';
import { PASSWORD_POLICY_MESSAGE } from '../shared/passwordPolicy';
import AccessTermsModal from './auth/AccessTermsModal';
import SupportContacts from './auth/SupportContacts';

export type LoginPageView = 'home' | 'login' | 'register' | 'forgot' | 'new-password';

export interface RegisterFormValues {
  displayName: string;
  email: string;
  crmv: string;
  contato: string;
  password: string;
}

export interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (values: RegisterFormValues) => Promise<void>;
  onCompletePasswordReset: (email: string, password: string) => Promise<void>;
  onRequestPasswordReset: (email: string) => Promise<void>;
  passwordResetEmail?: string | null;
  passwordResetNonce?: number;
  error?: string | null;
  success?: string | null;
  submitting?: boolean;
  heroImageUrl?: string;
}

const DEFAULT_HERO_IMAGE = fundoLogin;

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  required = true,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-slate-600" htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          required={required}
        />
        <button
          type="button"
          onClick={() => setVisible((current) => !current)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700 cursor-pointer"
          aria-label={visible ? 'Esconder senha' : 'Exibir senha'}
          tabIndex={0}
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage({
  onLogin,
  onRegister,
  onCompletePasswordReset,
  onRequestPasswordReset,
  passwordResetEmail = null,
  passwordResetNonce = 0,
  error,
  success,
  submitting = false,
  heroImageUrl = DEFAULT_HERO_IMAGE,
}: LoginPageProps) {
  const [view, setView] = useState<LoginPageView>('home');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [crmv, setCrmv] = useState('');
  const [contato, setContato] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [forgotSent, setForgotSent] = useState(false);
  const [showTerms, setShowTerms] = useState(false);

  const feedback = formError || error;

  useEffect(() => {
    if (error && view === 'home') {
      setView('login');
    }
  }, [error, view]);

  useEffect(() => {
    if (!passwordResetEmail) return;
    setEmail(passwordResetEmail);
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
    setView('new-password');
  }, [passwordResetEmail, passwordResetNonce]);

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
  };

  const goTo = (next: LoginPageView) => {
    resetForm();
    setForgotSent(false);
    setView(next);
  };

  const requestAccess = () => {
    goTo('register');
  };

  const sendRegister = async () => {
    try {
      await onRegister({
        displayName: displayName.trim(),
        email: email.trim(),
        crmv: crmv.trim(),
        contato: normalizePhone(contato),
        password,
      });
      resetForm();
      setView('login');
    } catch (_) {
      // App already maps the error; keep the register form visible.
    }
  };

  const acceptTermsAndContinue = async () => {
    setShowTerms(false);
    await sendRegister();
  };

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const identifierError = validateLoginIdentifier(email);
    if (identifierError) {
      setFormError(identifierError);
      return;
    }
    if (password && password.length < 6) {
      setFormError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    await onLogin(email.trim(), password);
  };

  const handleNewPasswordSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const identifierError = validateLoginIdentifier(email);
    if (identifierError) {
      setFormError(identifierError);
      return;
    }
    const passwordError = validateNewPassword(password, confirmPassword);
    if (passwordError) {
      setFormError(passwordError);
      return;
    }
    await onCompletePasswordReset(email.trim(), password);
  };

  const handleForgotSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const identifierError = validateLoginIdentifier(email);
    if (identifierError) {
      setFormError(identifierError);
      return;
    }
    try {
      await onRequestPasswordReset(email.trim());
      setForgotSent(true);
    } catch (_) {
      // App already maps the error.
    }
  };

  const handleRegisterSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!displayName.trim() || !email.trim() || !crmv.trim() || !contato.trim() || !password) {
      setFormError('Preencha nome, e-mail, CRMV, contato e senha para solicitar o acesso.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormError('Informe um e-mail válido.');
      return;
    }
    if (!isValidPhone(contato)) {
      setFormError('Informe o contato com DDD e número. Ex: (11) 96464-6464');
      return;
    }
    const passwordError = validateNewPassword(password, confirmPassword);
    if (passwordError) {
      setFormError(passwordError);
      return;
    }
    setShowTerms(true);
  };

  const inputClass =
    'flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50';

  return (
    <>
    <div className="relative min-h-screen bg-white">
      <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-[50%] lg:block">
        <img
          src={heroImageUrl}
          alt=""
          decoding="async"
          fetchPriority="low"
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/85 to-white/20" />
      </div>

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 py-6 sm:px-10 lg:px-16">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-700 text-white">
            <Stethoscope className="h-5 w-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight text-slate-900">
            VetAssistent AI
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={requestAccess}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-white/60 hover:text-slate-900 cursor-pointer"
          >
            Registrar
          </button>
          <button
            type="button"
            onClick={() => goTo('login')}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 cursor-pointer"
          >
            Entrar
          </button>
        </div>
      </header>

      <div className="relative z-10 flex min-h-screen items-center px-6 sm:px-10 lg:px-16">
        <div className="w-full max-w-xl py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
            Uso exclusivo de médicos veterinários
          </span>

          <h1 className="mt-6 font-serif text-4xl leading-tight tracking-tight text-slate-900 sm:text-5xl">
            Mais dados, mais precisão.{' '}
            <span className="text-slate-500">Uma decisão clínica mais completa.</span>
          </h1>

          {view === 'home' && (
            <div className="mt-6 space-y-3 text-sm leading-relaxed text-slate-600">
              <p>
                Escreva a anamnese, anexe exames do paciente em JPEG ou TXT e deixe a
                IA cruzar essas informações para auxiliar na identificação dos
                principais diagnósticos diferenciais.
              </p>
              <p>
                A plataforma analisa os dados clínicos de forma precisa, ajudando o
                médico-veterinário a interpretar o caso com mais informações e
                segurança.
              </p>
              <p>
                Além dos diferenciais, a IA apresenta possibilidades de conduta
                terapêutica e calcula a posologia de medicamentos de acordo com o peso
                do paciente, indicando as doses em mL ou comprimidos.
              </p>
              <p>
                Mais informação para apoiar seu raciocínio clínico e tornar sua tomada
                de decisão mais completa.
              </p>
            </div>
          )}

          {feedback && (
            <div className="mt-6 space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-left text-xs text-rose-800">
              <div className="flex items-center gap-1.5 font-semibold text-rose-900">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                {feedback.includes('pendente')
                  ? 'Acesso pendente'
                  : view === 'register'
                    ? 'Não foi possível enviar a solicitação'
                    : view === 'new-password'
                      ? 'Não foi possível salvar a nova senha'
                      : 'Não foi possível autenticar'}
              </div>
              <p className="leading-relaxed">{feedback}</p>
            </div>
          )}

          {success && (
            <div className="mt-6 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left text-xs text-emerald-800">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-900">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                Cadastro enviado
              </div>
              <p className="leading-relaxed">{success}</p>
            </div>
          )}

          <div>
            {view === 'home' && (
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={requestAccess}
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-700 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800 cursor-pointer"
                >
                  Solicitar acesso
                </button>
                <button
                  type="button"
                  onClick={() => goTo('login')}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
                >
                  Já tenho senha
                </button>
              </div>
            )}

            {view === 'login' && (
              <form
                onSubmit={handleLoginSubmit}
                className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Entrar</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Use o usuário ou e-mail e a senha da conta já ativada pelo administrador.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600" htmlFor="login-email">Usuário ou e-mail</label>
                  <input
                    id="login-email"
                    type="text"
                    autoComplete="username"
                    className={inputClass}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    disabled={submitting}
                    placeholder="admin"
                    required
                  />
                </div>
                <PasswordField
                  id="login-password"
                  label="Senha"
                  autoComplete="current-password"
                  value={password}
                  onChange={(value) => {
                    setPassword(value);
                    if (formError) setFormError(null);
                  }}
                  disabled={submitting}
                  required={false}
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar'}
                </button>
                <button
                  type="button"
                  onClick={() => goTo('forgot')}
                  className="w-full text-center text-xs font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Esqueceu a senha?
                </button>
                <button
                  type="button"
                  onClick={requestAccess}
                  className="w-full text-center text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  Ainda não tenho acesso — solicitar cadastro
                </button>
              </form>
            )}

            {view === 'register' && (
              <form
                onSubmit={handleRegisterSubmit}
                className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Solicitar acesso</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    A conta fica pendente até o administrador autorizar o login.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600" htmlFor="register-name">Nome completo</label>
                  <input
                    id="register-name"
                    type="text"
                    className={inputClass}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600" htmlFor="register-email">E-mail</label>
                    <input
                      id="register-email"
                      type="email"
                      autoComplete="email"
                      className={inputClass}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={submitting}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600" htmlFor="register-crmv">CRMV</label>
                    <input
                      id="register-crmv"
                      type="text"
                      className={inputClass}
                      value={crmv}
                      onChange={(e) => setCrmv(e.target.value)}
                      disabled={submitting}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600" htmlFor="register-contato">Contato</label>
                  <input
                    id="register-contato"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    className={inputClass}
                    value={contato}
                    onChange={(e) => setContato(formatPhone(e.target.value))}
                    disabled={submitting}
                    maxLength={15}
                    minLength={14}
                    pattern="\(\d{2}\) \d{4,5}-\d{4}"
                    placeholder="(00) 00000-0000"
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <PasswordField
                    id="register-password"
                    label="Senha"
                    autoComplete="new-password"
                    value={password}
                    onChange={setPassword}
                    disabled={submitting}
                  />
                  <PasswordField
                    id="register-confirm"
                    label="Confirmar senha"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    disabled={submitting}
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {PASSWORD_POLICY_MESSAGE}
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar solicitação'}
                </button>
                <button
                  type="button"
                  onClick={() => goTo('login')}
                  className="w-full text-center text-xs font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Já tenho senha — entrar
                </button>
              </form>
            )}

            {view === 'forgot' && (
              <form
                onSubmit={handleForgotSubmit}
                className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Resetar senha</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Informe o e-mail da conta. O administrador será avisado e você receberá um e-mail com as instruções quando o reset for concluído.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600" htmlFor="forgot-email">E-mail</label>
                  <input
                    id="forgot-email"
                    type="email"
                    autoComplete="email"
                    className={inputClass}
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (formError) setFormError(null);
                      if (forgotSent) setForgotSent(false);
                    }}
                    disabled={submitting}
                    placeholder="seu@email.com"
                    required
                  />
                </div>
                {forgotSent && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-emerald-800">
                    Pedido enviado. Aguarde o e-mail com as instruções. Não é necessário entrar em contato com o administrador.
                  </div>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar pedido de reset'}
                </button>
                <button
                  type="button"
                  onClick={() => goTo('login')}
                  className="w-full text-center text-xs font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Voltar para o login
                </button>
              </form>
            )}

            {view === 'new-password' && (
              <form
                onSubmit={handleNewPasswordSubmit}
                className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Definir nova senha</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Sua senha anterior foi apagada pelo administrador. Crie uma nova senha para entrar no sistema.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600" htmlFor="reset-email">E-mail</label>
                  <input
                    id="reset-email"
                    type="text"
                    autoComplete="username"
                    className={inputClass}
                    value={email}
                    readOnly
                    disabled
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <PasswordField
                    id="reset-password"
                    label="Nova senha"
                    autoComplete="new-password"
                    value={password}
                    onChange={setPassword}
                    disabled={submitting}
                  />
                  <PasswordField
                    id="reset-confirm"
                    label="Confirmar nova senha"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    disabled={submitting}
                  />
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">
                  {PASSWORD_POLICY_MESSAGE}
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-700 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar senha e entrar'}
                </button>
                <button
                  type="button"
                  onClick={() => goTo('login')}
                  className="w-full text-center text-xs font-medium text-slate-600 hover:text-slate-800 cursor-pointer"
                >
                  Voltar para o login
                </button>
              </form>
            )}
          </div>

          <div className="mt-10 border-t border-slate-100 pt-5">
            <SupportContacts />
          </div>

          <p className="mt-5 flex items-center gap-1.5 text-xs text-slate-400">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            Cadastro validado pelo CRMV e autorizado manualmente para evitar indução.
          </p>
        </div>
      </div>

    </div>

      <AccessTermsModal
        open={showTerms}
        onClose={() => setShowTerms(false)}
        onAccept={acceptTermsAndContinue}
      />
    </>
  );
}
