import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Building2,
  Check,
  ChevronRight,
  Edit,
  HelpCircle,
  Mail,
  MapPin,
  MessageCircle,
  MoreVertical,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  Trash2,
  UserRound,
  Wrench,
  X
} from 'lucide-react';
import HelpGuideModal from './HelpGuideModal';
import type { HelpGuideStep } from './HelpGuideModal';
import { ComponentLoan, ComponentMaintenance, Partner, PartnerContact, PartnerPersonType, PartnerType, UserRole } from '../types';
import { useNotifications } from './NotificationProvider';

interface PartnersTabProps {
  partners: Partner[];
  role: UserRole;
  maintenances?: ComponentMaintenance[];
  loans?: ComponentLoan[];
  partnerTypes?: PartnerType[];
  onAddPartner: (partner: Omit<Partner, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => Promise<void>;
  onEditPartner: (id: string, updates: Partial<Partner>) => Promise<void>;
  onDeactivatePartner: (id: string) => Promise<void>;
}

const defaultPartnerTypes: PartnerType[] = ['Assistência técnica', 'Prestador de serviço', 'Recebedor de empréstimo'];

export default function PartnersTab({
  partners,
  role,
  maintenances = [],
  loans = [],
  partnerTypes = defaultPartnerTypes,
  onAddPartner,
  onEditPartner,
  onDeactivatePartner
}: PartnersTabProps) {
  const { confirmDialog, showToast } = useNotifications();
  const canManage = role === 'administrador' || role === 'tecnico' || role === 'ADMINISTRADOR' || role === 'TECNICO_CAMPO';
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | PartnerType>('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'status'>('name');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<Partner | null>(null);
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const legalNameRef = useRef<HTMLInputElement>(null);
  const documentRef = useRef<HTMLInputElement>(null);
  const lastSearchedCepRef = useRef('');
  const typesRef = useRef<HTMLDivElement>(null);
  const contactNameRef = useRef<HTMLInputElement>(null);
  const contactPhoneRef = useRef<HTMLInputElement>(null);
  const contactMobileRef = useRef<HTMLInputElement>(null);
  const contactEmailRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [invalidField, setInvalidField] = useState<'legalName' | 'document' | 'types' | 'contactName' | 'contactPhone' | 'contactMobile' | 'contactEmail' | null>(null);
  const [legalName, setLegalName] = useState('');
  const [tradingName, setTradingName] = useState('');
  const [personType, setPersonType] = useState<PartnerPersonType>('PJ');
  const [documentNumber, setDocumentNumber] = useState('');
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');
  const [address, setAddress] = useState('');
  const [contacts, setContacts] = useState<PartnerContact[]>([]);
  const [contactEditorOpen, setContactEditorOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactName, setContactName] = useState('');
  const [contactRole, setContactRole] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactMobile, setContactMobile] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactEmailTouched, setContactEmailTouched] = useState(false);
  const [types, setTypes] = useState<PartnerType[]>([]);
  const [notes, setNotes] = useState('');
  const [active, setActive] = useState(true);

  const modalOpen = Boolean(selectedPartner || editingPartner || isAdding);
  useEffect(() => {
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [modalOpen]);

  useEffect(() => {
    if (!actionsOpen) return;
    const close = (event: MouseEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(event.target as Node)) setActionsOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActionsOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [actionsOpen]);

  useEffect(() => {
    if (!error) return;
    showToast('error', error);
  }, [error]);

  const focusInvalid = (field: typeof invalidField, target: React.RefObject<HTMLElement | null>) => {
    setInvalidField(field);
    requestAnimationFrame(() => {
      target.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.current?.focus({ preventScroll: true });
    });
  };

  const filteredPartners = useMemo(() => partners.filter(partner => {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    const matchesSearch = !query || [partner.legalName, partner.tradingName, partner.document, partner.email]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(query));
    const matchesType = typeFilter === 'all' || partner.types.includes(typeFilter);
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? partner.active : !partner.active);
    return matchesSearch && matchesType && matchesStatus;
  }), [partners, search, typeFilter, statusFilter]);

  const displayedPartners = useMemo(() => [...filteredPartners].sort((a, b) => {
    if (sortBy === 'status') return Number(b.active) - Number(a.active) || a.legalName.localeCompare(b.legalName, 'pt-BR');
    if (sortBy === 'recent') {
      const getTime = (value: any) => value?.toDate?.().getTime?.() || new Date(value || 0).getTime() || 0;
      return getTime(b.createdAt) - getTime(a.createdAt);
    }
    return (a.tradingName || a.legalName).localeCompare(b.tradingName || b.legalName, 'pt-BR');
  }), [filteredPartners, sortBy]);

  const resetForm = () => {
    setLegalName(''); setTradingName(''); setPersonType('PJ'); setDocumentNumber(''); setCep(''); setCepError(''); lastSearchedCepRef.current = '';
    setAddress(''); setContacts([]); resetContactEditor(); setTypes([]); setNotes(''); setActive(true); setError(''); setInvalidField(null);
  };

