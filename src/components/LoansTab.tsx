import React, { useState } from 'react';
import { AutopilotComponent, ThirdParty, ComponentLoan, LoanedItem, UserRole, CompanyProfile } from '../types';
import { useNotifications } from './NotificationProvider';
import { 
  Plus, 
  Search, 
  UserPlus, 
  Users, 
  Handshake, 
  Calendar, 
  FileText, 
  CheckCircle2, 
  Clock, 
  X, 
  Trash2, 
  ArrowLeftRight, 
  Cpu, 
  Briefcase, 
  Phone, 
  Mail, 
  BookOpen, 
  Download, 
  Share2, 
  Printer, 
  ChevronRight, 
  Sparkles,
  ClipboardCheck,
  Building,
  History
} from 'lucide-react';
import { jsPDF } from 'jspdf';

interface LoansTabProps {
  components: AutopilotComponent[];
  thirdParties: ThirdParty[];
  loans: ComponentLoan[];
  role: UserRole;
  currentUserName: string;
  companyProfile?: CompanyProfile;
  onAddThirdParty: (tp: Omit<ThirdParty, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => Promise<void>;
  onEditThirdParty: (id: string, updates: Partial<ThirdParty>) => Promise<void>;
  onDeleteThirdParty: (id: string) => Promise<void>;
  onAddLoan: (loan: Omit<ComponentLoan, 'id' | 'contractNumber' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => Promise<void>;
  onReturnLoan: (id: string) => Promise<void>;
  onPartialReturnLoan: (id: string, returnedItemIds: string[]) => Promise<void>;
  onDeleteLoan: (id: string) => Promise<void>;
}

export default function LoansTab({
  components,
  thirdParties,
  loans,
  role,
  currentUserName,
  companyProfile,
  onAddThirdParty,
  onEditThirdParty,
  onDeleteThirdParty,
  onAddLoan,
  onReturnLoan,
  onPartialReturnLoan,
  onDeleteLoan
}: LoansTabProps) {
  const { showToast, showDialog } = useNotifications();

  // Navigation within tab
  const [subTab, setSubTab] = useState<'loans' | 'thirdparties' | 'history'>('loans');
  const [historyTypeFilter, setHistoryTypeFilter] = useState<string>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'Ativo' | 'Devolvido'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Ativo' | 'Devolvido'>('all');

  // Modals
  const [isAddingThirdParty, setIsAddingThirdParty] = useState(false);
  const [editingThirdParty, setEditingThirdParty] = useState<ThirdParty | null>(null);
  const [isCreatingLoan, setIsCreatingLoan] = useState(false);
  const [viewingContract, setViewingContract] = useState<ComponentLoan | null>(null);

  // Custom confirmation modals
  const [loanToReturn, setLoanToReturn] = useState<ComponentLoan | null>(null);
  const [isPartialMode, setIsPartialMode] = useState(false);
  const [selectedPartialItemIds, setSelectedPartialItemIds] = useState<Record<string, boolean>>({});
  const [loanToDelete, setLoanToDelete] = useState<ComponentLoan | null>(null);
  const [thirdPartyToDelete, setThirdPartyToDelete] = useState<ThirdParty | null>(null);

  // Third party form states
  const [tpName, setTpName] = useState('');
  const [tpDocument, setTpDocument] = useState('');
  const [tpPhone, setTpPhone] = useState('');
  const [tpEmail, setTpEmail] = useState('');
  const [tpCompany, setTpCompany] = useState('');

  // Loan form states
  const [selectedThirdPartyId, setSelectedThirdPartyId] = useState('');
  const [loanDate, setLoanDate] = useState(new Date().toISOString().split('T')[0]);
  const [estimatedReturnDate, setEstimatedReturnDate] = useState('');
  const [loanNotes, setLoanNotes] = useState('');
  const [tempSelectedComponentId, setTempSelectedComponentId] = useState('');
  const [loanedItems, setLoanedItems] = useState<AutopilotComponent[]>([]);

  // Feedback states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareSuccess, setShareSuccess] = useState(false);

  // Email alert states
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [alertEmail, setAlertEmail] = useState('');
  const [alertSuccess, setAlertSuccess] = useState<string | null>(null);
  const [sendingAlert, setSendingAlert] = useState(false);

  // Overdue calculation
  const todayStr = new Date().toISOString().split('T')[0];
  const overdueLoans = loans.filter(l => l.status === 'Ativo' && l.estimatedReturnDate && l.estimatedReturnDate < todayStr);

  const dueSoonLimit = new Date();
  dueSoonLimit.setDate(dueSoonLimit.getDate() + 7);
  const dueSoonStr = dueSoonLimit.toISOString().split('T')[0];
  const dueSoonLoans = loans.filter(l => l.status === 'Ativo' && l.estimatedReturnDate && l.estimatedReturnDate >= todayStr && l.estimatedReturnDate <= dueSoonStr);

  // -------------------------------------------------------------
  // Dynamic Loan History Entries Construction
  // -------------------------------------------------------------
  const historyEntries = React.useMemo(() => {
    const entries: {
      id: string;
      loanId: string;
      contractNumber: string;
      thirdPartyName: string;
      thirdPartyCompany: string;
      thirdPartyDocument: string;
      componentId: string;
      componentSerial: string;
      componentName: string;
      componentBrand: string;
      componentType: string;
      loanDate: string;
      estimatedReturnDate?: string;
      actualReturnDate?: string;
      status: 'Ativo' | 'Devolvido';
      notes?: string;
    }[] = [];

    loans.forEach(loan => {
      // 1. Items currently under active or fully returned loan
      loan.items.forEach(item => {
        entries.push({
          id: `${loan.id}_active_${item.componentId}`,
          loanId: loan.id,
          contractNumber: loan.contractNumber,
          thirdPartyName: loan.thirdPartyName,
          thirdPartyCompany: loan.thirdPartyCompany || '',
          thirdPartyDocument: loan.thirdPartyDocument || '',
          componentId: item.componentId,
          componentSerial: item.componentSerial,
          componentName: item.componentName,
          componentBrand: item.componentBrand,
          componentType: item.componentType || '',
          loanDate: loan.loanDate,
          estimatedReturnDate: loan.estimatedReturnDate,
          actualReturnDate: loan.status === 'Devolvido' ? (loan.actualReturnDate || (typeof loan.updatedAt === 'string' ? loan.updatedAt.split('T')[0] : '')) : undefined,
          status: loan.status,
          notes: loan.notes
        });
      });

      // 2. Items that were partially returned under this loan
      if (loan.returnedItems) {
        loan.returnedItems.forEach(item => {
          entries.push({
            id: `${loan.id}_partial_${item.componentId}`,
            loanId: loan.id,
            contractNumber: loan.contractNumber,
            thirdPartyName: loan.thirdPartyName,
            thirdPartyCompany: loan.thirdPartyCompany || '',
            thirdPartyDocument: loan.thirdPartyDocument || '',
            componentId: item.componentId,
            componentSerial: item.componentSerial,
            componentName: item.componentName,
            componentBrand: item.componentBrand,
            componentType: item.componentType || '',
            loanDate: loan.loanDate,
            estimatedReturnDate: loan.estimatedReturnDate,
            actualReturnDate: loan.updatedAt ? (typeof loan.updatedAt === 'string' ? loan.updatedAt.split('T')[0] : 'Devolvido') : 'Devolvido',
            status: 'Devolvido',
            notes: loan.notes
          });
        });
      }
    });

    // Sort by loanDate desc (newest first)
    return entries.sort((a, b) => b.loanDate.localeCompare(a.loanDate));
  }, [loans]);

  // Filter entries based on Search & Select controls
  const filteredHistoryEntries = React.useMemo(() => {
    return historyEntries.filter(entry => {
      // Search filter
      const searchLower = searchTerm.toLowerCase();
      const matchSearch = !searchTerm || 
        entry.componentName.toLowerCase().includes(searchLower) ||
        entry.componentSerial.toLowerCase().includes(searchLower) ||
        entry.thirdPartyName.toLowerCase().includes(searchLower) ||
        entry.thirdPartyCompany.toLowerCase().includes(searchLower) ||
        entry.contractNumber.toLowerCase().includes(searchLower);

      // Category filter
      const matchCategory = historyTypeFilter === 'all' || entry.componentType === historyTypeFilter;

      // Status filter
      const matchStatus = historyStatusFilter === 'all' || entry.status === historyStatusFilter;

      return matchSearch && matchCategory && matchStatus;
    });
  }, [historyEntries, searchTerm, historyTypeFilter, historyStatusFilter]);

  // Quick Stats
  const statsTotalCount = historyEntries.length;
  const statsActiveCount = historyEntries.filter(e => e.status === 'Ativo').length;
  const statsReturnedCount = historyEntries.filter(e => e.status === 'Devolvido').length;

  const handleSendLoanEmailAlerts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertEmail.trim()) {
      showToast('warning', 'Por favor, insira o e-mail de destino.');
      return;
    }
    if (overdueLoans.length === 0) {
      showToast('info', 'Não há nenhum empréstimo vencido no momento para alertar.');
      return;
    }

    setSendingAlert(true);
    try {
      const response = await fetch('/api/loans/send-alert-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          alertEmail: alertEmail.trim(),
          loans: overdueLoans
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Erro ao disparar e-mails de alerta.');
      }

      setAlertSuccess(data.message);
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao enviar alertas.');
    } finally {
      setSendingAlert(false);
    }
  };

