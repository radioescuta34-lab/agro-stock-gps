import React, { useState, useEffect, useMemo } from 'react';
import {
  License,
  ComponentLoan,
  FieldDataCollection,
  Machine,
  UserProfile,
  LicenseSettings,
  CampoAlertSettings,
  LoanAlertSettings,
  MaintenanceAlertSettings,
  IdleAlertSettings,
  AutopilotComponent,
  MovementLog,
  ComponentMaintenance,
  AlertHistoryEntry
} from '../types';
import { useNotifications } from './NotificationProvider';
import { useLicenseAlertSettings } from '../hooks/useLicenseAlertSettings';
import { useCampoAlertSettings } from '../hooks/useCampoAlertSettings';
import { useLoanAlertSettings } from '../hooks/useLoanAlertSettings';
import { useMaintenanceAlertSettings } from '../hooks/useMaintenanceAlertSettings';
import { useIdleAlertSettings } from '../hooks/useIdleAlertSettings';
import { getLicensesExpiringInDays, sendLicenseExpirationEmail } from '../utils/licenseAlerts';
import { buildFieldDataReport, sendFieldDataAlertEmail } from '../utils/fieldDataAlerts';
import { getOverdueLoans, sendLoansAlertEmail } from '../utils/loansAlerts';
import { getOverdueMaintenances, getCompletedMaintenances, sendMaintenanceAlertEmail } from '../utils/maintenanceAlerts';
import { getIdleComponents, sendIdleComponentsAlertEmail } from '../utils/idleComponentsAlerts';
import { parseEmails, formatEmails, hasInvalidEmail } from '../utils/emailUtils';
import { formatNextSendLabel, getWeekdayLabel, getTodayStr } from '../utils/automationUtils';
import { getWeekFormattedLabel } from '../utils/dateUtils';
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Handshake,
  History,
  HelpCircle,
  Key,
  Mail,
  Send,
  Save,
  ClipboardList,
  Wrench,
  Boxes,
  X
} from 'lucide-react';

interface AlertSettingsSectionProps {
  licenses: License[];
  machines: Machine[];
  fieldDataCollections: FieldDataCollection[];
  loans: ComponentLoan[];
  components?: AutopilotComponent[];
  movements?: MovementLog[];
  maintenances?: ComponentMaintenance[];
  currentUser?: UserProfile | null;
  isDemoMode: boolean;
}

type HistoryModalType = 'licenses' | 'campo' | 'loans' | 'maintenance' | 'idle' | null;
type HowModalType = 'licenses' | 'campo' | 'loans' | 'maintenance' | 'idle' | null;

const badgeClass = (active: boolean) =>
  active
    ? 'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700'
    : 'inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-500';

const formatDateLabel = (iso?: string) => {
  if (!iso) return 'Nunca';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR');
};

interface AutomationCardProps {
  icon: React.ReactNode;
  title: string;
  summary: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  onOpenHow: () => void;
}

