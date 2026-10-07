import { Loader2, Lock, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '../ui';

export function AppLoadingScreen() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
    </div>
  );
}

export function SessionCheckingScreen({ email }: { email?: string | null }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      <p className="mt-3 text-sm font-medium text-slate-600">Verificando exclusividade da sessão para {email}...</p>
    </div>
  );
}

export function SessionRevokedScreen({ onReenter }: { onReenter: () => void }) {
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

        <Button onClick={onReenter} className="w-full" size="lg">
          Entrar Novamente
        </Button>
      </motion.div>
    </div>
  );
}

export function SessionConflictScreen({
  email,
  lastActive,
  sessionError,
  checkingConflict,
  onRecheck,
  onForceClaim,
  onLogout,
}: {
  email?: string | null;
  lastActive?: Date;
  sessionError?: string | null;
  checkingConflict: boolean;
  onRecheck: () => void;
  onForceClaim: () => void;
  onLogout: () => void;
}) {
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
            O e-mail <strong className="text-slate-900">{email}</strong> já possui uma sessão ativa em outro dispositivo, navegador ou aba neste momento.
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
          {lastActive && (
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-500">Última pulsação registrada:</span>
              <span className="font-mono text-slate-700">{lastActive.toLocaleTimeString('pt-BR')}</span>
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
            onClick={onRecheck} 
            variant="outline" 
            className="w-full flex items-center justify-center gap-2"
            disabled={checkingConflict}
          >
            {checkingConflict ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Verificar se a outra sessão foi fechada
          </Button>

          <Button 
            onClick={onForceClaim} 
            className="w-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center gap-2 shadow-sm"
            disabled={checkingConflict}
          >
            {checkingConflict ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
            Desconectar outra sessão e acessar aqui
          </Button>

          <Button 
            onClick={onLogout} 
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