  // Helper lists
  const availableComponents = components.filter(c => c.status === 'Disponível');

  // Resets
  const resetThirdPartyForm = () => {
    setTpName('');
    setTpDocument('');
    setTpPhone('');
    setTpEmail('');
    setTpCompany('');
    setError(null);
  };

  const resetLoanForm = () => {
    setSelectedThirdPartyId('');
    setLoanDate(new Date().toISOString().split('T')[0]);
    setEstimatedReturnDate('');
    setLoanNotes('');
    setTempSelectedComponentId('');
    setLoanedItems([]);
    setError(null);
  };

  // Create Third Party handler
  const handleCreateThirdParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tpName || !tpDocument || !tpCompany) {
      setError('Por favor, preencha o Nome, CPF/CNPJ e Empresa do terceiro.');
      return;
    }

    setLoading(true);
    try {
      await onAddThirdParty({
        name: tpName.trim(),
        document: tpDocument.trim(),
        phone: tpPhone.trim(),
        email: tpEmail.trim(),
        company: tpCompany.trim()
      });
      setIsAddingThirdParty(false);
      resetThirdPartyForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar prestador terceiro.');
    } finally {
      setLoading(false);
    }
  };

  // Edit Third Party handler
  const handleUpdateThirdParty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingThirdParty) return;
    if (!tpName || !tpDocument || !tpCompany) {
      setError('Campos Nome, CPF/CNPJ e Empresa são obrigatórios.');
      return;
    }

    setLoading(true);
    try {
      await onEditThirdParty(editingThirdParty.id, {
        name: tpName.trim(),
        document: tpDocument.trim(),
        phone: tpPhone.trim(),
        email: tpEmail.trim(),
        company: tpCompany.trim()
      });
      setEditingThirdParty(null);
      resetThirdPartyForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao editar dados.');
    } finally {
      setLoading(false);
    }
  };

  const startEditThirdParty = (tp: ThirdParty) => {
    setEditingThirdParty(tp);
    setTpName(tp.name);
    setTpDocument(tp.document);
    setTpPhone(tp.phone);
    setTpEmail(tp.email);
    setTpCompany(tp.company);
  };

  // Add component to temp loan list
  const addComponentToLoanList = () => {
    if (!tempSelectedComponentId) return;
    const comp = components.find(c => c.id === tempSelectedComponentId);
    if (!comp) return;

    if (loanedItems.some(item => item.id === comp.id)) {
      setError('Este equipamento já está adicionado ao empréstimo.');
      return;
    }

    setLoanedItems([...loanedItems, comp]);
    setTempSelectedComponentId('');
    setError(null);
  };

  // Remove component from temp loan list
  const removeComponentFromLoanList = (id: string) => {
    setLoanedItems(loanedItems.filter(item => item.id !== id));
  };

  // Save Component Loan handler
  const handleSaveLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedThirdPartyId) {
      setError('Por favor, selecione um prestador terceiro.');
      return;
    }
    if (loanedItems.length === 0) {
      setError('Adicione pelo menos um componente ao empréstimo.');
      return;
    }

    const thirdParty = thirdParties.find(tp => tp.id === selectedThirdPartyId);
    if (!thirdParty) {
      setError('Prestador terceiro inválido.');
      return;
    }

    setLoading(true);
    try {
      const formattedItems: LoanedItem[] = loanedItems.map(c => ({
        componentId: c.id,
        componentSerial: c.serialNumber,
        componentName: c.name,
        componentBrand: c.brand,
        componentType: c.type
      }));

      await onAddLoan({
        thirdPartyId: thirdParty.id,
        thirdPartyName: thirdParty.name,
        thirdPartyDocument: thirdParty.document,
        thirdPartyCompany: thirdParty.company,
        items: formattedItems,
        loanDate: loanDate,
        estimatedReturnDate: estimatedReturnDate || undefined,
        status: 'Ativo',
        notes: loanNotes.trim() || undefined
      });

      setIsCreatingLoan(false);
      resetLoanForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar o empréstimo.');
    } finally {
      setLoading(false);
    }
  };

  // Mark Loan as Returned
  const handleConfirmReturnLoan = async (id: string) => {
    try {
      setLoading(true);
      await onReturnLoan(id);
      setLoanToReturn(null);
      setIsPartialMode(false);
      setSelectedPartialItemIds({});
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao processar devolução.');
    } finally {
      setLoading(false);
    }
  };

  // Mark selected items as returned (partial return)
  const handleConfirmPartialReturnLoan = async (id: string) => {
    const returnedIds = Object.keys(selectedPartialItemIds).filter(key => selectedPartialItemIds[key]);
    if (returnedIds.length === 0) {
      showToast('warning', 'Por favor, selecione pelo menos um componente para devolução parcial.');
      return;
    }
    try {
      setLoading(true);
      await onPartialReturnLoan(id, returnedIds);
      setLoanToReturn(null);
      setIsPartialMode(false);
      setSelectedPartialItemIds({});
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao processar devolução parcial.');
    } finally {
      setLoading(false);
    }
  };

  // Delete Loan record
  const handleConfirmDeleteLoan = async (id: string) => {
    try {
      setLoading(true);
      await onDeleteLoan(id);
      setLoanToDelete(null);
    } catch (err: any) {
      showToast('error', err.message || 'Erro ao excluir empréstimo.');
    } finally {
      setLoading(false);
    }
  };

  // Share text builder (WhatsApp, Slack, email compatible)
  const handleShareContract = (loan: ComponentLoan) => {
    const itemsText = loan.items.map((it, idx) => `${idx + 1}. [${it.componentBrand}] ${it.componentName} (S/N: ${it.componentSerial})`).join('\n');
    const shareText = `*TERMO DE EMPRÉSTIMO DE EQUIPAMENTOS*\n` +
      `*Registro nº:* ${loan.contractNumber}\n` +
      `*Responsável:* ${loan.thirdPartyName}\n` +
      `*Empresa:* ${loan.thirdPartyCompany}\n` +
      `*CPF/CNPJ:* ${loan.thirdPartyDocument}\n` +
      `*Data de Saída:* ${new Date(loan.loanDate).toLocaleDateString('pt-BR')}\n` +
      `*Previsão de Retorno:* ${loan.estimatedReturnDate ? new Date(loan.estimatedReturnDate).toLocaleDateString('pt-BR') : 'Indeterminada'}\n\n` +
      `*Equipamentos Emprestados:*\n${itemsText}\n\n` +
      `Assinado e formalizado sob regime de empréstimo temporário de uso.\n` +
      `_${companyProfile?.tradingName || companyProfile?.name || 'Agro Stock GPS Logística'}_`;

    navigator.clipboard.writeText(shareText);
    setShareSuccess(true);
    setTimeout(() => setShareSuccess(false), 3000);
  };

  // PDF Download Generator using jsPDF
  const handleDownloadPDF = (loan: ComponentLoan) => {
    const associatedThirdParty = thirdParties.find(t => t.id === loan.thirdPartyId);
    const tpPhone = associatedThirdParty?.phone || 'não informado';

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Page coordinates and dimensions
    const margin = 20;
    const pageWidth = 210;
    let y = 20;

    // Outer frame decoration
    doc.setDrawColor(226, 232, 240);
    doc.rect(10, 10, pageWidth - 20, 277);

    // Document header
    if (companyProfile?.logoUrl) {
      try {
        let format = 'PNG';
        if (companyProfile.logoUrl.includes('image/jpeg') || companyProfile.logoUrl.includes('image/jpg')) {
          format = 'JPEG';
        } else if (companyProfile.logoUrl.includes('image/webp')) {
          format = 'WEBP';
        }
        
        const logoWidth = 24;
        const logoHeight = 14;
        const logoX = (pageWidth / 2) - (logoWidth / 2);
        const logoY = y;
        
        doc.addImage(companyProfile.logoUrl, format, logoX, logoY, logoWidth, logoHeight);
        y += logoHeight + 6;
      } catch (e) {
        console.error("Error drawing company logo in PDF: ", e);
      }
    }

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('TERMO DE EMPRÉSTIMO DE EQUIPAMENTOS', pageWidth / 2, y, { align: 'center' });
    y += 8;

    doc.setFontSize(10);
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`REGISTRO DE RETIRADA Nº ${loan.contractNumber}`, pageWidth / 2, y, { align: 'center' });
    y += 12;

    // Horizontal Separator Line
    doc.setDrawColor(16, 185, 129); // emerald-500
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // PARTIES
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('1. ENVOLVIDOS', margin, y);
    y += 6;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85); // slate-700
    
    const companyName = companyProfile?.name || 'AGRO STOCK GPS LOGÍSTICA S.A.';
    const companyCnpj = companyProfile?.cnpj || '12.345.678/0001-90';
    const textComodante = `CEDENTE: ${companyName}, inscrita sob o CNPJ nº ${companyCnpj}, proprietária dos equipamentos, doravante referida como CEDENTE.`;
    const splitComodante = doc.splitTextToSize(textComodante, pageWidth - (margin * 2));
    doc.text(splitComodante, margin, y);
    y += splitComodante.length * 5;

    const textComodatario = `RECEBEDOR(A): ${loan.thirdPartyName.toUpperCase()}, inscrito(a) sob o CPF/CNPJ nº ${loan.thirdPartyDocument}, vinculado(a) à empresa ou fazenda agrícola ${loan.thirdPartyCompany}, telefone ${tpPhone}, doravante referida como RECEBEDOR.`;
    const splitComodatario = doc.splitTextToSize(textComodatario, pageWidth - (margin * 2));
    doc.text(splitComodatario, margin, y);
    y += (splitComodatario.length * 5) + 6;

    // OBJETO
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('2. EQUIPAMENTOS EMPRESTADOS', margin, y);
    y += 6;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    const shortCompany = companyProfile?.tradingName || companyProfile?.name || 'CEDENTE';
    const textObjeto = `Constitui objeto deste termo o empréstimo gratuito temporário de uso dos componentes de tecnologia agrícola listados abaixo, de propriedade da ${shortCompany}:`;
    const splitObjeto = doc.splitTextToSize(textObjeto, pageWidth - (margin * 2));
    doc.text(splitObjeto, margin, y);
    y += (splitObjeto.length * 5) + 4;

    // Table Header
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setFillColor(248, 250, 252); // slate-50
    doc.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
    doc.setLineWidth(0.2);
    doc.rect(margin, y, pageWidth - (margin * 2), 7);
    
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Item', margin + 3, y + 4.5);
    doc.text('Equipamento / Descrição Técnica', margin + 12, y + 4.5);
    doc.text('Marca', margin + 95, y + 4.5);
    doc.text('Número de Série (S/N)', margin + 125, y + 4.5);
    y += 7;

    // Table Rows
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    
    loan.items.forEach((item, index) => {
      doc.line(margin, y, pageWidth - margin, y);
      doc.text(String(index + 1).padStart(2, '0'), margin + 3, y + 4.5);
      doc.text(`${item.componentName} [${item.componentType}]`, margin + 12, y + 4.5);
      doc.text(item.componentBrand, margin + 95, y + 4.5);
      doc.setFont('Helvetica', 'bold');
      doc.text(item.componentSerial, margin + 125, y + 4.5);
      doc.setFont('Helvetica', 'normal');
      y += 6;
    });
    
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // RESPONSIBILITIES & CONDITIONS
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('3. CONDIÇÕES DE USO E PRAZOS', margin, y);
    y += 6;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105); // slate-600
    
    const textTermos = `a) O(A) RECEBEDOR(A) confirma que recebeu os equipamentos descritos em perfeitas condições de funcionamento e se compromete a zelar por sua segurança e integridade.\n` +
      `b) É proibido transferir ou emprestar estes equipamentos para terceiros sem a autorização prévia por escrito da CEDENTE.\n` +
      `c) O empréstimo vigora a partir de ${new Date(loan.loanDate).toLocaleDateString('pt-BR')} com previsão de retorno estabelecida para ${loan.estimatedReturnDate ? new Date(loan.estimatedReturnDate).toLocaleDateString('pt-BR') : 'Tempo Indeterminado'}.\n` +
      `d) Em caso de danos, extravio ou perda dos itens por mau uso, o(a) RECEBEDOR(A) será responsável pelo ressarcimento do valor de mercado correspondente.`;
    
    const splitTermos = doc.splitTextToSize(textTermos, pageWidth - (margin * 2));
    doc.text(splitTermos, margin, y);
    y += (splitTermos.length * 4) + 12;

    // DATE AND SIGNATURES
    const todayFormatted = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`Local de Emissão e Data: Campo Verde, ${todayFormatted}.`, margin, y);
    y += 20;

    // Signature boxes
    doc.setLineWidth(0.3);
    doc.setDrawColor(148, 163, 184); // slate-400
    
    // Left - Cedente
    doc.line(margin, y, margin + 65, y);
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(companyProfile?.tradingName || companyProfile?.name || 'AGRO STOCK GPS S.A.', margin + 32.5, y + 4, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Representante Cedente', margin + 32.5, y + 8, { align: 'center' });

    // Right - Recebedor
    doc.line(pageWidth - margin - 65, y, pageWidth - margin, y);
    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(loan.thirdPartyName.toUpperCase(), pageWidth - margin - 32.5, y + 4, { align: 'center' });
    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('RECEBEDOR', pageWidth - margin - 32.5, y + 8, { align: 'center' });

    doc.save(`Termo_Emprestimo_${loan.contractNumber}.pdf`);
  };

  // Filter listings
  const filteredLoans = loans.filter(l => {
    const matchesSearch = l.thirdPartyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          l.contractNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          l.items.some(it => it.componentSerial.toLowerCase().includes(searchTerm.toLowerCase()) || it.componentName.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesStatus = statusFilter === 'all' || l.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const filteredThirdParties = thirdParties.filter(tp => 
    tp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tp.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tp.document.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-4" id="loans-module-root">
      
      {/* Header & Subtabs Selection */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Handshake className="h-5 w-5 text-emerald-500" />
            Módulo de Empréstimos
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Gestão de empréstimos de antenas, monitores e nav controllers para prestadores de serviços terceiros.
          </p>
        </div>

        {/* Sub-tab Toggle */}
        <div className="flex bg-slate-100 p-1 rounded-xl self-start md:self-auto">
          <button
            onClick={() => { setSubTab('loans'); setSearchTerm(''); }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${subTab === 'loans' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Empréstimos
          </button>
          <button
            onClick={() => { setSubTab('thirdparties'); setSearchTerm(''); }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${subTab === 'thirdparties' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <Users className="h-3.5 w-3.5" />
            Terceiros
            <span className="bg-slate-200 text-slate-700 rounded-full px-1.5 text-[9px] font-black leading-4">{thirdParties.length}</span>
          </button>
          <button
            onClick={() => { setSubTab('history'); setSearchTerm(''); }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${subTab === 'history' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
          >
            <History className="h-3.5 w-3.5 text-emerald-500" />
            Histórico
          </button>
        </div>
      </div>

      {/* Main Action Bar */}
      <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        
        {/* Search */}
        <div className="flex flex-1 min-w-0 items-stretch gap-2.5">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder={
                subTab === 'loans' 
                  ? 'Buscar por nº, terceiro ou nº de série...' 
                  : subTab === 'thirdparties'
                  ? 'Buscar terceiro por nome, CPF/CNPJ ou empresa...'
                  : 'Buscar no histórico (terceiro, componente, série, termo)...'
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2 rounded-xl text-xs focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none font-medium"
            />
          </div>

          {subTab === 'loans' && (
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="shrink-0 max-w-[45%] bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-700"
            >
              <option value="all">Todos Status</option>
              <option value="Ativo">Ativos</option>
              <option value="Devolvido">Devolvidos</option>
            </select>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          {subTab === 'loans' && (
            <>
              <button
                onClick={() => {
                  setIsAlertModalOpen(true);
                  setAlertSuccess(null);
                }}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5"
              >
                <Mail className="h-4 w-4" />
                Configurar alertas
              </button>

              <button
                onClick={() => {
                  if (thirdParties.length === 0) {
                    showDialog({
                      title: 'Nenhum prestador terceiro cadastrado',
                      message: 'Para criar um empréstimo, você precisa cadastrar pelo menos um prestador terceiro.',
                      icon: 'warning',
                      okLabel: 'Cadastrar Prestador Terceiro',
                      cancelLabel: 'Cancelar',
                      onOk: () => {
                        setSubTab('thirdparties');
                        setIsAddingThirdParty(true);
                      }
                    });
                    return;
                  }
                  setIsCreatingLoan(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Novo Empréstimo
              </button>
            </>
          )}

          {subTab === 'thirdparties' && (
            <button
              onClick={() => setIsAddingThirdParty(true)}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5"
            >
              <UserPlus className="h-4 w-4" />
              Cadastrar Terceiro
            </button>
          )}

          {subTab === 'history' && (
            <>
              {/* Type Filter */}
              <select
                value={historyTypeFilter}
                onChange={(e) => setHistoryTypeFilter(e.target.value)}
                className="bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-700"
              >
                <option value="all">Todas Categorias</option>
                <option value="Antena">Antenas</option>
                <option value="Monitor">Monitores</option>
                <option value="Nav Controller">Nav Controllers</option>
                <option value="Acessório">Acessórios</option>
              </select>

              {/* Status Filter */}
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value as any)}
                className="bg-white border border-slate-200 text-xs px-3 py-2 rounded-xl focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-700"
              >
                <option value="all">Todos Status</option>
                <option value="Ativo">Em Campo (Ativo)</option>
                <option value="Devolvido">Já Devolvido</option>
              </select>
            </>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: LOANS HISTORY & ACTIVE MODULES */}
      {/* ========================================================= */}
      {subTab === 'loans' && (
        <div className="space-y-4" id="loans-list-view">
          {filteredLoans.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 shadow-sm">
              <div className="h-12 w-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                <Handshake className="h-6 w-6 text-slate-400" />
              </div>
              <p className="font-bold text-slate-700 text-sm">Nenhum empréstimo cadastrado</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                Ajuste os filtros de busca ou crie um novo termo de empréstimo para liberar componentes a terceiros.
              </p>
            </div>
          ) : (
            <>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-slate-400" id="loans-context-indicators">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                {filteredLoans.length} empréstimos
              </span>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400"></span>
                {filteredLoans.filter(l => l.status === 'Ativo' && l.estimatedReturnDate && l.estimatedReturnDate >= todayStr && l.estimatedReturnDate <= dueSoonStr).length} vencem em breve
              </span>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500"></span>
                {filteredLoans.filter(l => l.status === 'Ativo' && l.estimatedReturnDate && l.estimatedReturnDate < todayStr).length} atrasado
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredLoans.map(loan => {
                const isReturned = loan.status === 'Devolvido';
                
                return (
                  <div 
                    key={loan.id} 
                    className={`bg-white border rounded-2xl p-5 shadow-sm transition-all flex flex-col justify-between ${isReturned ? 'border-slate-100 bg-slate-50/50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    <div>
                      {/* Top status & Contract ID */}
                      <div className="flex items-center justify-between mb-4">
                        <span className="font-mono text-[10px] font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                          {loan.contractNumber}
                        </span>

                        <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${isReturned ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                          {isReturned ? <CheckCircle2 className="h-3 w-3 text-slate-400" /> : <Clock className="h-3 w-3 text-emerald-500 animate-pulse" />}
                          {loan.status}
                        </span>
                      </div>

                      {/* Third Party Details */}
                      <div className="mb-4">
                        <h3 className="font-bold text-slate-900 text-sm leading-tight mb-1">{loan.thirdPartyName}</h3>
                        <div className="flex flex-col gap-0.5 text-[11px] text-slate-500 font-medium">
                          <span className="flex items-center gap-1">
                            <Building className="h-3 w-3 text-slate-400 shrink-0" />
                            {loan.thirdPartyCompany}
                          </span>
                          <span>CPF/CNPJ: {loan.thirdPartyDocument}</span>
                        </div>
                      </div>

                      {/* Line Separator */}
                      <div className="border-t border-slate-100 my-3"></div>

                      {/* List of items */}
                      <div className="mb-4 space-y-2">
                        <p className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold">Componentes Emprestados ({loan.items.length})</p>
                        <div className="space-y-1.5 max-h-24 overflow-y-auto">
                          {loan.items.map((it, idx) => (
                            <div key={idx} className="flex items-start justify-between bg-slate-50 border border-slate-100/50 p-1.5 rounded-lg text-[11px]">
                              <span className="font-bold text-slate-800 truncate max-w-[140px]" title={it.componentName}>
                                {it.componentName}
                              </span>
                              <span className="font-mono text-slate-500 font-semibold text-[10px] select-all shrink-0">
                                S/N: {it.componentSerial}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Dates */}
                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-100 mb-4 font-medium">
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-bold">Retirada</span>
                          <span className="text-slate-700 font-bold flex items-center gap-1 mt-0.5">
                            <Calendar className="h-3.5 w-3.5 text-slate-400" />
                            {new Date(loan.loanDate).toLocaleDateString('pt-BR')}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[9px] uppercase font-bold">Restituição</span>
                          {isReturned && loan.actualReturnDate ? (
                            <span className="text-slate-500 font-semibold flex items-center gap-1 mt-0.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
                              {new Date(loan.actualReturnDate).toLocaleDateString('pt-BR')}
                            </span>
                          ) : (
                            <span className={`font-bold flex items-center gap-1 mt-0.5 ${loan.estimatedReturnDate ? 'text-amber-600' : 'text-slate-500'}`}>
                              <Clock className="h-3.5 w-3.5" />
                              {loan.estimatedReturnDate ? new Date(loan.estimatedReturnDate).toLocaleDateString('pt-BR') : 'Sem data'}
                            </span>
                          )}
                        </div>
                      </div>

                      {loan.notes && (
                        <p className="text-[11px] text-slate-500 italic bg-slate-50 p-2 rounded-lg border border-slate-100 border-dashed truncate mb-4" title={loan.notes}>
                          Obs: {loan.notes}
                        </p>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-2 border-t border-slate-100">
                      
                      {/* View contract */}
                      <button
                        onClick={() => setViewingContract(loan)}
                        className="flex-1 py-1.5 px-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 border border-indigo-100 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                        title="Ver Termo de Empréstimo"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        Ver Termo
                      </button>

                      {/* Devolução */}
                      {!isReturned ? (
                        <button
                          onClick={() => setLoanToReturn(loan)}
                          className="py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1"
                          title="Receber Equipamentos"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Receber
                        </button>
                      ) : (
                        <div className="text-[10px] text-slate-400 bg-slate-100 py-1.5 px-2.5 rounded-lg border border-slate-200 font-bold flex items-center gap-1">
                          Devolvido
                        </div>
                      )}

                      {/* Administrative actions */}
                      {(role === 'administrador' || role === 'ADMINISTRADOR') && (
                        <button
                          onClick={() => setLoanToDelete(loan)}
                          className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-transparent hover:border-rose-100 rounded-lg transition-all"
                          title="Excluir Registro de Empréstimo"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}

                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: THIRD PARTIES LIST & RECOVERY */}
      {/* ========================================================= */}
      {subTab === 'thirdparties' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" id="thirdparties-list-view">
          {filteredThirdParties.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-8 w-8 text-slate-300 mx-auto mb-3" />
              <p className="font-bold text-slate-700 text-sm">Nenhum terceiro localizado</p>
              <p className="text-xs text-slate-400 mt-1">
                Ajuste os filtros de busca ou crie um novo cadastro de terceiro prestador.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
                    <th className="py-3 px-4">Nome Completo</th>
                    <th className="py-3 px-4">Empresa / Fazenda</th>
                    <th className="py-3 px-4">CPF / CNPJ</th>
                    <th className="py-3 px-4">Contato Telefônico</th>
                    <th className="py-3 px-4">E-mail</th>
                    <th className="py-3 px-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                  {filteredThirdParties.map(tp => (
                    <tr key={tp.id} className="hover:bg-slate-50/35 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-slate-900 flex items-center gap-2">
                        <Users className="h-3.5 w-3.5 text-slate-400" />
                        {tp.name}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-600">
                        {tp.company}
                      </td>
                      <td className="py-3.5 px-4 font-mono font-bold text-slate-500">
                        {tp.document}
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                          {tp.phone || <span className="text-slate-300">Não informado</span>}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-600">
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-slate-400 shrink-0" />
                          {tp.email || <span className="text-slate-300">Não informado</span>}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => startEditThirdParty(tp)}
                            className="p-1.5 hover:bg-slate-50 border border-slate-100 hover:text-indigo-600 rounded-lg transition-colors text-slate-500"
                            title="Editar Dados do Terceiro"
                          >
                            Editar
                          </button>
                          {(role === 'administrador' || role === 'ADMINISTRADOR') && (
                            <button
                              onClick={() => setThirdPartyToDelete(tp)}
                              className="p-1.5 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors text-slate-400"
                              title="Excluir Terceiro"
                            >
                              Excluir
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: EQUIPMENT LOAN HISTORY */}
      {/* ========================================================= */}
      {subTab === 'history' && (
        <div className="space-y-6 animate-fade-in" id="history-loans-view">
          {/* Quick Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="h-10 w-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                <ArrowLeftRight className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Histórico de Envios</span>
                <span className="text-xl font-extrabold text-slate-900">{statsTotalCount}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">equipamentos emprestados no total</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="h-10 w-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Ativos em Campo</span>
                <span className="text-xl font-extrabold text-slate-900">{statsActiveCount}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">sob posse dos terceiros atualmente</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="h-10 w-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider block">Devoluções Concluídas</span>
                <span className="text-xl font-extrabold text-slate-900">{statsReturnedCount}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">retornados com sucesso ao estoque</span>
              </div>
            </div>
          </div>

          {/* Table of Entries */}
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            {filteredHistoryEntries.length === 0 ? (
              <div className="text-center py-12">
                <History className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                <p className="font-bold text-slate-700 text-sm">Nenhum registro localizado</p>
                <p className="text-xs text-slate-400 mt-1">
                  Ajuste os filtros de busca ou os filtros de categoria e status para encontrar registros.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[11px] font-extrabold uppercase tracking-wider">
                      <th className="py-3 px-4">Equipamento / Componente</th>
                      <th className="py-3 px-4">Responsável (Terceiro)</th>
                      <th className="py-3 px-4">Termo / Contrato</th>
                      <th className="py-3 px-4">Data de Empréstimo</th>
                      <th className="py-3 px-4">Retorno Efetivo / Estimado</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Observações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700 font-medium">
                    {filteredHistoryEntries.map((entry) => {
                      const isReturned = entry.status === 'Devolvido';
                      const isOverdue = !isReturned && entry.estimatedReturnDate && entry.estimatedReturnDate < new Date().toISOString().split('T')[0];

                      return (
                        <tr key={entry.id} className="hover:bg-slate-50/35 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-900">{entry.componentName}</span>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                  S/N: {entry.componentSerial}
                                </span>
                                <span className="text-[10px] text-slate-400 font-semibold">
                                  {entry.componentBrand} • {entry.componentType}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-800">{entry.thirdPartyName}</span>
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                {entry.thirdPartyCompany} {entry.thirdPartyDocument && `(${entry.thirdPartyDocument})`}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span 
                              onClick={() => {
                                // Find full loan object to let them preview/print the contract term if needed
                                const originalLoan = loans.find(l => l.id === entry.loanId);
                                if (originalLoan) setViewingContract(originalLoan);
                              }}
                              className="font-mono text-[10px] font-black text-indigo-600 hover:text-indigo-800 cursor-pointer hover:underline bg-indigo-50 px-2 py-1 rounded shadow-xs"
                              title="Clique para visualizar termo completo"
                            >
                              {entry.contractNumber}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-600">
                            {new Date(entry.loanDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </td>
                          <td className="py-3 px-4">
                            {isReturned ? (
                              <span className="text-emerald-700 font-bold flex flex-col">
                                <span>{entry.actualReturnDate ? new Date(entry.actualReturnDate + 'T12:00:00').toLocaleDateString('pt-BR') : 'Concluído'}</span>
                                <span className="text-[9px] text-emerald-500 font-medium font-mono uppercase">Devolvido</span>
                              </span>
                            ) : (
                              <span className={`flex flex-col ${isOverdue ? 'text-rose-600 font-extrabold' : 'text-slate-600 font-semibold'}`}>
                                <span>
                                  {entry.estimatedReturnDate 
                                    ? new Date(entry.estimatedReturnDate + 'T12:00:00').toLocaleDateString('pt-BR') 
                                    : 'Sem previsão'
                                  }
                                </span>
                                {isOverdue && (
                                  <span className="text-[9px] text-rose-500 font-extrabold uppercase animate-pulse">
                                    Vencido / Atrasado
                                  </span>
                                )}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${isReturned ? 'bg-slate-100 text-slate-500 border-slate-200' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                              {isReturned ? <CheckCircle2 className="h-3 w-3 text-slate-400" /> : <Clock className="h-3 w-3 text-amber-500 animate-pulse" />}
                              {isReturned ? 'Devolvido' : 'Em Campo'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            {entry.notes ? (
                              <button 
                                onClick={() => {
                                  showDialog({
                                    title: `Observações para o Termo ${entry.contractNumber}`,
                                    message: entry.notes,
                                    icon: 'info',
                                    okLabel: 'Fechar'
                                  });
                                }}
                                className="p-1 text-slate-400 hover:text-indigo-600 font-bold hover:bg-slate-50 rounded"
                                title="Ver Observações"
                              >
                                <FileText className="h-4 w-4 mx-auto" />
                              </button>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: REGISTER/EDIT THIRD PARTY */}
      {/* ========================================================= */}
      {(isAddingThirdParty || editingThirdParty) && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden border border-slate-100 animate-slide-up">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2">
                <Users className="h-4 w-4 text-emerald-400" />
                {editingThirdParty ? 'Editar Prestador Terceiro' : 'Cadastrar Prestador Terceiro'}
              </h2>
              <button 
                onClick={() => {
                  setIsAddingThirdParty(false);
                  setEditingThirdParty(null);
                  resetThirdPartyForm();
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={editingThirdParty ? handleUpdateThirdParty : handleCreateThirdParty} className="p-6 space-y-4">
              
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-xl">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] uppercase font-black text-slate-400">Nome do Prestador/Operador *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: João da Silva Santos"
                    value={tpName}
                    onChange={(e) => setTpName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-800"
                  />
                </div>

                {/* CPF/CNPJ */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-400">CPF ou CNPJ *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 000.000.000-00"
                    value={tpDocument}
                    onChange={(e) => setTpDocument(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-800"
                  />
                </div>

                {/* Company */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-400">Empresa / Fazenda Vinculada *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Cooperativa Agroeste"
                    value={tpCompany}
                    onChange={(e) => setTpCompany(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-800"
                  />
                </div>

                {/* Phone */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-400">Telefone de Contato</label>
                  <input
                    type="tel"
                    placeholder="Ex: (16) 99999-9999"
                    value={tpPhone}
                    onChange={(e) => setTpPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-800"
                  />
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-black text-slate-400">E-mail</label>
                  <input
                    type="email"
                    placeholder="Ex: joao@empresa.com"
                    value={tpEmail}
                    onChange={(e) => setTpEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-800"
                  />
                </div>
              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingThirdParty(false);
                    setEditingThirdParty(null);
                    resetThirdPartyForm();
                  }}
                  className="px-4 py-2 hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {loading ? 'Processando...' : editingThirdParty ? 'Salvar Alterações' : 'Cadastrar Terceiro'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CREATE LOAN (COMPREHENSIVE MULTI-ITEM SELECTOR) */}
      {/* ========================================================= */}
      {isCreatingLoan && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-xl overflow-hidden border border-slate-100 animate-slide-up flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <h2 className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2">
                <Handshake className="h-4 w-4 text-emerald-400" />
                Registrar Novo Empréstimo
              </h2>
              <button 
                onClick={() => {
                  setIsCreatingLoan(false);
                  resetLoanForm();
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Container */}
            <form onSubmit={handleSaveLoan} className="flex-1 overflow-y-auto p-6 space-y-5">
              
              {error && (
                <div className="p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold rounded-xl">
                  {error}
                </div>
              )}

              {/* 1. Select third party & Dates */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-slate-400" />
                  Passo 1: Destinatário e Prazos
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Select Third Party */}
                  <div className="space-y-1.5 md:col-span-1">
                    <label className="text-[10px] uppercase font-black text-slate-400">Prestador Terceiro *</label>
                    <select
                      required
                      value={selectedThirdPartyId}
                      onChange={(e) => setSelectedThirdPartyId(e.target.value)}
                      className="w-full bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-700"
                    >
                      <option value="">Selecione...</option>
                      {thirdParties.map(tp => (
                        <option key={tp.id} value={tp.id}>
                          {tp.name} ({tp.company})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Loan Date */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400">Data de Retirada *</label>
                    <input
                      type="date"
                      required
                      value={loanDate}
                      onChange={(e) => setLoanDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-800"
                    />
                  </div>

                  {/* Estimated Return Date */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400">Previsão de Devolução</label>
                    <input
                      type="date"
                      value={estimatedReturnDate}
                      onChange={(e) => setEstimatedReturnDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 px-3.5 py-2 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Select Components to add */}
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-4">
                <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-500 flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-slate-400" />
                  Passo 2: Adicionar Equipamentos do Estoque
                </h3>

                <div className="flex gap-2">
                  <div className="flex-1">
                    <select
                      value={tempSelectedComponentId}
                      onChange={(e) => setTempSelectedComponentId(e.target.value)}
                      className="w-full bg-white border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-700"
                    >
                      <option value="">Selecione um componente disponível...</option>
                      {availableComponents.map(c => (
                        <option key={c.id} value={c.id}>
                          [{c.brand}] {c.name} - (S/N: {c.serialNumber})
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={addComponentToLoanList}
                    className="px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shrink-0 transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-4 w-4 text-emerald-400" />
                    Adicionar
                  </button>
                </div>

                {/* List of currently added components */}
                <div className="space-y-2 mt-3">
                  <label className="text-[10px] uppercase font-black text-slate-400 block">Equipamentos no Lote ({loanedItems.length})</label>
                  {loanedItems.length === 0 ? (
                    <div className="p-4 bg-white rounded-xl border border-slate-200 border-dashed text-center text-xs text-slate-400 italic">
                      Nenhum item adicionado ao lote. Escolha um componente acima e clique em Adicionar.
                    </div>
                  ) : (
                    <div className="border border-slate-100 rounded-xl overflow-hidden bg-white max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {loanedItems.map((item, idx) => (
                        <div key={item.id} className="flex items-center justify-between p-3 text-xs hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <span className="font-bold text-slate-400 w-5">{(idx+1).toString().padStart(2, '0')}</span>
                            <div>
                              <p className="font-bold text-slate-800">{item.name}</p>
                              <p className="text-[10px] text-slate-500 font-medium">Marca: {item.brand} | Tipo: {item.type}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono bg-slate-100 font-extrabold text-[10px] px-2 py-0.5 rounded text-slate-600">
                              S/N: {item.serialNumber}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeComponentFromLoanList(item.id)}
                              className="p-1 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                              title="Remover do lote"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Notes */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-black text-slate-400">Observações do Empréstimo (Opcional)</label>
                <textarea
                  placeholder="Ex: Entrega realizada com maleta protetora e chicote de alimentação original."
                  value={loanNotes}
                  onChange={(e) => setLoanNotes(e.target.value)}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl text-xs focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-800 resize-none"
                />
              </div>

              {/* Footer Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingLoan(false);
                    resetLoanForm();
                  }}
                  className="px-4 py-2 hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                >
                  {loading ? 'Salvando...' : 'Confirmar e Salvar'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EMPRÉSTIMO PAPER PREVIEW */}
      {/* ========================================================= */}
      {viewingContract && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-100 rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden border border-slate-200 animate-slide-up flex flex-col my-8 max-h-[92vh]">
            
            {/* Upper Action Bar (Non-Printable) */}
            <div className="bg-slate-900 text-white px-6 py-3.5 flex items-center justify-between shrink-0 select-none">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-bold uppercase tracking-wider">Termo de Empréstimo • {viewingContract.contractNumber}</span>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                
                {/* Download PDF */}
                <button
                  onClick={() => handleDownloadPDF(viewingContract)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1"
                  title="Exportar Termo para PDF"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Baixar PDF</span>
                </button>

                {/* Share message */}
                <button
                  onClick={() => handleShareContract(viewingContract)}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-lg transition-colors border border-slate-700 flex items-center gap-1"
                  title="Copiar resumo do empréstimo para WhatsApp"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  <span>{shareSuccess ? 'Copiado!' : 'Compartilhar'}</span>
                </button>

                {/* Print natively */}
                <button
                  onClick={() => window.print()}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700"
                  title="Imprimir Termo"
                >
                  <Printer className="h-3.5 w-3.5" />
                </button>

                <div className="h-5 w-[1px] bg-slate-800 mx-1"></div>

                {/* Close */}
                <button 
                  onClick={() => setViewingContract(null)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Contract Sheet Preview Container (Highly Styled Sheet of Paper) */}
            <div className="flex-1 overflow-y-auto p-8 flex justify-center bg-slate-100">
              <div 
                className="bg-white border border-slate-300 shadow-md p-10 max-w-[210mm] w-full font-serif text-xs text-slate-800 space-y-6 leading-relaxed select-text tracking-wide"
                id="printable-comodato-document"
                style={{ minHeight: '297mm', position: 'relative' }}
              >
                
                {/* Contract Double Border Frame */}
                <div className="absolute inset-4 border border-slate-200/60 pointer-events-none"></div>

                {/* Contract Heading */}
                <div className="text-center space-y-2 select-none">
                  {companyProfile?.logoUrl && (
                    <div className="flex justify-center mb-3">
                      <img src={companyProfile.logoUrl} alt="Logo" className="max-h-12 object-contain" referrerPolicy="no-referrer" />
                    </div>
                  )}
                  <h1 className="text-sm font-bold tracking-widest text-slate-900 uppercase">
                    Termo de Retirada e Empréstimo de Equipamentos
                  </h1>
                  <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-widest">
                    Acompanhamento de Uso de Equipamentos de GPS Agrícola
                  </p>
                  <div className="h-[2px] w-24 bg-emerald-500 mx-auto mt-2"></div>
                </div>

                <div className="text-right text-[10px] font-mono text-slate-400 font-bold">
                  REGISTRO Nº {viewingContract.contractNumber}
                </div>

                {/* 1. Partes */}
                <div className="space-y-1">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wide">1. Partes Envolvidas</h3>
                  <p className="indent-8 text-justify">
                    <strong>CEDENTE:</strong> <strong>{(companyProfile?.name || 'AGRO STOCK GPS LOGÍSTICA S.A.').toUpperCase()}</strong>, com sede cadastrada em <strong>{companyProfile?.address || 'Av. das Nações Unidas, 1000 - São Paulo, SP'}</strong>, inscrita sob o CNPJ nº <strong>{companyProfile?.cnpj || '12.345.678/0001-90'}</strong>, doravante denominada simplesmente CEDENTE.
                  </p>
                  <p className="indent-8 text-justify mt-1.5">
                    <strong>RECEBEDOR(A):</strong> <strong>{viewingContract.thirdPartyName.toUpperCase()}</strong>, inscrito(a) sob o CPF/CNPJ nº <strong>{viewingContract.thirdPartyDocument}</strong>, devidamente qualificado(a) e vinculado(a) profissionalmente às atividades produtivas de agricultura e operações de campo da empresa/fazenda <strong>{viewingContract.thirdPartyCompany || 'Não cadastrada'}</strong>, doravante denominado simplesmente RECEBEDOR.
                  </p>
                </div>

                {/* 2. Objeto */}
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wide">2. Equipamentos e Especificações</h3>
                  <p className="indent-8 text-justify">
                    O presente documento acompanha a retirada temporária dos equipamentos de precisão listados abaixo, de propriedade da CEDENTE:
                  </p>

                  {/* Table */}
                  <div className="border border-slate-300 rounded-lg overflow-hidden my-3">
                    <table className="w-full text-left border-collapse text-[10px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-300 font-bold text-slate-900">
                          <th className="py-2 px-3 border-r border-slate-300">Item</th>
                          <th className="py-2 px-3 border-r border-slate-300">Equipamento Cedido</th>
                          <th className="py-2 px-3 border-r border-slate-300">Marca</th>
                          <th className="py-2 px-3">Número de Série (S/N)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-slate-700">
                        {viewingContract.items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/20">
                            <td className="py-2 px-3 border-r border-slate-200 text-slate-500 font-bold">{(idx + 1).toString().padStart(2, '0')}</td>
                            <td className="py-2 px-3 border-r border-slate-200 font-bold">{item.componentName} ({item.componentType})</td>
                            <td className="py-2 px-3 border-r border-slate-200 font-semibold">{item.componentBrand}</td>
                            <td className="py-2 px-3 font-mono font-bold text-slate-900 select-all">{item.componentSerial}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* 3. Clausulas */}
                <div className="space-y-1.5 text-justify">
                  <h3 className="font-bold text-slate-900 uppercase tracking-wide">3. Condições de Uso e Devolução</h3>
                  <p>
                    <strong>Item A:</strong> O(A) RECEBEDOR(A) confirma que recebeu os equipamentos descritos acima em perfeito estado de funcionamento físico e se compromete a zelar por sua guarda e conservação.
                  </p>
                  <p>
                    <strong>Item B:</strong> Os equipamentos devem ser utilizados exclusivamente para os serviços agendados, sendo vedado emprestar ou repassar os itens a terceiros sem autorização prévia por escrito da CEDENTE.
                  </p>
                  <p>
                    <strong>Item C:</strong> A retirada ocorreu no dia <strong>{new Date(viewingContract.loanDate).toLocaleDateString('pt-BR')}</strong>, com previsão de retorno para o dia <strong>{viewingContract.estimatedReturnDate ? new Date(viewingContract.estimatedReturnDate).toLocaleDateString('pt-BR') : 'Tempo Indeterminado'}</strong>.
                  </p>
                  <p>
                    <strong>Item D:</strong> Em caso de perdas, danos, quebras por mau uso ou roubo dos equipamentos, o(a) RECEBEDOR(A) se responsabiliza pela devida reparação ou reposição pelo valor correspondente de mercado.
                  </p>
                </div>

                {/* Date */}
                <p className="italic text-right pt-4 text-[11px] font-sans font-medium text-slate-600">
                  Campo Verde - MT, {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}.
                </p>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-8 pt-10 select-none font-sans text-[10px]">
                  
                  {/* Comodante signature area */}
                  <div className="text-center space-y-1 flex flex-col items-center">
                    <div className="w-56 border-t border-slate-400 mt-6 pt-1.5 font-bold text-slate-900 uppercase tracking-wide truncate">
                      {companyProfile?.tradingName || companyProfile?.name || 'AGRO STOCK GPS LOGÍSTICA'}
                    </div>
                    <span className="text-slate-500 block text-[9px]">CEDENTE (Representante)</span>
                    <span className="text-[9px] text-slate-400 block">Responsável: {currentUserName}</span>
                  </div>

                  {/* Comodatário signature area */}
                  <div className="text-center space-y-1 flex flex-col items-center">
                    <div className="w-56 border-t border-slate-400 mt-6 pt-1.5 font-bold text-slate-900 uppercase tracking-wide">
                      {viewingContract.thirdPartyName.toUpperCase()}
                    </div>
                    <span className="text-slate-500 block text-[9px]">RECEBEDOR</span>
                    <span className="text-[9px] text-slate-400 block">CPF/CNPJ: {viewingContract.thirdPartyDocument}</span>
                  </div>

                </div>

              </div>
            </div>

            {/* Bottom Footer (Helpful tip) */}
            <div className="bg-white border-t border-slate-200 px-6 py-3 text-center text-[10px] text-slate-400 shrink-0">
              * Para assinar digitalmente ou fisicamente, faça o download do arquivo PDF acima ou envie diretamente via canais de compartilhamento.
            </div>

          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: EMAIL ALERTS FOR OVERDUE LOANS */}
      {/* ========================================================= */}
      {isAlertModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl w-full max-w-xl shadow-xl overflow-hidden border border-slate-100 animate-slide-up flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
              <h2 className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2">
                <Mail className="h-4 w-4 text-emerald-400" />
                Alertas por E-mail (Empréstimos Vencidos)
              </h2>
              <button 
                onClick={() => {
                  setIsAlertModalOpen(false);
                  setAlertSuccess(null);
                }}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Container */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              
              {alertSuccess ? (
                <div className="p-4 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl space-y-2">
                  <p className="font-bold text-xs flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Sucesso! Alerta Disparado
                  </p>
                  <p className="text-[11px] leading-relaxed text-slate-700">
                    {alertSuccess}
                  </p>
                  <button
                    onClick={() => {
                      setIsAlertModalOpen(false);
                      setAlertSuccess(null);
                    }}
                    className="mt-2 w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all"
                  >
                    Fechar Janela
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSendLoanEmailAlerts} className="space-y-4">
                  {/* Warning / Explanation banner */}
                  <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold rounded-xl leading-relaxed">
                    ⚙️ <strong>Como funciona?</strong> O sistema irá compilar todos os empréstimos ativos cuja data de previsão de retorno estimada já expirou e enviar um relatório detalhado contendo marcas, números de série e terceiros responsáveis para o e-mail informado.
                  </div>

                  {/* Recipient Email Input */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase font-black text-slate-400">E-mail de Destino para o Alerta *</label>
                    <input
                      type="email"
                      required
                      placeholder="Ex: gestor@agrostockgps.com"
                      value={alertEmail}
                      onChange={(e) => setAlertEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 px-3.5 py-2.5 rounded-xl text-xs focus:bg-white focus:ring-1 focus:ring-emerald-500 outline-none font-semibold text-slate-800"
                    />
                  </div>

                  {/* List of overdue items to be included */}
                  <div className="space-y-2">
                    <h3 className="text-[10px] uppercase font-black text-slate-400">
                      Empréstimos Vencidos Identificados ({overdueLoans.length})
                    </h3>

                    {overdueLoans.length === 0 ? (
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-center">
                        <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                        <p className="text-xs font-bold text-slate-700">Excelente! Nenhum empréstimo está vencido.</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">Todos os equipamentos estão dentro do prazo de devolução estimado.</p>
                      </div>
                    ) : (
                      <div className="border border-slate-100 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-extrabold uppercase text-slate-400">
                              <th className="py-2 px-3">Termo / Responsável</th>
                              <th className="py-2 px-3">Empresa</th>
                              <th className="py-2 px-3">Previsão</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-[11px] font-medium text-slate-700">
                            {overdueLoans.map(loan => (
                              <tr key={loan.id} className="hover:bg-slate-50/50">
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-slate-900">{loan.contractNumber}</div>
                                  <div className="text-slate-500 text-[10px]">{loan.thirdPartyName}</div>
                                </td>
                                <td className="py-2.5 px-3 text-slate-500">{loan.thirdPartyCompany}</td>
                                <td className="py-2.5 px-3 font-bold text-rose-600">
                                  {loan.estimatedReturnDate ? new Date(loan.estimatedReturnDate).toLocaleDateString('pt-BR') : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Modal Actions */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setIsAlertModalOpen(false);
                        setAlertSuccess(null);
                      }}
                      className="px-4 py-2 hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={sendingAlert || overdueLoans.length === 0}
                      className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {sendingAlert ? 'Disparando...' : 'Enviar Alertas por E-mail'}
                    </button>
                  </div>
                </form>
              )}

            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal for Devolução (Receber) */}
      {loanToReturn && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" id="loan-return-confirm-modal">
          <div className="bg-white rounded-3xl border border-emerald-100 shadow-2xl max-w-md w-full overflow-hidden transform transition-all scale-100">
            <div className={`${isPartialMode ? 'bg-amber-50/50 border-b border-slate-100' : 'bg-emerald-50/50 border-b border-slate-100'} p-6 flex items-start gap-4`}>
              <div className={`h-10 w-10 ${isPartialMode ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'} rounded-full flex items-center justify-center shrink-0`}>
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {isPartialMode ? 'Devolução Parcial de Itens' : 'Confirmar Recebimento'}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {isPartialMode 
                    ? 'Selecione quais componentes estão sendo devolvidos agora. Os não selecionados continuarão sob posse do terceiro.'
                    : 'Você está confirmando a devolução total dos itens associados a este empréstimo.'
                  }
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-2">
                <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Detalhes do Termo</div>
                <div className="text-xs text-slate-700 font-bold">Registro: {loanToReturn.contractNumber}</div>
                <div className="text-xs text-slate-700">Responsável: <strong>{loanToReturn.thirdPartyName}</strong></div>
                <div className="text-xs text-slate-700">Empresa: <strong>{loanToReturn.thirdPartyCompany}</strong></div>
              </div>

              {isPartialMode ? (
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[11px] text-slate-400 font-bold uppercase tracking-wider">
                    <span>Selecionar Itens Devolvidos</span>
                    <span className="text-amber-600 font-mono text-[10px]">
                      {Object.keys(selectedPartialItemIds).filter(k => selectedPartialItemIds[k]).length} de {loanToReturn.items.length} selecionados
                    </span>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {loanToReturn.items.map((it, idx) => {
                      const isSelected = !!selectedPartialItemIds[it.componentId];
                      return (
                        <div 
                          key={idx} 
                          onClick={() => {
                            setSelectedPartialItemIds(prev => ({
                              ...prev,
                              [it.componentId]: !prev[it.componentId]
                            }));
                          }}
                          className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                            isSelected 
                              ? 'bg-emerald-50/60 border-emerald-300 shadow-sm' 
                              : 'bg-white border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}} // Handled by outer click
                              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 h-4 w-4 shrink-0 pointer-events-none"
                            />
                            <div className="text-left">
                              <div className="font-semibold text-slate-800 text-xs">{it.componentName}</div>
                              <div className="font-mono text-slate-500 text-[10px]">S/N: {it.componentSerial}</div>
                            </div>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isSelected ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {isSelected ? 'Devolver' : 'Manter Em uso'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-[11px] text-slate-400 font-bold uppercase tracking-wider">Itens Retornando ao Estoque ({loanToReturn.items.length})</div>
                  <div className="space-y-1.5 max-h-32 overflow-y-auto">
                    {loanToReturn.items.map((it, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-white p-2 rounded-xl border border-slate-100 text-xs">
                        <span className="font-semibold text-slate-800">{it.componentName}</span>
                        <span className="font-mono text-slate-500 text-[10px]">S/N: {it.componentSerial}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="text-[11px] text-amber-600 font-medium">
                * Os componentes devolvidos voltarão automaticamente ao estado <strong>"Disponível"</strong> no estoque geral de hardware GPS.
              </p>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex flex-wrap justify-between items-center gap-3 border-t border-slate-100">
              {isPartialMode ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setIsPartialMode(false);
                      setSelectedPartialItemIds({});
                    }}
                    className="px-4 py-2 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                  >
                    Voltar p/ Devolução Total
                  </button>
                  <button
                    type="button"
                    disabled={Object.keys(selectedPartialItemIds).filter(k => selectedPartialItemIds[k]).length === 0}
                    onClick={() => handleConfirmPartialReturnLoan(loanToReturn.id)}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-55 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                    id="confirm-partial-return-btn"
                  >
                    Confirmar Devolução Parcial
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setLoanToReturn(null);
                      setIsPartialMode(false);
                      setSelectedPartialItemIds({});
                    }}
                    className="px-4 py-2 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                    id="cancel-return-btn"
                  >
                    Voltar / Cancelar
                  </button>
                  <div className="flex gap-2">
                    {loanToReturn.items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsPartialMode(true);
                          setSelectedPartialItemIds({});
                        }}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all border border-slate-200"
                        id="partial-return-trigger-btn"
                      >
                        Devolver parcial
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleConfirmReturnLoan(loanToReturn.id)}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                      id="confirm-return-btn"
                    >
                      Sim, Confirmar Devolução
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal for Loan Deletion */}
      {loanToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" id="loan-delete-confirm-modal">
          <div className="bg-white rounded-3xl border border-rose-100 shadow-2xl max-w-md w-full overflow-hidden transform transition-all scale-100">
            <div className="bg-rose-50/50 p-6 border-b border-slate-100 flex items-start gap-4">
              <div className="h-10 w-10 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Excluir Registro de Empréstimo</h3>
                <p className="text-xs text-slate-500 mt-1">
                  A exclusão definitiva deste registro de empréstimo não altera o estado atual dos equipamentos.
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1 text-xs">
                <div>Termo: <strong>{loanToDelete.contractNumber}</strong></div>
                <div>Terceiro: <strong>{loanToDelete.thirdPartyName}</strong></div>
                <div>Status Atual: <span className="font-bold text-amber-600">{loanToDelete.status}</span></div>
              </div>
              <p className="text-[11px] text-rose-600 font-semibold leading-relaxed">
                Aviso: Esta ação é irreversível e removerá permanentemente o termo {loanToDelete.contractNumber} do livro de auditoria e relatórios.
              </p>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setLoanToDelete(null)}
                className="px-4 py-2 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                id="cancel-delete-loan-btn"
              >
                Voltar / Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleConfirmDeleteLoan(loanToDelete.id)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                id="confirm-delete-loan-btn"
              >
                Sim, Excluir Registro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal for Third Party Deletion */}
      {thirdPartyToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" id="thirdparty-delete-confirm-modal">
          <div className="bg-white rounded-3xl border border-rose-100 shadow-2xl max-w-md w-full overflow-hidden transform transition-all scale-100">
            <div className="bg-rose-50/50 p-6 border-b border-slate-100 flex items-start gap-4">
              <div className="h-10 w-10 bg-rose-100 text-rose-700 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Excluir Cadastro de Terceiro</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Excluir permanentemente o prestador terceiro e seu histórico de contato.
                </p>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1 text-xs">
                <div>Nome: <strong>{thirdPartyToDelete.name}</strong></div>
                <div>Documento: <strong>{thirdPartyToDelete.document}</strong></div>
                {thirdPartyToDelete.company && <div>Empresa: <strong>{thirdPartyToDelete.company}</strong></div>}
              </div>
              <p className="text-[11px] text-slate-500 italic">
                Nota: Esta exclusão não afetará termos de empréstimo anteriores já fechados ou em aberto com este prestador.
              </p>
            </div>

            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setThirdPartyToDelete(null)}
                className="px-4 py-2 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-xs rounded-xl transition-all"
                id="cancel-delete-tp-btn"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await onDeleteThirdParty(thirdPartyToDelete.id);
                    setThirdPartyToDelete(null);
                  } catch (err: any) {
                    showToast('error', err.message || 'Erro ao deletar terceiro.');
                  }
                }}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                id="confirm-delete-tp-btn"
              >
                Sim, Excluir Cadastro
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
