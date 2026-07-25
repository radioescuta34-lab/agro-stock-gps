import React, { useState, useEffect } from 'react';
import { CompanyProfile, UserRole, UserProfile } from '../types';
import { 
  Building2, 
  Save, 
  FileText, 
  ShieldAlert, 
  CheckCircle, 
  MapPin, 
  Phone, 
  Mail, 
  Info,
  ExternalLink,
  Users,
  UserPlus,
  Trash2,
  Edit2,
  Search,
  User,
  Shield,
  Wrench,
  X,
  Calendar,
  Upload,
  Image as ImageIcon
} from 'lucide-react';
import UserForm from './UserForm';
import type { UserFormData } from './UserForm';

interface CompanyTabProps {
  companyProfile: CompanyProfile;
  role: UserRole;
  currentUserName: string;
  onUpdateCompany: (updates: Omit<CompanyProfile, 'updatedAt' | 'updatedBy'>) => Promise<void>;
  usersList?: UserProfile[];
  onAddUser?: (newUser: Omit<UserProfile, 'createdAt'>, password?: string) => Promise<void>;
  onEditUser?: (uid: string, updates: Partial<Omit<UserProfile, 'uid' | 'createdAt'>>, password?: string) => Promise<any>;
  onDeleteUser?: (uid: string) => Promise<void>;
}

