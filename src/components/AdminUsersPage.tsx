import React, { useEffect, useState } from 'react';
import { Download, History, KeyRound, Loader2, ShieldCheck, Trash2, UserCheck, UserX, X } from 'lucide-react';
import { openBackupDocument } from '../lib/backupDocument';
import { formatPhone } from '../lib/phone';
import {
  activateUser,
  AdminActionResult,
  deleteUserHistory,
  deleteUserRegistration,
  fetchUserBackup,
  mapAuthError,
  requestAdminPasswordReset,
  requestedPasswordReset,
  requiresPasswordReset,
  revokeUserAccess,
  sendAdminTestEmail,
  subscribeUsers,
  UserProfile,
} from '../services/authService';

export interface AdminUsersPageProps {
  currentUserId: string;
  onResetOwnPassword: () => void;
}

function emailsMatch(typed: string, actual?: string | null): boolean {
  return typed.trim().toLowerCase() === String(actual || '').trim().toLowerCase();
}

function emailNote(result: AdminActionResult, fallbackTo?: string): string {
  const to = result.emailTo || fallbackTo;
  if (result.emailSent && to) return ` E-mail aceito pelo Brevo para ${to}. Se não chegar, veja spam e os logs do Brevo.`;
  if (result.emailError) return ` O e-mail não foi enviado: ${result.emailError}`;
  return ' O e-mail não foi enviado.';
}

