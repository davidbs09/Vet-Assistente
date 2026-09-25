import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle2, Loader2, Lock, Stethoscope, ShieldCheck } from 'lucide-react';
import fundoLogin from '../source/fundo-login.png';

export type LoginPageView = 'home' | 'login' | 'register';

export interface RegisterFormValues {
  displayName: string;
  email: string;
  crmv: string;
  password: string;
}

export interface LoginPageProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (values: RegisterFormValues) => Promise<void>;
  error?: string | null;
  success?: string | null;
  submitting?: boolean;
  heroImageUrl?: string;
}

const DEFAULT_HERO_IMAGE = fundoLogin;

export default function LoginPage({
  onLogin,
  onRegister,
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
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const feedback = formError || error;

  const resetForm = () => {
    setPassword('');
    setConfirmPassword('');
    setFormError(null);
  };

  const goTo = (next: LoginPageView) => {
    resetForm();
    setView(next);
  };

  const handleLoginSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!email.trim() || !password) {
      setFormError('Informe e-mail e senha para entrar.');
      return;
    }
    await onLogin(email.trim(), password);
  };

  const handleRegisterSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (!displayName.trim() || !email.trim() || !password) {
      setFormError('Preencha nome, e-mail e senha para solicitar o acesso.');
      return;
    }
    if (password.length < 6) {
      setFormError('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setFormError('As senhas não coincidem.');
      return;
    }
    await onRegister({
      displayName: displayName.trim(),
      email: email.trim(),
      crmv: crmv.trim(),
      password,
    });
    resetForm();
    setView('login');
  };

  const inputClass =
    'flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 disabled:opacity-50';

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <div className="absolute inset-y-0 right-0 hidden w-[58%] lg:block">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${heroImageUrl})`,
            maskImage:
              'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 22%, #000 48%)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 22%, #000 48%)',
          }}
        />
        <div
          className="absolute inset-y-0 left-0 w-2/3 backdrop-blur-md"
          style={{
            maskImage: 'linear-gradient(to right, #000 0%, transparent 75%)',
            WebkitMaskImage: 'linear-gradient(to right, #000 0%, transparent 75%)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/25 to-transparent" />
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
            onClick={() => goTo('register')}
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
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-xl py-28"
        >
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
                {feedback.includes('pendente') ? 'Acesso pendente' : 'Não foi possível autenticar'}
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

          <AnimatePresence mode="wait">
            {view === 'home' && (
              <motion.div
                key="home-actions"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-8 flex flex-col gap-3 sm:flex-row"
              >
                <button
                  type="button"
                  onClick={() => goTo('register')}
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
              </motion.div>
            )}

            {view === 'login' && (
              <motion.form
                key="login-form"
                onSubmit={handleLoginSubmit}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur"
              >
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Entrar</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Use o e-mail e a senha da conta já ativada pelo administrador.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-600" htmlFor="login-email">E-mail</label>
                  <input
                    id="login-email"
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
                  <label className="text-xs font-medium text-slate-600" htmlFor="login-password">Senha</label>
                  <input
                    id="login-password"
                    type="password"
                    autoComplete="current-password"
                    className={inputClass}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={submitting}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 cursor-pointer"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar com e-mail e senha'}
                </button>
                <button
                  type="button"
                  onClick={() => goTo('register')}
                  className="w-full text-center text-xs font-medium text-emerald-700 hover:text-emerald-800 cursor-pointer"
                >
                  Ainda não tenho acesso — solicitar cadastro
                </button>
              </motion.form>
            )}

            {view === 'register' && (
              <motion.form
                key="register-form"
                onSubmit={handleRegisterSubmit}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur"
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
                      placeholder="Opcional"
                    />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600" htmlFor="register-password">Senha</label>
                    <input
                      id="register-password"
                      type="password"
                      autoComplete="new-password"
                      className={inputClass}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={submitting}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-600" htmlFor="register-confirm">Confirmar senha</label>
                    <input
                      id="register-confirm"
                      type="password"
                      autoComplete="new-password"
                      className={inputClass}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={submitting}
                      required
                    />
                  </div>
                </div>
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
              </motion.form>
            )}
          </AnimatePresence>

          <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-400">
            <Lock className="h-3.5 w-3.5 text-slate-400" />
            Cadastro validado pelo CRMV e autorizado manualmente para evitar indução.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
