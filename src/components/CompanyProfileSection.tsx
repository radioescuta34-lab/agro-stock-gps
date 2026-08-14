import React, { useState, useEffect } from 'react';
import { CompanyProfile, UserRole } from '../types';
import {
  Building2,
  Save,
  FileText,
  CheckCircle,
  Info,
  Upload,
  Image as ImageIcon,
  Trash2,
  Pencil,
  Mail,
  Phone,
  MapPin,
  X
} from 'lucide-react';

interface CompanyProfileSectionProps {
  companyProfile: CompanyProfile;
  role: UserRole;
  currentUserName: string;
  onUpdateCompany: (updates: Omit<CompanyProfile, 'updatedAt' | 'updatedBy'>) => Promise<void>;
}

export default function CompanyProfileSection({
  companyProfile,
  role,
  currentUserName,
  onUpdateCompany
}: CompanyProfileSectionProps) {
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
  const [isEditing, setIsEditing] = useState(false);

  const isAdmin = role === 'administrador' || role === 'ADMINISTRADOR';

  useEffect(() => {
    setName(companyProfile.name);
    setTradingName(companyProfile.tradingName || '');
    setCnpj(companyProfile.cnpj);
    setPhone(companyProfile.phone);
    setEmail(companyProfile.email);
    setAddress(companyProfile.address);
    setLogoUrl(companyProfile.logoUrl || '');
  }, [companyProfile]);

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
        return clean
          .replace(/^(\d{2})(\d)/, '($1) $2')
          .replace(/(\d{5})(\d)/, '$1-$2')
          .substring(0, 15);
      } else {
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

  const resetDraft = () => {
    setName(companyProfile.name);
    setTradingName(companyProfile.tradingName || '');
    setCnpj(companyProfile.cnpj);
    setPhone(companyProfile.phone);
    setEmail(companyProfile.email);
    setAddress(companyProfile.address);
    setLogoUrl(companyProfile.logoUrl || '');
    setError(null);
  };

  const handleCancel = () => {
    resetDraft();
    setIsEditing(false);
  };

  const isValidCNPJ = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

    const calculateDigit = (base: string, weights: number[]) => {
      const sum = base.split('').reduce((total, digit, index) => total + Number(digit) * weights[index], 0);
      const remainder = sum % 11;
      return remainder < 2 ? 0 : 11 - remainder;
    };

    const firstDigit = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const secondDigit = calculateDigit(digits.slice(0, 12) + firstDigit, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return digits.endsWith(`${firstDigit}${secondDigit}`);
  };

  const handleLogoUpload = (file?: File) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Use uma imagem PNG, JPG ou WebP.');
      return;
    }
    if (file.size > 500 * 1024) {
      setError('A logomarca deve ter no máximo 500 KB.');
      return;
    }

    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => setLogoUrl(reader.result as string);
    reader.readAsDataURL(file);
  };

  const formatUpdatedAt = () => {
    const value: any = companyProfile.updatedAt;
    if (!value) return null;
    const date = typeof value?.toDate === 'function'
      ? value.toDate()
      : value?.seconds
        ? new Date(value.seconds * 1000)
        : new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
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
    if (!isValidCNPJ(cnpj)) {
      setError('Informe um CNPJ válido.');
      return;
    }
    if (phone.trim() && !/^\d{10,11}$/.test(phone.replace(/\D/g, ''))) {
      setError('Informe um telefone válido com DDD.');
      return;
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Informe um e-mail corporativo válido.');
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
      setIsEditing(false);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar os dados cadastrais da empresa.');
    } finally {
      setLoading(false);
    }
  };

  const summaryFields = [companyProfile.name, companyProfile.cnpj, companyProfile.phone, companyProfile.email, companyProfile.address];
  const completedFields = summaryFields.filter(value => value?.trim()).length;
  const updatedAtLabel = formatUpdatedAt();

  return (
    <div className="space-y-4">
      {success && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-500" />
          Informações da empresa atualizadas com sucesso.
        </div>
      )}

      {!isEditing ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="p-4 sm:p-5">
            <div className="flex items-start gap-3.5">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
                {companyProfile.logoUrl ? (
                  <img src={companyProfile.logoUrl} alt={`Logo de ${companyProfile.tradingName || companyProfile.name}`} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <Building2 className="h-6 w-6 text-slate-300" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-extrabold text-slate-900">
                      {companyProfile.tradingName || companyProfile.name || 'Empresa sem nome'}
                    </h3>
                    {companyProfile.tradingName && (
                      <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500">{companyProfile.name}</p>
                    )}
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${
                    completedFields === summaryFields.length ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                  }`}>
                    <CheckCircle className="h-3 w-3" />
                    {completedFields === summaryFields.length ? 'Cadastro completo' : `${completedFields}/${summaryFields.length} preenchidos`}
                  </span>
                </div>
                <p className="mt-2 font-mono text-[11px] font-semibold text-slate-500">
                  CNPJ {companyProfile.cnpj || 'não informado'}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div className="flex min-w-0 items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">E-mail</p>
                  <p className={`mt-0.5 truncate text-xs font-semibold ${companyProfile.email ? 'text-slate-700' : 'text-slate-400'}`}>
                    {companyProfile.email || 'Não informado'}
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Telefone</p>
                  <p className={`mt-0.5 text-xs font-semibold ${companyProfile.phone ? 'text-slate-700' : 'text-slate-400'}`}>
                    {companyProfile.phone || 'Não informado'}
                  </p>
                </div>
              </div>

              <div className="flex min-w-0 items-start gap-2.5 rounded-xl bg-slate-50 p-3 sm:col-span-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <div className="min-w-0">
                  <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400">Endereço</p>
                  <p className={`mt-0.5 text-xs font-semibold leading-relaxed ${companyProfile.address ? 'text-slate-700' : 'text-slate-400'}`}>
                    {companyProfile.address || 'Não informado'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-[10px] text-slate-400">
              {updatedAtLabel ? `Atualizado em ${updatedAtLabel}` : 'Dados usados em contratos, comprovantes e PDFs.'}
              {companyProfile.updatedBy ? ` por ${companyProfile.updatedBy}` : ''}
            </p>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => { setError(null); setIsEditing(true); }}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 sm:w-auto"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar dados
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                <Info className="h-3.5 w-3.5" /> Somente administradores podem editar
              </span>
            )}
          </div>
        </div>
      ) : (
      <div className="bg-slate-50 border border-slate-200/60 rounded-2xl p-4 space-y-4">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">Editar dados da empresa</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">As alterações serão aplicadas aos documentos gerados.</p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            aria-label="Cancelar edição"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      {!isAdmin && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-3 flex items-start gap-2 text-xs">
          <Info className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="font-medium text-amber-700">
            Apenas administradores podem alterar os dados da empresa.
          </p>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {error && (
          <div className="bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold p-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-black text-slate-400">Razão Social (Empresa Proprietária) <span className="text-rose-500">*</span></label>
          <input
            type="text"
            placeholder="Ex: AGRO SERVIÇOS E TECNOLOGIA LTDA"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isAdmin || loading}
            className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-black text-slate-400">Nome Fantasia / Marca Comercial</label>
          <input
            type="text"
            placeholder="Ex: Agro Stock Brasil"
            value={tradingName}
            onChange={(e) => setTradingName(e.target.value)}
            disabled={!isAdmin || loading}
            className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>

        <div className="space-y-1.5 bg-white border border-slate-200/60 rounded-2xl p-4">
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
                    onChange={(e) => handleLogoUpload(e.target.files?.[0])}
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
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-black text-slate-400">E-mail Corporativo</label>
          <input
            type="email"
            placeholder="suporte@suaempresa.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={!isAdmin || loading}
            className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-black text-slate-400">Endereço Completo (Sede Logística)</label>
          <textarea
            placeholder="Av. Principal, Km 45 - Zona Rural - Ribeirão Preto, SP"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={!isAdmin || loading}
            rows={3}
            className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-emerald-500 focus:border-emerald-500 disabled:bg-slate-50 disabled:text-slate-500 resize-none"
          />
        </div>

        {isAdmin && (
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/10 hover:shadow-emerald-600/20 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {loading ? 'Salvando Alterações...' : 'Salvar Dados da Empresa'}
          </button>
        )}
      </form>

      {/* PDF Preview */}
      <div className="bg-slate-800 text-white rounded-2xl p-6 shadow-xl border border-slate-700">
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-300 mb-4 flex items-center gap-2">
          <FileText className="h-4 w-4 text-emerald-400" />
          Pré-visualização de Documentos
        </h2>
        <p className="text-[11px] text-slate-400 mb-6">
          Veja em tempo real como as informações editadas à esquerda se comportarão no cabeçalho e nos termos jurídicos em PDF gerados pelo sistema:
        </p>

        <div className="bg-white text-slate-800 rounded-xl p-5 shadow-2xl border border-slate-100 font-sans max-w-sm mx-auto space-y-4 text-[9px]">
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
                <p className="font-bold text-slate-800 text-[6.5px] uppercase">TERCEIRO / RECEBEDOR</p>
                <p className="text-[6px] text-slate-400">Responsável Recebedor</p>
              </div>
            </div>
          </div>
        </div>

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
      )}
    </div>
  );
}
