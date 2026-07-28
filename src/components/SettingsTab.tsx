import React, { useState, useEffect } from 'react';
import { CompanyProfile, UserRole, UserProfile } from '../types';
import {
  Settings,
  Brain,
  CheckCircle2,
  XCircle,
  Loader2,
  Key,
  Save,
  RefreshCw,
  Bell,
  Clock,
  ChevronDown,
  Building2,
  Users
} from 'lucide-react';
import CompanyProfileSection from './CompanyProfileSection';
import UserManagementSection from './UserManagementSection';

const PROVIDERS = {
  openai: { label: 'OpenAI', placeholder: 'sk-...', docsUrl: 'https://platform.openai.com/api-keys', docsLabel: 'platform.openai.com', defaultModel: 'gpt-4o-mini' },
  deepseek: { label: 'DeepSeek', placeholder: 'sk-...', docsUrl: 'https://platform.deepseek.com/api_keys', docsLabel: 'platform.deepseek.com', defaultModel: 'deepseek-chat' },
  gemini: { label: 'Google Gemini', placeholder: 'AIza...', docsUrl: 'https://aistudio.google.com/apikey', docsLabel: 'aistudio.google.com', defaultModel: 'gemini-2.0-flash' },
  claude: { label: 'Claude (Anthropic)', placeholder: 'sk-ant-...', docsUrl: 'https://console.anthropic.com/settings/keys', docsLabel: 'console.anthropic.com', defaultModel: 'claude-sonnet-4-20250514' },
} as const;

type Provider = keyof typeof PROVIDERS;

const PROVIDER_LOGO = {
  openai: { color: '#10a37f', letter: 'O' },
  deepseek: { color: '#4F6BF5', letter: 'D' },
  gemini: { color: '#4285F4', letter: 'G' },
  claude: { color: '#d97757', letter: 'C' },
};

function ProviderLogo({ provider, className }: { provider: Provider; className?: string }) {
  const c = PROVIDER_LOGO[provider];
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <circle cx="12" cy="12" r="10" fill={c.color} />
      <text x="12" y="16" textAnchor="middle" fill="white" fontSize="13" fontWeight="800" fontFamily="system-ui, sans-serif">
        {c.letter}
      </text>
    </svg>
  );
}

interface SettingsTabProps {
  companyProfile: CompanyProfile;
  role: UserRole;
  currentUserName: string;
  usersList: UserProfile[];
  onUpdateCompany: (updates: Omit<CompanyProfile, 'updatedAt' | 'updatedBy'>) => Promise<void>;
  onAddUser?: (newUser: Omit<UserProfile, 'createdAt'>, password?: string) => Promise<void>;
  onEditUser?: (uid: string, updates: Partial<Omit<UserProfile, 'uid' | 'createdAt'>>, password?: string) => Promise<any>;
  onDeleteUser?: (uid: string) => Promise<void>;
}

