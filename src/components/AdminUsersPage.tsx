import React, { useEffect, useState } from 'react';
import { Loader2, ShieldCheck, UserCheck } from 'lucide-react';
import { activateUser, listUsers, UserProfile } from '../services/authService';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar os usuários.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleActivate = async (userId: string) => {
    setActivatingId(userId);
    setError(null);
    try {
      await activateUser(userId);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível ativar esta conta.');
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Acessos</h2>
        <p className="text-sm text-slate-500">
          Contas novas ficam pendentes até você autorizar o login.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
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
              {users.map((user) => (
                <tr key={user.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{user.displayName}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3 text-slate-500">{user.crmv || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        user.status === 'active'
                          ? 'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700'
                          : 'inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700'
                      }
                    >
                      {user.status === 'active' ? (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      ) : null}
                      {user.status === 'active' ? 'Ativa' : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {user.status === 'pending' ? (
                      <button
                        type="button"
                        onClick={() => handleActivate(user.id)}
                        disabled={activatingId === user.id}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 cursor-pointer"
                      >
                        {activatingId === user.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <UserCheck className="h-3.5 w-3.5" />
                        )}
                        Ativar
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Liberada</span>
                    )}
                  </td>
                </tr>
              ))}
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
    </div>
  );
}