function AdminUsersPage({ currentUserId, onResetOwnPassword }: AdminUsersPageProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [resetConfirm, setResetConfirm] = useState('');
  const [purgeTarget, setPurgeTarget] = useState<{user: UserProfile; mode: 'registration' | 'history'} | null>(null);
  const [purgeConfirm, setPurgeConfirm] = useState('');

  useEffect(() => {
    const unsubscribe = subscribeUsers(
      (items) => {
        setUsers(items);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );
    return unsubscribe;
  }, []);

  const closeResetModal = () => {
    if (busyId && resetTarget && busyId === resetTarget.id) return;
    setResetTarget(null);
    setResetConfirm('');
  };

  const closePurgeModal = () => {
    if (busyId && purgeTarget && busyId === purgeTarget.user.id) return;
    setPurgeTarget(null);
    setPurgeConfirm('');
  };

  const removedNote = (result: AdminActionResult): string => {
    const patients = result.patients || 0;
    const consultations = result.consultations || 0;
    const parts = [
      patients ? `${patients} paciente${patients === 1 ? '' : 's'}` : '',
      consultations ? `${consultations} atendimento${consultations === 1 ? '' : 's'}` : '',
    ].filter(Boolean);
    if (!parts.length) return ' Não havia pacientes nem atendimentos.';
    return ` Saíram ${parts.join(' e ')}.`;
  };

  const handleActivate = async (userId: string) => {
    setBusyId(userId);
    setError(null);
    setSuccess(null);
    try {
      const result = await activateUser(userId);
      setSuccess(`Acesso liberado.${emailNote(result)}`);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleRevoke = async (user: UserProfile) => {
    if (user.id === currentUserId) return;
    if (user.role === 'admin') return;
    const confirmed = window.confirm(
      `Remover o acesso de ${user.displayName || user.email}? Essa pessoa não conseguirá entrar até você liberar de novo.`
    );
    if (!confirmed) return;

    setBusyId(user.id);
    setError(null);
    setSuccess(null);
    try {
      const result = await revokeUserAccess(user.id);
      setSuccess(`Acesso revogado.${emailNote(result, user.email)}`);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmReset = async () => {
    if (!resetTarget) return;
    if (!emailsMatch(resetConfirm, resetTarget.email)) return;

    setBusyId(resetTarget.id);
    setError(null);
    setSuccess(null);
    try {
      await requestAdminPasswordReset(resetTarget.id);
      setSuccess(`A senha de ${resetTarget.displayName || resetTarget.email} foi resetada. O cliente recebe um e-mail com as instruções. Se não chegar, veja spam e os logs do Brevo.`);
      setResetTarget(null);
      setResetConfirm('');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmPurge = async () => {
    if (!purgeTarget) return;
    if (!emailsMatch(purgeConfirm, purgeTarget.user.email)) return;

    const target = purgeTarget.user;
    const mode = purgeTarget.mode;
    setBusyId(target.id);
    setError(null);
    setSuccess(null);
    try {
      const result = mode === 'registration'
        ? await deleteUserRegistration(target.id)
        : await deleteUserHistory(target.id);
      const name = target.displayName || target.email;
      setSuccess(
        mode === 'registration'
          ? `Cadastro de ${name} excluído.${removedNote(result)}`
          : `Histórico de ${name} excluído.${removedNote(result)} O cadastro e o login permanecem.`
      );
      setPurgeTarget(null);
      setPurgeConfirm('');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleBackup = async (user: UserProfile) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('O navegador bloqueou a janela do backup. Permita a abertura de janelas e tente de novo.');
      return;
    }
    printWindow.document.write('<p style="font-family:sans-serif;padding:24px">Preparando o backup...</p>');
    setBusyId(user.id);
    setError(null);
    setSuccess(null);
    try {
      const backup = await fetchUserBackup(user.id);
      openBackupDocument(backup, printWindow);
      setSuccess(`Backup de ${user.displayName || user.email} pronto. Salve como PDF na janela que abriu.`);
    } catch (err) {
      printWindow.close();
      setError(mapAuthError(err));
    } finally {
      setBusyId(null);
    }
  };

  const statusLabel = (user: UserProfile) => {
    if (requiresPasswordReset(user)) return 'Aguardando nova senha';
    if (requestedPasswordReset(user)) return 'Pediu reset de senha';
    if (user.status === 'active') return 'Ativa';
    if (user.status === 'revoked') return 'Revogada';
    return 'Pendente';
  };

  const statusClass = (user: UserProfile) => {
    if (requiresPasswordReset(user) || requestedPasswordReset(user)) {
      return 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800';
    }
    if (user.status === 'active') return 'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700';
    if (user.status === 'revoked') return 'inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700';
    return 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700';
  };

  const canReset = (user: UserProfile) =>
    user.id !== currentUserId && user.role !== 'admin' && user.status !== 'revoked';

  const actionBase = 'inline-flex w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60 cursor-pointer lg:w-auto';
  const actionColors = {
    activate: 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800',
    revoke: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
    reset: 'border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100',
    backup: 'border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100',
    history: 'border-orange-300 bg-orange-50 text-orange-800 hover:bg-orange-100',
    registration: 'border-rose-600 bg-rose-600 text-white hover:bg-rose-700',
  };

  const renderUserActions = (user: UserProfile, isSelf: boolean, isAdmin: boolean) => (
    <div className="grid grid-cols-1 gap-2 min-[480px]:grid-cols-2 sm:grid-cols-3 lg:flex lg:flex-wrap lg:justify-start">
      {(user.status === 'pending' || user.status === 'revoked') && (
        <button
          type="button"
          onClick={() => handleActivate(user.id)}
          disabled={busyId === user.id}
          className={`${actionBase} ${actionColors.activate}`}
        >
          {busyId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserCheck className="h-3.5 w-3.5" />}
          {user.status === 'revoked' ? 'Reativar' : 'Ativar'}
        </button>
      )}
      {user.status === 'active' && !isSelf && !isAdmin && (
        <button
          type="button"
          onClick={() => handleRevoke(user)}
          disabled={busyId === user.id}
          className={`${actionBase} ${actionColors.revoke}`}
        >
          {busyId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
          Revogar acesso
        </button>
      )}
      {canReset(user) && (
        <button
          type="button"
          onClick={() => {
            setSuccess(null);
            setError(null);
            setResetConfirm('');
            setResetTarget(user);
          }}
          disabled={busyId === user.id}
          className={`${actionBase} ${actionColors.reset}`}
        >
          {busyId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
          Resetar senha
        </button>
      )}
      {!isSelf && !isAdmin && (
        <>
          <button
            type="button"
            onClick={() => { void handleBackup(user); }}
            disabled={busyId === user.id}
            className={`${actionBase} ${actionColors.backup}`}
          >
            {busyId === user.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Fazer backup
          </button>
          <button
            type="button"
            onClick={() => {
              setSuccess(null);
              setError(null);
              setResetTarget(null);
              setResetConfirm('');
              setPurgeConfirm('');
              setPurgeTarget({user, mode: 'history'});
            }}
            disabled={busyId === user.id}
            className={`${actionBase} ${actionColors.history}`}
          >
            <History className="h-3.5 w-3.5" />
            Excluir histórico
          </button>
          <button
            type="button"
            onClick={() => {
              setSuccess(null);
              setError(null);
              setResetTarget(null);
              setResetConfirm('');
              setPurgeConfirm('');
              setPurgeTarget({user, mode: 'registration'});
            }}
            disabled={busyId === user.id}
            className={`${actionBase} ${actionColors.registration}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir cadastro
          </button>
        </>
      )}
      {user.status === 'active' && (isSelf || isAdmin) && (
        <span className="col-span-2 text-xs text-slate-400 sm:col-span-3 lg:col-span-1">
          {isSelf ? 'Sua conta' : 'Admin'}
        </span>
      )}
    </div>
  );

  return (
    <div className="min-w-0 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Acessos</h2>
        <p className="text-sm text-slate-500">
          Quando um cliente pedir reset, o status muda para Pediu reset de senha. Aí você confirma o e-mail e apaga a senha antiga.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              setBusyId('test-email');
              setError(null);
              setSuccess(null);
              try {
                const result = await sendAdminTestEmail();
                setSuccess(`Teste de e-mail:${emailNote(result)}`);
              } catch (err) {
                setError(mapAuthError(err));
              } finally {
                setBusyId(null);
              }
            }}
            disabled={busyId === 'test-email'}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
          >
            {busyId === 'test-email' ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Enviar e-mail de teste para o admin
          </button>
          <button
            type="button"
            onClick={onResetOwnPassword}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <KeyRound className="mr-1.5 h-3.5 w-3.5" />
            Trocar minha senha
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {success && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
        <div className="space-y-3 lg:hidden">
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const isAdmin = user.role === 'admin';
            return (
              <article
                key={user.id}
                className={requestedPasswordReset(user) ? 'min-w-0 rounded-2xl border border-amber-200 bg-amber-50/70 p-4' : 'min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{user.displayName}</p>
                    <p className="truncate text-sm text-slate-600">{user.email}</p>
                  </div>
                  <span className={statusClass(user)}>
                    {user.status === 'active' && !requiresPasswordReset(user) && !requestedPasswordReset(user) ? <ShieldCheck className="h-3.5 w-3.5" /> : null}
                    {requiresPasswordReset(user) || requestedPasswordReset(user) ? <KeyRound className="h-3.5 w-3.5" /> : null}
                    {statusLabel(user)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  CRMV {user.crmv || '—'} · {formatPhone(user.contato || '') || user.contato || '—'}
                </p>
                <div className="mt-3">
                  {renderUserActions(user, isSelf, isAdmin)}
                </div>
              </article>
            );
          })}
          {users.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
              Nenhuma solicitação de acesso ainda.
            </div>
          )}
        </div>
        <div className="hidden min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:block">
          <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.45fr)_5.5rem_9.5rem_auto] gap-x-4 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500">
            <span>Veterinário</span>
            <span>E-mail</span>
            <span>CRMV</span>
            <span>Contato</span>
            <span>Status</span>
          </div>
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const isAdmin = user.role === 'admin';
            return (
              <div
                key={user.id}
                className={requestedPasswordReset(user) ? 'border-t border-amber-100 bg-amber-50/70 px-4 py-3' : 'border-t border-slate-100 px-4 py-3'}
              >
                <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1.45fr)_5.5rem_9.5rem_auto] items-center gap-x-4 text-sm">
                  <p className="truncate font-medium text-slate-900" title={user.displayName}>{user.displayName}</p>
                  <p className="truncate text-slate-600" title={user.email}>{user.email}</p>
                  <p className="truncate text-slate-500" title={user.crmv || undefined}>{user.crmv || '—'}</p>
                  <p className="truncate text-slate-600" title={formatPhone(user.contato || '') || user.contato || undefined}>
                    {formatPhone(user.contato || '') || user.contato || '—'}
                  </p>
                  <span className={statusClass(user)}>
                    {user.status === 'active' && !requiresPasswordReset(user) && !requestedPasswordReset(user) ? <ShieldCheck className="h-3.5 w-3.5" /> : null}
                    {requiresPasswordReset(user) || requestedPasswordReset(user) ? <KeyRound className="h-3.5 w-3.5" /> : null}
                    {statusLabel(user)}
                  </span>
                </div>
                <div className="mt-2">
                  {renderUserActions(user, isSelf, isAdmin)}
                </div>
              </div>
            );
          })}
          {users.length === 0 && (
            <div className="border-t border-slate-100 px-4 py-10 text-center text-sm text-slate-500">
              Nenhuma solicitação de acesso ainda.
            </div>
          )}
        </div>
        </>
      )}

      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={closeResetModal}
            aria-label="Fechar confirmação"
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={closeResetModal}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <KeyRound className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Resetar senha</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              A senha atual de <strong>{resetTarget.displayName || resetTarget.email}</strong> será
              apagada. O cliente recebe um e-mail em ajudavoce.com.br com o passo a passo para criar a nova senha.
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Para confirmar, informe o e-mail desta conta.
            </p>
            <input
              type="email"
              value={resetConfirm}
              onChange={(event) => setResetConfirm(event.target.value)}
              className="mt-3 flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              placeholder="e-mail da conta"
              autoComplete="off"
              disabled={busyId === resetTarget.id}
            />
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closeResetModal}
                disabled={busyId === resetTarget.id}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                disabled={busyId === resetTarget.id || !emailsMatch(resetConfirm, resetTarget.email)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60 cursor-pointer"
              >
                {busyId === resetTarget.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Confirmar reset
              </button>
            </div>
          </div>
        </div>
      )}

      {purgeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={closePurgeModal}
            aria-label="Fechar confirmação"
          />
          <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={closePurgeModal}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-700 cursor-pointer"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${purgeTarget.mode === 'registration' ? 'bg-rose-100 text-rose-700' : 'bg-orange-100 text-orange-700'}`}>
              {purgeTarget.mode === 'registration' ? <Trash2 className="h-5 w-5" /> : <History className="h-5 w-5" />}
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">
              {purgeTarget.mode === 'registration' ? 'Excluir cadastro' : 'Excluir histórico'}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {purgeTarget.mode === 'registration' ? (
                <>
                  O cadastro de <strong>{purgeTarget.user.displayName || purgeTarget.user.email}</strong> será
                  apagado, junto com os pacientes e os atendimentos. Essa pessoa não consegue mais entrar.
                </>
              ) : (
                <>
                  Os pacientes e os atendimentos de <strong>{purgeTarget.user.displayName || purgeTarget.user.email}</strong> serão
                  apagados. O cadastro e o login permanecem.
                </>
              )}
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Para confirmar, informe o e-mail desta conta.
            </p>
            <input
              type="email"
              value={purgeConfirm}
              onChange={(event) => setPurgeConfirm(event.target.value)}
              className={`mt-3 flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 ${purgeTarget.mode === 'registration' ? 'focus-visible:ring-rose-500' : 'focus-visible:ring-orange-500'}`}
              placeholder="e-mail da conta"
              autoComplete="off"
              disabled={busyId === purgeTarget.user.id}
            />
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={closePurgeModal}
                disabled={busyId === purgeTarget.user.id}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmPurge}
                disabled={busyId === purgeTarget.user.id || !emailsMatch(purgeConfirm, purgeTarget.user.email)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 cursor-pointer ${purgeTarget.mode === 'registration' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-orange-600 hover:bg-orange-700'}`}
              >
                {busyId === purgeTarget.user.id ? <Loader2 className="h-4 w-4 animate-spin" /> : purgeTarget.mode === 'registration' ? <Trash2 className="h-4 w-4" /> : <History className="h-4 w-4" />}
                {purgeTarget.mode === 'registration' ? 'Excluir cadastro' : 'Excluir histórico'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUsersPage;