  const openCreate = () => { resetForm(); setIsAdding(true); };
  const openEdit = (partner: Partner) => {
    setLegalName(partner.legalName); setTradingName(partner.tradingName || ''); setPersonType(partner.personType || (partner.document.replace(/\D/g, '').length <= 11 ? 'PF' : 'PJ')); setDocumentNumber(partner.document);
    setCep(partner.cep || ''); setCepError(''); lastSearchedCepRef.current = partner.cep?.replace(/\D/g, '') || '';
    setAddress(partner.address || '');
    setContacts(partner.contacts?.length ? partner.contacts : (partner.contactPerson || partner.phone || partner.email ? [{ id: `legacy_${partner.id}`, name: partner.contactPerson || partner.tradingName || partner.legalName, phone: partner.phone, email: partner.email }] : []));
    resetContactEditor(); setTypes(partner.types); setNotes(partner.notes || '');
    setActive(partner.active); setSelectedPartner(null); setActionsOpen(false); setEditingPartner(partner); setError('');
  };

  const toggleType = (type: PartnerType) => setTypes(current => current.includes(type) ? current.filter(item => item !== type) : [...current, type]);

  const formatDocument = (value: string, kind: PartnerPersonType) => {
    const digits = value.replace(/\D/g, '').slice(0, kind === 'PF' ? 11 : 14);
    if (kind === 'PF') {
      return digits
        .replace(/^(\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1-$2');
    }
    return digits
      .replace(/^(\d{2})(\d)/, '$1.$2')
      .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d)/, '.$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2');
  };

  const formatCep = (value: string) => value.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