export default function SettingsTab({
  companyProfile,
  role,
  currentUserName,
  usersList = [],
  onUpdateCompany,
  onAddUser,
  onEditUser,
  onDeleteUser
}: SettingsTabProps) {
  const [provider, setProvider] = useState<Provider>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [savedKey, setSavedKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'unknown' | 'checking' | 'connected' | 'failed'>('unknown');
  const [openSection, setOpenSection] = useState<string | null>(null);

  useEffect(() => {
    checkCurrentStatus();
  }, []);

  const cfg = PROVIDERS[provider];

  const checkCurrentStatus = async () => {
    try {
      const res = await fetch('/api/settings/ai/status');
      const data = await res.json();
      if (data.configured) {
        setConnectionStatus('connected');
        if (data.provider) setProvider(data.provider as Provider);
        if (data.model) setModel(data.model);
      } else {
        setConnectionStatus('unknown');
      }
    } catch {
      setConnectionStatus('unknown');
    }
  };

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    setModel(PROVIDERS[newProvider].defaultModel);
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('Informe a chave da API.');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/settings/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: apiKey.trim(), model: model.trim() || cfg.defaultModel })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erro ao salvar.');
      }

      setSavedKey(true);
      setSuccess('Configuração salva com sucesso!');
      setConnectionStatus('connected');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const keyToTest = apiKey.trim() || (await getSavedKeyFromServer());
    if (!keyToTest) {
      setError('Nenhuma chave configurada para testar.');
      return;
    }

    setTesting(true);
    setConnectionStatus('checking');
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/settings/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyToTest, provider, model: model.trim() || cfg.defaultModel })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Falha na conexão.');
      }

      setConnectionStatus('connected');
      setSuccess('Conexão realizada com sucesso!');
    } catch (err: any) {
      setConnectionStatus('failed');
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  const getSavedKeyFromServer = async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/settings/ai-key/status');
      const data = await res.json();
      return data.key || null;
    } catch {
      return null;
    }
  };

  const statusBadge = () => {
    switch (connectionStatus) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Conectado
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-lg">
            <XCircle className="h-3.5 w-3.5" />
            Falha na Conexão
          </span>
        );
      case 'checking':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Testando...
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <XCircle className="h-3.5 w-3.5" />
            Não configurado
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-100 text-emerald-600 rounded-xl">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-slate-900">Configurações</h1>
            <p className="text-slate-500 text-xs mt-0.5">Gerencie as integrações e preferências do sistema</p>
          </div>
        </div>
      </div>

      {/* Integrações Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setOpenSection(openSection === 'integracoes' ? null : 'integracoes')}
          className="w-full px-5 py-4 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Settings className="h-3.5 w-3.5" />
            Integrações
          </h2>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${openSection === 'integracoes' ? 'rotate-180' : ''}`} />
        </button>

        {openSection === 'integracoes' && (
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl shrink-0">
              <Brain className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-800">A.I.</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure o provedor de IA para o módulo de OCR de licenças.
                A chave é armazenada com segurança no banco de dados e usada pelo servidor.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-3 mt-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              {statusBadge()}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Provider Selector */}
              <div>
                <label className="text-[10px] uppercase font-black text-slate-400">
                  Provedor
                </label>
                <div className="relative mt-1.5">
                  <ProviderLogo provider={provider} className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none" />
                  <select
                    value={provider}
                    onChange={e => handleProviderChange(e.target.value as Provider)}
                    className="w-full pl-9 pr-8 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 text-slate-800 appearance-none bg-white"
                  >
                    {Object.entries(PROVIDERS).map(([key, p]) => (
                      <option key={key} value={key}>{p.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {/* Model Input */}
              <div>
                <label className="text-[10px] uppercase font-black text-slate-400">
                  Modelo
                </label>
                <input
                  type="text"
                  placeholder={cfg.defaultModel}
                  value={model}
                  onChange={e => setModel(e.target.value)}
                  className="w-full px-3.5 py-1.5 mt-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500 placeholder:text-slate-400 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Padrão: <code className="text-slate-500 bg-slate-100 px-1 rounded">{cfg.defaultModel}</code>
                </p>
              </div>
            </div>

            {/* API Key Input */}
            <div className="border-t border-slate-200/60 pt-3">
              <div>
                <label className="text-[10px] uppercase font-black text-slate-400">
                  Chave da API <span className="text-rose-500">*</span>
                </label>
                <div className="relative mt-1.5">
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                  <input
                    type="password"
                    placeholder={cfg.placeholder}
                    value={apiKey}
                    onChange={e => { setApiKey(e.target.value); setSavedKey(false); }}
                    className="w-full pl-9 pr-3.5 py-1.5 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500 placeholder:text-slate-400 font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Chave secreta da API {cfg.label}. Obtenha em{' '}
                  <a href={cfg.docsUrl} target="_blank" rel="noopener noreferrer"
                    className="text-emerald-500 hover:text-emerald-600 underline">{cfg.docsLabel}</a>
                </p>
              </div>
            </div>

            {/* Error / Success Messages */}
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
                <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-rose-600">{error}</p>
              </div>
            )}
            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-xs font-semibold text-emerald-600">{success}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="border-t border-slate-100 pt-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  Salvar
                </button>
                <button
                  onClick={handleTest}
                  disabled={testing}
                  className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  {testing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  Testar Conexão
                </button>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {/* Empresa Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setOpenSection(openSection === 'empresa' ? null : 'empresa')}
          className="w-full px-5 py-4 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" />
            Empresa
          </h2>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${openSection === 'empresa' ? 'rotate-180' : ''}`} />
        </button>

        {openSection === 'empresa' && (
          <div className="p-5">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl shrink-0">
                <Building2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-800">Dados da Empresa</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gerencie o cadastro da empresa proprietária de licenças.
                </p>
              </div>
            </div>

            <CompanyProfileSection
              companyProfile={companyProfile}
              role={role}
              currentUserName={currentUserName}
              onUpdateCompany={onUpdateCompany}
            />
          </div>
        )}
      </div>

      {/* Usuários Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setOpenSection(openSection === 'usuarios' ? null : 'usuarios')}
          className="w-full px-5 py-4 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            Usuários
          </h2>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${openSection === 'usuarios' ? 'rotate-180' : ''}`} />
        </button>

        {openSection === 'usuarios' && (
          <div className="p-5">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 bg-emerald-100 text-emerald-600 rounded-xl shrink-0">
                <Users className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-slate-800">Usuários Cadastrados</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Gerencie os usuários autorizados a acessar o painel administrativo e operacional.
                </p>
              </div>
            </div>

            <UserManagementSection
              usersList={usersList}
              role={role}
              companyEmail={companyProfile.email}
              onAddUser={onAddUser}
              onEditUser={onEditUser}
              onDeleteUser={onDeleteUser}
            />
          </div>
        )}
      </div>

      {/* Notificações Section */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setOpenSection(openSection === 'notificacoes' ? null : 'notificacoes')}
          className="w-full px-5 py-4 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Bell className="h-3.5 w-3.5" />
            Notificações
          </h2>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${openSection === 'notificacoes' ? 'rotate-180' : ''}`} />
        </button>

        {openSection === 'notificacoes' && (
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className="p-2.5 bg-slate-100 text-slate-400 rounded-xl shrink-0">
              <Bell className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-slate-800">Central de Notificações</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Gerencie alertas e notificações do sistema, como lembretes de vencimento de licenças,
                avisos de manutenção e notificações de empréstimos.
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2 p-4 bg-slate-50 border border-slate-200 rounded-xl">
            <Clock className="h-4 w-4 text-slate-400" />
            <span className="text-xs font-semibold text-slate-400">Em desenvolvimento</span>
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
