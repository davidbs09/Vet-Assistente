import React, { useEffect, useState } from 'react';
import { KeyRound, Loader2, ShieldCheck, UserCheck, UserX, X } from 'lucide-react';
import {
  activateUser,
  mapAuthError,
  requestAdminPasswordReset,
  requestedPasswordReset,
  requiresPasswordReset,
  revokeUserAccess,
  subscribeUsers,
  UserProfile,
} from '../services/authService';

export interface AdminUsersPageProps {
  currentUserId: string;
}

function emailsMatch(typed: string, actual?: string | null): boolean {
  return typed.trim().toLowerCase() === String(actual || '').trim().toLowerCase();
}

function AdminUsersPage({ currentUserId }: AdminUsersPageProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [resetConfirm, setResetConfirm] = useState('');

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

  const handleActivate = async (userId: string) => {
    setBusyId(userId);
    setError(null);
    setSuccess(null);
    try {
      await activateUser(userId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ativar esta conta.');
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
      await revokeUserAccess(user.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível remover o acesso desta conta.');
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
      setSuccess(`A senha de ${resetTarget.displayName || resetTarget.email} foi apagada. A pessoa entra sem senha e define uma nova.`);
      setResetTarget(null);
      setResetConfirm('');
    } catch (err) {
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Acessos</h2>
        <p className="text-sm text-slate-500">
          Quando um cliente pedir reset, o status muda para Pediu reset de senha. Aí você confirma o e-mail e apaga a senha antiga.
        </p>
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
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-medium">Veterinário</th>
                <th className="px-4 py-3 font-medium">E-mail</th>
                <th className="px-4 py-3 font-medium">CRMV</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ação</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const isSelf = user.id === currentUserId;
                const isAdmin = user.role === 'admin';
                return (
                  <tr key={user.id} className={requestedPasswordReset(user) ? 'border-t border-amber-100 bg-amber-50/70' : 'border-t border-slate-100'}>
                    <td className="px-4 py-3 font-medium text-slate-900">{user.displayName}</td>
                    <td className="px-4 py-3 text-slate-600">{user.email}</td>
                    <td className="px-4 py-3 text-slate-500">{user.crmv || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={statusClass(user)}>
                        {user.status === 'active' && !requiresPasswordReset(user) && !requestedPasswordReset(user) ? <ShieldCheck className="h-3.5 w-3.5" /> : null}
                        {requiresPasswordReset(user) || requestedPasswordReset(user) ? <KeyRound className="h-3.5 w-3.5" /> : null}
                        {statusLabel(user)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {(user.status === 'pending' || user.status === 'revoked') && (
                          <button
                            type="button"
                            onClick={() => handleActivate(user.id)}
                            disabled={busyId === user.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                          >
                            {busyId === user.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserCheck className="h-3.5 w-3.5" />
                            )}
                            {user.status === 'revoked' ? 'Reativar' : 'Ativar'}
                          </button>
                        )}
                        {user.status === 'active' && !isSelf && !isAdmin && (
                          <button
                            type="button"
                            onClick={() => handleRevoke(user)}
                            disabled={busyId === user.id}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-60 cursor-pointer"
                          >
                            {busyId === user.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <UserX className="h-3.5 w-3.5" />
                            )}
                            Revogar
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
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-60 cursor-pointer"
                          >
                            {busyId === user.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <KeyRound className="h-3.5 w-3.5" />
                            )}
                            Resetar senha
                          </button>
                        )}
                        {user.status === 'active' && (isSelf || isAdmin) && (
                          <span className="text-xs text-slate-400">
                            {isSelf ? 'Sua conta' : 'Admin'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Nenhuma solicitação de acesso ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <KeyRound className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Resetar senha</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              A senha atual de <strong>{resetTarget.displayName || resetTarget.email}</strong> será
              apagada. Essa pessoa só entra de novo deixando a senha em branco e criando uma nova.
            </p>
            <p className="mt-3 text-sm text-slate-600">
              Para confirmar, informe o e-mail desta conta.
            </p>
            <input
              type="email"
              value={resetConfirm}
              onChange={(event) => setResetConfirm(event.target.value)}
              className="mt-3 flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
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
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60 cursor-pointer"
              >
                {busyId === resetTarget.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Confirmar reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminUsersPage;