  useEffect(() => {
    const digits = cep.replace(/\D/g, '');
    if (digits.length !== 8) {
      setCepError('');
      if (digits.length < 8) lastSearchedCepRef.current = '';
      return;
    }
    if (lastSearchedCepRef.current === digits) return;
    lastSearchedCepRef.current = digits;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setCepLoading(true); setCepError('');
      try {
        const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`, { signal: controller.signal });
        if (!response.ok) throw new Error('Falha ao consultar o CEP.');
        const data = await response.json();
        if (data.erro) {
          setCepError('CEP não encontrado. Confira os números digitados.');
          return;
        }
        const cityState = [data.localidade, data.uf].filter(Boolean).join(' - ');
        setAddress([data.logradouro, data.bairro, cityState].filter(Boolean).join(', '));
      } catch (lookupError: any) {
        if (lookupError.name !== 'AbortError') setCepError('Não foi possível consultar o CEP agora. Digite o endereço manualmente.');
      } finally {
        if (!controller.signal.aborted) setCepLoading(false);
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [cep]);

  const changePersonType = (kind: PartnerPersonType) => {
    setPersonType(kind);
    setDocumentNumber(current => formatDocument(current, kind));
    if (kind === 'PF') setTradingName('');
  };

  function resetContactEditor() {
    setContactEditorOpen(false); setEditingContactId(null); setContactName(''); setContactRole(''); setContactPhone(''); setContactMobile(''); setContactEmail(''); setContactEmailTouched(false);
  }

  const editContact = (contact: PartnerContact) => {
    const legacyPhoneDigits = (contact.phone || '').replace(/\D/g, '');
    setContactEditorOpen(true);
    setEditingContactId(contact.id); setContactName(contact.name); setContactRole(contact.role || '');
    setContactPhone(legacyPhoneDigits.length === 11 && !contact.mobile ? '' : formatPhone(contact.phone || '', false));
    setContactMobile(formatPhone(contact.mobile || (legacyPhoneDigits.length === 11 ? contact.phone : ''), true));
    setContactEmail(normalizeEmail(contact.email || '')); setContactEmailTouched(false);
  };

  const formatPhone = (value: string, mobile: boolean) => {
    const digits = value.replace(/\D/g, '').slice(0, mobile ? 11 : 10);
    return digits
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(mobile ? /(\d{5})(\d)/ : /(\d{4})(\d)/, '$1-$2');
  };

  const normalizeEmail = (value: string) => value.replace(/\s/g, '').toLocaleLowerCase('pt-BR').slice(0, 128);
  const isValidEmail = (value: string) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  const contactEmailInvalid = contactEmailTouched && !isValidEmail(contactEmail);

  const saveContact = async () => {
    if (!contactName.trim()) {
      setError('Informe o nome do contato.');
      focusInvalid('contactName', contactNameRef);
      return;
    }
    if (contactPhone && contactPhone.replace(/\D/g, '').length !== 10) {
      setError('Informe um telefone com DDD e 10 dígitos.');
      focusInvalid('contactPhone', contactPhoneRef);
      return;
    }
    if (contactMobile && contactMobile.replace(/\D/g, '').length !== 11) {
      setError('Informe um celular com DDD e 11 dígitos.');
      focusInvalid('contactMobile', contactMobileRef);
      return;
    }
    setContactEmailTouched(true);
    if (!isValidEmail(contactEmail)) {
      setError('Informe um e-mail válido, como contato@empresa.com.br.');
      focusInvalid('contactEmail', contactEmailRef);
      return;
    }
    const contact: PartnerContact = {
      id: editingContactId || `contact_${Date.now()}`,
      name: contactName.trim(), role: contactRole.trim(), phone: contactPhone.trim(), mobile: contactMobile.trim(), email: contactEmail.trim()
    };
    const nextContacts = editingContactId ? contacts.map(item => item.id === editingContactId ? contact : item) : [...contacts, contact];
    const primaryContact = nextContacts[0];
    setLoading(true); setError('');
    try {
      if (editingPartner) {
        await onEditPartner(editingPartner.id, {
          contacts: nextContacts,
          contactPerson: primaryContact?.name || '',
          phone: primaryContact?.mobile || primaryContact?.phone || '',
          email: primaryContact?.email || ''
        });
      }
      setContacts(nextContacts); resetContactEditor(); setInvalidField(null);
      showToast('success', editingPartner
        ? (editingContactId ? 'Contato atualizado.' : 'Contato adicionado.')
        : (editingContactId ? 'Contato atualizado no formulário.' : 'Contato adicionado ao formulário.'));
    } catch (contactError: any) {
      setError(contactError.message || 'Não foi possível salvar o contato.');
    } finally {
      setLoading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (contactEditorOpen && (contactName.trim() || contactPhone || contactMobile || contactEmail)) {
      setError('Conclua o contato em edição usando “Salvar contato” antes de salvar o parceiro.');
      focusInvalid('contactName', contactNameRef);
      return;
    }
    const documentDigits = documentNumber.replace(/\D/g, '');
    if (!legalName.trim()) {
      setError(personType === 'PF' ? 'Informe o nome completo.' : 'Informe a razão social.');
      focusInvalid('legalName', legalNameRef);
      return;
    }
    if (documentDigits.length !== (personType === 'PF' ? 11 : 14)) {
      setError(`Informe um ${personType === 'PF' ? 'CPF com 11 dígitos' : 'CNPJ com 14 dígitos'}.`);
      focusInvalid('document', documentRef);
      return;
    }
    if (types.length === 0) {
      setError('Selecione ao menos um tipo de parceiro.');
      focusInvalid('types', typesRef);
      return;
    }
    setLoading(true); setError(''); setInvalidField(null);
    const primaryContact = contacts[0];
    const payload = {
      legalName: legalName.trim(), tradingName: tradingName.trim(), personType, document: documentNumber.trim(),
      phone: primaryContact?.mobile || primaryContact?.phone || '', email: primaryContact?.email || '', cep: cep.trim(), address: address.trim(),
      contactPerson: primaryContact?.name || '', contacts, types, active, notes: notes.trim()
    };
    try {
      if (editingPartner) await onEditPartner(editingPartner.id, payload);
      else await onAddPartner(payload);
      setEditingPartner(null); setIsAdding(false); resetForm();
    } catch (err: any) {
      setError(err.message || 'Não foi possível salvar o parceiro.');
    } finally { setLoading(false); }
  };

  const deactivate = async (partner: Partner) => {
    const confirmed = await confirmDialog({
      title: partner.active ? 'Desativar parceiro?' : 'Parceiro já inativo',
      message: partner.active
        ? 'O parceiro deixará de aparecer em novas operações, mas permanecerá nos históricos existentes.'
        : 'Este parceiro já está inativo.',
      confirmLabel: partner.active ? 'Desativar' : 'Entendi', cancelLabel: 'Cancelar', danger: partner.active
    });
    if (!confirmed || !partner.active) return;
    try {
      await onDeactivatePartner(partner.id); setSelectedPartner(null); setActionsOpen(false);
      showToast('success', 'Parceiro desativado.');
    } catch (err: any) { showToast('error', err.message || 'Não foi possível desativar o parceiro.'); }
  };

  const relatedCounts = (partner: Partner) => ({
    maintenances: maintenances.filter(item => item.providerId === partner.id || item.providerName.trim().toLocaleLowerCase('pt-BR') === partner.legalName.trim().toLocaleLowerCase('pt-BR') || (partner.tradingName && item.providerName.trim().toLocaleLowerCase('pt-BR') === partner.tradingName.trim().toLocaleLowerCase('pt-BR'))).length,
    loans: loans.filter(item => item.thirdPartyId === partner.id || item.thirdPartyDocument === partner.document).length
  });

  const getPartnerContacts = (partner: Partner): PartnerContact[] => partner.contacts?.length
    ? partner.contacts
    : (partner.contactPerson || partner.phone || partner.email
      ? [{ id: `legacy_${partner.id}`, name: partner.contactPerson || partner.tradingName || partner.legalName, phone: partner.phone, email: partner.email }]
      : []);

  const getWhatsAppUrl = (mobile: string) => {
    const digits = mobile.replace(/\D/g, '');
    const internationalNumber = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${internationalNumber}`;
  };

  const steps: HelpGuideStep[] = [
    {
      title: 'Cadastro de parceiros',
      description: 'Crie e gerencie parceiros como assistências técnicas, prestadores de serviço ou recebedores de empréstimos. Cada parceiro pode ter múltiplos contatos e tipos de atuação.',
      icon: Building2,
      accent: 'bg-emerald-600 text-white'
    },
    {
      title: 'Pessoa física ou jurídica',
      description: 'Ao cadastrar, escolha entre pessoa física (CPF) ou pessoa jurídica (CNPJ). Para PJ, é possível informar nome fantasia e razão social. O CEP preenche o endereço automaticamente.',
      icon: UserRound,
      accent: 'bg-slate-900 text-white'
    },
    {
      title: 'Gerenciamento de contatos',
      description: 'Adicione múltiplos contatos para cada parceiro, com telefone, celular, e-mail e função. O primeiro contato é considerado o principal e aparece na listagem.',
      icon: Phone,
      accent: 'bg-blue-600 text-white'
    },
    {
      title: 'Tipos de atuação',
      description: 'Defina as funções do parceiro no sistema: Assistência técnica, Prestador de serviço ou Recebedor de empréstimo. Um parceiro pode exercer mais de uma função simultaneamente. Em empréstimos e manutenção, o destino é vinculado ao ID do parceiro. Não cadastre assistências ou recebedores como armazenamentos internos.',
      icon: Wrench,
      accent: 'bg-violet-600 text-white'
    },
    {
      title: 'Busca, filtros e histórico',
      description: 'Use a barra de busca para localizar parceiros por nome, documento ou e-mail. Filtre por tipo e status, e acompanhe quantas manutenções e empréstimos cada parceiro possui.',
      icon: Search,
      accent: 'bg-amber-600 text-white'
    }
  ];

  const formModal = (isAdding || editingPartner) && createPortal(
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:p-4">
      <button type="button" aria-label="Fechar formulário" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]" onClick={() => !loading && (setIsAdding(false), setEditingPartner(null))} />
      <div className="relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700"><Building2 className="h-5 w-5" /></span>
            <div><h2 className="text-base font-bold text-slate-900 sm:text-lg">{editingPartner ? 'Editar parceiro' : 'Novo parceiro'}</h2><p className="mt-0.5 text-xs text-slate-500">Dados cadastrais e funções na operação.</p></div>
          </div>
          <button type="button" aria-label="Fechar" onClick={() => !loading && (setIsAdding(false), setEditingPartner(null))} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto bg-slate-50/50 px-4 py-5 sm:px-6">

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-emerald-700">Identificação</p>
                <p className="mt-1 text-xs text-slate-500">Dados usados para reconhecer o parceiro nos registros.</p>
              </div>
              <fieldset className="mb-4">
                <legend className="mb-1.5 text-xs font-bold text-slate-700">Tipo de pessoa</legend>
                <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                  <button type="button" aria-pressed={personType === 'PF'} onClick={() => changePersonType('PF')} className={`min-h-10 rounded-lg px-3 text-xs font-bold transition ${personType === 'PF' ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Pessoa física</button>
                  <button type="button" aria-pressed={personType === 'PJ'} onClick={() => changePersonType('PJ')} className={`min-h-10 rounded-lg px-3 text-xs font-bold transition ${personType === 'PJ' ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700'}`}>Pessoa jurídica</button>
                </div>
              </fieldset>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className={`text-xs font-bold text-slate-700 ${personType === 'PF' ? 'sm:col-span-2' : ''}`}>{personType === 'PF' ? 'Nome completo' : 'Razão social'} <span className="text-rose-500">*</span>
                  <input ref={legalNameRef} autoFocus value={legalName} onChange={e => { setLegalName(e.target.value); if (invalidField === 'legalName') setInvalidField(null); }} aria-invalid={invalidField === 'legalName'} placeholder={personType === 'PF' ? 'Ex.: Maria da Silva' : 'Ex.: Oficina Campo Forte Ltda.'} className={`mt-1.5 min-h-11 w-full rounded-xl border bg-white px-3.5 font-normal outline-none transition ${invalidField === 'legalName' ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10'}`} />
                </label>
                {personType === 'PJ' && <label className="text-xs font-bold text-slate-700">Nome fantasia
                  <input value={tradingName} onChange={e => setTradingName(e.target.value)} placeholder="Como é conhecida" className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3.5 font-normal outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
                </label>}
                <label className={`text-xs font-bold text-slate-700 ${personType === 'PF' ? 'sm:col-span-2' : ''}`}>{personType === 'PF' ? 'CPF' : 'CNPJ'} <span className="text-rose-500">*</span>
                  <input ref={documentRef} inputMode="numeric" autoComplete="off" value={documentNumber} onChange={e => { setDocumentNumber(formatDocument(e.target.value, personType)); if (invalidField === 'document') setInvalidField(null); }} aria-invalid={invalidField === 'document'} placeholder={personType === 'PF' ? '000.000.000-00' : '00.000.000/0000-00'} maxLength={personType === 'PF' ? 14 : 18} className={`mt-1.5 min-h-11 w-full rounded-xl border bg-white px-3.5 font-normal tabular-nums outline-none transition ${invalidField === 'document' ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10'}`} />
                </label>
                <label className="text-xs font-bold text-slate-700">CEP
                  <div className="relative"><input inputMode="numeric" autoComplete="postal-code" maxLength={9} value={cep} onChange={e => setCep(formatCep(e.target.value))} placeholder="00000-000" aria-invalid={Boolean(cepError)} aria-describedby={cepError ? 'partner-cep-error' : undefined} className={`mt-1.5 min-h-11 w-full rounded-xl border px-3.5 pr-20 font-normal tabular-nums outline-none transition ${cepError ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10'}`} />{cepLoading && <span className="absolute right-3 top-1/2 mt-0.5 -translate-y-1/2 text-[10px] font-semibold text-slate-400">Buscando...</span>}</div>
                  {cepError && <span id="partner-cep-error" className="mt-1.5 block text-[10px] font-semibold text-rose-600">{cepError}</span>}
                </label>
                <label className="text-xs font-bold text-slate-700">Endereço
                  <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Preenchido automaticamente pelo CEP" className="mt-1.5 min-h-11 w-full rounded-xl border border-slate-300 px-3.5 font-normal outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Contato</p>
                <p className="mt-1 text-xs text-slate-500">Informações para comunicação e encaminhamento.</p>
              </div>
              <div className="space-y-2">
                {contacts.map((contact, index) => (
                  <div key={contact.id} className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-xs font-extrabold text-emerald-700 shadow-sm ring-1 ring-slate-200">{contact.name.split(' ').map(word => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5"><p className="truncate text-xs font-bold text-slate-800">{contact.name}</p>{index === 0 && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-700">Principal</span>}</div>
                      {contact.role && <p className="mt-0.5 text-[10px] text-slate-500">{contact.role}</p>}
                      <p className="mt-1 break-words text-[10px] text-slate-500">{[contact.mobile, contact.phone, contact.email].filter(Boolean).join(' · ') || 'Sem telefone, celular ou e-mail'}</p>
                    </div>
                    <button type="button" onClick={() => editContact(contact)} aria-label={`Editar contato ${contact.name}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-white hover:text-emerald-700"><Edit className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>

              {contactEditorOpen || contacts.length === 0 ? (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
                  <p className="mb-3 text-[10px] font-extrabold uppercase tracking-wide text-emerald-700">{editingContactId ? 'Editar contato' : 'Adicionar contato'}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-bold text-slate-700">Nome <span className="text-rose-500">*</span><input ref={contactNameRef} value={contactName} onChange={e => { setContactName(e.target.value); if (invalidField === 'contactName') setInvalidField(null); }} aria-invalid={invalidField === 'contactName'} placeholder="Nome do contato" className={`mt-1 min-h-10 w-full rounded-xl border bg-white px-3 font-normal outline-none ${invalidField === 'contactName' ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-emerald-500'}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Função<input value={contactRole} onChange={e => setContactRole(e.target.value)} placeholder="Ex.: Compras, Oficina" className="mt-1 min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 font-normal outline-none focus:border-emerald-500" /></label>
                    <label className="text-xs font-bold text-slate-700">Telefone<input ref={contactPhoneRef} type="tel" inputMode="tel" maxLength={14} value={contactPhone} onChange={e => { setContactPhone(formatPhone(e.target.value, false)); if (invalidField === 'contactPhone') setInvalidField(null); }} aria-invalid={invalidField === 'contactPhone'} placeholder="(00) 0000-0000" className={`mt-1 min-h-10 w-full rounded-xl border bg-white px-3 font-normal tabular-nums outline-none ${invalidField === 'contactPhone' ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-emerald-500'}`} /></label>
                    <label className="text-xs font-bold text-slate-700">Celular / WhatsApp<input ref={contactMobileRef} type="tel" inputMode="tel" maxLength={15} value={contactMobile} onChange={e => { setContactMobile(formatPhone(e.target.value, true)); if (invalidField === 'contactMobile') setInvalidField(null); }} aria-invalid={invalidField === 'contactMobile'} placeholder="(00) 00000-0000" className={`mt-1 min-h-10 w-full rounded-xl border bg-white px-3 font-normal tabular-nums outline-none ${invalidField === 'contactMobile' ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-300 focus:border-emerald-500'}`} /></label>
                    <label className="text-xs font-bold text-slate-700 sm:col-span-2">E-mail
                      <input ref={contactEmailRef} type="email" inputMode="email" autoCapitalize="none" spellCheck={false} maxLength={128} value={contactEmail} onChange={e => { setContactEmail(normalizeEmail(e.target.value)); if (invalidField === 'contactEmail') setInvalidField(null); }} onBlur={() => setContactEmailTouched(true)} aria-invalid={contactEmailInvalid || invalidField === 'contactEmail'} aria-describedby={contactEmailInvalid ? 'partner-contact-email-error' : undefined} placeholder="contato@empresa.com.br" className={`mt-1 min-h-10 w-full rounded-xl border bg-white px-3 font-normal outline-none transition ${contactEmailInvalid || invalidField === 'contactEmail' ? 'border-rose-400 bg-rose-50/50 text-rose-800 ring-2 ring-rose-100' : 'border-slate-300 focus:border-emerald-500'}`} />
                      {contactEmailInvalid && <span id="partner-contact-email-error" className="mt-1.5 block text-[10px] font-semibold text-rose-600">Digite um e-mail válido, como contato@empresa.com.br.</span>}
                    </label>
                  </div>
                  <div className="mt-3 flex justify-end gap-2">{contacts.length > 0 && <button type="button" disabled={loading} onClick={resetContactEditor} className="min-h-9 rounded-lg px-3 text-xs font-bold text-slate-500 hover:bg-white disabled:opacity-50">Cancelar</button>}<button type="button" disabled={loading || contactEmailInvalid} onClick={() => void saveContact()} className="min-h-9 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Salvando...' : editingContactId ? 'Salvar contato' : 'Adicionar contato'}</button></div>
                </div>
              ) : (
                <button type="button" onClick={() => setContactEditorOpen(true)} className="mt-3 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-300 text-xs font-bold text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50/40 hover:text-emerald-700"><Plus className="h-4 w-4" /> Adicionar contato</button>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Atuação no sistema</p>
                <p className="mt-1 text-xs text-slate-500">Selecione todas as funções que este parceiro pode exercer.</p>
              </div>
              <fieldset>
                <legend className="sr-only">Tipos de parceiro</legend>
                <div ref={typesRef} tabIndex={-1} className={`grid gap-2 rounded-xl outline-none sm:grid-cols-3 ${invalidField === 'types' ? 'ring-2 ring-rose-300 ring-offset-2' : ''}`}>
                  {partnerTypes.map(type => (
                    <button key={type} type="button" aria-pressed={types.includes(type)} onClick={() => { toggleType(type); setInvalidField(null); }} className={`flex min-h-12 items-center gap-2.5 rounded-xl border px-3 text-left text-xs font-semibold transition ${types.includes(type) ? 'border-emerald-300 bg-emerald-50 text-emerald-800 shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'}`}>
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${types.includes(type) ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'}`}>{types.includes(type) && <Check className="h-3.5 w-3.5" />}</span>
                      <span className="leading-tight">{type}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <label className="mt-4 block text-xs font-bold text-slate-700">Observações
                <textarea rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Registre condições comerciais, especialidades ou informações relevantes..." className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 px-3.5 py-3 font-normal leading-relaxed outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10" />
              </label>
            </section>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            <button type="button" disabled={loading} onClick={() => (setIsAdding(false), setEditingPartner(null))} className="min-h-11 rounded-xl border border-slate-200 px-4 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50">Cancelar</button>
            <button disabled={loading} className="min-h-11 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{loading ? 'Salvando...' : editingPartner ? 'Salvar alterações' : 'Cadastrar parceiro'}</button>
          </footer>
        </form>
      </div>
    </div>, document.body
  );

  return <div className="space-y-4" id="partners-tab">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-slate-900">Parceiros</h1><span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">{displayedPartners.length} {displayedPartners.length === 1 ? 'parceiro' : 'parceiros'}</span></div><p className="mt-1 text-xs text-slate-500">Centralize assistências, prestadores e recebedores de equipamentos.</p></div>
        <div className="flex shrink-0 items-center gap-2"><button onClick={() => setHelpOpen(true)} aria-label="Ajuda sobre parceiros" title="Como usar esta tela" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-900"><HelpCircle className="h-5 w-5" /></button>{canManage && <button onClick={openCreate} className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"><Plus className="h-4 w-4" /> Novo</button>}</div>
      </div>
      <div className="mt-4 flex items-center gap-2 sm:hidden"><button onClick={() => { setMobileSearchOpen(v => !v); setMobileFiltersOpen(false); }} aria-label="Buscar parceiros" className={`flex h-10 w-10 items-center justify-center rounded-xl border ${mobileSearchOpen ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}><Search className="h-4 w-4" /></button><button onClick={() => { setMobileFiltersOpen(v => !v); setMobileSearchOpen(false); }} aria-label="Filtrar parceiros" className={`flex h-10 w-10 items-center justify-center rounded-xl border ${mobileFiltersOpen || typeFilter !== 'all' || statusFilter !== 'active' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}><SlidersHorizontal className="h-4 w-4" /></button></div>
      {mobileSearchOpen && <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, documento ou e-mail" className="mt-3 min-h-10 w-full rounded-xl border border-slate-200 px-3 text-xs outline-none focus:border-emerald-400 sm:hidden" />}
      {mobileFiltersOpen && <div className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-2 sm:hidden"><select value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | PartnerType)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="all">Todos os tipos</option>{partnerTypes.map(type => <option key={type}>{type}</option>)}</select><select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos os status</option></select><select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs"><option value="name">Ordenar por nome</option><option value="recent">Mais recentes</option><option value="status">Ordenar por status</option></select></div>}
    </section>

    <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex">
      <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, documento ou e-mail" className="min-h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-xs outline-none focus:border-emerald-400" /></div>
      <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as 'all' | PartnerType)} className="min-h-10 max-w-52 rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="all">Todos os tipos</option>{partnerTypes.map(type => <option key={type}>{type}</option>)}</select>
      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option></select>
      <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} className="min-h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs"><option value="name">Nome</option><option value="recent">Mais recentes</option><option value="status">Status</option></select>
    </div>

    {displayedPartners.length === 0 ? (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center"><Building2 className="mx-auto h-8 w-8 text-slate-300" /><h2 className="mt-3 text-sm font-bold text-slate-700">Nenhum parceiro encontrado</h2><p className="mt-1 text-xs text-slate-500">Ajuste os filtros ou cadastre um novo parceiro.</p></div>
    ) : (
      <>
        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
          <div className="grid grid-cols-[minmax(230px,1.5fr)_minmax(170px,1fr)_minmax(190px,1.1fr)_130px_32px] items-center gap-4 border-b border-slate-200 bg-slate-50/70 px-5 py-3 text-[9px] font-extrabold uppercase tracking-[0.12em] text-slate-400"><span>Parceiro</span><span>Atuação</span><span>Contato principal</span><span>Atividade</span><span /></div>
          <div className="divide-y divide-slate-100">{displayedPartners.map(partner => { const primary = getPartnerContacts(partner)[0]; const counts = relatedCounts(partner); return <button key={partner.id} onClick={() => setSelectedPartner(partner)} className="group grid w-full grid-cols-[minmax(230px,1.5fr)_minmax(170px,1fr)_minmax(190px,1.1fr)_130px_32px] items-center gap-4 px-5 py-4 text-left transition hover:bg-emerald-50/30 focus:outline-none focus-visible:bg-emerald-50/40"><div className="flex min-w-0 items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-extrabold text-slate-600 group-hover:bg-white">{(partner.tradingName || partner.legalName).split(' ').map(word => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}</span><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-xs font-bold text-slate-900">{partner.tradingName || partner.legalName}</p><span className={`h-2 w-2 shrink-0 rounded-full ${partner.active ? 'bg-emerald-500' : 'bg-slate-300'}`} /></div><p className="mt-0.5 truncate text-[10px] text-slate-400">{partner.legalName}</p><p className="mt-1 text-[10px] font-medium tabular-nums text-slate-500">{partner.document}</p></div></div><div className="flex flex-wrap gap-1">{partner.types.slice(0, 2).map(type => <span key={type} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">{type}</span>)}{partner.types.length > 2 && <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">+{partner.types.length - 2}</span>}</div><div className="min-w-0">{primary ? <><p className="truncate text-xs font-semibold text-slate-700">{primary.name}</p><p className="mt-1 truncate text-[10px] text-slate-400">{primary.mobile || primary.phone || primary.email || 'Sem canal informado'}</p></> : <p className="text-[10px] text-slate-400">Não informado</p>}</div><div className="text-[10px] text-slate-500"><p><strong className="text-slate-800">{counts.maintenances}</strong> manutenções</p><p className="mt-1"><strong className="text-slate-800">{counts.loans}</strong> empréstimos</p></div><ChevronRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-emerald-600" /></button>; })}</div>
        </div>

        <div className="grid gap-3 md:hidden">{displayedPartners.map(partner => { const primary = getPartnerContacts(partner)[0]; const counts = relatedCounts(partner); return <button key={partner.id} onClick={() => setSelectedPartner(partner)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition active:scale-[0.99]"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[10px] font-extrabold text-slate-600">{(partner.tradingName || partner.legalName).split(' ').map(word => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-bold text-slate-900">{partner.tradingName || partner.legalName}</p><span className={`h-2 w-2 shrink-0 rounded-full ${partner.active ? 'bg-emerald-500' : 'bg-slate-300'}`} /></div><p className="mt-0.5 truncate text-[10px] text-slate-400">{partner.legalName}</p></div><ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" /></div><div className="mt-3 flex flex-wrap gap-1">{partner.types.map(type => <span key={type} className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-semibold text-slate-600">{type}</span>)}</div><div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-[10px]"><div><p className="text-slate-400">Documento</p><p className="mt-1 truncate font-medium text-slate-600">{partner.document}</p></div><div><p className="text-slate-400">Contato principal</p><p className="mt-1 truncate font-medium text-slate-600">{primary?.name || 'Não informado'}</p></div></div>{(counts.maintenances > 0 || counts.loans > 0) && <p className="mt-3 text-[10px] text-slate-400">{counts.maintenances} manutenções · {counts.loans} empréstimos</p>}</button>; })}</div>
      </>
    )}
    {selectedPartner && createPortal(
      <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center sm:p-4">
        <button aria-label="Fechar resumo" className="absolute inset-0 bg-slate-950/55" onClick={() => setSelectedPartner(null)} />
        <div className="relative flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-xl sm:rounded-2xl">
          <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex min-w-0 gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xs font-extrabold text-emerald-700 ring-1 ring-emerald-100">{(selectedPartner.tradingName || selectedPartner.legalName).split(' ').map(word => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}</span><div className="min-w-0"><h2 className="truncate text-base font-bold text-slate-900">{selectedPartner.tradingName || selectedPartner.legalName}</h2><div className="mt-1 flex flex-wrap items-center gap-1.5"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600">{selectedPartner.personType === 'PF' ? 'Pessoa física' : 'Pessoa jurídica'}</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${selectedPartner.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{selectedPartner.active ? 'Ativo' : 'Inativo'}</span></div><div className="mt-1.5 flex flex-wrap gap-1">{selectedPartner.types.map(type => <span key={type} className="text-[9px] font-semibold text-slate-500">{type}</span>)}</div></div></div>
            <div ref={actionsRef} className="relative flex gap-1">{canManage && <><button onClick={() => openEdit(selectedPartner)} aria-label="Editar parceiro" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-emerald-50 hover:text-emerald-700"><Edit className="h-4 w-4" /></button><button onClick={() => setActionsOpen(v => !v)} aria-label="Mais opções" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><MoreVertical className="h-5 w-5" /></button>{actionsOpen && <div className="absolute right-9 top-10 z-10 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl"><button onClick={() => deactivate(selectedPartner)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-xs font-semibold text-rose-600 hover:bg-rose-50"><Trash2 className="h-4 w-4" />Desativar parceiro</button></div>}</>}<button onClick={() => setSelectedPartner(null)} aria-label="Fechar" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          </header>
          <div className="overflow-y-auto bg-slate-50/60 p-4 sm:p-5">
            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <dl className="grid grid-cols-2 gap-x-5 gap-y-4 text-xs"><div className="col-span-2"><dt className="text-[10px] font-bold text-slate-400">{selectedPartner.personType === 'PF' ? 'Nome completo' : 'Razão social'}</dt><dd className="mt-1 font-semibold text-slate-800">{selectedPartner.legalName}</dd></div><div><dt className="text-[10px] font-bold text-slate-400">Documento</dt><dd className="mt-1 font-medium tabular-nums text-slate-700">{selectedPartner.document}</dd></div><div><dt className="text-[10px] font-bold text-slate-400">CEP</dt><dd className="mt-1 font-medium tabular-nums text-slate-700">{selectedPartner.cep || 'Não informado'}</dd></div>{selectedPartner.address && <div className="col-span-2 border-t border-slate-100 pt-3"><dt className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400"><MapPin className="h-3.5 w-3.5" />Endereço</dt><dd className="mt-1.5 leading-relaxed text-slate-700">{selectedPartner.address}</dd></div>}</dl>
            </section>
            <section className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
              <div className="mb-3 flex items-center justify-between"><div><h3 className="text-xs font-bold text-slate-800">Contatos</h3><p className="mt-0.5 text-[10px] text-slate-400">Canais diretos deste parceiro</p></div><span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 text-[10px] font-bold text-slate-500">{getPartnerContacts(selectedPartner).length}</span></div>
              {getPartnerContacts(selectedPartner).length ? <div className="divide-y divide-slate-100">{getPartnerContacts(selectedPartner).map((contact, index) => <div key={contact.id} className="flex items-center gap-3 py-3 first:pt-1 last:pb-1"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-extrabold text-slate-600">{contact.name.split(' ').map(word => word[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-1.5"><p className="truncate text-xs font-bold text-slate-800">{contact.name}</p>{index === 0 && <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[8px] font-bold text-emerald-700">Principal</span>}</div><p className="mt-0.5 truncate text-[10px] text-slate-400">{contact.role || 'Contato'}</p></div><div className="flex shrink-0 items-center gap-1">{contact.phone && <a href={`tel:${contact.phone.replace(/\D/g, '')}`} aria-label={`Ligar para ${contact.name}`} title={contact.phone} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><Phone className="h-4 w-4" /></a>}{contact.email && <a href={`mailto:${contact.email}`} aria-label={`Enviar e-mail para ${contact.name}`} title={contact.email} className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><Mail className="h-4 w-4" /></a>}{contact.mobile && <a href={getWhatsAppUrl(contact.mobile)} target="_blank" rel="noopener noreferrer" aria-label={`Abrir WhatsApp de ${contact.name}`} title={`${contact.mobile} · WhatsApp`} className="flex h-9 items-center gap-1.5 rounded-xl bg-emerald-50 px-2.5 text-[10px] font-bold text-emerald-700 transition hover:bg-emerald-100"><MessageCircle className="h-4 w-4" /><span className="hidden sm:inline">WhatsApp</span></a>}</div></div>)}</div> : <p className="py-3 text-xs text-slate-400">Nenhum contato informado.</p>}
            </section>
            <div className="mt-3">{(() => { const counts = relatedCounts(selectedPartner); const hasHistory = counts.maintenances > 0 || counts.loans > 0; return hasHistory ? <div className="grid grid-cols-2 gap-2"><div className="rounded-xl bg-amber-50/70 p-3"><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-amber-600" /><p className="text-sm font-bold text-slate-900">{counts.maintenances}</p></div><p className="mt-1 text-[10px] text-slate-500">Manutenções</p></div><div className="rounded-xl bg-sky-50/70 p-3"><div className="flex items-center gap-2"><Building2 className="h-4 w-4 text-sky-600" /><p className="text-sm font-bold text-slate-900">{counts.loans}</p></div><p className="mt-1 text-[10px] text-slate-500">Empréstimos</p></div></div> : <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2.5 text-[10px] text-slate-400"><span>0 manutenções</span><span>·</span><span>0 empréstimos</span></div>; })()}</div>
          </div>
        </div>
      </div>,
      document.body
    )}
    {formModal}
    <HelpGuideModal open={helpOpen} onClose={() => setHelpOpen(false)} title="Como usar a tela de Parceiros" steps={steps} />
  </div>;
}
