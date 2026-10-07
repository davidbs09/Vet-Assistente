import { Check, Copy, Globe, Server, Code2, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../lib/cn';
import { Button } from './ui';

export default function DeployGuideModal({ 
  onClose, 
  copiedSnippet, 
  setCopiedSnippet 
}: { 
  onClose: () => void; 
  copiedSnippet: string | null; 
  setCopiedSnippet: (val: string | null) => void;
}) {
  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isTargetDomain = currentHostname.includes('ajudavoce.com.br');

  const copyToClipboard = (text: string, label: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedSnippet(label);
      setTimeout(() => setCopiedSnippet(null), 3000);
    }
  };

  const iframeCode = `<iframe 
  src="${typeof window !== 'undefined' ? window.location.origin : 'https://www.ajudavoce.com.br'}" 
  width="100%" 
  height="900" 
  style="border: none; border-radius: 12px; width: 100%; min-height: 800px;" 
  allow="microphone; camera; clipboard-write; fullscreen">
</iframe>`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 sm:p-8 shadow-2xl space-y-6"
      >
        <div className="flex items-start justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
              <Globe className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Implantação em www.ajudavoce.com.br</h2>
              <p className="text-xs text-slate-500">Guia de configuração para execução no seu domínio</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Current status banner */}
        <div className={cn(
          "rounded-xl p-4 border text-xs flex items-start gap-3",
          isTargetDomain 
            ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
            : "bg-slate-50 border-slate-200 text-slate-700"
        )}>
          {isTargetDomain ? (
            <ShieldCheck className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <Globe className="h-5 w-5 text-slate-500 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <div className="font-semibold text-slate-900">
              {isTargetDomain ? "Você já está acessando pelo seu domínio oficial!" : "Ambiente Atual: " + (currentHostname || "Local / Pré-visualização")}
            </div>
            <p className="text-slate-600">
              Domínio de destino: <strong className="text-slate-900">www.ajudavoce.com.br</strong> e <strong className="text-slate-900">ajudavoce.com.br</strong>
            </p>
          </div>
        </div>

        {/* Step 1: Firebase Auth Authorized Domains */}
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold text-sm text-amber-950">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-xs font-bold text-amber-900">1</span>
              Autorizar Domínio no Firebase Authentication (Obrigatório)
            </div>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 uppercase tracking-wider">
              Essencial para Login
            </span>
          </div>
          <p className="text-xs text-amber-900/90 leading-relaxed">
            O Google exige que todo domínio que utilize o Login do Google esteja cadastrado na lista de domínios permitidos do Firebase. Sem este passo, o login retornará o erro <code className="bg-amber-100 px-1 py-0.5 rounded font-mono">auth/unauthorized-domain</code>.
          </p>
          <div className="rounded-lg bg-white p-3 border border-amber-200 text-xs space-y-2">
            <div className="font-medium text-slate-800">Como autorizar em 1 minuto:</div>
            <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-1">
              <li>Acesse o <strong>Firebase Console</strong> (console.firebase.google.com).</li>
              <li>Entre no projeto e clique em <strong>Authentication</strong> no menu lateral.</li>
              <li>Acesse a aba <strong>Settings (Configurações)</strong> e role até <strong>Authorized domains (Domínios Autorizados)</strong>.</li>
              <li>Clique em <strong>Adicionar domínio</strong> e insira separadamente:</li>
            </ol>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="rounded bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 border border-slate-200">
                ajudavoce.com.br
              </span>
              <span className="rounded bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-800 border border-slate-200">
                www.ajudavoce.com.br
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard('ajudavoce.com.br, www.ajudavoce.com.br', 'domains')}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors cursor-pointer"
              >
                {copiedSnippet === 'domains' ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedSnippet === 'domains' ? 'Copiados!' : 'Copiar Domínios'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Step 2: Deployment options */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">2</span>
            Escolha Como Deseja Publicar no seu Domínio
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Option A */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-xs text-slate-900">
                <Server className="h-4 w-4 text-emerald-600" />
                Opção A: Hospedagem Direta dos Arquivos
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Gere os arquivos otimizados rodando <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">npm run build</code>. 
                Envie o conteúdo da pasta <code className="bg-slate-200 px-1 py-0.5 rounded font-mono">dist/</code> para a raiz pública (<code className="font-mono">public_html</code>) de sua hospedagem no domínio <strong>www.ajudavoce.com.br</strong> (cPanel, Hostinger, Vercel, Apache, etc.).
              </p>
            </div>

            {/* Option B */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-xs text-slate-900">
                <Code2 className="h-4 w-4 text-emerald-600" />
                Opção B: Iframe em Página Existente
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Se você já possui um site (WordPress, Wix, etc.) e deseja incorporar este aplicativo dentro de uma página (ex: <code className="font-mono">ajudavoce.com.br/vet</code>), use a tag abaixo.
              </p>
            </div>
          </div>

          {/* Iframe snippet box */}
          <div className="rounded-xl border border-slate-200 bg-slate-900 p-3.5 text-xs text-slate-200 space-y-2">
            <div className="flex items-center justify-between text-slate-400">
              <span className="font-mono text-[11px]">Código para Iframe com Permissão de Microfone:</span>
              <button
                type="button"
                onClick={() => copyToClipboard(iframeCode, 'iframe')}
                className="inline-flex items-center gap-1 rounded bg-slate-800 hover:bg-slate-700 px-2 py-1 text-slate-200 text-[11px] transition-colors cursor-pointer"
              >
                {copiedSnippet === 'iframe' ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedSnippet === 'iframe' ? 'Copiado!' : 'Copiar Código'}</span>
              </button>
            </div>
            <pre className="overflow-x-auto text-[11px] font-mono text-emerald-400 leading-relaxed p-2 bg-slate-950 rounded">
              {iframeCode}
            </pre>
            <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-800">
              O atributo <code className="text-amber-300">allow="microphone; camera; clipboard-write"</code> garante que o recurso de gravação de áudio e anamnese por voz funcione sem bloqueios no seu site.
            </p>
          </div>
        </div>

        {/* Step 3: Security checks */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs text-slate-600">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <ShieldAlert className="h-4 w-4 text-emerald-600" />
            Recursos Ativos e Protegidos no Domínio
          </div>
          <ul className="grid gap-1 sm:grid-cols-2 list-inside list-disc">
            <li>Banco de Dados Firestore em nuvem conectado</li>
            <li>Regras de segurança com isolamento por usuário</li>
            <li>Proteção de Login Único por e-mail ativa</li>
            <li>IA Gemini com literatura renomada e dosagem exata</li>
          </ul>
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <Button onClick={onClose} className="px-6">
            Entendido
          </Button>
        </div>
      </motion.div>
    </div>
  );
}