function AutomationCard({ icon, title, summary, active, open, onToggle, children, footer, onOpenHow }: AutomationCardProps) {
  return (
    <div className={`bg-white border rounded-2xl overflow-hidden transition-all ${open ? 'border-emerald-200 shadow-sm' : 'border-slate-200 hover:border-slate-300'}`}>
      <div className="p-4 sm:px-5 sm:py-4">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full min-w-0 items-center gap-3 text-left cursor-pointer rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
        >
          <div className={`shrink-0 p-2.5 border rounded-xl transition-colors ${open ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-emerald-600 shadow-sm'}`}>
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-2">
              <h4 className="text-sm font-bold text-slate-900 leading-tight">{title}</h4>
              <span className={badgeClass(active)}>
                <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                {active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            {!open && (
              <p className="mt-0.5 text-[11px] text-slate-400 truncate">{summary}</p>
            )}
          </div>
          <span className="shrink-0 p-2 rounded-lg text-slate-400" aria-hidden="true">
            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </span>
        </button>

        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3 sm:ml-13">
          <span className="text-[11px] text-slate-400">
            {open ? 'Configurações da automação' : 'Toque para configurar'}
          </span>
          <button
            type="button"
            onClick={onOpenHow}
            className="shrink-0 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 cursor-pointer"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            Como funciona
          </button>
        </div>
      </div>

      <div className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-4 border-t border-slate-100 px-4 py-4 sm:px-5">{children}</div>
          {footer && (
            <div className="grid grid-cols-1 gap-2 bg-slate-50/80 px-4 py-3 border-t border-slate-100 sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:px-5 [&>button]:w-full sm:[&>button]:w-auto">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
}

function Toggle({ checked, onChange }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
        checked ? 'bg-emerald-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
    {children}
  </label>
);

const InputShell: React.FC<{ dimmed?: boolean; children: React.ReactNode }> = ({ dimmed, children }) => (
  <div className={dimmed ? 'opacity-50 pointer-events-none' : ''}>{children}</div>
);

export default function AlertSettingsSection({
  licenses,
  machines,
  fieldDataCollections,
  loans,
  components = [],
  movements = [],
  maintenances = [],
  currentUser,
  isDemoMode
}: AlertSettingsSectionProps) {
  const { showToast, showDialog } = useNotifications();
  const { alertSettings, saveAlertSettings } = useLicenseAlertSettings(isDemoMode);
  const { campoSettings, saveCampoSettings } = useCampoAlertSettings(isDemoMode);
  const { loanSettings, saveLoanSettings } = useLoanAlertSettings(isDemoMode);
  const { maintenanceSettings, saveMaintenanceSettings } = useMaintenanceAlertSettings(isDemoMode);
  const { idleSettings, saveIdleSettings } = useIdleAlertSettings(isDemoMode);

  // ---- Licenses local form state ----
  const [licenseEnabled, setLicenseEnabled] = useState(false);
  const [licenseEmails, setLicenseEmails] = useState('');
  const [licenseNotifyExpired, setLicenseNotifyExpired] = useState(false);
  const [licThresholds, setLicThresholds] = useState<{ '15': boolean; '30': boolean; '60': boolean }>({
    '15': true,
    '30': true,
    '60': true
  });
  const [isSavingLicenses, setIsSavingLicenses] = useState(false);
  const [isSendingLicenseTest, setIsSendingLicenseTest] = useState(false);

  // ---- Campo local form state ----
  const [campoEnabled, setCampoEnabled] = useState(false);
  const [campoEmails, setCampoEmails] = useState('');
  const [campoDay, setCampoDay] = useState('quinta');
  const [campoTime, setCampoTime] = useState('08:00');
  const [isSavingCampo, setIsSavingCampo] = useState(false);
  const [isSendingCampo, setIsSendingCampo] = useState(false);
  const [showCampoConfirm, setShowCampoConfirm] = useState(false);

  // ---- Loans local form state ----
  const [loanEnabled, setLoanEnabled] = useState(false);
  const [loanEmails, setLoanEmails] = useState('');
  const [isSavingLoans, setIsSavingLoans] = useState(false);
  const [isSendingLoans, setIsSendingLoans] = useState(false);

  // ---- Maintenance local form state ----
  const [maintEnabled, setMaintEnabled] = useState(false);
  const [maintEmails, setMaintEmails] = useState('');
  const [maintOverdueDays, setMaintOverdueDays] = useState(7);
  const [maintNotifyCompleted, setMaintNotifyCompleted] = useState(true);
  const [isSavingMaint, setIsSavingMaint] = useState(false);
  const [isSendingMaint, setIsSendingMaint] = useState(false);

  // ---- Idle components local form state ----
  const [idleEnabled, setIdleEnabled] = useState(false);
  const [idleEmails, setIdleEmails] = useState('');
  const [idleDays, setIdleDays] = useState(30);
  const [isSavingIdle, setIsSavingIdle] = useState(false);
  const [isSendingIdle, setIsSendingIdle] = useState(false);

  const [historyModal, setHistoryModal] = useState<HistoryModalType>(null);
  const [howModal, setHowModal] = useState<HowModalType>(null);
  const [openCard, setOpenCard] = useState<'licenses' | 'campo' | 'loans' | 'maintenance' | 'idle' | null>('licenses');

  // Sync form fields whenever settings load from storage/Firestore
  useEffect(() => {
    if (!alertSettings) return;
    setLicenseEnabled(alertSettings.enabled);
    setLicenseEmails(formatEmails(alertSettings.alertEmails));
    setLicenseNotifyExpired(!!alertSettings.notifyExpired);
    setLicThresholds({
      '15': alertSettings.thresholds?.['15'] ?? true,
      '30': alertSettings.thresholds?.['30'] ?? true,
      '60': alertSettings.thresholds?.['60'] ?? true
    });
  }, [alertSettings]);

  useEffect(() => {
    if (!campoSettings) return;
    setCampoEnabled(campoSettings.enabled);
    setCampoEmails(formatEmails(campoSettings.alertEmails));
    setCampoDay(campoSettings.scheduleDay);
    setCampoTime(campoSettings.scheduleTime);
  }, [campoSettings]);

  useEffect(() => {
    if (!loanSettings) return;
    setLoanEnabled(loanSettings.enabled);
    setLoanEmails(formatEmails(loanSettings.alertEmails));
  }, [loanSettings]);

  useEffect(() => {
    if (!maintenanceSettings) return;
    setMaintEnabled(maintenanceSettings.enabled);
    setMaintEmails(formatEmails(maintenanceSettings.alertEmails));
    setMaintOverdueDays(maintenanceSettings.overdueDays);
    setMaintNotifyCompleted(maintenanceSettings.notifyCompleted);
  }, [maintenanceSettings]);

  useEffect(() => {
    if (!idleSettings) return;
    setIdleEnabled(idleSettings.enabled);
    setIdleEmails(formatEmails(idleSettings.alertEmails));
    setIdleDays(idleSettings.idleDays);
  }, [idleSettings]);

  const updatedBy = currentUser?.name || currentUser?.email || 'Sistema';

  const report = useMemo(
    () => buildFieldDataReport(machines, fieldDataCollections),
    [machines, fieldDataCollections]
  );
  const overdueLoans = useMemo(() => getOverdueLoans(loans), [loans]);
  const expiringSoonCount = useMemo(() => getLicensesExpiringInDays(licenses, 30).length, [licenses]);

  // ---- Dirty flags (unsaved changes) ----
  const licenseDirty =
    licenseEnabled !== (alertSettings?.enabled ?? false) ||
    parseEmails(licenseEmails).join(',') !== (alertSettings?.alertEmails || []).join(',') ||
    licenseNotifyExpired !== (alertSettings?.notifyExpired ?? false) ||
    licThresholds['15'] !== (alertSettings?.thresholds?.['15'] ?? true) ||
    licThresholds['30'] !== (alertSettings?.thresholds?.['30'] ?? true) ||
    licThresholds['60'] !== (alertSettings?.thresholds?.['60'] ?? true);

  const campoDirty =
    campoEnabled !== (campoSettings?.enabled ?? false) ||
    parseEmails(campoEmails).join(',') !== (campoSettings?.alertEmails || []).join(',') ||
    campoDay !== (campoSettings?.scheduleDay ?? 'quinta') ||
    campoTime !== (campoSettings?.scheduleTime ?? '08:00');

  const loansDirty =
    loanEnabled !== (loanSettings?.enabled ?? false) ||
    parseEmails(loanEmails).join(',') !== (loanSettings?.alertEmails || []).join(',');

  const maintDirty =
    maintEnabled !== (maintenanceSettings?.enabled ?? false) ||
    parseEmails(maintEmails).join(',') !== (maintenanceSettings?.alertEmails || []).join(',') ||
    maintOverdueDays !== (maintenanceSettings?.overdueDays ?? 7) ||
    maintNotifyCompleted !== (maintenanceSettings?.notifyCompleted ?? true);

  const idleDirty =
    idleEnabled !== (idleSettings?.enabled ?? false) ||
    parseEmails(idleEmails).join(',') !== (idleSettings?.alertEmails || []).join(',') ||
    idleDays !== (idleSettings?.idleDays ?? 30);

  // ---- Summary line ----
  const configuredCount = [!!parseEmails(licenseEmails).length, !!parseEmails(campoEmails).length, !!parseEmails(loanEmails).length, !!parseEmails(maintEmails).length, !!parseEmails(idleEmails).length].filter(Boolean).length;
  const activeCount = [licenseEnabled, campoEnabled, loanEnabled, maintEnabled, idleEnabled].filter(Boolean).length;
  const needsConfigCount = 5 - configuredCount;
  const summaryParts: string[] = [];
  if (configuredCount > 0) summaryParts.push(`${configuredCount} automações configuradas`);
  else summaryParts.push('Nenhuma automação configurada ainda');
  summaryParts.push(`${activeCount} ativa${activeCount === 1 ? '' : 's'}`);
  if (needsConfigCount > 0) summaryParts.push(`${needsConfigCount} requer${needsConfigCount === 1 ? '' : 'em'} configuração`);

  // ---- Histories ----
  const licenseHistory: AlertHistoryEntry[] = alertSettings?.history || [];
  const loanHistory: AlertHistoryEntry[] = loanSettings?.history || [];
  const campoHistory: AlertHistoryEntry[] = campoSettings?.history || [];
  const maintHistory: AlertHistoryEntry[] = maintenanceSettings?.history || [];
  const idleHistory: AlertHistoryEntry[] = idleSettings?.history || [];

  // ---- Live computed status for new alerts ----
  const overdueMaintenances = useMemo(
    () => getOverdueMaintenances(maintenances, maintOverdueDays),
    [maintenances, maintOverdueDays]
  );
  const idleComponents = useMemo(
    () => getIdleComponents(components, movements, idleDays),
    [components, movements, idleDays]
  );

  // ---- Collapsed card summaries ----
  const licensesSummary = `${parseEmails(licenseEmails).length} destinatário(s) · ${expiringSoonCount} assinatura(s) vencendo em 30 dias`;
  const campoSummary = report.pendingMachinesCount === 0 ? 'Sem pendências no ciclo atual' : `${report.pendingMachinesCount} pendência(s) no ciclo atual`;
  const loansSummary = overdueLoans.length === 0 ? 'Nenhum empréstimo vencido' : `${overdueLoans.length} empréstimo(s) vencido(s)`;
  const maintSummary = `${overdueMaintenances.length} atrasada(s)${maintNotifyCompleted ? ' · conclusões avisadas' : ''}`;
  const idleSummary = idleComponents.length === 0 ? 'Nenhum componente ocioso' : `${idleComponents.length} componente(s) ocioso(s)`;

  // ============================================================
  // Licenses
  // ============================================================
  const lastLicenseSent = [alertSettings?.lastSent15, alertSettings?.lastSent30, alertSettings?.lastSent60, alertSettings?.lastSentExpired]
    .filter(Boolean)
    .sort()
    .pop();

  const handleSaveLicenses = async () => {
    const emails = parseEmails(licenseEmails);
    if (hasInvalidEmail(licenseEmails)) {
      showDialog({
        title: 'E-mail(s) inválido(s)',
        message: 'Verifique os e-mails informados (separados por vírgula). Ex.: gestor@fazenda.com.br, suprimentos@fazenda.com.br',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    if (licenseEnabled && emails.length === 0) {
      showDialog({
        title: 'E-mail de destino não informado',
        message: 'Informe ao menos um e-mail que receberá os alertas antes de ativar esta automação.',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    if (!licenseEnabled) {
      setLicThresholds(prev => ({ '15': true, '30': true, '60': true }));
    }
    setIsSavingLicenses(true);
    try {
      const newSettings: LicenseSettings = {
        alertEmails: licenseEnabled ? emails : [],
        enabled: licenseEnabled,
        thresholds: licenseEnabled ? { ...licThresholds } : { '15': true, '30': true, '60': true },
        notifyExpired: licenseEnabled ? licenseNotifyExpired : false,
        lastSentExpired: alertSettings?.lastSentExpired || '',
        lastSent15: alertSettings?.lastSent15 || '',
        lastSent30: alertSettings?.lastSent30 || '',
        lastSent60: alertSettings?.lastSent60 || '',
        history: alertSettings?.history || [],
        updatedAt: new Date().toISOString(),
        updatedBy
      };
      await saveAlertSettings(newSettings);
      showToast('success', licenseEnabled ? 'Automação de vencimento de licenças ativada.' : 'Automação de vencimento de licenças desativada.');
    } catch (err: any) {
      showToast('error', 'Erro ao salvar configurações de licenças: ' + (err.message || ''));
    } finally {
      setIsSavingLicenses(false);
    }
  };

  const handleSendLicenseTest = async () => {
    const emails = parseEmails(licenseEmails);
    if (emails.length === 0) {
      showDialog({
        title: 'E-mail de destino não informado',
        message: 'Informe ao menos um e-mail que receberá o alerta de teste.',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    setIsSendingLicenseTest(true);
    try {
      const thresholds: Array<['15' | '30' | '60', number]> = [
        ['15', 15],
        ['30', 30],
        ['60', 60]
      ];
      const pending: { days: number; count: number }[] = [];
      let sentCount = 0;
      let simulated = false;

      for (const [key, days] of thresholds) {
        if (!licThresholds[key]) continue;
        const expiring = getLicensesExpiringInDays(licenses, days);
        if (expiring.length === 0) continue;
        const res = await sendLicenseExpirationEmail(emails, days, expiring);
        if (res.success) {
          sentCount += expiring.length;
          simulated = simulated || !!res.simulated;
          pending.push({ days, count: expiring.length });
        } else {
          throw new Error(`Erro enviando alerta de ${days} dias: ${res.message}`);
        }
      }

      if (licenseNotifyExpired) {
        const expired = licenses.filter(l => l.expirationDate && l.expirationDate < getTodayStr());
        if (expired.length > 0) {
          const res = await sendLicenseExpirationEmail(emails, 0, expired, 'expired');
          if (res.success) {
            sentCount += expired.length;
            simulated = simulated || !!res.simulated;
            pending.push({ days: 0, count: expired.length });
          } else {
            throw new Error(`Erro enviando alerta de licenças vencidas: ${res.message}`);
          }
        }
      }

      if (pending.length === 0) {
        showToast('info', 'Nenhuma licença vencendo nos próximos 15, 30 ou 60 dias (nem já vencida). Nada a enviar.');
      } else if (simulated) {
        showToast('info', `Alerta de teste simulado (SMTP não configurado). Detalhes impressos no console do servidor.`);
      } else {
        showToast('success', `Alerta de teste enviado com ${sentCount} licença(s) para ${emails.join(', ')}.`);
      }
    } catch (err: any) {
      showToast('error', 'Erro ao enviar alerta de teste: ' + (err.message || ''));
    } finally {
      setIsSendingLicenseTest(false);
    }
  };

  // ============================================================
  // Campo
  // ============================================================
  const lastCampoSentLabel = campoSettings?.lastSentWeek
    ? getWeekFormattedLabel(campoSettings.lastSentWeek)
    : 'Nunca';

  const handleSaveCampo = async () => {
    const emails = parseEmails(campoEmails);
    if (hasInvalidEmail(campoEmails)) {
      showDialog({
        title: 'E-mail(s) inválido(s)',
        message: 'Verifique os e-mails informados (separados por vírgula). Ex.: gestao@fazenda.com.br, operacao@fazenda.com.br',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    if (campoEnabled && emails.length === 0) {
      showDialog({
        title: 'E-mail de destino não informado',
        message: 'Informe ao menos um e-mail que receberá o relatório semanal antes de ativar esta automação.',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    setIsSavingCampo(true);
    try {
      const newSettings: CampoAlertSettings = {
        alertEmails: campoEnabled ? emails : [],
        enabled: campoEnabled,
        scheduleDay: campoDay,
        scheduleTime: campoTime,
        lastSentWeek: campoEnabled ? (campoSettings?.lastSentWeek || '') : '',
        history: campoSettings?.history || [],
        updatedAt: new Date().toISOString(),
        updatedBy
      };
      await saveCampoSettings(newSettings);
      showToast('success', campoEnabled ? 'Automação de pendências de campo agendada.' : 'Automação de pendências de campo desativada.');
    } catch (err: any) {
      showToast('error', 'Erro ao salvar configurações de campo: ' + (err.message || ''));
    } finally {
      setIsSavingCampo(false);
    }
  };

  const handleOpenCampoConfirm = () => {
    const emails = parseEmails(campoEmails);
    if (emails.length === 0) {
      showDialog({
        title: 'E-mail de destino não informado',
        message: 'Informe ao menos um e-mail que receberá o relatório das frentes pendentes.',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    setShowCampoConfirm(true);
  };

  const handleConfirmSendCampo = async () => {
    const emails = parseEmails(campoEmails);
    setIsSendingCampo(true);
    try {
      const res = await sendFieldDataAlertEmail(emails, report);
      if (!res.success) throw new Error(res.message);
      setShowCampoConfirm(false);
      if (res.simulated) {
        showToast('info', 'Alerta simulado (SMTP não configurado). Relatório impresso no console do servidor.');
      } else {
        showToast('success', `Relatório de campo enviado para ${emails.join(', ')}.`);
      }
    } catch (err: any) {
      showToast('error', 'Falha ao enviar e-mail: ' + (err.message || ''));
    } finally {
      setIsSendingCampo(false);
    }
  };

  // ============================================================
  // Manutenções
  // ============================================================
  const lastMaintSentLabel = formatDateLabel(maintenanceSettings?.lastSentDate);

  const handleSaveMaint = async () => {
    const emails = parseEmails(maintEmails);
    if (hasInvalidEmail(maintEmails)) {
      showDialog({
        title: 'E-mail(s) inválido(s)',
        message: 'Verifique os e-mails informados (separados por vírgula).',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    if (maintEnabled && emails.length === 0) {
      showDialog({
        title: 'E-mail de destino não informado',
        message: 'Informe ao menos um e-mail que receberá os alertas de manutenções antes de ativar esta automação.',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    if (!maintEnabled) {
      setMaintNotifyCompleted(false);
    }
    setIsSavingMaint(true);
    try {
      const newSettings: MaintenanceAlertSettings = {
        alertEmails: maintEnabled ? emails : [],
        enabled: maintEnabled,
        overdueDays: maintOverdueDays || 7,
        notifyCompleted: maintEnabled ? maintNotifyCompleted : false,
        lastSentDate: maintenanceSettings?.lastSentDate || '',
        notifiedIds: maintenanceSettings?.notifiedIds || [],
        history: maintenanceSettings?.history || [],
        updatedAt: new Date().toISOString(),
        updatedBy
      };
      await saveMaintenanceSettings(newSettings);
      showToast('success', maintEnabled ? 'Automação de manutenções ativada.' : 'Automação de manutenções desativada.');
    } catch (err: any) {
      showToast('error', 'Erro ao salvar configurações de manutenções: ' + (err.message || ''));
    } finally {
      setIsSavingMaint(false);
    }
  };

  const handleSendMaintNow = async () => {
    const emails = parseEmails(maintEmails);
    if (emails.length === 0) {
      showDialog({
        title: 'E-mail de destino não informado',
        message: 'Informe ao menos um e-mail que receberá os alertas de manutenções.',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    const overdue = getOverdueMaintenances(maintenances, maintOverdueDays);
    const completed = getCompletedMaintenances(maintenances, maintenanceSettings?.notifiedIds || []);
    if (overdue.length === 0 && completed.length === 0) {
      showToast('info', 'Nenhuma manutenção atrasada ou concluída recentemente. Nada a enviar.');
      return;
    }
    setIsSendingMaint(true);
    try {
      let simulated = false;
      if (overdue.length > 0) {
        const res = await sendMaintenanceAlertEmail(emails, overdue, 'overdue', maintOverdueDays);
        if (!res.success) throw new Error(res.message);
        simulated = simulated || !!res.simulated;
      }
      if (completed.length > 0) {
        const res = await sendMaintenanceAlertEmail(emails, completed, 'completed', maintOverdueDays);
        if (!res.success) throw new Error(res.message);
        simulated = simulated || !!res.simulated;
      }
      if (simulated) {
        showToast('info', 'Alerta simulado (SMTP não configurado). Detalhes impressos no console do servidor.');
      } else {
        showToast('success', `Alertas de manutenções enviados para ${emails.join(', ')}.`);
      }
    } catch (err: any) {
      showToast('error', 'Erro ao enviar alertas: ' + (err.message || ''));
    } finally {
      setIsSendingMaint(false);
    }
  };

  // ============================================================
  // Componentes ociosos
  // ============================================================
  const lastIdleSentLabel = formatDateLabel(idleSettings?.lastSentDate);

  const handleSaveIdle = async () => {
    const emails = parseEmails(idleEmails);
    if (hasInvalidEmail(idleEmails)) {
      showDialog({
        title: 'E-mail(s) inválido(s)',
        message: 'Verifique os e-mails informados (separados por vírgula).',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    if (idleEnabled && emails.length === 0) {
      showDialog({
        title: 'E-mail de destino não informado',
        message: 'Informe ao menos um e-mail que receberá os alertas de componentes ociosos antes de ativar esta automação.',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    setIsSavingIdle(true);
    try {
      const newSettings: IdleAlertSettings = {
        alertEmails: idleEnabled ? emails : [],
        enabled: idleEnabled,
        idleDays: idleDays || 30,
        lastSentDate: idleSettings?.lastSentDate || '',
        history: idleSettings?.history || [],
        updatedAt: new Date().toISOString(),
        updatedBy
      };
      await saveIdleSettings(newSettings);
      showToast('success', idleEnabled ? 'Automação de componentes ociosos ativada.' : 'Automação de componentes ociosos desativada.');
    } catch (err: any) {
      showToast('error', 'Erro ao salvar configurações de componentes ociosos: ' + (err.message || ''));
    } finally {
      setIsSavingIdle(false);
    }
  };

  const handleSendIdleNow = async () => {
    const emails = parseEmails(idleEmails);
    if (emails.length === 0) {
      showDialog({
        title: 'E-mail de destino não informado',
        message: 'Informe ao menos um e-mail que receberá os alertas de componentes ociosos.',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    const idleList = getIdleComponents(components, movements, idleDays);
    if (idleList.length === 0) {
      showToast('info', 'Nenhum componente ocioso no momento. Nada a enviar.');
      return;
    }
    setIsSendingIdle(true);
    try {
      const res = await sendIdleComponentsAlertEmail(emails, idleList, idleDays);
      if (!res.success) throw new Error(res.message);
      if (res.simulated) {
        showToast('info', 'Alerta simulado (SMTP não configurado). Detalhes impressos no console do servidor.');
      } else {
        showToast('success', `Alerta de ${idleList.length} componente(s) ocioso(s) enviado para ${emails.join(', ')}.`);
      }
    } catch (err: any) {
      showToast('error', 'Erro ao enviar alertas: ' + (err.message || ''));
    } finally {
      setIsSendingIdle(false);
    }
  };

  // ============================================================
  // Empréstimos
  // ============================================================
  const lastLoanSentLabel = formatDateLabel(loanSettings?.lastSentDate);

  const handleSaveLoans = async () => {
    const emails = parseEmails(loanEmails);
    if (hasInvalidEmail(loanEmails)) {
      showDialog({
        title: 'E-mail(s) inválido(s)',
        message: 'Verifique os e-mails informados (separados por vírgula).',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    if (loanEnabled && emails.length === 0) {
      showDialog({
        title: 'E-mail de destino não informado',
        message: 'Informe ao menos um e-mail que receberá os alertas de empréstimos vencidos.',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    setIsSavingLoans(true);
    try {
      const newSettings: LoanAlertSettings = {
        alertEmails: loanEnabled ? emails : [],
        enabled: loanEnabled,
        lastSentDate: loanSettings?.lastSentDate || '',
        history: loanSettings?.history || [],
        updatedAt: new Date().toISOString(),
        updatedBy
      };
      await saveLoanSettings(newSettings);
      showToast('success', loanEnabled ? 'Automação de empréstimos vencidos ativada.' : 'Automação de empréstimos vencidos desativada.');
    } catch (err: any) {
      showToast('error', 'Erro ao salvar configurações de empréstimos: ' + (err.message || ''));
    } finally {
      setIsSavingLoans(false);
    }
  };

  const handleSendLoansNow = async () => {
    const emails = parseEmails(loanEmails);
    if (emails.length === 0) {
      showDialog({
        title: 'E-mail de destino não informado',
        message: 'Informe ao menos um e-mail que receberá os alertas de empréstimos vencidos.',
        icon: 'warning',
        okLabel: 'Entendi'
      });
      return;
    }
    if (overdueLoans.length === 0) {
      showToast('info', 'Nenhum empréstimo vencido no momento. Nada a enviar.');
      return;
    }
    setIsSendingLoans(true);
    try {
      const res = await sendLoansAlertEmail(emails, overdueLoans);
      if (!res.success) throw new Error(res.message);
      if (res.simulated) {
        showToast('info', 'Alerta simulado (SMTP não configurado). Detalhes impressos no console do servidor.');
      } else {
        showToast('success', `Alerta de ${overdueLoans.length} empréstimo(s) vencido(s) enviado para ${emails.join(', ')}.`);
      }
    } catch (err: any) {
      showToast('error', 'Erro ao enviar alertas: ' + (err.message || ''));
    } finally {
      setIsSendingLoans(false);
    }
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-slate-600 leading-relaxed">
        Configure e acompanhe os alertas automáticos por e-mail do sistema. Cada cartão abaixo representa uma
        automação: ative, defina o destinatário e clique em <strong>Salvar alterações</strong>.
      </p>

      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 sm:px-4">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          {summaryParts[0]}
        </span>
        {summaryParts.slice(1).map((part, i) => (
          <span key={i} className="inline-flex items-center gap-1.5">
            <span className="text-slate-300">•</span>
            {part}
          </span>
        ))}
      </div>

      {/* ---------- Licenses ---------- */}
      <AutomationCard
        icon={<Key className="h-5 w-5" />}
        title="Vencimento de licenças"
        summary={licensesSummary}
        active={licenseEnabled}
        open={openCard === 'licenses'}
        onToggle={() => setOpenCard(openCard === 'licenses' ? null : 'licenses')}
        onOpenHow={() => setHowModal('licenses')}
        footer={
          <>
            {licenseDirty && (
              <span className="text-[10px] font-bold text-amber-600 mr-auto">Alterações não salvas</span>
            )}
            <button
              type="button"
              onClick={handleSendLicenseTest}
              disabled={!parseEmails(licenseEmails).length || isSendingLicenseTest}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              {isSendingLicenseTest ? 'Enviando...' : 'Enviar teste'}
            </button>
            <button
              type="button"
              onClick={handleSaveLicenses}
              disabled={isSavingLicenses}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {isSavingLicenses ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-700">Automação ativa</p>
              <p className="text-[11px] text-slate-400">
                {licenseEnabled
                  ? 'Recebe alertas automaticamente conforme a frequência abaixo.'
                  : 'Desativada — nenhum e-mail será enviado.'}
              </p>
            </div>
            <Toggle checked={licenseEnabled} onChange={setLicenseEnabled} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <FieldLabel>Destinatário</FieldLabel>
              <InputShell dimmed={!licenseEnabled}>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ex: suprimentos@fazenda.com.br, gestor@fazenda.com.br"
                    value={licenseEmails}
                    onChange={e => setLicenseEmails(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Separe vários destinatários por vírgula.</p>
              </InputShell>
            </div>
            <div>
              <FieldLabel>Frequência</FieldLabel>
              <InputShell dimmed={!licenseEnabled}>
                <div className="border border-slate-200 rounded-xl px-3 py-2 space-y-1.5">
                  {([60, 30, 15] as const).map(days => {
                    const key = String(days) as '15' | '30' | '60';
                    return (
                      <label key={days} className="flex items-center justify-between text-[11px] text-slate-600 cursor-pointer">
                        <span>{days} dias antes</span>
                        <input
                          type="checkbox"
                          checked={licThresholds[key]}
                          onChange={() => setLicThresholds(prev => ({ ...prev, [key]: !prev[key] }))}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </label>
                    );
                  })}
                </div>
              </InputShell>
            </div>
          </div>

          <InputShell dimmed={!licenseEnabled}>
            <label className="flex items-center justify-between gap-3 text-[11px] text-slate-600 cursor-pointer bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <span>
                <strong className="text-slate-700">Avisar também quando já vencidas</strong>
                <span className="block text-[10px] text-slate-400 mt-0.5">Envia alerta diário para licenças com data de vencimento passada.</span>
              </span>
              <input
                type="checkbox"
                checked={licenseNotifyExpired}
                onChange={e => setLicenseNotifyExpired(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
            </label>
          </InputShell>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <span>Quando envia: <strong className="text-slate-700">Automaticamente, 1x por dia</strong></span>
            <span>Próximo envio: <strong className="text-slate-700">Diário (varredura automática)</strong></span>
            <span>Último envio: <strong className="text-slate-700">{licenseHistory.length > 0 ? formatDateLabel(licenseHistory[licenseHistory.length - 1].date) : formatDateLabel(lastLicenseSent)}</strong></span>
            {licenseHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setHistoryModal('licenses')}
                className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                <History className="h-3.5 w-3.5" />
                Ver histórico
              </button>
            )}
          </div>
        </div>
      </AutomationCard>

      {/* ---------- Campo ---------- */}
      <AutomationCard
        icon={<ClipboardList className="h-5 w-5" />}
        title="Pendências de campo"
        summary={campoSummary}
        active={campoEnabled}
        open={openCard === 'campo'}
        onToggle={() => setOpenCard(openCard === 'campo' ? null : 'campo')}
        onOpenHow={() => setHowModal('campo')}
        footer={
          <>
            {campoDirty && (
              <span className="text-[10px] font-bold text-amber-600 mr-auto">Alterações não salvas</span>
            )}
            <button
              type="button"
              onClick={handleOpenCampoConfirm}
              disabled={!parseEmails(campoEmails).length || isSendingCampo}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              Enviar agora
            </button>
            <button
              type="button"
              onClick={handleSaveCampo}
              disabled={isSavingCampo}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {isSavingCampo ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-700">Automação ativa</p>
              <p className="text-[11px] text-slate-400">
                {campoEnabled
                  ? `Envia o relatório toda ${getWeekdayLabel(campoDay)} às ${campoTime}.`
                  : 'Desativada — nenhum relatório será enviado.'}
              </p>
            </div>
            <Toggle checked={campoEnabled} onChange={setCampoEnabled} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Destinatário</FieldLabel>
              <InputShell dimmed={!campoEnabled}>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ex: gestao@fazenda.com.br, operacao@fazenda.com.br"
                    value={campoEmails}
                    onChange={e => setCampoEmails(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Separe vários destinatários por vírgula.</p>
              </InputShell>
            </div>
            <div>
              <FieldLabel>Quando enviar</FieldLabel>
              <InputShell dimmed={!campoEnabled}>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <select
                      value={campoDay}
                      onChange={e => setCampoDay(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white rounded-xl text-xs text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer"
                    >
                      <option value="segunda">Toda Segunda-feira</option>
                      <option value="terca">Toda Terça-feira</option>
                      <option value="quarta">Toda Quarta-feira</option>
                      <option value="quinta">Toda Quinta-feira</option>
                      <option value="sexta">Toda Sexta-feira</option>
                      <option value="sabado">Todo Sábado</option>
                      <option value="domingo">Todo Domingo</option>
                    </select>
                  </div>
                  <input
                    type="time"
                    value={campoTime}
                    onChange={e => setCampoTime(e.target.value)}
                    className="w-32 px-3 py-2 border border-slate-300 bg-white rounded-xl text-xs text-slate-900 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>
              </InputShell>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <span>Quando envia: <strong className="text-slate-700">Toda {getWeekdayLabel(campoDay)} às {campoTime}</strong></span>
            <span>Próximo envio: <strong className="text-slate-700">{formatNextSendLabel(campoDay, campoTime)}</strong></span>
            <span>Último envio: <strong className="text-slate-700">{lastCampoSentLabel}</strong></span>
            {campoHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setHistoryModal('campo')}
                className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                <History className="h-3.5 w-3.5" />
                Ver histórico
              </button>
            )}
          </div>
        </div>
      </AutomationCard>

      {/* ---------- Empréstimos ---------- */}
      <AutomationCard
        icon={<Handshake className="h-5 w-5" />}
        title="Empréstimos vencidos"
        summary={loansSummary}
        active={loanEnabled}
        open={openCard === 'loans'}
        onToggle={() => setOpenCard(openCard === 'loans' ? null : 'loans')}
        onOpenHow={() => setHowModal('loans')}
        footer={
          <>
            {loansDirty && (
              <span className="text-[10px] font-bold text-amber-600 mr-auto">Alterações não salvas</span>
            )}
            <button
              type="button"
              onClick={handleSendLoansNow}
              disabled={!parseEmails(loanEmails).length || isSendingLoans}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              {isSendingLoans ? 'Enviando...' : 'Enviar agora'}
            </button>
            <button
              type="button"
              onClick={handleSaveLoans}
              disabled={isSavingLoans}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {isSavingLoans ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-700">Automação ativa</p>
              <p className="text-[11px] text-slate-400">
                {loanEnabled
                  ? 'Envia um aviso diário sempre que existirem empréstimos vencidos.'
                  : 'Desativada — nenhum aviso será enviado.'}
              </p>
            </div>
            <Toggle checked={loanEnabled} onChange={setLoanEnabled} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div>
              <FieldLabel>Destinatário</FieldLabel>
              <InputShell dimmed={!loanEnabled}>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ex: gestor@agrostockgps.com, almoxarifado@fazenda.com.br"
                    value={loanEmails}
                    onChange={e => setLoanEmails(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Separe vários destinatários por vírgula.</p>
              </InputShell>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <span>Quando envia: <strong className="text-slate-700">Automaticamente, 1x por dia</strong></span>
            <span>Próximo envio: <strong className="text-slate-700">Diário enquanto houver vencidos</strong></span>
            <span>Último envio: <strong className="text-slate-700">{lastLoanSentLabel}</strong></span>
            {loanHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setHistoryModal('loans')}
                className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                <History className="h-3.5 w-3.5" />
                Ver histórico
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span
                className={`font-bold px-2 py-0.5 rounded-full ${
                  overdueLoans.length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {overdueLoans.length === 0 ? '0 vencidos' : `${overdueLoans.length} vencido${overdueLoans.length === 1 ? '' : 's'}`}
              </span>
              <span>no momento</span>
            </span>
          </div>
        </div>
      </AutomationCard>

      {/* ---------- Manutenções ---------- */}
      <AutomationCard
        icon={<Wrench className="h-5 w-5" />}
        title="Manutenções atrasadas / concluídas"
        summary={maintSummary}
        active={maintEnabled}
        open={openCard === 'maintenance'}
        onToggle={() => setOpenCard(openCard === 'maintenance' ? null : 'maintenance')}
        onOpenHow={() => setHowModal('maintenance')}
        footer={
          <>
            {maintDirty && (
              <span className="text-[10px] font-bold text-amber-600 mr-auto">Alterações não salvas</span>
            )}
            <button
              type="button"
              onClick={handleSendMaintNow}
              disabled={!parseEmails(maintEmails).length || isSendingMaint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              {isSendingMaint ? 'Enviando...' : 'Enviar agora'}
            </button>
            <button
              type="button"
              onClick={handleSaveMaint}
              disabled={isSavingMaint}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {isSavingMaint ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-700">Automação ativa</p>
              <p className="text-[11px] text-slate-400">
                {maintEnabled
                  ? `Avisa manutenções paradas há mais de ${maintOverdueDays} dias e conclusões.`
                  : 'Desativada — nenhum aviso será enviado.'}
              </p>
            </div>
            <Toggle checked={maintEnabled} onChange={setMaintEnabled} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <FieldLabel>Destinatário</FieldLabel>
              <InputShell dimmed={!maintEnabled}>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ex: manutencao@fazenda.com.br, gestor@fazenda.com.br"
                    value={maintEmails}
                    onChange={e => setMaintEmails(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Separe vários destinatários por vírgula.</p>
              </InputShell>
            </div>
            <div>
              <FieldLabel>Permanência máxima</FieldLabel>
              <InputShell dimmed={!maintEnabled}>
                <div className="relative">
                  <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <select
                    value={maintOverdueDays}
                    onChange={e => setMaintOverdueDays(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white rounded-xl text-xs text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer"
                  >
                    <option value={3}>3 dias</option>
                    <option value={5}>5 dias</option>
                    <option value={7}>7 dias</option>
                    <option value={10}>10 dias</option>
                    <option value={15}>15 dias</option>
                    <option value={30}>30 dias</option>
                  </select>
                </div>
              </InputShell>
            </div>
          </div>

          <InputShell dimmed={!maintEnabled}>
            <label className="flex items-center justify-between gap-3 text-[11px] text-slate-600 cursor-pointer bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <span>
                <strong className="text-slate-700">Avisar quando uma manutenção for concluída</strong>
                <span className="block text-[10px] text-slate-400 mt-0.5">Cada manutenção é avisada apenas uma vez.</span>
              </span>
              <input
                type="checkbox"
                checked={maintNotifyCompleted}
                onChange={e => setMaintNotifyCompleted(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
            </label>
          </InputShell>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <span>Quando envia: <strong className="text-slate-700">Diariamente (atrasadas) + conclusões</strong></span>
            <span>Último envio: <strong className="text-slate-700">{lastMaintSentLabel}</strong></span>
            {maintHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setHistoryModal('maintenance')}
                className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                <History className="h-3.5 w-3.5" />
                Ver histórico
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span
                className={`font-bold px-2 py-0.5 rounded-full ${
                  overdueMaintenances.length > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {overdueMaintenances.length === 0 ? '0 atrasadas' : `${overdueMaintenances.length} atrasada${overdueMaintenances.length === 1 ? '' : 's'}`}
              </span>
              <span>no momento</span>
            </span>
          </div>
        </div>
      </AutomationCard>

      {/* ---------- Componentes ociosos ---------- */}
      <AutomationCard
        icon={<Boxes className="h-5 w-5" />}
        title="Componentes ociosos"
        summary={idleSummary}
        active={idleEnabled}
        open={openCard === 'idle'}
        onToggle={() => setOpenCard(openCard === 'idle' ? null : 'idle')}
        onOpenHow={() => setHowModal('idle')}
        footer={
          <>
            {idleDirty && (
              <span className="text-[10px] font-bold text-amber-600 mr-auto">Alterações não salvas</span>
            )}
            <button
              type="button"
              onClick={handleSendIdleNow}
              disabled={!parseEmails(idleEmails).length || isSendingIdle}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Send className="h-3.5 w-3.5" />
              {isSendingIdle ? 'Enviando...' : 'Enviar agora'}
            </button>
            <button
              type="button"
              onClick={handleSaveIdle}
              disabled={isSavingIdle}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" />
              {isSavingIdle ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-slate-700">Automação ativa</p>
              <p className="text-[11px] text-slate-400">
                {idleEnabled
                  ? `Avisa componentes disponíveis sem movimentação há ${idleDays} dias.`
                  : 'Desativada — nenhum aviso será enviado.'}
              </p>
            </div>
            <Toggle checked={idleEnabled} onChange={setIdleEnabled} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <FieldLabel>Destinatário</FieldLabel>
              <InputShell dimmed={!idleEnabled}>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="ex: almoxarifado@fazenda.com.br, gestor@fazenda.com.br"
                    value={idleEmails}
                    onChange={e => setIdleEmails(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white rounded-xl text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 text-xs"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">Separe vários destinatários por vírgula.</p>
              </InputShell>
            </div>
            <div>
              <FieldLabel>Dias sem movimento</FieldLabel>
              <InputShell dimmed={!idleEnabled}>
                <div className="relative">
                  <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <select
                    value={idleDays}
                    onChange={e => setIdleDays(Number(e.target.value))}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 bg-white rounded-xl text-xs text-slate-900 focus:ring-emerald-500 focus:border-emerald-500 cursor-pointer"
                  >
                    <option value={15}>15 dias</option>
                    <option value={30}>30 dias</option>
                    <option value={45}>45 dias</option>
                    <option value={60}>60 dias</option>
                    <option value={90}>90 dias</option>
                  </select>
                </div>
              </InputShell>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100">
            <span>Quando envia: <strong className="text-slate-700">Diariamente, 1x por dia</strong></span>
            <span>Último envio: <strong className="text-slate-700">{lastIdleSentLabel}</strong></span>
            {idleHistory.length > 0 && (
              <button
                type="button"
                onClick={() => setHistoryModal('idle')}
                className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                <History className="h-3.5 w-3.5" />
                Ver histórico
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span
                className={`font-bold px-2 py-0.5 rounded-full ${
                  idleComponents.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {idleComponents.length === 0 ? '0 ociosos' : `${idleComponents.length} ocioso${idleComponents.length === 1 ? '' : 's'}`}
              </span>
              <span>no momento</span>
            </span>
          </div>
        </div>
      </AutomationCard>

      {/* ---------- History modal ---------- */}
      {historyModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-slate-900">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <History className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Histórico de envios</h3>
                  <p className="text-xs text-slate-500">
                    {historyModal === 'licenses' && 'Vencimento de licenças'}
                    {historyModal === 'campo' && 'Pendências de campo'}
                    {historyModal === 'loans' && 'Empréstimos vencidos'}
                    {historyModal === 'maintenance' && 'Manutenções'}
                    {historyModal === 'idle' && 'Componentes ociosos'}
                  </p>
                </div>
              </div>
              <button onClick={() => setHistoryModal(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            {(() => {
              const historyEntries: AlertHistoryEntry[] =
                historyModal === 'licenses' ? licenseHistory
                : historyModal === 'campo' ? campoHistory
                : historyModal === 'loans' ? loanHistory
                : historyModal === 'maintenance' ? maintHistory
                : idleHistory;
              return (
            <div className="overflow-hidden border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-extrabold uppercase text-slate-400">
                    <th className="py-2 px-3">Data</th>
                    <th className="py-2 px-3">Tipo</th>
                    <th className="py-2 px-3">Destinatário</th>
                    <th className="py-2 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px] font-medium text-slate-700">
                  {historyEntries.map((entry, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-3">{entry.date ? new Date(entry.date).toLocaleString('pt-BR') : '—'}</td>
                      <td className="py-2 px-3">
                        {entry.type === '60' && '60 dias antes'}
                        {entry.type === '30' && '30 dias antes'}
                        {entry.type === '15' && '15 dias antes'}
                        {entry.type === 'expired' && 'Vencidas'}
                        {entry.type === 'loans' && 'Vencidos diário'}
                        {entry.type === 'campo' && 'Relatório semanal'}
                        {entry.type === 'maintenance_overdue' && 'Manutenção atrasada'}
                        {entry.type === 'maintenance_completed' && 'Manutenção concluída'}
                        {entry.type === 'idle' && 'Componentes ociosos'}
                      </td>
                      <td className="py-2 px-3 text-slate-500">{entry.recipient}</td>
                      <td className="py-2 px-3">
                        <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {entry.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {historyEntries.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-slate-400">Nenhum envio registrado até o momento.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
              );
            })()}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setHistoryModal(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- How it works modal ---------- */}
      {howModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-slate-900">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <HelpCircle className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">
                    {howModal === 'licenses' && 'Vencimento de licenças'}
                    {howModal === 'campo' && 'Pendências de campo'}
                    {howModal === 'loans' && 'Empréstimos vencidos'}
                    {howModal === 'maintenance' && 'Manutenções atrasadas / concluídas'}
                    {howModal === 'idle' && 'Componentes ociosos'}
                  </h3>
                  <p className="text-xs text-slate-500">Como funciona esta automação?</p>
                </div>
              </div>
              <button onClick={() => setHowModal(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="text-xs text-slate-600 leading-relaxed space-y-3">
              {howModal === 'licenses' && (
                <>
                  <p>
                    O sistema verifica automaticamente todas as licenças de sinal e ativações cadastradas e, quando
                    uma licença estiver para vencer, envia um e-mail com o <strong>nome, número de série e máquina
                    vinculada</strong> — com antecedência de 60, 30 ou 15 dias (você escolhe quais avisos quer receber).
                  </p>
                  <p>
                    A verificação acontece todos os dias. Cada prazo é avisado no máximo <strong>uma vez por dia</strong>,
                    evitando e-mails repetidos.
                  </p>
                </>
              )}
              {howModal === 'campo' && (
                <>
                  <p>
                    Todas as semanas o sistema consolida quais máquinas ainda não tiveram o recolhimento de dados de
                    campo concluído, agrupando por <strong>frente de trabalho</strong>.
                  </p>
                  <p>
                    No dia e horário configurados, envia o relatório com as frentes totalmente pendentes e as que estão
                    em andamento, para a equipe de gestão cobrar os técnicos antes do encerramento da semana.
                  </p>
                </>
              )}
              {howModal === 'loans' && (
                <>
                  <p>
                    O sistema acompanha os empréstimos de equipamentos a terceiros. Quando a <strong>previsão de retorno
                    já passou</strong>, envia um e-mail listando o contrato, responsável, empresa e equipamentos.
                  </p>
                  <p>
                    O aviso é enviado <strong>uma vez por dia</strong> enquanto existirem empréstimos vencidos, para cobrar a devolução ao almoxarifado.
                  </p>
                </>
              )}
              {howModal === 'maintenance' && (
                <>
                  <p>
                    O sistema acompanha as ordens de manutenção de componentes. Toda manutenção com status{' '}
                    <strong>"Em Manutenção"</strong> por mais de <strong>{maintOverdueDays} dias</strong> gera um alerta
                    diário até ser resolvida.
                  </p>
                  <p>
                    Quando uma manutenção é <strong>concluída</strong>, um aviso único é enviado (cada manutenção é
                    notificada apenas uma vez), mantendo a gestão informada sobre o retorno do equipamento.
                  </p>
                </>
              )}
              {howModal === 'idle' && (
                <>
                  <p>
                    O sistema verifica os componentes com status <strong>"Disponível"</strong> (em estoque) e calcula a
                    data do último movimento registrado, como instalação, remoção ou manutenção.
                  </p>
                  <p>
                    Componentes sem movimentação por mais de <strong>{idleDays} dias</strong> são listados em um alerta
                    diário, ajudando a identificar estoque parado e itens ociosos.
                  </p>
                </>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setHowModal(null)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Campo send confirmation modal ---------- */}
      {showCampoConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5 text-slate-900">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <Mail className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold">Enviar relatório agora?</h3>
                  <p className="text-xs text-slate-500">Relatório de pendências de campo — {report.weekLabel}</p>
                </div>
              </div>
              <button onClick={() => setShowCampoConfirm(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                <p><strong>Destinatário:</strong> <span className="text-emerald-700 font-bold">{parseEmails(campoEmails).join(', ')}</span></p>
                <p><strong>Ciclo semanal:</strong> {report.weekId}</p>
              </div>

              {report.pendingMachinesCount === 0 ? (
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  Todas as frentes foram concluídas nesta semana. Nada pendente.
                </div>
              ) : (
                <div className="border border-amber-200 bg-amber-50 p-3 rounded-xl space-y-2">
                  <p className="font-bold text-amber-800">
                    {report.pendingMachinesCount} máquina(s) com pendência:
                  </p>
                  <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {report.frentesPendente.map(f => (
                      <li key={f.frente} className="bg-white p-2 rounded-lg border border-amber-200 text-[11px]">
                        <strong className="text-slate-900">{f.frente}:</strong> {f.machines.length} máquina(s) 100% pendentes ({f.machines.join(', ')})
                      </li>
                    ))}
                    {report.frentesEmAndamento.map(f => (
                      <li key={f.frente} className="bg-white p-2 rounded-lg border border-blue-200 text-[11px]">
                        <strong className="text-slate-900">{f.frente}:</strong> Em andamento — {f.pendingCount} de {f.totalCount} pendente(s) ({f.machines.join(', ')})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end items-center gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCampoConfirm(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSendCampo}
                disabled={isSendingCampo}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Send className={`h-3.5 w-3.5 ${isSendingCampo ? 'animate-spin' : ''}`} />
                {isSendingCampo ? 'Enviando...' : 'Confirmar envio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
