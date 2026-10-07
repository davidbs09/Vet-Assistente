import { Dog, Globe, LogOut } from 'lucide-react';
import { Button } from '../ui';

export default function AppHeader({
  displayName,
  email,
  isAdmin,
  onGoHome,
  onOpenAdmin,
  onOpenDeployGuide,
  onLogout,
}: {
  displayName?: string | null;
  email?: string | null;
  isAdmin: boolean;
  onGoHome: () => void;
  onOpenAdmin: () => void;
  onOpenDeployGuide: () => void;
  onLogout: () => void;
}) {
  const label = displayName || email || 'U';

  return (
    <header className="sticky top-0 z-10 border-bottom border-slate-200 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 cursor-pointer" onClick={onGoHome}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
            <Dog className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-900 hidden sm:block">VetAI</span>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onOpenDeployGuide}
            className="hidden md:flex items-center gap-1.5 rounded-full bg-slate-100 hover:bg-slate-200 px-3 py-1 text-xs font-medium text-slate-700 transition-colors cursor-pointer border border-slate-200"
            title="Guia de Implantação e Domínio www.ajudavoce.com.br"
          >
            <Globe className="h-3.5 w-3.5 text-emerald-600" />
            <span>ajudavoce.com.br</span>
          </button>

          <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Login Único Ativo</span>
          </div>

          {isAdmin && (
            <button
              type="button"
              onClick={onOpenAdmin}
              className="hidden sm:flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-slate-800 cursor-pointer"
            >
              Acessos
            </button>
          )}

          <div className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white">
              {label.slice(0, 1).toUpperCase()}
            </div>
            <span className="text-sm font-medium text-slate-700 hidden sm:block">
              {displayName || email}
            </span>
          </div>
          <Button variant="ghost" size="sm" onClick={onLogout}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
