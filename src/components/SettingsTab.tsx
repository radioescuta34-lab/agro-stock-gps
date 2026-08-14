import React, { useState, useEffect } from 'react';
import { CompanyProfile, UserRole, UserProfile, License, Machine, FieldDataCollection, ComponentLoan, AutopilotComponent, MovementLog, ComponentMaintenance } from '../types';
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
  ChevronDown,
  Building2,
  Users,
  PlugZap,
  ShieldCheck,
  AlertTriangle,
  ExternalLink
} from 'lucide-react';
import CompanyProfileSection from './CompanyProfileSection';
import UserManagementSection from './UserManagementSection';
import AlertSettingsSection from './AlertSettingsSection';

const PROVIDERS = {
  openai: { label: 'OpenAI', placeholder: 'sk-...', docsUrl: 'https://platform.openai.com/api-keys', docsLabel: 'platform.openai.com', defaultModel: 'gpt-4o-mini' },
  deepseek: { label: 'DeepSeek', placeholder: 'sk-...', docsUrl: 'https://platform.deepseek.com/api_keys', docsLabel: 'platform.deepseek.com', defaultModel: 'deepseek-chat' },
  gemini: { label: 'Google Gemini', placeholder: 'AIza...', docsUrl: 'https://aistudio.google.com/apikey', docsLabel: 'aistudio.google.com', defaultModel: 'gemini-3.5-flash' },
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

interface SettingsSectionToggleProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  open: boolean;
  onClick: () => void;
}