export default function CompanyTab({
  companyProfile,
  role,
  currentUserName,
  onUpdateCompany,
  usersList = [],
  onAddUser,
  onEditUser,
  onDeleteUser
}: CompanyTabProps) {
  // Sub-Tab State
  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'users'>('profile');

  // Local form states (Company Profile)
  const [name, setName] = useState(companyProfile.name);
  const [tradingName, setTradingName] = useState(companyProfile.tradingName || '');
  const [cnpj, setCnpj] = useState(companyProfile.cnpj);
  const [phone, setPhone] = useState(companyProfile.phone);
  const [email, setEmail] = useState(companyProfile.email);
  const [address, setAddress] = useState(companyProfile.address);
  const [logoUrl, setLogoUrl] = useState(companyProfile.logoUrl || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // User management states
  const [searchTerm, setSearchTerm] = useState('');
  const [userFormMode, setUserFormMode] = useState<'add' | 'edit'>('add');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);
  const [userSuccess, setUserSuccess] = useState<string | null>(null);

  // Sync state if prop changes (e.g. after database load)
  useEffect(() => {
    setName(companyProfile.name);
    setTradingName(companyProfile.tradingName || '');
    setCnpj(companyProfile.cnpj);
    setPhone(companyProfile.phone);
    setEmail(companyProfile.email);
    setAddress(companyProfile.address);
    setLogoUrl(companyProfile.logoUrl || '');
  }, [companyProfile]);

  const isAdmin = role === 'administrador' || role === 'ADMINISTRADOR';

  // Formatting helpers
  const formatCNPJ = (value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length <= 14) {
      return clean
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .substring(0, 18);
    }
    return value.substring(0, 18);
  };

  const formatPhone = (value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length <= 11) {
      if (clean.length > 10) {
        // Mobile phone (11) 99999-9999
        return clean
          .replace(/^(\d{2})(\d)/, '($1) $2')
          .replace(/(\d{5})(\d)/, '$1-$2')
          .substring(0, 15);
      } else {
        // Landline (11) 9999-9999
        return clean
          .replace(/^(\d{2})(\d)/, '($1) $2')
          .replace(/(\d{4})(\d)/, '$1-$2')
          .substring(0, 14);
      }
    }
    return value.substring(0, 15);
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCnpj(formatCNPJ(e.target.value));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;

    if (!name.trim()) {
      setError('A Razão Social é obrigatória.');
      return;
    }
    if (!cnpj.trim()) {
      setError('O CNPJ é obrigatório.');
      return;
    }
    if (cnpj.replace(/\D/g, '').length < 14) {
      setError('O CNPJ informado está incompleto.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await onUpdateCompany({
        name: name.trim(),
        tradingName: tradingName.trim() || undefined,
        cnpj: cnpj.trim(),
        phone: phone.trim(),
        email: email.trim(),
        address: address.trim(),
        logoUrl: logoUrl || undefined
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar os dados cadastrais da empresa.');
    } finally {
      setLoading(false);
    }
  };

  // User management helpers
  const filteredUsers = usersList.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const resetUserForm = () => {
    setUserFormMode('add');
    setSelectedUser(null);
    setUserError(null);
    setUserSuccess(null);
  };

  const startEditUser = (u: UserProfile) => {
    setUserFormMode('edit');
    setSelectedUser(u);
    setUserError(null);
    setUserSuccess(null);
  };

  const handleUserFormSave = async (data: UserFormData, password?: string) => {
    if (!isAdmin) return;
    setUserError(null);
    setUserSuccess(null);
    setUserLoading(true);

    const virtualEmail = `${data.username}@agrostockgps.com`;

    try {
      if (userFormMode === 'add') {
        if (!password || password.length < 6) {
          setUserError('A senha de acesso é obrigatória e deve ter no mínimo 6 caracteres.');
          setUserLoading(false);
          return;
        }

        const tempUid = 'user_' + Math.random().toString(36).substr(2, 9);
        await onAddUser?.({
          uid: tempUid,
          name: data.name,
          firstName: data.firstName,
          lastName: data.lastName,
          username: data.username,
          email: virtualEmail,
          role: data.role!
        }, password);

        setUserSuccess('Usuário e login de acesso criados com sucesso!');
        resetUserForm();
      } else {
        if (!selectedUser) return;

        const result = await onEditUser?.(selectedUser.uid, {
          name: data.name,
          firstName: data.firstName,
          lastName: data.lastName,
          username: data.username,
          email: virtualEmail,
          role: data.role!
        }, password || undefined);

        if (result && result.warning) {
          setUserSuccess(`Cadastro de usuário atualizado com sucesso!\n\nNota: ${result.warning}`);
        } else {
          setUserSuccess('Cadastro de usuário atualizado com sucesso!');
        }
        resetUserForm();
      }
    } catch (err: any) {
      console.error(err);
      setUserError(err.message || 'Erro ao salvar os dados do usuário.');
    } finally {
      setUserLoading(false);
    }
  };

  const handleDeleteUserClick = async (uid: string, uEmail: string) => {
    if (!isAdmin) return;
    if (uEmail === email) {
      setUserError('Não é permitido excluir o usuário principal da empresa.');
      return;
    }

    if (window.confirm(`Tem certeza de que deseja excluir o usuário "${uEmail}"? Esta ação removerá o acesso ao sistema.`)) {
      setUserLoading(true);
      setUserError(null);
      setUserSuccess(null);

      try {
        await onDeleteUser?.(uid);
        setUserSuccess('Acesso e cadastro do usuário excluídos com sucesso.');
      } catch (err: any) {
        setUserError(err.message || 'Erro ao excluir o usuário do banco de dados.');
      } finally {
        setUserLoading(false);
      }
    }
  };

  const getInitials = (fullName?: string) => {
    if (!fullName) return '';
    const parts = fullName.trim().split(' ');
    if (parts.length >= 2) {
      return ((parts[0]?.[0] || '') + (parts[parts.length - 1]?.[0] || '')).toUpperCase();
    }
    return fullName.substring(0, 2).toUpperCase();
  };

  return (
    <div className="space-y-6" id="company-tab-container">
      {/* Tab Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-500" />
            Minha Empresa & Acessos
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gerencie o cadastro da empresa proprietária de licenças e configure os usuários autorizados a acessar o painel administrativo e operacional.
          </p>
        </div>

      </div>

      {/* Role Notice */}
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 flex items-start gap-3 text-xs shadow-sm">
          <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-extrabold uppercase tracking-wider text-[10px]">Acesso de Leitura</p>
            <p className="mt-1 text-amber-700 font-medium">
              Sua conta está configurada como <strong>Técnico de Campo</strong>. Apenas usuários com privilégios de <strong>Administrador</strong> podem alterar as informações cadastrais e criar logins para novos usuários.
            </p>
          </div>
        </div>
      )}

      {/* Sub Tab Switcher */}
      <div className="flex border-b border-slate-200" id="company-subtabs">
        <button
          onClick={() => setActiveSubTab('profile')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-xs uppercase tracking-wider transition-all ${
            activeSubTab === 'profile'
              ? 'border-emerald-500 text-emerald-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          id="btn-subtab-profile"
        >
          <Building2 className="h-4 w-4" />
          Dados da Empresa
        </button>
        <button
          onClick={() => setActiveSubTab('users')}
          className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-xs uppercase tracking-wider transition-all ${
            activeSubTab === 'users'
              ? 'border-emerald-500 text-emerald-600 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
          id="btn-subtab-users"
        >
          <Users className="h-4 w-4" />
          Usuários Cadastrados ({usersList.length})
        </button>
      </div>

      {activeSubTab === 'profile' ? (
        /* Main Grid Content (Company Profile) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in" id="company-profile-subtab">
          
          {/* Left Form (7 Columns) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-500" />
                Dados Cadastrais
              </h2>

              <form onSubmit={handleSave} className="space-y-4">
                {error && (
                  <div className="bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold p-3 rounded-lg" id="company-form-error">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold p-3 rounded-lg flex items-center gap-2" id="company-form-success">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    Informações da empresa atualizadas e salvas com sucesso!
                  </div>
                )}

                {/* 1. Razao Social */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-400">Razão Social (Empresa Proprietária) <span className="text-rose-500">*</span></label>
                  <input
                    type="text"
                    placeholder="Ex: AGRO SERVIÇOS E TECNOLOGIA LTDA"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!isAdmin || loading}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                    id="company-name-input"
                  />
                </div>

                {/* 2. Nome Fantasia */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-400">Nome Fantasia / Marca Comercial</label>
                  <input
                    type="text"
                    placeholder="Ex: Agro Stock Brasil"
                    value={tradingName}
                    onChange={(e) => setTradingName(e.target.value)}
                    disabled={!isAdmin || loading}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                    id="company-trading-input"
                  />
                </div>

                {/* Logomarca da Empresa */}
                <div className="space-y-1.5 bg-slate-50 border border-slate-200/60 rounded-2xl p-4">
                  <label className="text-[10px] uppercase font-black text-slate-400 block mb-1">Logomarca da Empresa (Sua Marca)</label>
                  <div className="flex items-center gap-4">
                    {logoUrl ? (
                      <div className="relative h-16 w-16 bg-white border border-slate-200 rounded-xl p-1 shrink-0 flex items-center justify-center group overflow-hidden shadow-sm">
                        <img 
                          src={logoUrl} 
                          alt="Logo da Empresa" 
                          className="h-full w-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => setLogoUrl('')}
                            className="absolute inset-0 bg-slate-900/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white rounded-xl"
                            title="Remover Logomarca"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="h-16 w-16 bg-slate-100 border border-dashed border-slate-300 text-slate-400 rounded-xl shrink-0 flex items-center justify-center shadow-xs">
                        <ImageIcon className="h-6 w-6" />
                      </div>
                    )}
                    
                    {isAdmin ? (
                      <div className="flex-1">
                        <label className="cursor-pointer inline-flex items-center gap-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 transition-all shadow-xs">
                          <Upload className="h-3.5 w-3.5 text-slate-500" />
                          Upload de Logo
                          <input 
                            type="file" 
                            accept="image/*" 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onloadend = () => {
                                  setLogoUrl(reader.result as string);
                                };
                                reader.readAsDataURL(file);
                              }
                            }} 
                            className="hidden" 
                          />
                        </label>
                        <p className="text-[10px] text-slate-400 mt-1">Sua logo aparecerá nos termos de empréstimos, comprovantes e PDFs gerados.</p>
                      </div>
                    ) : (
                      <div className="flex-1">
                        <span className="text-[11px] text-slate-400 font-semibold">Nenhuma logomarca cadastrada</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. CNPJ & Telefone Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400">CNPJ <span className="text-rose-500">*</span></label>
                    <input
                      type="text"
                      placeholder="00.000.000/0001-00"
                      value={cnpj}
                      onChange={handleCnpjChange}
                      disabled={!isAdmin || loading}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                      id="company-cnpj-input"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400">Telefone para Contato</label>
                    <input
                      type="text"
                      placeholder="(00) 00000-0000"
                      value={phone}
                      onChange={handlePhoneChange}
                      disabled={!isAdmin || loading}
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                      id="company-phone-input"
                    />
                  </div>
                </div>

                {/* 4. Email */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-400">E-mail Corporativo</label>
                  <input
                    type="email"
                    placeholder="suporte@suaempresa.com.br"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={!isAdmin || loading}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
                    id="company-email-input"
                  />
                </div>

                {/* 5. Endereco */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-400">Endereço Completo (Sede Logística)</label>
                  <textarea
                    placeholder="Av. Principal, Km 45 - Zona Rural - Ribeirão Preto, SP"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    disabled={!isAdmin || loading}
                    rows={3}
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500 resize-none"
                    id="company-address-input"
                  />
                </div>

                {/* Save Trigger */}
                {isAdmin && (
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/10 hover:shadow-emerald-600/20 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
                    id="company-save-btn"
                  >
                    <Save className="h-4 w-4" />
                    {loading ? 'Salvando Alterações...' : 'Salvar Dados da Empresa'}
                  </button>
                )}
              </form>
            </div>

            {/* Integration Info Cards */}
            <div className="bg-slate-100 rounded-2xl border border-slate-200/60 p-4 text-xs text-slate-600 space-y-2.5">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-slate-700">Por que esses dados são importantes?</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Ao vender ou implantar licenças do <span translate="no" className="notranslate">Agro Stock GPS</span> para novos clientes (Usina, Cooperativa ou Produtor Rural), este cadastro estabelece a propriedade dos ativos e personaliza todos os termos de retiradas e contratos.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Preview Column (5 Columns) */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-800 text-white rounded-2xl p-6 shadow-xl border border-slate-700">
              <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-400" />
                Pré-visualização de Documentos
              </h2>
              <p className="text-[11px] text-slate-400 mb-6">
                Veja em tempo real como as informações editadas à esquerda se comportarão no cabeçalho e nos termos jurídicos em PDF gerados pelo sistema:
              </p>

              {/* Simulated Sheet of Paper */}
              <div className="bg-white text-slate-800 rounded-xl p-5 shadow-2xl border border-slate-100 font-sans max-w-sm mx-auto space-y-4 text-[9px]">
                
                {/* Fake PDF Header */}
                <div className="border-b-2 border-emerald-500 pb-3 text-center space-y-1">
                  {logoUrl && (
                    <div className="flex justify-center mb-1.5">
                      <img src={logoUrl} alt="Logo" className="max-h-8 object-contain" referrerPolicy="no-referrer" />
                    </div>
                  )}
                  <span className="text-[7px] text-slate-400 font-mono tracking-widest uppercase">TERMO DE EMPRÉSTIMO DE EQUIPAMENTOS</span>
                  <h3 className="font-extrabold text-slate-900 leading-tight uppercase text-center text-[10px]">
                    {name.trim() || 'RAZÃO SOCIAL DA SUA EMPRESA'}
                  </h3>
                  {tradingName.trim() && (
                    <p className="text-[7px] text-slate-500 font-semibold italic">
                      {tradingName}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-center gap-x-2 text-[7px] text-slate-400 font-medium">
                    {cnpj && <span className="font-mono">CNPJ: {cnpj}</span>}
                    {phone && <span>Tel: {phone}</span>}
                  </div>
                </div>

                {/* Document Body Body */}
                <div className="space-y-2.5">
                  <div>
                    <h4 className="font-bold text-slate-900 uppercase text-[7px]">1. ENVOLVIDOS</h4>
                    <p className="text-slate-500 text-justify leading-relaxed mt-0.5">
                      <strong>CEDENTE:</strong> <strong>{(name.trim() || 'RAZÃO SOCIAL DA SUA EMPRESA').toUpperCase()}</strong>, inscrita sob o CNPJ nº <strong>{cnpj || '00.000.000/0001-00'}</strong>, {address ? `sediada em ${address}, ` : ''}proprietária dos equipamentos descritos, doravante referida como CEDENTE.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-bold text-slate-900 uppercase text-[7px]">2. ESPECIFICAÇÕES</h4>
                    <p className="text-slate-500 leading-relaxed mt-0.5">
                      Constitui objeto deste termo o empréstimo gratuito temporário de uso dos componentes de tecnologia agrícola listados abaixo, de propriedade da <strong>{(tradingName.trim() || name.trim() || 'CEDENTE').toUpperCase()}</strong>.
                    </p>
                  </div>

                  {/* Simulated signature box */}
                  <div className="pt-6 grid grid-cols-2 gap-4 text-center">
                    <div className="space-y-1">
                      <div className="h-[0.5px] bg-slate-300 w-full"></div>
                      <p className="font-bold text-slate-800 text-[6.5px] uppercase truncate">
                        {tradingName.trim() || name.trim() || 'SUA EMPRESA'}
                      </p>
                      <p className="text-[6px] text-slate-400">Representante Cedente</p>
                    </div>

                    <div className="space-y-1">
                      <div className="h-[0.5px] bg-slate-300 w-full"></div>
                      <p className="font-bold text-slate-800 text-[6.5px] uppercase">
                        TERCEIRO / RECEBEDOR
                      </p>
                      <p className="text-[6px] text-slate-400">Responsável Recebedor</p>
                    </div>
                  </div>

                </div>

              </div>

              {/* Sync Alert Indicator */}
              <div className="mt-5 bg-slate-700/50 border border-slate-600/50 rounded-xl p-3.5 text-[11px] text-slate-300 flex items-start gap-2">
                <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold text-white">Sincronização Ativa</p>
                  <p className="text-slate-400 mt-0.5">
                    Os dados salvos serão utilizados dinamicamente pelo gerador de PDF `jsPDF` e pelo painel visual de termos em toda a plataforma.
                  </p>
                </div>
              </div>

            </div>
          </div>

        </div>
      ) : (
        /* Users List and Configuration Subtab */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-fade-in" id="company-users-subtab">
          
          {/* User List Panel (7 Columns) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              
              {/* List Header with Search */}
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Users className="h-4 w-4 text-slate-500" />
                    Colaboradores com Acesso
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Estes usuários possuem credenciais válidas para efetuar login no sistema.
                  </p>
                </div>
                
                {/* Search Bar */}
                <div className="relative rounded-xl shadow-sm w-full md:w-64">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-4 w-4 text-slate-400" />
                  </div>
                  <input
                    type="text"
                    placeholder="Filtrar por nome ou e-mail..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    id="user-search-input"
                  />
                </div>
              </div>

              {/* User list */}
              {filteredUsers.length === 0 ? (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <Users className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-500">Nenhum colaborador encontrado</p>
                  <p className="text-[10px] text-slate-400 mt-1">Insira um novo cadastro utilizando o formulário lateral.</p>
                </div>
              ) : (
                <div className="space-y-3" id="users-items-list">
                  {filteredUsers.map((u) => {
                    const isSelf = u.email === email;
                    const isUserAdmin = u.role === 'administrador' || u.role === 'ADMINISTRADOR';
                    const userRoleLabel = isUserAdmin ? 'Administrador' : 'Técnico de Campo';
                    const displayUsername = u.username || (u.email ? u.email.split('@')[0] : '');
                    
                    return (
                      <div 
                        key={u.uid} 
                        className={`p-4 rounded-xl border transition-all flex items-center justify-between ${
                          selectedUser?.uid === u.uid 
                            ? 'bg-emerald-50/40 border-emerald-300 shadow-sm' 
                            : 'bg-white border-slate-100 hover:border-slate-200'
                        }`}
                        id={`user-item-${u.uid}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Avatar Circle */}
                          <div className={`h-9 w-9 rounded-full overflow-hidden font-bold text-xs flex items-center justify-center shrink-0 ${
                            isUserAdmin 
                              ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                              : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}>
                            {u.photoURL ? (
                              <img src={u.photoURL} alt="" className="w-full h-full object-cover" />
                            ) : (
                              getInitials(u.name)
                            )}
                          </div>
                          
                          {/* Info */}
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                               <span className="text-xs font-bold text-slate-800 truncate">{u.name}</span>
                              {u.uid.startsWith('demo_user_') && (
                                <span className="bg-slate-100 text-slate-500 text-[8px] px-1 py-0.2 rounded font-mono">Demo</span>
                              )}
                            </div>
                            <span className="block text-[10px] text-slate-400 truncate mt-0.5 font-mono">Usuário: {displayUsername}</span>
                            
                            {/* Role Badge and Creation Date */}
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className={`inline-flex items-center gap-1 text-[8px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                                isUserAdmin
                                  ? 'bg-amber-50 text-amber-700 border-amber-100'
                                  : 'bg-blue-50 text-blue-700 border-blue-100'
                              }`}>
                                {isUserAdmin ? <Shield className="h-2 w-2" /> : <Wrench className="h-2 w-2" />}
                                {userRoleLabel}
                              </span>
                              
                              {u.createdAt && (
                                <span className="text-[9px] text-slate-400 flex items-center gap-1 font-mono">
                                  <Calendar className="h-2.5 w-2.5 shrink-0" />
                                  {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        {isAdmin && (
                          <div className="flex items-center gap-1.5 shrink-0 ml-4">
                            <button
                              onClick={() => startEditUser(u)}
                              disabled={userLoading}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                              title="Editar usuário"
                              id={`btn-edit-user-${u.uid}`}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteUserClick(u.uid, u.email)}
                              disabled={userLoading}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                              title="Excluir acesso"
                              id={`btn-delete-user-${u.uid}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          </div>

          {/* User Form Panel (5 Columns) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sticky top-24">
              
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  {userFormMode === 'add' ? <UserPlus className="h-4 w-4 text-emerald-500" /> : <Edit2 className="h-4 w-4 text-emerald-500" />}
                  {userFormMode === 'add' ? 'Cadastrar Novo Usuário' : 'Alterar Usuário'}
                </h2>
                {userFormMode === 'edit' && (
                  <button 
                    onClick={resetUserForm}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                    title="Cancelar edição"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {!isAdmin ? (
                <div className="bg-slate-50 border border-slate-200 text-slate-500 text-xs p-4 rounded-xl flex items-start gap-2">
                  <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    Apenas administradores podem cadastrar, alterar cargos ou excluir logins de novos colaboradores no sistema.
                  </span>
                </div>
              ) : (
                <UserForm
                  mode="admin"
                  initialData={selectedUser ? {
                    firstName: selectedUser.firstName || selectedUser.name.split(' ')[0],
                    lastName: selectedUser.lastName || selectedUser.name.split(' ').slice(1).join(' '),
                    username: selectedUser.username || selectedUser.email.split('@')[0],
                    name: selectedUser.name,
                    role: selectedUser.role,
                  } : undefined}
                  loading={userLoading}
                  error={userError}
                  success={userSuccess}
                  onSave={handleUserFormSave}
                  onCancel={userFormMode === 'edit' ? resetUserForm : undefined}
                  submitLabel={userFormMode === 'add' ? 'Cadastrar Usuário' : 'Salvar Alterações'}
                />
              )}

            </div>
          </div>

        </div>
      )}

    </div>
  );
}
