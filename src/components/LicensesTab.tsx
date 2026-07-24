import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { 
  License, 
  LicenseBrand, 
  LicenseType, 
  LicenseStatus, 
  AutopilotComponent,
  UserRole,
  UserProfile,
  LicenseSettings
} from '../types';
import { 
  Plus, 
  Search, 
  Filter, 
  Trash2, 
  Edit2, 
  Check, 
  X, 
  Key, 
  Calendar, 
  AlertTriangle, 
  CheckCircle2, 
  Monitor, 
  Cpu, 
  Clock, 
  Info,
  Tag,
  Sparkles,
  Upload,
  RefreshCw,
  FileText,
  QrCode,
  LayoutGrid,
  List,
  Mail,
  Bell
} from 'lucide-react';

const LOCAL_STORAGE_KEY_PREFIX = 'agro_stock_gps_';

interface LicensesTabProps {
  licenses: License[];
  components: AutopilotComponent[];
  role: UserRole;
  currentUser?: UserProfile | null;
  isDemoMode: boolean;
  onAddLicense: (lic: Omit<License, 'id' | 'updatedAt' | 'updatedBy'>) => Promise<void>;
  onEditLicense: (id: string, updates: Partial<License>) => Promise<void>;
  onDeleteLicense: (id: string) => Promise<void>;
}