function SettingsSectionToggle({ icon, title, description, open, onClick }: SettingsSectionToggleProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`group flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500 sm:px-5 ${
        open ? 'border-b border-emerald-100 bg-emerald-50/60' : 'hover:bg-slate-50'
      }`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${
        open ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500 group-hover:bg-emerald-50 group-hover:text-emerald-700'
      }`}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-extrabold text-slate-800">{title}</span>
        <span className="mt-0.5 block truncate text-[11px] text-slate-500">{description}</span>
      </span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 group-hover:bg-white group-hover:text-slate-600">
        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </span>
    </button>
  );
}

interface SettingsTabProps {
  companyProfile: CompanyProfile;
  role: UserRole;
  currentUserName: string;
  usersList: UserProfile[];
  licenses: License[];
  machines: Machine[];
  fieldDataCollections: FieldDataCollection[];
  loans: ComponentLoan[];
  components?: AutopilotComponent[];
  movements?: MovementLog[];
  maintenances?: ComponentMaintenance[];
  currentUser?: UserProfile | null;
  isDemoMode: boolean;
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
  licenses,
  machines,
  fieldDataCollections,
  loans,
  components = [],
  movements = [],
  maintenances = [],
  currentUser,
  isDemoMode,
  onUpdateCompany,
  onAddUser,
  onEditUser,
  onDeleteUser
}: SettingsTabProps) {
  const [provider, setProvider] = useState<Provider>('deepseek');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
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
        if (data.provider) {
          setProvider(data.provider as Provider);
          setModel(data.model || PROVIDERS[data.provider as Provider]?.defaultModel || '');
        } else if (data.model) {
          setModel(data.model);
        }
      } else {
        setConnectionStatus('unknown');
      }
    } catch {
      setConnectionStatus('unknown');
    }
  };

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
    setApiKey('');
    setError(null);
    setErrorType(null);
    setModel(PROVIDERS[newProvider].defaultModel);
  };

  const handleSave = async () => {
    if (!apiKey.trim()) {
      setError('Informe a chave da API.');
      return;
    }

    setSaving(true);
    setError(null);
    setErrorType(null);
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

      setSuccess('Configuração salva com sucesso!');
      setConnectionStatus('connected');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setConnectionStatus('checking');
    setError(null);
    setErrorType(null);
    setSuccess(null);

    try {
      const body: Record<string, string> = { provider, model: model.trim() || cfg.defaultModel };
      if (apiKey.trim()) {
        body.apiKey = apiKey.trim();
      }

      const res = await fetch('/api/settings/ai/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setErrorType(err.errorType || null);
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
    <div className="space-y-4 sm:space-y-6">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-gradient-to-br from-white via-white to-emerald-50 p-4 shadow-sm sm:p-5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-emerald-100/60 blur-2xl" />
        <div className="relative flex items-start gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm shadow-emerald-200">
            <Settings className="h-5 w-5" />
          </div>
          <div className="min-w-0 pt-0.5">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-700">
              <ShieldCheck className="h-3.5 w-3.5" />
              Painel administrativo
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-950">Configurações</h1>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Gerencie integrações, acessos e preferências do sistema.</p>
          </div>
        </div>
      </div>

      {/* Integrações Section */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <SettingsSectionToggle
          icon={<PlugZap className="h-4 w-4" />}
          title="Integrações"
          description="Inteligência artificial e serviços externos"
          open={openSection === 'integracoes'}
          onClick={() => setOpenSection(openSection === 'integracoes' ? null : 'integracoes')}
        />

        {openSection === 'integracoes' && (
        <div className="p-4 sm:p-5">
          <div className="flex items-start gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
              <Brain className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-extrabold text-slate-900">Inteligência artificial</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Selecione o provedor usado na leitura automática de licenças por OCR.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
            {/* Connection Status */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-4">
              <span className="text-[11px] font-bold text-slate-500">Status da integração</span>
              {statusBadge()}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    className="min-h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-8 text-xs font-medium text-slate-800 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
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
                  className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-xs font-medium placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:text-slate-500"
                />
                <p className="text-[10px] text-slate-400 mt-1.5">
                  Padrão: <code className="text-slate-500 bg-slate-100 px-1 rounded">{cfg.defaultModel}</code>
                </p>
              </div>
            </div>

            {/* API Key Input */}
            <div className="border-t border-slate-200 pt-4">
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
                    onChange={e => setApiKey(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3.5 font-mono text-xs font-medium placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:bg-slate-50 disabled:text-slate-500"
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
            {error && errorType === 'quota_exceeded' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800">Cota da API excedida</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Sua chave {cfg.label} atingiu o limite de requisições. {provider === 'gemini' ? 'Ative o faturamento no Google Cloud para aumentar a cota — você não paga nada se ficar dentro dos limites gratuitos expandidos.' : 'Verifique seu plano e limites de uso no painel do provedor.'}
                    </p>
                    {provider === 'gemini' && (
                      <a href="https://console.cloud.google.com/billing" target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-bold text-amber-800 underline mt-2 hover:text-amber-900">
                        Ativar faturamento <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}
            {error && errorType === 'model_unavailable' && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-amber-800">Modelo temporariamente indisponível</p>
                    <p className="text-xs text-amber-700 mt-1">
                      O modelo <strong>{model || cfg.defaultModel}</strong> está sob alta demanda no momento. Tente novamente em alguns minutos ou use outro modelo.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {error && errorType === 'auth_error' && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-rose-700">Chave inválida ou sem permissão</p>
                    <p className="text-xs text-rose-600 mt-1">
                      Sua chave não tem permissão para acessar este modelo. Gere uma nova chave no <strong>{cfg.label}</strong>.
                    </p>
                    <a href={cfg.docsUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 underline mt-2 hover:text-rose-800">
                      {cfg.docsLabel} <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            )}
            {error && errorType === 'model_not_found' && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <div className="flex items-start gap-2">
                  <XCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-rose-700">Modelo não encontrado</p>
                    <p className="text-xs text-rose-600 mt-1">
                      O modelo <strong>"{model || cfg.defaultModel}"</strong> não existe ou não está disponível. Verifique o nome do modelo.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {error && !errorType && (
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
            <div className="border-t border-slate-200 pt-4">
              <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:flex">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
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
                  className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <SettingsSectionToggle
          icon={<Building2 className="h-4 w-4" />}
          title="Empresa"
          description="Dados institucionais e informações de contato"
          open={openSection === 'empresa'}
          onClick={() => setOpenSection(openSection === 'empresa' ? null : 'empresa')}
        />

        {openSection === 'empresa' && (
          <div className="p-4 sm:p-5">
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <SettingsSectionToggle
          icon={<Users className="h-4 w-4" />}
          title="Usuários"
          description="Acessos, perfis e permissões"
          open={openSection === 'usuarios'}
          onClick={() => setOpenSection(openSection === 'usuarios' ? null : 'usuarios')}
        />

        {openSection === 'usuarios' && (
          <div className="p-4 sm:p-5">
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <SettingsSectionToggle
          icon={<Bell className="h-4 w-4" />}
          title="Notificações"
          description="Alertas automáticos e destinatários"
          open={openSection === 'notificacoes'}
          onClick={() => setOpenSection(openSection === 'notificacoes' ? null : 'notificacoes')}
        />

        {openSection === 'notificacoes' && (
        <div className="p-4 sm:p-5">
          <AlertSettingsSection
            licenses={licenses}
            machines={machines}
            fieldDataCollections={fieldDataCollections}
            loans={loans}
            components={components}
            movements={movements}
            maintenances={maintenances}
            currentUser={currentUser}
            isDemoMode={isDemoMode}
          />
        </div>
        )}
      </div>
    </div>
  );
}