export default function LicensesTab({
  licenses,
  components,
  role,
  currentUser,
  isDemoMode,
  onAddLicense,
  onEditLicense,
  onDeleteLicense
}: LicensesTabProps) {
  const isAdminOrTech = role === 'administrador' || role === 'tecnico' || role === 'ADMINISTRADOR' || role === 'TECNICO_CAMPO';

  const [searchTerm, setSearchTerm] = useState('');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  // Expiration alerting & filtering states
  const [expirationRangeFilter, setExpirationRangeFilter] = useState<string>('all');
  const [alertSettings, setAlertSettings] = useState<LicenseSettings | null>(null);
  const [alertEmailInput, setAlertEmailInput] = useState('');
  const [isAlertSettingsOpen, setIsAlertSettingsOpen] = useState(false);
  const [isSavingAlertSettings, setIsSavingAlertSettings] = useState(false);
  const [isSendingAlertManual, setIsSendingAlertManual] = useState(false);
  const [alertSuccessToast, setAlertSuccessToast] = useState<string | null>(null);

  // Load and subscribe alert settings
  useEffect(() => {
    if (isDemoMode) {
      const saved = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}license_alerts`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setAlertSettings(parsed);
        setAlertEmailInput(parsed.alertEmail || '');
      } else {
        const defaultAlert = {
          alertEmail: '',
          lastSent60: '',
          lastSent30: '',
          lastSent15: '',
          updatedAt: new Date().toISOString(),
          updatedBy: 'Sistema'
        };
        setAlertSettings(defaultAlert);
        setAlertEmailInput('');
      }
    } else {
      const unsub = onSnapshot(
        doc(db, 'settings', 'licenses'),
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            const loaded: LicenseSettings = {
              alertEmail: data.alertEmail || '',
              lastSent60: data.lastSent60 || '',
              lastSent30: data.lastSent30 || '',
              lastSent15: data.lastSent15 || '',
              updatedAt: data.updatedAt || '',
              updatedBy: data.updatedBy || ''
            };
            setAlertSettings(loaded);
            setAlertEmailInput(loaded.alertEmail);
          } else {
            const defaultAlert = {
              alertEmail: '',
              lastSent60: '',
              lastSent30: '',
              lastSent15: '',
              updatedAt: '',
              updatedBy: ''
            };
            setAlertSettings(defaultAlert);
            setAlertEmailInput('');
          }
        },
        (err) => {
          console.error("Erro ao carregar configurações de alerta:", err);
        }
      );
      return () => unsub();
    }
  }, [isDemoMode]);

  // Helper to filter expiring licenses in next N days
  const getLicensesExpiringInDays = (days: number): License[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return licenses.filter(lic => {
      if (!lic.expirationDate) return false;
      const expDate = new Date(lic.expirationDate);
      const diffTime = expDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return diffDays >= 0 && diffDays <= days;
    });
  };

  // Helper to trigger API request to send email alert
  const sendExpirationEmail = async (days: number, expiringLics: License[]) => {
    if (!alertSettings?.alertEmail) return { success: false, message: 'Nenhum e-mail de alerta cadastrado' };

    try {
      const payload = {
        alertEmail: alertSettings.alertEmail,
        days,
        licenses: expiringLics.map(l => ({
          name: l.name,
          brand: l.brand,
          code: l.code,
          expirationDate: l.expirationDate,
          deviceSerialNumber: l.deviceSerialNumber || l.associatedComponentSerial || '',
          associatedMachinePrefix: l.associatedMachinePrefix || ''
        }))
      };

      const res = await fetch('/api/licenses/send-alert-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha no envio de e-mail pela API');
      }
      return { success: true, message: data.message, simulated: data.simulated };
    } catch (err: any) {
      console.error(`Erro ao enviar alerta de ${days} dias:`, err);
      return { success: false, message: err.message || 'Erro de conexão' };
    }
  };

  // Automatic Expiration Alert Check Effect
  useEffect(() => {
    if (!licenses || licenses.length === 0 || !alertSettings || !alertSettings.alertEmail) return;

    const runAutoAlertCheck = async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const updates: Partial<LicenseSettings> = {};
      let hasUpdates = false;

      // Check 15 days threshold
      if (alertSettings.lastSent15 !== todayStr) {
        const expiring15 = getLicensesExpiringInDays(15);
        if (expiring15.length > 0) {
          console.log(`[AutoAlert] Disparando e-mail de alerta de 15 dias para: ${alertSettings.alertEmail}`);
          const res = await sendExpirationEmail(15, expiring15);
          if (res.success) {
            updates.lastSent15 = todayStr;
            hasUpdates = true;
          }
        }
      }

      // Check 30 days threshold
      if (alertSettings.lastSent30 !== todayStr) {
        const expiring30 = getLicensesExpiringInDays(30);
        if (expiring30.length > 0) {
          console.log(`[AutoAlert] Disparando e-mail de alerta de 30 dias para: ${alertSettings.alertEmail}`);
          const res = await sendExpirationEmail(30, expiring30);
          if (res.success) {
            updates.lastSent30 = todayStr;
            hasUpdates = true;
          }
        }
      }

      // Check 60 days threshold
      if (alertSettings.lastSent60 !== todayStr) {
        const expiring60 = getLicensesExpiringInDays(60);
        if (expiring60.length > 0) {
          console.log(`[AutoAlert] Disparando e-mail de alerta de 60 dias para: ${alertSettings.alertEmail}`);
          const res = await sendExpirationEmail(60, expiring60);
          if (res.success) {
            updates.lastSent60 = todayStr;
            hasUpdates = true;
          }
        }
      }

      if (hasUpdates) {
        const timestampStr = new Date().toISOString();
        const updatedByStr = currentUser?.name || currentUser?.email || 'Sistema';

        const newSettings: LicenseSettings = {
          ...alertSettings,
          ...updates,
          updatedAt: timestampStr,
          updatedBy: updatedByStr
        };

        if (isDemoMode) {
          setAlertSettings(newSettings);
          localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}license_alerts`, JSON.stringify(newSettings));
        } else {
          try {
            const docRef = doc(db, 'settings', 'licenses');
            await setDoc(docRef, {
              ...newSettings,
              updatedAt: serverTimestamp()
            }, { merge: true });
          } catch (err) {
            console.error("Erro ao salvar logs de alerta no Firestore:", err);
          }
        }
      }
    };

    const timer = setTimeout(() => {
      runAutoAlertCheck();
    }, 4000);

    return () => clearTimeout(timer);
  }, [licenses, alertSettings, isDemoMode, currentUser]);

  // Save email alert settings
  const handleSaveAlertSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminOrTech) {
      alert('Apenas administradores ou técnicos podem alterar as configurações de alerta.');
      return;
    }

    setIsSavingAlertSettings(true);
    const timestampStr = new Date().toISOString();
    const updatedByStr = currentUser?.name || currentUser?.email || 'Sistema';

    const newSettings: LicenseSettings = {
      alertEmail: alertEmailInput.trim(),
      lastSent60: alertSettings?.lastSent60 || '',
      lastSent30: alertSettings?.lastSent30 || '',
      lastSent15: alertSettings?.lastSent15 || '',
      updatedAt: timestampStr,
      updatedBy: updatedByStr
    };

    try {
      if (isDemoMode) {
        setAlertSettings(newSettings);
        localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}license_alerts`, JSON.stringify(newSettings));
      } else {
        const docRef = doc(db, 'settings', 'licenses');
        await setDoc(docRef, {
          ...newSettings,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      setAlertSuccessToast('E-mail de alertas salvo e registrado com sucesso!');
      setTimeout(() => setAlertSuccessToast(null), 4000);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar as configurações de alerta: ' + err.message);
    } finally {
      setIsSavingAlertSettings(false);
    }
  };

  // Trigger manual simulation checks
  const handleTriggerManualAlerts = async () => {
    if (!alertEmailInput) {
      alert('Por favor, cadastre um e-mail de destino primeiro.');
      return;
    }
    setIsSendingAlertManual(true);
    setAlertSuccessToast(null);

    try {
      const expiring15 = getLicensesExpiringInDays(15);
      const expiring30 = getLicensesExpiringInDays(30);
      const expiring60 = getLicensesExpiringInDays(60);

      let totalSent = 0;
      let lastMessage = '';
      let isSimulated = false;

      if (expiring15.length > 0) {
        const res = await sendExpirationEmail(15, expiring15);
        if (res.success) {
          totalSent += expiring15.length;
          lastMessage = res.message || '';
          isSimulated = !!res.simulated;
        } else {
          throw new Error(`Erro enviando alerta de 15 dias: ${res.message}`);
        }
      }
      if (expiring30.length > 0) {
        const res = await sendExpirationEmail(30, expiring30);
        if (res.success) {
          totalSent += expiring30.length;
          lastMessage = res.message || '';
          isSimulated = !!res.simulated;
        } else {
          throw new Error(`Erro enviando alerta de 30 dias: ${res.message}`);
        }
      }
      if (expiring60.length > 0) {
        const res = await sendExpirationEmail(60, expiring60);
        if (res.success) {
          totalSent += expiring60.length;
          lastMessage = res.message || '';
          isSimulated = !!res.simulated;
        } else {
          throw new Error(`Erro enviando alerta de 60 dias: ${res.message}`);
        }
      }

      if (totalSent > 0) {
        if (isSimulated) {
          setAlertSuccessToast(lastMessage);
        } else {
          setAlertSuccessToast(`Varredura concluída! ${lastMessage} (Total de ${totalSent} licenças com vencimento iminente notificadas com sucesso contendo seus respectivos Números de Série).`);
        }
      } else {
        setAlertSuccessToast('Varredura manual concluída. Nenhuma licença de sinal/software está vencendo nos próximos 15, 30 ou 60 dias. Nenhum alerta foi enviado.');
      }
      setTimeout(() => setAlertSuccessToast(null), 12000);
    } catch (err: any) {
      alert('Erro ao rodar varredura de alertas: ' + err.message);
    } finally {
      setIsSendingAlertManual(false);
    }
  };

  const [isAdding, setIsAdding] = useState(false);
  const [editingLic, setEditingLic] = useState<License | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [brand, setBrand] = useState<LicenseBrand>('Trimble');
  const [type, setType] = useState<LicenseType>('Assinatura de Sinal');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<LicenseStatus>('Ativa');
  const [associatedComponentSerial, setAssociatedComponentSerial] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [isPerpetual, setIsPerpetual] = useState(false);

  // Extra fields supporting OCR
  const [startDate, setStartDate] = useState('');
  const [deviceSerialNumber, setDeviceSerialNumber] = useState('');
  const [deviceModel, setDeviceModel] = useState('');
  const [masterUnlockKey, setMasterUnlockKey] = useState('');

  // OCR process states
  const [ocrImagePreview, setOcrImagePreview] = useState<string | null>(null);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrProgressStep, setOcrProgressStep] = useState('');
  const [ocrSuccessMessage, setOcrSuccessMessage] = useState<string | null>(null);

  // Field display state
  const [qrModalLicense, setQrModalLicense] = useState<License | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setBrand('Trimble');
    setType('Assinatura de Sinal');
    setCode('');
    setStatus('Ativa');
    setAssociatedComponentSerial('');
    setExpirationDate('');
    setIsPerpetual(false);
    setError(null);
    setStartDate('');
    setDeviceSerialNumber('');
    setDeviceModel('');
    setMasterUnlockKey('');
    setOcrImagePreview(null);
    setOcrSuccessMessage(null);
  };

  // OCR processing logic
  const handleOcrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processSelectedFile(file);
  };

  const processSelectedFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Por favor, selecione um arquivo de imagem válido (PNG, JPG, JPEG).');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64Url = reader.result as string;
      setOcrImagePreview(base64Url);
      setError(null);
    };
    reader.onerror = () => {
      setError('Erro ao ler o arquivo de imagem.');
    };
    reader.readAsDataURL(file);
  };

  const handleOcrProcess = async () => {
    if (!ocrImagePreview) {
      setError('Por favor, selecione uma imagem de licença primeiro.');
      return;
    }

    setIsOcrLoading(true);
    setOcrProgressStep('Iniciando processamento da imagem...');
    setError(null);
    setOcrSuccessMessage(null);

    try {
      const commaIndex = ocrImagePreview.indexOf(',');
      const mimeType = ocrImagePreview.substring(5, ocrImagePreview.indexOf(';'));
      const imageBase64 = ocrImagePreview.substring(commaIndex + 1);

      const steps = [
        'Lendo arquivo de imagem...',
        'Conectando com o servidor de IA...',
        'Executando OCR inteligente via Gemini 3.5...',
        'Extraindo serviço de assinatura Trimble/Topcon...',
        'Mapeando datas de vigência e números de série...',
        'Preenchendo formulário...',
      ];

      let stepIdx = 0;
      const progressInterval = setInterval(() => {
        if (stepIdx < steps.length - 1) {
          stepIdx++;
          setOcrProgressStep(steps[stepIdx]);
        }
      }, 700);

      const response = await fetch('/api/licenses/parse-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ imageBase64, mimeType }),
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Falha na resposta do servidor.');
      }

      const result = await response.json();

      if (result.subscriptionService) setName(result.subscriptionService);
      
      if (result.brand === 'Trimble' || result.brand === 'Topcon') {
        setBrand(result.brand);
      } else {
        const lowerName = (result.subscriptionService || '').toLowerCase();
        if (lowerName.includes('trimble') || (result.permissionCode || '').toLowerCase().includes('trimble')) {
          setBrand('Trimble');
        } else if (lowerName.includes('topcon')) {
          setBrand('Topcon');
        }
      }

      if (result.permissionCode) setCode(result.permissionCode);
      if (result.startDate) setStartDate(result.startDate);
      
      if (result.expirationDate) {
        setExpirationDate(result.expirationDate);
        setIsPerpetual(false);
        const expDate = new Date(result.expirationDate);
        const today = new Date();
        if (expDate < today) {
          setStatus('Expirada');
        } else {
          setStatus('Ativa');
        }
      } else {
        setIsPerpetual(true);
        setStatus('Ativa');
      }

      if (result.serialNumber) setDeviceSerialNumber(result.serialNumber);
      if (result.model) setDeviceModel(result.model);
      if (result.masterUnlockKey) setMasterUnlockKey(result.masterUnlockKey);

      setOcrSuccessMessage(`Processamento concluído com sucesso!
✓ Serviço: ${result.subscriptionService}
✓ Código: ${result.permissionCode}
✓ Master Unlock Key: ${result.masterUnlockKey || 'N/A'}`);
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Falha ao analisar a imagem da licença. Verifique se o documento está legível e tente novamente.');
    } finally {
      setIsOcrLoading(false);
      setOcrProgressStep('');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdminOrTech) {
      setError('Apenas administradores ou técnicos podem cadastrar licenças.');
      return;
    }
    if (!name || !code) {
      setError('Por favor, insira o nome da licença e a chave de ativação.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Find associated machine from component, if component is selected
      let associatedMachinePrefix = '';
      if (associatedComponentSerial) {
        const foundComp = components.find(c => c.serialNumber === associatedComponentSerial);
        if (foundComp) {
          associatedMachinePrefix = foundComp.currentMachine || '';
        }
      }

      await onAddLicense({
        name: name.trim(),
        brand,
        type,
        code: code.trim(),
        status,
        associatedComponentSerial: associatedComponentSerial || '',
        associatedMachinePrefix: associatedMachinePrefix || '',
        expirationDate: isPerpetual ? '' : expirationDate,
        startDate: startDate || '',
        deviceSerialNumber: deviceSerialNumber || '',
        deviceModel: deviceModel || '',
        masterUnlockKey: masterUnlockKey || '',
        unlockStatus: 'pendente'
      });
      setIsAdding(false);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao cadastrar licença.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLic) return;
    if (!isAdminOrTech) {
      setError('Apenas administradores ou técnicos podem modificar licenças.');
      return;
    }
    if (!name || !code) {
      setError('Por favor, preencha os campos obrigatórios.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Find associated machine from component, if component is selected
      let associatedMachinePrefix = '';
      if (associatedComponentSerial) {
        const foundComp = components.find(c => c.serialNumber === associatedComponentSerial);
        if (foundComp) {
          associatedMachinePrefix = foundComp.currentMachine || '';
        }
      }

      await onEditLicense(editingLic.id, {
        name: name.trim(),
        brand,
        type,
        code: code.trim(),
        status,
        associatedComponentSerial: associatedComponentSerial || '',
        associatedMachinePrefix: associatedMachinePrefix || '',
        expirationDate: isPerpetual ? '' : expirationDate,
        startDate: startDate || '',
        deviceSerialNumber: deviceSerialNumber || '',
        deviceModel: deviceModel || '',
        masterUnlockKey: masterUnlockKey || ''
      });
      setEditingLic(null);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao editar licença.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmUnlock = async (licId: string) => {
    try {
      const nowStr = new Date().toISOString();
      const byStr = currentUser?.name || currentUser?.email || 'Sistema';
      
      await onEditLicense(licId, {
        unlockStatus: 'desbloqueado',
        unlockedAt: nowStr,
        unlockedBy: byStr
      });
      
      // Update local state for the modal to reflect the change immediately
      setQrModalLicense(prev => prev ? {
        ...prev,
        unlockStatus: 'desbloqueado',
        unlockedAt: nowStr,
        unlockedBy: byStr
      } : null);
      
    } catch (err: any) {
      alert('Erro ao confirmar desbloqueio: ' + err.message);
    }
  };

  const handleResetUnlock = async (licId: string) => {
    try {
      await onEditLicense(licId, {
        unlockStatus: 'pendente',
        unlockedAt: '',
        unlockedBy: ''
      });
      
      setQrModalLicense(prev => prev ? {
        ...prev,
        unlockStatus: 'pendente',
        unlockedAt: '',
        unlockedBy: ''
      } : null);
      
    } catch (err: any) {
      alert('Erro ao redefinir status de desbloqueio: ' + err.message);
    }
  };

  const startEdit = (lic: License) => {
    setEditingLic(lic);
    setName(lic.name);
    setBrand(lic.brand);
    setType(lic.type);
    setCode(lic.code);
    setStatus(lic.status);
    setAssociatedComponentSerial(lic.associatedComponentSerial || '');
    setExpirationDate(lic.expirationDate || '');
    setIsPerpetual(!lic.expirationDate);
    setStartDate(lic.startDate || '');
    setDeviceSerialNumber(lic.deviceSerialNumber || '');
    setDeviceModel(lic.deviceModel || '');
    setMasterUnlockKey(lic.masterUnlockKey || '');
    setOcrImagePreview(null);
    setOcrSuccessMessage(null);
    setIsAdding(false);
    setError(null);
  };

  const handleDelete = async (id: string) => {
    if (!isAdminOrTech) {
      alert('Apenas administradores ou técnicos podem remover licenças.');
      return;
    }
    if (confirm('Tem certeza de que deseja remover esta licença de sinal/software permanentemente?')) {
      try {
        await onDeleteLicense(id);
      } catch (err) {
        console.error(err);
        alert('Erro ao excluir licença.');
      }
    }
  };

  // Filtered Licenses
  const filteredLicenses = licenses.filter(lic => {
    const matchesSearch = 
      lic.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lic.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lic.associatedComponentSerial && lic.associatedComponentSerial.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lic.associatedMachinePrefix && lic.associatedMachinePrefix.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lic.deviceSerialNumber && lic.deviceSerialNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lic.deviceModel && lic.deviceModel.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lic.masterUnlockKey && lic.masterUnlockKey.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesBrand = brandFilter === 'all' || lic.brand === brandFilter;
    const matchesStatus = statusFilter === 'all' || lic.status === statusFilter;
    const matchesType = typeFilter === 'all' || lic.type === typeFilter;

    // Expiration range filter
    let matchesExpirationRange = true;
    if (expirationRangeFilter !== 'all') {
      if (lic.expirationDate) {
        const expDate = new Date(lic.expirationDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const diffTime = expDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const limitDays = parseInt(expirationRangeFilter, 10);

        // Matches if expiration is from today (0) up to limitDays
        matchesExpirationRange = diffDays >= 0 && diffDays <= limitDays;
      } else {
        // Perpetual license doesn't have an expiration date, so it never matches expiring soon filter
        matchesExpirationRange = false;
      }
    }

    return matchesSearch && matchesBrand && matchesStatus && matchesType && matchesExpirationRange;
  });

  return (
    <div className="space-y-6" id="licenses-tab-wrapper">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-6 rounded-2xl border border-slate-200 shadow-sm gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gerenciamento de Licenças</h1>
          <p className="text-slate-500 text-sm mt-1">
            Controle de assinaturas de sinal de correção (RTX, RTK) e ativações de recursos permanentes para monitores de piloto automático.
          </p>
        </div>
        
        <div className="flex flex-wrap gap-2 shrink-0 w-full md:w-auto">
          <button
            onClick={() => setIsAlertSettingsOpen(!isAlertSettingsOpen)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 border shadow-sm w-full sm:w-auto cursor-pointer ${
              isAlertSettingsOpen 
                ? 'bg-emerald-50 border-emerald-350 text-emerald-700' 
                : 'bg-white border-slate-250 text-slate-700 hover:bg-slate-50'
            }`}
            id="toggle-alert-settings-btn"
          >
            <Mail className="h-4 w-4 text-emerald-600" />
            Configurar Alertas
          </button>

          {isAdminOrTech && !isAdding && !editingLic && (
            <button
              onClick={() => {
                resetForm();
                setIsAdding(true);
              }}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2 shadow-sm shrink-0 w-full sm:w-auto cursor-pointer"
              id="register-license-btn"
            >
              <Plus className="h-4.5 w-4.5" />
              Cadastrar Nova Licença
            </button>
          )}
        </div>
      </div>

      {/* Alert Settings Collapsible Card */}
      {isAlertSettingsOpen && (
        <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4" id="alert-settings-box">
          <div className="flex justify-between items-center border-b border-slate-200 pb-3">
            <h3 className="font-bold text-slate-800 flex items-center gap-2 text-xs uppercase tracking-wider">
              <Bell className="h-5 w-5 text-emerald-600" />
              Configuração de Alertas Automáticos de Vencimento
            </h3>
            <button
              onClick={() => setIsAlertSettingsOpen(false)}
              className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition-all cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left side: email form */}
            <div className="lg:col-span-2 space-y-3">
              <p className="text-xs text-slate-500 leading-relaxed">
                O sistema realiza uma varredura automática em busca de licenças de sinal ou ativações de monitores prestes a expirar. Os alertas são disparados com 60, 30 e 15 dias de antecedência para o e-mail cadastrado, listando os <strong>números de série</strong> das respectivas licenças e monitores para que as renovações sejam providenciadas.
              </p>

              <form onSubmit={handleSaveAlertSettings} className="flex flex-col sm:flex-row gap-2.5 items-end">
                <div className="flex-1 w-full">
                  <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    E-mail Destinatário dos Alertas
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="email"
                      required
                      placeholder="Ex: suprimentos@fazendaagrostock.com.br"
                      value={alertEmailInput}
                      onChange={e => setAlertEmailInput(e.target.value)}
                      disabled={!isAdminOrTech}
                      className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:opacity-60"
                    />
                  </div>
                </div>

                {isAdminOrTech && (
                  <button
                    type="submit"
                    disabled={isSavingAlertSettings}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 shrink-0 w-full sm:w-auto cursor-pointer"
                  >
                    {isSavingAlertSettings ? 'Salvando...' : 'Salvar E-mail'}
                  </button>
                )}
              </form>
            </div>

            {/* Right side: quick scan status & logs */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-slate-400" />
                Histórico de Envio de Alertas
              </h4>
              <div className="space-y-2 text-[11px] text-slate-600">
                <div className="flex justify-between items-center">
                  <span>Alerta 60 Dias:</span>
                  <span className="font-semibold text-slate-850 bg-slate-100 px-2 py-0.5 rounded">
                    {alertSettings?.lastSent60 ? `Enviado em: ${new Date(alertSettings.lastSent60).toLocaleDateString('pt-BR')}` : 'Nunca disparado'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Alerta 30 Dias:</span>
                  <span className="font-semibold text-slate-850 bg-slate-100 px-2 py-0.5 rounded">
                    {alertSettings?.lastSent30 ? `Enviado em: ${new Date(alertSettings.lastSent30).toLocaleDateString('pt-BR')}` : 'Nunca disparado'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span>Alerta 15 Dias:</span>
                  <span className="font-semibold text-slate-850 bg-slate-100 px-2 py-0.5 rounded">
                    {alertSettings?.lastSent15 ? `Enviado em: ${new Date(alertSettings.lastSent15).toLocaleDateString('pt-BR')}` : 'Nunca disparado'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleTriggerManualAlerts}
                disabled={isSendingAlertManual || !alertEmailInput}
                className="w-full mt-1.5 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isSendingAlertManual ? 'animate-spin' : ''}`} />
                Varredura Manual e Teste
              </button>
            </div>
          </div>

          {/* Success / Status alerts */}
          {alertSuccessToast && (
            <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl flex items-start gap-2.5 text-emerald-850 text-xs shadow-sm">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="leading-normal">
                {alertSuccessToast}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Adding/Editing Form Box */}
      {(isAdding || editingLic) && (
        <div className="bg-white p-6 rounded-2xl border-2 border-emerald-500/30 shadow-md animate-fade-in" id="license-form-box">
          <div className="flex justify-between items-center pb-4 mb-6 border-b border-slate-100">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Key className="h-5 w-5 text-emerald-500" />
              {isAdding ? 'Cadastrar Nova Licença' : `Editar Licença: ${editingLic?.name}`}
            </h2>
            <button
              onClick={() => {
                setIsAdding(false);
                setEditingLic(null);
                resetForm();
              }}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={isAdding ? handleCreate : handleUpdate} className="space-y-5">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-600 text-xs font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            {isAdding && (
              <div className="bg-gradient-to-br from-indigo-50/40 via-purple-50/10 to-transparent p-5 rounded-2xl border border-indigo-150 shadow-sm mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                    <Sparkles className="h-5 w-5 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">Ativação Inteligente (IA OCR)</h4>
                    <p className="text-[11px] text-slate-500">Suba o documento de ativação para preencher todos os dados da licença de sinal instantaneamente.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                  <div className="lg:col-span-7">
                    <div 
                      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-indigo-500', 'bg-indigo-50/30'); }}
                      onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-50/30'); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('border-indigo-500', 'bg-indigo-50/30');
                        const file = e.dataTransfer.files?.[0];
                        if (file) processSelectedFile(file);
                      }}
                      className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/10 hover:bg-indigo-50/20 rounded-xl p-6 text-center cursor-pointer transition-all flex flex-col items-center justify-center relative min-h-[160px]"
                    >
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleOcrFileChange}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        disabled={isOcrLoading}
                        id="ocr-file-input"
                      />
                      
                      {ocrImagePreview ? (
                        <div className="w-full flex flex-col items-center gap-3">
                          <img 
                            src={ocrImagePreview} 
                            alt="Prévia do documento" 
                            className="max-h-40 object-contain rounded-lg shadow-sm border border-indigo-100"
                            referrerPolicy="no-referrer"
                          />
                          <div className="text-center">
                            <p className="text-xs font-bold text-indigo-900 flex items-center justify-center gap-1">
                              <FileText className="h-4 w-4" /> Imagem Carregada
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">Clique ou arraste para substituir</p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-4">
                          <Upload className="h-8 w-8 text-indigo-400 mb-2.5" />
                          <p className="text-xs font-bold text-slate-700">Arraste a foto do termo de ativação</p>
                          <p className="text-[10px] text-slate-400 mt-1">ou clique para selecionar no computador (PNG, JPG, JPEG)</p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-5 flex flex-col justify-between bg-white/60 rounded-xl p-4 border border-indigo-100/50">
                    <div>
                      <h5 className="text-[11px] font-bold text-indigo-950 uppercase tracking-wider mb-2">Instruções de Escaneamento</h5>
                      <ul className="text-[10px] text-slate-600 space-y-1.5 list-disc pl-4.5 leading-relaxed">
                        <li>Certifique-se de que o texto esteja legível e focado.</li>
                        <li>Formatos Trimble (RTX Plus, CenterPoint) e Topcon são detectados automaticamente.</li>
                        <li>Os QR codes de ativação e de desbloqueio serão gerados no painel após salvar o cadastro.</li>
                      </ul>
                    </div>

                    <div className="mt-4">
                      {isOcrLoading ? (
                        <div className="space-y-2">
                          <button
                            type="button"
                            disabled
                            className="w-full py-2.5 bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl flex items-center justify-center gap-2"
                          >
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                            Processando...
                          </button>
                          <p className="text-[10px] text-center text-indigo-600 font-medium animate-pulse">
                            {ocrProgressStep}
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={handleOcrProcess}
                          disabled={!ocrImagePreview}
                          className={`w-full py-2.5 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm ${ocrImagePreview ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer' : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'}`}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Processar com IA OCR
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {ocrSuccessMessage && (
                  <div className="mt-4 p-3.5 bg-indigo-50 border border-indigo-200 rounded-xl animate-fade-in flex gap-3">
                    <CheckCircle2 className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-indigo-950">Preenchimento Concluído!</p>
                      <p className="text-[10px] text-indigo-800 whitespace-pre-line mt-1 font-mono leading-relaxed bg-white/70 p-2 rounded-lg border border-indigo-100 truncate">
                        {ocrSuccessMessage}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              
              {/* Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Nome Comercial da Licença *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Trimble CenterPoint RTX (Anual)"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-slate-800"
                />
              </div>

              {/* Activation Code */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Chave / Código de Ativação *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: RTX-ANUAL-9982-XXXX"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-mono text-slate-800"
                />
              </div>

              {/* Brand */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Fabricante / Tecnologia</label>
                <select
                  value={brand}
                  onChange={e => setBrand(e.target.value as LicenseBrand)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-slate-800 bg-white"
                >
                  <option value="Trimble">Trimble</option>
                  <option value="Topcon">Topcon</option>
                </select>
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Tipo de Ativação</label>
                <select
                  value={type}
                  onChange={e => setType(e.target.value as LicenseType)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-slate-800 bg-white"
                >
                  <option value="Assinatura de Sinal">Assinatura de Sinal (RTX / RTK / Satélite)</option>
                  <option value="Ativação de Tela">Ativação de Tela (Piloto, Seção, Multi-produto)</option>
                </select>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Status da Ativação</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as LicenseStatus)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-slate-800 bg-white"
                >
                  <option value="Ativa">Ativa (Habilitada e em uso)</option>
                  <option value="Disponível">Disponível (Não vinculada / No estoque)</option>
                  <option value="Pendente">Pendente (Aguardando liberação de sinal)</option>
                  <option value="Expirada">Expirada (Requer renovação contratual)</option>
                </select>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Data de Início (Vigência)</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-slate-800 bg-white"
                />
              </div>

              {/* Expiration Date Section */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">Data de Expiração</label>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isPerpetual}
                      onChange={e => setIsPerpetual(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    Licença Permanente (Vitalícia)
                  </label>
                </div>
                
                <input
                  type="date"
                  disabled={isPerpetual}
                  value={isPerpetual ? '' : expirationDate}
                  onChange={e => setExpirationDate(e.target.value)}
                  className={`w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-slate-800 bg-white ${isPerpetual ? 'opacity-50 cursor-not-allowed bg-slate-50' : ''}`}
                />
              </div>

              {/* Device Model */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Modelo do Monitor/Aparelho</label>
                <input
                  type="text"
                  placeholder="Ex: FmX, GFX-750"
                  value={deviceModel}
                  onChange={e => setDeviceModel(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-slate-800"
                />
              </div>

              {/* Device Serial Number */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">S/N do Monitor/Aparelho</label>
                <input
                  type="text"
                  placeholder="Ex: 5348542353"
                  value={deviceSerialNumber}
                  onChange={e => setDeviceSerialNumber(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-mono text-slate-800"
                />
              </div>

              {/* Master Unlock Key */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Master Unlock Key (Trimble)</label>
                <input
                  type="text"
                  placeholder="Ex: 542353-FMX20-27091-71D6C21A"
                  value={masterUnlockKey}
                  onChange={e => setMasterUnlockKey(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm font-mono text-slate-800"
                />
              </div>

              {/* Component Association */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Equipamento de Destino (Opcional)</label>
                <select
                  value={associatedComponentSerial}
                  onChange={e => setAssociatedComponentSerial(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-sm text-slate-800 bg-white"
                >
                  <option value="">Nenhum - Disponível no Estoque / Não Vinculado</option>
                  {components
                    .filter(c => brand === 'all' || c.brand === brand)
                    .map(c => (
                      <option key={c.id} value={c.serialNumber}>
                        [{c.brand}] {c.name} (S/N: {c.serialNumber}) {c.currentMachine ? `-> Instalado em: ${c.currentMachine}` : '(No Almoxarifado)'}
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1.5 italic">
                  Vincular a um monitor ou receptor aplica automaticamente a identificação da máquina correspondente para facilitar o rastreamento em campo.
                </p>
              </div>

            </div>

            {/* Form actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setEditingLic(null);
                  resetForm();
                }}
                className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
              >
                {loading ? 'Salvando...' : (isAdding ? 'Cadastrar Licença' : 'Salvar Alterações')}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, chave, S/N equipamento ou máquina..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-xs text-slate-800"
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 md:w-auto shrink-0 w-full sm:w-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 sm:flex-initial">
            {/* Brand Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 rounded-xl">
              <Filter className="h-3.5 w-3.5 text-slate-400 shrink-0 hidden sm:inline" />
              <select
                value={brandFilter}
                onChange={e => setBrandFilter(e.target.value)}
                className="bg-transparent border-none text-[11px] font-bold text-slate-600 focus:outline-none pr-2 py-1.5 w-full cursor-pointer"
              >
                <option value="all">Tecnologia (Todas)</option>
                <option value="Trimble">Trimble</option>
                <option value="Topcon">Topcon</option>
              </select>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 rounded-xl">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="bg-transparent border-none text-[11px] font-bold text-slate-600 focus:outline-none pr-2 py-1.5 w-full cursor-pointer"
              >
                <option value="all">Tipo (Todos)</option>
                <option value="Assinatura de Sinal">Sinal</option>
                <option value="Ativação de Tela">Ativação</option>
              </select>
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 rounded-xl">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-transparent border-none text-[11px] font-bold text-slate-600 focus:outline-none pr-2 py-1.5 w-full cursor-pointer"
              >
                <option value="all">Status (Todos)</option>
                <option value="Ativa">Ativas</option>
                <option value="Disponível">Disponíveis</option>
                <option value="Pendente">Pendentes</option>
                <option value="Expirada">Expiradas</option>
              </select>
            </div>

            {/* Expiration Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-3 rounded-xl">
              <select
                value={expirationRangeFilter}
                onChange={e => setExpirationRangeFilter(e.target.value)}
                className="bg-transparent border-none text-[11px] font-bold text-slate-600 focus:outline-none pr-2 py-1.5 w-full cursor-pointer"
              >
                <option value="all">Vencimento (Todos)</option>
                <option value="15">Vencendo em até 15 dias</option>
                <option value="30">Vencendo em até 30 dias</option>
                <option value="60">Vencendo em até 60 dias</option>
              </select>
            </div>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center justify-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-slate-600'}`}
              title="Visualização em Grade (Cards)"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200/50' : 'text-slate-400 hover:text-slate-600'}`}
              title="Visualização em Lista"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Grid List */}
      {filteredLicenses.length === 0 ? (
        <div className="bg-white p-12 text-center border border-slate-200 rounded-2xl text-slate-400 shadow-sm">
          <Key className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <p className="font-medium text-sm">Nenhuma licença correspondente localizada.</p>
          <p className="text-xs text-slate-400 mt-1">Ajuste os filtros de busca ou crie um novo registro.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" id="licenses-grid">
          {filteredLicenses.map(lic => {
            const isTrimble = lic.brand === 'Trimble';
            
            // Expiration warnings
            const isPerpetualLic = !lic.expirationDate;
            let expirationStatusText = 'Vitalícia (Sem Expiração)';
            let isNearExpiration = false;
            let isExpired = lic.status === 'Expirada';

            if (lic.expirationDate) {
              const expDate = new Date(lic.expirationDate);
              const today = new Date();
              const diffTime = expDate.getTime() - today.getTime();
              const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
              
              expirationStatusText = expDate.toLocaleDateString('pt-BR');
              
              if (diffDays < 0) {
                isExpired = true;
                expirationStatusText = `Expirada em ${expDate.toLocaleDateString('pt-BR')}`;
              } else if (diffDays <= 30) {
                isNearExpiration = true;
                expirationStatusText = `Expira em ${diffDays} dias (${expDate.toLocaleDateString('pt-BR')})`;
              }
            }

            // Status style
            let badgeBg = 'bg-slate-100 text-slate-700';
            let icon = <Clock className="h-3.5 w-3.5" />;
            
            if (lic.status === 'Ativa') {
              badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-100';
              icon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
            } else if (lic.status === 'Expirada' || isExpired) {
              badgeBg = 'bg-rose-50 text-rose-700 border-rose-100';
              icon = <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />;
            } else if (lic.status === 'Pendente') {
              badgeBg = 'bg-amber-50 text-amber-700 border-amber-100';
              icon = <Clock className="h-3.5 w-3.5 text-amber-500" />;
            } else if (lic.status === 'Disponível') {
              badgeBg = 'bg-indigo-50 text-indigo-700 border-indigo-100';
              icon = <Tag className="h-3.5 w-3.5 text-indigo-500" />;
            }

            return (
              <div 
                key={lic.id} 
                className={`bg-white rounded-2xl border ${isNearExpiration ? 'border-amber-400' : isExpired ? 'border-rose-400' : 'border-slate-200'} shadow-sm p-5 hover:shadow-md transition-all flex flex-col justify-between`}
              >
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <span className={`text-[10px] font-extrabold uppercase tracking-wide px-2.5 py-0.5 rounded-full border ${isTrimble ? 'bg-indigo-50 text-indigo-700 border-indigo-100' : 'bg-sky-50 text-sky-700 border-sky-100'}`}>
                      {lic.brand}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${badgeBg}`}>
                      {icon}
                      {isExpired ? 'Expirada' : lic.status}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-800 text-sm mt-3 line-clamp-2" title={lic.name}>
                    {lic.name}
                  </h3>

                  <p className="text-[11px] text-slate-400 font-medium mt-1 uppercase tracking-wide">
                    {lic.type}
                  </p>

                  {/* Activation Key Code Box */}
                  <div className="mt-3.5 p-2 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Código de Ativação</span>
                      <span className="text-xs font-mono text-slate-600 font-bold tracking-tight select-all truncate max-w-[95%]" title={lic.code}>
                        {lic.code}
                      </span>
                    </div>
                    <Key className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                  </div>

                  {/* Master Unlock Key Code Box */}
                  {lic.masterUnlockKey && (
                    <div className="mt-2.5 p-2 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-center justify-between">
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-[9px] font-bold text-indigo-700 uppercase tracking-wider">Master Unlock Key</span>
                        <span className="text-xs font-mono text-indigo-900 font-bold tracking-tight select-all truncate max-w-[95%]" title={lic.masterUnlockKey}>
                          {lic.masterUnlockKey}
                        </span>
                      </div>
                      <Sparkles className="h-3.5 w-3.5 text-indigo-400 shrink-0 ml-2" />
                    </div>
                  )}

                  {/* Association details */}
                  <div className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
                    {lic.startDate && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400 font-medium">Início Contrato:</span>
                        <span className="text-slate-700 font-bold">
                          {new Date(lic.startDate).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-medium">Hardware Vinculado:</span>
                      <span className="text-slate-700 font-bold truncate max-w-[150px]">
                        {lic.associatedComponentSerial ? (
                          <span className="flex items-center gap-1" title={`S/N: ${lic.associatedComponentSerial}`}>
                            <Cpu className="h-3 w-3 text-emerald-500" />
                            {lic.associatedComponentSerial}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal italic">Não vinculado</span>
                        )}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs">
                      <span className="text-slate-400 font-medium">Máquina instalada:</span>
                      <span className="text-slate-700 font-bold">
                        {lic.associatedMachinePrefix ? (
                          <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-extrabold border border-emerald-100">
                            {lic.associatedMachinePrefix}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-normal italic">Sem máquina</span>
                        )}
                      </span>
                    </div>

                    {(lic.deviceModel || lic.deviceSerialNumber) && (
                      <div className="flex justify-between text-xs">
                        <span className="text-slate-400 font-medium">Monitor/Receptor:</span>
                        <span className="text-slate-700 font-bold truncate max-w-[150px]" title={`${lic.deviceModel || ''} ${lic.deviceSerialNumber ? `(S/N: ${lic.deviceSerialNumber})` : ''}`}>
                          {lic.deviceModel || ''} {lic.deviceSerialNumber ? `[S/N: ${lic.deviceSerialNumber}]` : ''}
                        </span>
                      </div>
                    )}

                    <div className="flex justify-between text-xs items-center">
                      <span className="text-slate-400 font-medium">Expiração/Contrato:</span>
                      <span className={`font-bold text-[11px] flex items-center gap-1 ${isExpired ? 'text-rose-600' : isNearExpiration ? 'text-amber-600' : 'text-slate-600'}`}>
                        <Calendar className="h-3 w-3 shrink-0" />
                        {expirationStatusText}
                      </span>
                    </div>

                    <div className="flex justify-between text-xs items-center pt-2 border-t border-slate-100/60 mt-1.5">
                      <span className="text-slate-400 font-medium">Desbloqueio Equipam.:</span>
                      {lic.unlockStatus === 'desbloqueado' ? (
                        <span 
                          className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-100 flex items-center gap-1 cursor-help" 
                          title={`Desbloqueado em: ${lic.unlockedAt ? new Date(lic.unlockedAt).toLocaleString('pt-BR') : ''}${lic.unlockedBy ? ` por ${lic.unlockedBy}` : ''}`}
                        >
                          <Check className="h-3 w-3 text-emerald-600" />
                          Realizado
                        </span>
                      ) : (
                        <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-100 flex items-center gap-1">
                          <Clock className="h-3 w-3 text-amber-500 animate-pulse" />
                          Pendente
                        </span>
                      )}
                    </div>

                    {lic.unlockStatus === 'desbloqueado' && lic.unlockedAt && (
                      <div className="text-[10px] text-slate-400 italic text-right mt-0.5">
                        Confirmado em {new Date(lic.unlockedAt).toLocaleDateString('pt-BR')} às {new Date(lic.unlockedAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex justify-between items-center mt-5 pt-3 border-t border-slate-100 shrink-0">
                  <button
                    onClick={() => setQrModalLicense(lic)}
                    className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl text-emerald-700 hover:text-emerald-800 transition-colors text-[10px] font-bold shadow-sm"
                    title="Exibir QR Codes de Desbloqueio"
                  >
                    <QrCode className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    Desbloqueio QR
                  </button>

                  {isAdminOrTech && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => startEdit(lic)}
                        className="p-1.5 hover:bg-slate-50 border border-slate-100 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
                        title="Editar Licença"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(lic.id)}
                        className="p-1.5 hover:bg-rose-50 border border-transparent rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                        title="Excluir Licença"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden" id="licenses-list-view">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-500 text-[11px] font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Marca/Tipo</th>
                  <th className="py-3 px-4">Nome / Recurso</th>
                  <th className="py-3 px-4">Código / Chave</th>
                  <th className="py-3 px-4">Vínculos</th>
                  <th className="py-3 px-4">Contrato / Expiração</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Desbloqueio</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                {filteredLicenses.map(lic => {
                  const isTrimble = lic.brand === 'Trimble';
                  
                  // Expiration warnings
                  const isPerpetualLic = !lic.expirationDate;
                  let expirationStatusText = 'Vitalícia';
                  let isNearExpiration = false;
                  let isExpired = lic.status === 'Expirada';

                  if (lic.expirationDate) {
                    const expDate = new Date(lic.expirationDate);
                    const today = new Date();
                    const diffTime = expDate.getTime() - today.getTime();
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    expirationStatusText = expDate.toLocaleDateString('pt-BR');
                    
                    if (diffDays < 0) {
                      isExpired = true;
                      expirationStatusText = `Expirou (${expDate.toLocaleDateString('pt-BR')})`;
                    } else if (diffDays <= 30) {
                      isNearExpiration = true;
                      expirationStatusText = `Expira em ${diffDays}d (${expDate.toLocaleDateString('pt-BR')})`;
                    }
                  }

                  // Status style
                  let badgeBg = 'bg-slate-100 text-slate-700';
                  let statusIcon = <Clock className="h-3 w-3" />;
                  
                  if (lic.status === 'Ativa') {
                    badgeBg = 'bg-emerald-50 text-emerald-700 border-emerald-100';
                    statusIcon = <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
                  } else if (lic.status === 'Expirada' || isExpired) {
                    badgeBg = 'bg-rose-50 text-rose-700 border-rose-100';
                    statusIcon = <AlertTriangle className="h-3 w-3 text-rose-500" />;
                  } else if (lic.status === 'Pendente') {
                    badgeBg = 'bg-amber-50 text-amber-700 border-amber-100';
                    statusIcon = <Clock className="h-3 w-3 text-amber-500" />;
                  } else if (lic.status === 'Disponível') {
                    badgeBg = 'bg-indigo-50 text-indigo-700 border-indigo-100';
                    statusIcon = <Tag className="h-3 w-3 text-indigo-500" />;
                  }

                  return (
                    <tr 
                      key={lic.id} 
                      className={`hover:bg-slate-50/50 transition-colors ${isNearExpiration ? 'bg-amber-50/10' : isExpired ? 'bg-rose-50/10' : ''}`}
                    >
                      {/* Marca/Tipo */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <span className={`self-start text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-md border ${isTrimble ? 'bg-indigo-50 text-indigo-700 border-indigo-150' : 'bg-sky-50 text-sky-700 border-sky-150'}`}>
                            {lic.brand}
                          </span>
                          <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                            {lic.type === 'Assinatura de Sinal' ? 'Sinal' : 'Ativação'}
                          </span>
                        </div>
                      </td>

                      {/* Nome / Recurso */}
                      <td className="py-3 px-4 font-semibold text-slate-800 max-w-[180px] truncate" title={lic.name}>
                        {lic.name}
                      </td>

                      {/* Código / Chave */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1 max-w-[180px]">
                          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
                            <Key className="h-3 w-3 text-slate-400 shrink-0" />
                            <span className="text-[11px] font-mono text-slate-600 font-bold select-all truncate" title={lic.code}>
                              {lic.code}
                            </span>
                          </div>
                          {lic.masterUnlockKey && (
                            <div className="flex items-center gap-1.5 bg-indigo-50/50 border border-indigo-100 px-2 py-1 rounded-lg">
                              <Sparkles className="h-3 w-3 text-indigo-400 shrink-0" />
                              <span className="text-[11px] font-mono text-indigo-900 font-bold select-all truncate" title={lic.masterUnlockKey}>
                                {lic.masterUnlockKey}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Vínculos */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1.5">
                          {lic.associatedMachinePrefix ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-slate-400 font-medium w-12">Veículo:</span>
                              <span className="bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded text-[10px] font-extrabold border border-emerald-100">
                                {lic.associatedMachinePrefix}
                              </span>
                            </div>
                          ) : null}

                          {lic.associatedComponentSerial ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-slate-400 font-medium w-12">Hardware:</span>
                              <span className="text-slate-700 font-bold flex items-center gap-1 text-[11px]" title={`S/N: ${lic.associatedComponentSerial}`}>
                                <Cpu className="h-2.5 w-2.5 text-emerald-500" />
                                {lic.associatedComponentSerial}
                              </span>
                            </div>
                          ) : null}

                          {(lic.deviceModel || lic.deviceSerialNumber) ? (
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-slate-400 font-medium w-12">Monitor:</span>
                              <span className="text-slate-600 font-medium truncate max-w-[120px] text-[10px]" title={`${lic.deviceModel || ''} ${lic.deviceSerialNumber ? `(S/N: ${lic.deviceSerialNumber})` : ''}`}>
                                {lic.deviceModel || ''} {lic.deviceSerialNumber ? `[${lic.deviceSerialNumber}]` : ''}
                              </span>
                            </div>
                          ) : null}

                          {!lic.associatedMachinePrefix && !lic.associatedComponentSerial && !lic.deviceModel && !lic.deviceSerialNumber && (
                            <span className="text-slate-400 italic text-[10px]">Nenhum vínculo</span>
                          )}
                        </div>
                      </td>

                      {/* Contrato / Expiração */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          {lic.startDate && (
                            <span className="text-[10px] text-slate-400 font-medium">
                              Início: {new Date(lic.startDate).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                          <span className={`font-bold flex items-center gap-1 ${isExpired ? 'text-rose-600' : isNearExpiration ? 'text-amber-600' : 'text-slate-600'}`}>
                            <Calendar className="h-3 w-3 shrink-0" />
                            {expirationStatusText}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${badgeBg}`}>
                          {statusIcon}
                          {isExpired ? 'Expirada' : lic.status}
                        </span>
                      </td>

                      {/* Desbloqueio */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {lic.unlockStatus === 'desbloqueado' ? (
                            <span 
                              className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-bold border border-emerald-100 inline-flex items-center gap-1 cursor-help" 
                              title={`Desbloqueado em: ${lic.unlockedAt ? new Date(lic.unlockedAt).toLocaleString('pt-BR') : ''}${lic.unlockedBy ? ` por ${lic.unlockedBy}` : ''}`}
                            >
                              <Check className="h-3 w-3 text-emerald-600" />
                              Realizado
                            </span>
                          ) : (
                            <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full text-[10px] font-bold border border-amber-100 inline-flex items-center gap-1">
                              <Clock className="h-3 w-3 text-amber-500 animate-pulse" />
                              Pendente
                            </span>
                          )}
                          {lic.unlockStatus === 'desbloqueado' && lic.unlockedAt && (
                            <span className="text-[9px] text-slate-400 block max-w-[100px] truncate">
                              {new Date(lic.unlockedAt).toLocaleDateString('pt-BR')}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Ações */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex justify-end items-center gap-2">
                          <button
                            onClick={() => setQrModalLicense(lic)}
                            className="p-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-lg text-emerald-700 hover:text-emerald-800 transition-colors"
                            title="Desbloqueio QR / Chaves"
                          >
                            <QrCode className="h-4 w-4" />
                          </button>

                          {isAdminOrTech && (
                            <>
                              <button
                                onClick={() => startEdit(lic)}
                                className="p-1.5 hover:bg-slate-50 border border-slate-100 rounded-lg text-slate-500 hover:text-indigo-600 transition-colors"
                                title="Editar Licença"
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(lic.id)}
                                className="p-1.5 hover:bg-rose-50 border border-transparent rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                                title="Excluir Licença"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Information footer */}
      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-2xl flex gap-3">
        <Info className="h-5 w-5 text-indigo-500 shrink-0 mt-0.5" />
        <div className="text-xs text-indigo-800 leading-normal">
          <p className="font-bold">Como funciona a sincronização automática de localização?</p>
          <p className="mt-1">
            As licenças são vinculadas ao hardware pelo <strong>Número de Série</strong>. Quando um técnico realiza a instalação de um receptor ou monitor em um trator, colhedora ou pulverizador (através da aba de <strong>Serviços de Campo</strong>), o sistema atualiza instantaneamente a localização geográfica das licenças ativas associadas a este hardware.
          </p>
        </div>
      </div>

      {/* QR Code Campo Modal */}
      {qrModalLicense && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in" id="qr-code-modal">
          <div className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden animate-scale-up">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-6 text-white flex justify-between items-center">
              <div>
                <h3 className="text-md font-bold flex items-center gap-2">
                  <QrCode className="h-5 w-5 animate-pulse" /> Desbloqueio de Sinal em Campo
                </h3>
                <p className="text-xs text-emerald-100 mt-1 truncate max-w-[450px]" title={qrModalLicense.name}>
                  {qrModalLicense.name}
                </p>
              </div>
              <button 
                onClick={() => setQrModalLicense(null)}
                className="p-1.5 hover:bg-white/10 rounded-full text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              
              <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-2xl p-4 flex gap-3 text-xs">
                <Info className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Como realizar o desbloqueio rápido no monitor?</p>
                  <p className="mt-1 leading-relaxed">
                    Aponte o leitor de QR code integrado ou utilize a câmera do celular para copiar os códigos. Insira a chave correspondente no menu de assinaturas do seu receptor Trimble (FmX, GFX) ou Topcon para liberar o sinal de satélite.
                  </p>
                </div>
              </div>

              {/* Unlock Status Banner inside the Modal */}
              <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs ${qrModalLicense.unlockStatus === 'desbloqueado' ? 'bg-emerald-50 border-emerald-150 text-emerald-900' : 'bg-amber-50 border-amber-150 text-amber-900'}`}>
                <div className="flex items-start gap-2.5">
                  {qrModalLicense.unlockStatus === 'desbloqueado' ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-650 shrink-0 mt-0.5 animate-bounce" />
                  ) : (
                    <Clock className="h-5 w-5 text-amber-650 shrink-0 mt-0.5 animate-pulse" />
                  )}
                  <div>
                    <p className="font-bold">
                      {qrModalLicense.unlockStatus === 'desbloqueado' 
                        ? '✓ Desbloqueio Confirmado no Equipamento' 
                        : '⏱ Aguardando Desbloqueio no Equipamento'}
                    </p>
                    <p className="mt-0.5 text-slate-500 font-medium">
                      {qrModalLicense.unlockStatus === 'desbloqueado' 
                        ? `Esta licença foi marcada como ativada no equipamento físico em ${qrModalLicense.unlockedAt ? new Date(qrModalLicense.unlockedAt).toLocaleString('pt-BR') : ''}${qrModalLicense.unlockedBy ? ` por ${qrModalLicense.unlockedBy}` : ''}.`
                        : 'Após digitar o código no receptor de campo, confirme o desbloqueio no botão abaixo para registrar a data, hora e operador.'}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 flex items-center">
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${qrModalLicense.unlockStatus === 'desbloqueado' ? 'bg-emerald-100 border-emerald-250 text-emerald-800' : 'bg-amber-100 border-amber-250 text-amber-800'}`}>
                    {qrModalLicense.unlockStatus === 'desbloqueado' ? 'Realizado' : 'Pendente'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                
                {/* QR 1: Activation Code */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-between text-center">
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wide bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full">
                      Código de Ativação
                    </span>
                    <h4 className="text-xs font-bold text-slate-700 mt-2">Chave de Permissão</h4>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm my-4">
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrModalLicense.code)}`} 
                      alt="QR Code de Ativação" 
                      className="h-44 w-44 object-contain"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  <div className="w-full space-y-2">
                    <div className="p-2 bg-white rounded-lg border border-slate-100 font-mono text-xs text-slate-600 font-bold select-all truncate">
                      {qrModalLicense.code}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(qrModalLicense.code);
                        alert('Código de ativação copiado para a área de transferência!');
                      }}
                      className="w-full py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] rounded-lg transition-all"
                    >
                      Copiar Código
                    </button>
                  </div>
                </div>

                {/* QR 2: Master Unlock Key */}
                <div className={`bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-between text-center ${!qrModalLicense.masterUnlockKey ? 'opacity-50 cursor-not-allowed justify-center' : ''}`}>
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wide bg-indigo-100 text-indigo-800 px-2.5 py-0.5 rounded-full">
                      Master Unlock Key
                    </span>
                    <h4 className="text-xs font-bold text-slate-700 mt-2">Chave Mestra (Trimble)</h4>
                  </div>

                  {qrModalLicense.masterUnlockKey ? (
                    <>
                      <div className="bg-white p-3.5 rounded-xl border border-slate-100 shadow-sm my-4">
                        <img 
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrModalLicense.masterUnlockKey)}`} 
                          alt="QR Code Master Unlock Key" 
                          className="h-44 w-44 object-contain"
                          referrerPolicy="no-referrer"
                        />
                      </div>

                      <div className="w-full space-y-2">
                        <div className="p-2 bg-white rounded-lg border border-slate-100 font-mono text-xs text-slate-600 font-bold select-all truncate">
                          {qrModalLicense.masterUnlockKey}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(qrModalLicense.masterUnlockKey || '');
                            alert('Master Unlock Key copiada para a área de transferência!');
                          }}
                          className="w-full py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-[10px] rounded-lg transition-all"
                        >
                          Copiar Chave Mestra
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="py-12 flex flex-col items-center justify-center">
                      <Key className="h-10 w-10 text-slate-300 mb-2" />
                      <p className="text-[11px] text-slate-400 max-w-[180px]">Nenhuma Master Unlock Key cadastrada para esta licença.</p>
                    </div>
                  )}
                </div>

              </div>

              {/* Device metadata in modal */}
              <div className="border-t border-slate-100 pt-4 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 font-medium">Modelo do Receptor/Monitor:</span>
                  <p className="text-slate-800 font-bold mt-0.5">{qrModalLicense.deviceModel || <span className="text-slate-400 font-normal italic">Não especificado</span>}</p>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Número de Série do Aparelho:</span>
                  <p className="text-slate-800 font-bold mt-0.5 font-mono">{qrModalLicense.deviceSerialNumber || <span className="text-slate-400 font-normal italic">Não especificado</span>}</p>
                </div>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex justify-between items-center">
              <div>
                {qrModalLicense.unlockStatus === 'desbloqueado' ? (
                  <button
                    type="button"
                    onClick={() => handleResetUnlock(qrModalLicense.id)}
                    className="px-4 py-2 bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-100 rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Voltar para Pendente
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConfirmUnlock(qrModalLicense.id)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Confirmar Desbloqueio
                  </button>
                )}
              </div>
              <button 
                onClick={() => setQrModalLicense(null)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all"
              >
                Fechar Painel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
