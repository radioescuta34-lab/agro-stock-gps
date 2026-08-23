import React, { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  serverTimestamp,
  getDoc,
  query,
  where,
  getDocs,
  writeBatch,
  arrayRemove,
  arrayUnion,
  FieldValue
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { 
  AutopilotComponent, 
  Machine, 
  MovementLog, 
  UserProfile, 
  UserRole,
  License,
  ThirdParty,
  ComponentLoan,
  CompanyProfile,
  ComponentMaintenance,
  ComponentStatus,
  MaintenanceProvider,
  Partner,
  PartnerType,
  FieldDataCollection,
  DashboardNavPreset,
  MachineType,
  LicenseSettings,
  CampoAlertSettings,
  LoanAlertSettings,
  MaintenanceAlertSettings,
  IdleAlertSettings,
  AlertHistoryEntry,
  MovementStatus,
  MovementHistoryEntry,
  RegisteredType,
  RegisteredTypeCategory
} from './types';
import { DEFAULT_REGISTERED_TYPES, DEFAULT_TYPE_NAMES, CORE_SERVICE_ACTIONS } from './constants/typeRegistry';
import AuthScreen from './components/AuthScreen';
import { useNotifications } from './components/NotificationProvider';
import { hashPassword } from './utils/crypto';
import Dashboard from './components/Dashboard';
import ComponentsTab from './components/ComponentsTab';
import MachinesTab from './components/MachinesTab';
import MovementsTab from './components/MovementsTab';
import LicensesTab from './components/LicensesTab';
import LoansTab from './components/LoansTab';
import PartnersTab from './components/PartnersTab';
import ProfileTab from './components/ProfileTab';
import SupportTab from './components/SupportTab';
import SettingsTab from './components/SettingsTab';
import AppNotificationCenter from './components/AppNotificationCenter';
import { useLicenseAlertSettings } from './hooks/useLicenseAlertSettings';
import { useCampoAlertSettings } from './hooks/useCampoAlertSettings';
import { useLoanAlertSettings } from './hooks/useLoanAlertSettings';
import { useMaintenanceAlertSettings } from './hooks/useMaintenanceAlertSettings';
import { useIdleAlertSettings } from './hooks/useIdleAlertSettings';
import { getLicensesExpiringInDays, sendLicenseExpirationEmail } from './utils/licenseAlerts';
import { buildFieldDataReport, sendFieldDataAlertEmail } from './utils/fieldDataAlerts';
import { getOverdueLoans, sendLoansAlertEmail } from './utils/loansAlerts';
import { getOverdueMaintenances, getCompletedMaintenances, sendMaintenanceAlertEmail } from './utils/maintenanceAlerts';
import { getIdleComponents, sendIdleComponentsAlertEmail } from './utils/idleComponentsAlerts';
import { isCampoAlertDue, isLoansAlertDue, getTodayStr } from './utils/automationUtils';
import { getISOWeekId } from './utils/dateUtils';
import { 
  Cpu, 
  Tractor,
  Satellite,
  Wrench, 
  LogOut, 
  LayoutDashboard, 
  Menu, 
  X,
  Database,
  CloudLightning,
  CheckCircle2,
  Key,
  Handshake,
  User,
  Settings,
  LifeBuoy,
  ChevronDown,
  Building2
} from 'lucide-react';

const LOCAL_STORAGE_KEY_PREFIX = 'agro_stock_gps_';

const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: 'AGRO STOCK GPS LOGÍSTICA S.A.',
  tradingName: 'Agro Stock GPS',
  cnpj: '12.345.678/0001-90',
  phone: '(11) 99999-9999',
  email: 'contato@agrostockgps.com.br',
  address: 'Av. das Nações Unidas, 1000 - São Paulo, SP',
  updatedAt: new Date().toISOString(),
  updatedBy: 'Sistema'
};

const getComponentPlacementAfterOS = (
  movement: Pick<MovementLog, 'action' | 'machinePrefix'>,
  currentStatus: ComponentStatus,
  currentMachine: string
): { status: ComponentStatus; currentMachine: string } => {
  switch (movement.action) {
    case 'Instalação':
      return { status: 'Em Uso', currentMachine: movement.machinePrefix };
    case 'Remoção':
      return { status: 'Disponível', currentMachine: '' };
    case 'Manutenção':
      return { status: 'Manutenção', currentMachine: '' };
    case 'Calibração':
    default:
      return { status: currentStatus, currentMachine };
  }
};

export default function App() {
  const { showToast } = useNotifications();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isRegistrationsMenuOpen, setIsRegistrationsMenuOpen] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);

  // Core Data Lists
  const [components, setComponents] = useState<AutopilotComponent[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);
  const [loans, setLoans] = useState<ComponentLoan[]>([]);
  const [maintenances, setMaintenances] = useState<ComponentMaintenance[]>([]);
  const [providers, setProviders] = useState<MaintenanceProvider[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);
  const [fieldDataCollections, setFieldDataCollections] = useState<FieldDataCollection[]>([]);
  const [typeRegistry, setTypeRegistry] = useState<RegisteredType[]>([]);
  const [movementsSubTab, setMovementsSubTab] = useState<'os' | 'kanban' | undefined>(undefined);
  const [licensePresetFilter, setLicensePresetFilter] = useState<'active' | 'expired' | null>(null);
  const [componentPresetFilter, setComponentPresetFilter] = useState<DashboardNavPreset | null>(null);
  const [machinePresetFilter, setMachinePresetFilter] = useState<DashboardNavPreset | null>(null);
  const [kanbanPresetFilter, setKanbanPresetFilter] = useState<DashboardNavPreset | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ tab: string; itemId: string } | null>(null);

  const [loadingApp, setLoadingApp] = useState(true);
  const legacyPartnersMigrationStarted = useRef(false);

  // License alert settings (global background auto-scan)
  const { alertSettings: licenseAlertSettings, saveAlertSettings } = useLicenseAlertSettings(isDemoMode);
  const { campoSettings, saveCampoSettings } = useCampoAlertSettings(isDemoMode);
  const { loanSettings, saveLoanSettings } = useLoanAlertSettings(isDemoMode);
  const { maintenanceSettings, saveMaintenanceSettings } = useMaintenanceAlertSettings(isDemoMode);
  const { idleSettings, saveIdleSettings } = useIdleAlertSettings(isDemoMode);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const target = params.get('open');
    const focusParamMap: Record<string, string> = { support: 'ticket', licenses: 'license', components: 'component', loans: 'loan' };
    if (target && ['support', 'licenses', 'components', 'loans', 'movements'].includes(target)) {
      setCurrentTab(target);
      const focusParam = focusParamMap[target];
      const focusId = focusParam ? params.get(focusParam) : null;
      if (focusParam && focusId) {
        setFocusTarget({ tab: target, itemId: focusId });
        params.delete(focusParam);
      }
      params.delete('open');
      const cleanQuery = params.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ''}${window.location.hash}`);
    }
  }, [user?.uid]);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#user-menu-button') && !target.closest('#user-menu-dropdown')) {
        setIsUserMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsUserMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!isRegistrationsMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-registrations-menu]')) {
        setIsRegistrationsMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsRegistrationsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isRegistrationsMenuOpen]);

  useEffect(() => {
    if (!user || thirdParties.length === 0 || legacyPartnersMigrationStarted.current) return;
    const missingPartners = thirdParties.filter(tp => !partners.some(partner => partner.id === tp.id));
    if (missingPartners.length === 0) return;

    legacyPartnersMigrationStarted.current = true;
    const migrate = async () => {
      try {
        if (isDemoMode) {
          const migrated: Partner[] = missingPartners.map(tp => ({
            id: tp.id,
            legalName: tp.company || tp.name,
            tradingName: tp.name,
            personType: tp.document.replace(/\D/g, '').length <= 11 ? 'PF' : 'PJ',
            document: tp.document,
            phone: tp.phone,
            email: tp.email,
            cep: '',
            address: '',
            contactPerson: tp.name,
            contacts: [{ id: `legacy_${tp.id}`, name: tp.name, phone: tp.phone, email: tp.email }],
            types: ['Recebedor de empréstimo'],
            active: true,
            notes: 'Migrado do cadastro legado de terceiros.',
            createdAt: tp.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: user.name
          }));
          const updated = [...partners, ...migrated];
          setPartners(updated);
          saveDemoData('partners', updated);
          return;
        }

        await Promise.all(missingPartners.map(async tp => {
          const partnerRef = doc(db, 'partners', tp.id);
          if ((await getDoc(partnerRef)).exists()) return;
          await setDoc(partnerRef, {
            id: tp.id,
            legalName: tp.company || tp.name,
            tradingName: tp.name,
            personType: tp.document.replace(/\D/g, '').length <= 11 ? 'PF' : 'PJ',
            document: tp.document,
            phone: tp.phone,
            email: tp.email,
            cep: '',
            address: '',
            contactPerson: tp.name,
            contacts: [{ id: `legacy_${tp.id}`, name: tp.name, phone: tp.phone, email: tp.email }],
            types: ['Recebedor de empréstimo'],
            active: true,
            notes: 'Migrado do cadastro legado de terceiros.',
            createdAt: tp.createdAt || serverTimestamp(),
            updatedAt: serverTimestamp(),
            updatedBy: user.name || user.email || 'Sistema'
          });
        }));
      } catch (migrationError) {
        legacyPartnersMigrationStarted.current = false;
        console.error('Não foi possível migrar os terceiros legados para parceiros:', migrationError);
      }
    };
    void migrate();
  }, [isDemoMode, partners, thirdParties, user]);

  // Authenticated state listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setIsDemoMode(false);
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const docSnap = await getDoc(userDocRef);
          
          if (docSnap.exists()) {
            const data = docSnap.data();
            const storedRole = data.role as UserRole;
            const isSpecialEmail = firebaseUser.email === 'endriuse@hotmail.com' || firebaseUser.email === 'endriusernane@gmail.com' || firebaseUser.email === 'admin@agrostockgps.com';
            const finalRole = isSpecialEmail ? 'administrador' : storedRole;

            if (storedRole !== finalRole) {
              await updateDoc(userDocRef, { role: finalRole });
              data.role = finalRole;
            }

            setUser({
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: data.name || firebaseUser.displayName || 'Usuário',
              firstName: data.firstName || undefined,
              lastName: data.lastName || undefined,
              username: data.username || undefined,
              role: data.role as UserRole,
              photoURL: data.photoURL || undefined,
              createdAt: data.createdAt || new Date().toISOString()
            });
          } else {
            // Roll back user fallback
            const isSpecialEmail = firebaseUser.email === 'endriuse@hotmail.com' || firebaseUser.email === 'endriusernane@gmail.com' || firebaseUser.email === 'admin@agrostockgps.com';
            const fallbackProfile: UserProfile = {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
              role: isSpecialEmail ? 'administrador' : 'tecnico',
              createdAt: new Date().toISOString()
            };
            await setDoc(userDocRef, fallbackProfile);
            setUser(fallbackProfile);
          }
        } catch (err) {
          console.error('Error fetching user profile from Firestore', err);
          // Fallback user if database fails
          const isSpecialEmail = firebaseUser.email === 'endriuse@hotmail.com' || firebaseUser.email === 'endriusernane@gmail.com' || firebaseUser.email === 'admin@agrostockgps.com';
          setUser({
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuário',
            role: isSpecialEmail ? 'administrador' : 'tecnico',
            createdAt: new Date().toISOString()
          });
        }
      } else {
        // If not logged in and not in demo mode, clear user
        if (!isDemoMode) {
          setUser(null);
        }
      }
      setLoadingApp(false);
    });

    return () => unsubscribe();
  }, [isDemoMode]);

  // Global background auto-scan for expiring licenses (60/30/15 days) + expired — DEMO MODE ONLY
  // In production this is handled by the /api/cron/alerts server job.
  useEffect(() => {
    if (!isDemoMode) return;
    if (!licenses || licenses.length === 0 || !licenseAlertSettings) return;
    if (!licenseAlertSettings.enabled) return;
    if (!licenseAlertSettings.alertEmails || licenseAlertSettings.alertEmails.length === 0) return;

    const runAutoAlertCheck = async () => {
      const today = getTodayStr();
      const thresholds = licenseAlertSettings.thresholds || { '15': true, '30': true, '60': true };
      const updates: Partial<LicenseSettings> = {};
      const newHistory: AlertHistoryEntry[] = [...(licenseAlertSettings.history || [])];
      let hasUpdates = false;

      const attempts: Array<{ key: 'lastSent15' | 'lastSent30' | 'lastSent60'; type: '15' | '30' | '60'; days: number }> = [
        { key: 'lastSent15', type: '15', days: 15 },
        { key: 'lastSent30', type: '30', days: 30 },
        { key: 'lastSent60', type: '60', days: 60 }
      ];

      for (const attempt of attempts) {
        if (!thresholds[attempt.type]) continue;
        if (licenseAlertSettings[attempt.key] === today) continue;
        const expiring = getLicensesExpiringInDays(licenses, attempt.days);
        if (expiring.length === 0) continue;

        console.log(`[AutoAlert] Disparando e-mail de alerta de ${attempt.days} dias para: ${licenseAlertSettings.alertEmails.join(', ')}`);
        const res = await sendLicenseExpirationEmail(licenseAlertSettings.alertEmails, attempt.days, expiring);
        if (res.success) {
          updates[attempt.key] = today;
          newHistory.push({
            type: attempt.type,
            date: new Date().toISOString(),
            recipient: licenseAlertSettings.alertEmails.join(', '),
            status: 'Enviado'
          });
          hasUpdates = true;
        }
      }

      if (licenseAlertSettings.notifyExpired && licenseAlertSettings.lastSentExpired !== today) {
        const todayDate = getTodayStr();
        const expired = licenses.filter(l => l.expirationDate && l.expirationDate < todayDate);
        if (expired.length > 0) {
          const res = await sendLicenseExpirationEmail(licenseAlertSettings.alertEmails, 0, expired, 'expired');
          if (res.success) {
            updates.lastSentExpired = today;
            newHistory.push({
              type: 'expired',
              date: new Date().toISOString(),
              recipient: licenseAlertSettings.alertEmails.join(', '),
              status: 'Enviado'
            });
            hasUpdates = true;
          }
        }
      }

      if (hasUpdates) {
        if (newHistory.length > 50) newHistory.splice(0, newHistory.length - 50);
        const updatedByStr = user?.name || user?.email || 'Sistema';

        const newSettings: LicenseSettings = {
          ...licenseAlertSettings,
          ...updates,
          history: newHistory,
          updatedAt: new Date().toISOString(),
          updatedBy: updatedByStr
        };

        try {
          await saveAlertSettings(newSettings);
        } catch (err) {
          console.error("Erro ao salvar logs de alerta de licenças:", err);
        }
      }
    };

    const timer = setTimeout(() => {
      runAutoAlertCheck();
    }, 4000);

    return () => clearTimeout(timer);
  }, [licenses, licenseAlertSettings, isDemoMode, user, saveAlertSettings]);

  // Global background auto-scan for weekly field data pending fronts — DEMO MODE ONLY
  useEffect(() => {
    if (!isDemoMode) return;
    if (!machines || machines.length === 0 || !campoSettings || !campoSettings.enabled) return;
    if (!campoSettings.alertEmails || campoSettings.alertEmails.length === 0) return;

    const runCampoCheck = async () => {
      if (!isCampoAlertDue(campoSettings)) return;

      const report = buildFieldDataReport(machines, fieldDataCollections, getISOWeekId(new Date()));
      if (report.pendingMachinesCount === 0) return;

      console.log(`[AutoAlert] Disparando e-mail de pendências de campo para: ${campoSettings.alertEmails.join(', ')}`);
      const res = await sendFieldDataAlertEmail(campoSettings.alertEmails, report);
      if (res.success) {
        const newHistory: AlertHistoryEntry[] = [...(campoSettings.history || [])];
        newHistory.push({
          type: 'campo',
          date: new Date().toISOString(),
          recipient: campoSettings.alertEmails.join(', '),
          status: 'Enviado'
        });
        if (newHistory.length > 50) newHistory.splice(0, newHistory.length - 50);

        const updated: CampoAlertSettings = {
          ...campoSettings,
          lastSentWeek: report.weekId,
          history: newHistory,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.name || user?.email || 'Sistema'
        };
        try {
          await saveCampoSettings(updated);
        } catch (err) {
          console.error("Erro ao salvar configurações de alerta de campo:", err);
        }
      }
    };

    const timer = setTimeout(() => {
      runCampoCheck();
    }, 4000);

    return () => clearTimeout(timer);
  }, [machines, fieldDataCollections, campoSettings, isDemoMode, user, saveCampoSettings]);

  // Global background auto-scan for overdue loans (once per day) — DEMO MODE ONLY
  useEffect(() => {
    if (!isDemoMode) return;
    if (!loans || loans.length === 0 || !loanSettings || !loanSettings.enabled) return;
    if (!loanSettings.alertEmails || loanSettings.alertEmails.length === 0) return;

    const runLoansCheck = async () => {
      const overdue = getOverdueLoans(loans);
      if (!isLoansAlertDue(loanSettings.enabled, loanSettings.lastSentDate, overdue.length)) return;

      console.log(`[AutoAlert] Disparando e-mail de empréstimos vencidos para: ${loanSettings.alertEmails.join(', ')}`);
      const res = await sendLoansAlertEmail(loanSettings.alertEmails, overdue);
      if (res.success) {
        const newHistory: AlertHistoryEntry[] = [...(loanSettings.history || [])];
        newHistory.push({
          type: 'loans',
          date: new Date().toISOString(),
          recipient: loanSettings.alertEmails.join(', '),
          status: 'Enviado'
        });
        if (newHistory.length > 50) newHistory.splice(0, newHistory.length - 50);

        const updated: LoanAlertSettings = {
          ...loanSettings,
          lastSentDate: getTodayStr(),
          history: newHistory,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.name || user?.email || 'Sistema'
        };
        try {
          await saveLoanSettings(updated);
        } catch (err) {
          console.error("Erro ao salvar configurações de alerta de empréstimos:", err);
        }
      }
    };

    const timer = setTimeout(() => {
      runLoansCheck();
    }, 4000);

    return () => clearTimeout(timer);
  }, [loans, loanSettings, isDemoMode, user, saveLoanSettings]);

  // Global background auto-scan for maintenances (overdue daily + completed once) — DEMO MODE ONLY
  useEffect(() => {
    if (!isDemoMode) return;
    if (!maintenances || maintenances.length === 0 || !maintenanceSettings || !maintenanceSettings.enabled) return;
    if (!maintenanceSettings.alertEmails || maintenanceSettings.alertEmails.length === 0) return;

    const runMaintenanceCheck = async () => {
      const today = getTodayStr();
      const newHistory: AlertHistoryEntry[] = [...(maintenanceSettings.history || [])];
      let notifiedIds = [...(maintenanceSettings.notifiedIds || [])];
      let updated = false;

      if (maintenanceSettings.lastSentDate !== today) {
        const overdue = getOverdueMaintenances(maintenances, maintenanceSettings.overdueDays);
        if (overdue.length > 0) {
          const res = await sendMaintenanceAlertEmail(maintenanceSettings.alertEmails, overdue, 'overdue', maintenanceSettings.overdueDays);
          if (res.success) {
            newHistory.push({
              type: 'maintenance_overdue',
              date: new Date().toISOString(),
              recipient: maintenanceSettings.alertEmails.join(', '),
              status: 'Enviado'
            });
            updated = true;
          }
        }
      }

      if (maintenanceSettings.notifyCompleted) {
        const completed = getCompletedMaintenances(maintenances, notifiedIds);
        if (completed.length > 0) {
          const res = await sendMaintenanceAlertEmail(maintenanceSettings.alertEmails, completed, 'completed', maintenanceSettings.overdueDays);
          if (res.success) {
            completed.forEach(m => {
              if (!notifiedIds.includes(m.id)) notifiedIds.push(m.id);
            });
            newHistory.push({
              type: 'maintenance_completed',
              date: new Date().toISOString(),
              recipient: maintenanceSettings.alertEmails.join(', '),
              status: 'Enviado'
            });
            updated = true;
          }
        }
      }

      if (updated) {
        if (newHistory.length > 50) newHistory.splice(0, newHistory.length - 50);
        if (notifiedIds.length > 100) notifiedIds.splice(0, notifiedIds.length - 100);
        const updatedSettings: MaintenanceAlertSettings = {
          ...maintenanceSettings,
          lastSentDate: today,
          notifiedIds,
          history: newHistory,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.name || user?.email || 'Sistema'
        };
        try {
          await saveMaintenanceSettings(updatedSettings);
        } catch (err) {
          console.error("Erro ao salvar configurações de alerta de manutenções:", err);
        }
      }
    };

    const timer = setTimeout(() => {
      runMaintenanceCheck();
    }, 4000);

    return () => clearTimeout(timer);
  }, [maintenances, maintenanceSettings, isDemoMode, user, saveMaintenanceSettings]);

  // Global background auto-scan for idle components (daily) — DEMO MODE ONLY
  useEffect(() => {
    if (!isDemoMode) return;
    if (!components || components.length === 0 || !idleSettings || !idleSettings.enabled) return;
    if (!idleSettings.alertEmails || idleSettings.alertEmails.length === 0) return;

    const runIdleCheck = async () => {
      const today = getTodayStr();
      if (idleSettings.lastSentDate === today) return;

      const idleComponents = getIdleComponents(components, movements, idleSettings.idleDays);
      if (idleComponents.length === 0) return;

      const res = await sendIdleComponentsAlertEmail(idleSettings.alertEmails, idleComponents, idleSettings.idleDays);
      if (res.success) {
        const newHistory: AlertHistoryEntry[] = [...(idleSettings.history || [])];
        newHistory.push({
          type: 'idle',
          date: new Date().toISOString(),
          recipient: idleSettings.alertEmails.join(', '),
          status: 'Enviado'
        });
        if (newHistory.length > 50) newHistory.splice(0, newHistory.length - 50);

        const updated: IdleAlertSettings = {
          ...idleSettings,
          lastSentDate: today,
          history: newHistory,
          updatedAt: new Date().toISOString(),
          updatedBy: user?.name || user?.email || 'Sistema'
        };
        try {
          await saveIdleSettings(updated);
        } catch (err) {
          console.error("Erro ao salvar configurações de alerta de componentes ociosos:", err);
        }
      }
    };

    const timer = setTimeout(() => {
      runIdleCheck();
    }, 4000);

    return () => clearTimeout(timer);
  }, [components, movements, idleSettings, isDemoMode, user, saveIdleSettings]);

  // Real-time Firestore Listeners (only when authenticated with Firestore and NOT in demo mode)
  useEffect(() => {
    if (!user || isDemoMode) return;

    // Components Listener
    const unsubComponents = onSnapshot(
      collection(db, 'components'),
      (snapshot) => {
        const list: AutopilotComponent[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            serialNumber: data.serialNumber || '',
            name: data.name || '',
            brand: data.brand || 'Trimble',
            type: data.type || '',
            status: data.status || 'Disponível',
            currentMachine: data.currentMachine || '',
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy || ''
          });
        });
        setComponents(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'components');
      }
    );

    // Machines Listener
    const unsubMachines = onSnapshot(
      collection(db, 'machines'),
      (snapshot) => {
        const list: Machine[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            prefix: data.prefix || '',
            type: data.type || 'Trator',
            model: data.model || '',
            brand: data.brand || '',
            fleet: data.fleet || '',
            updatedAt: data.updatedAt
          });
        });
        setMachines(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'machines');
      }
    );

    // Movements Listener
    const unsubMovements = onSnapshot(
      collection(db, 'movements'),
      (snapshot) => {
        const list: MovementLog[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            componentId: data.componentId || '',
            componentSerial: data.componentSerial || '',
            componentName: data.componentName || '',
            machineId: data.machineId || undefined,
            machinePrefix: data.machinePrefix || '',
            action: data.action || 'Instalação',
            technicianId: data.technicianId || '',
            technicianName: data.technicianName || '',
            date: data.date,
            notes: data.notes || '',
            createdAt: data.createdAt,
            osNumber: data.osNumber,
            status: data.status,
            history: data.history,
            completedAt: data.completedAt,
            cancelledAt: data.cancelledAt,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy
          });
        });
        setMovements(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'movements');
      }
    );

    // Field Data Collections Listener
    const unsubFieldData = onSnapshot(
      collection(db, 'field_data_collections'),
      (snapshot) => {
        const list: FieldDataCollection[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            machineId: data.machineId || '',
            machinePrefix: data.machinePrefix || '',
            machineBrand: data.machineBrand || '',
            machineModel: data.machineModel || '',
            machineType: data.machineType || undefined,
            fleet: data.fleet || data.frente || '',
            frente: data.frente || data.fleet || '',
            weekId: data.weekId || '',
            status: data.status || 'Pendente',
            collectedAt: data.collectedAt || undefined,
            collectedBy: data.collectedBy || undefined,
            history: data.history || [],
            createdAt: data.createdAt || undefined,
            notes: data.notes || '',
            updatedAt: data.updatedAt || new Date().toISOString()
          });
        });
        setFieldDataCollections(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'field_data_collections');
      }
    );

    // Licenses Listener
    const unsubLicenses = onSnapshot(
      collection(db, 'licenses'),
      (snapshot) => {
        const list: License[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            name: data.name || '',
            brand: data.brand || 'Trimble',
            type: data.type || 'Assinatura de Sinal',
            code: data.code || '',
            status: data.status || 'Ativa',
            associatedComponentSerial: data.associatedComponentSerial || '',
            associatedMachinePrefix: data.associatedMachinePrefix || '',
            expirationDate: data.expirationDate || '',
            startDate: data.startDate || '',
            deviceSerialNumber: data.deviceSerialNumber || '',
            deviceModel: data.deviceModel || '',
            masterUnlockKey: data.masterUnlockKey || '',
            unlockStatus: data.unlockStatus || (data.unlockedAt ? 'desbloqueado' : 'pendente'),
            unlockedAt: data.unlockedAt || '',
            unlockedBy: data.unlockedBy || '',
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy || ''
          });
        });
        setLicenses(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'licenses');
      }
    );

    // One-time compatibility read used only to migrate legacy third parties.
    const unsubThirdParties = () => undefined;
    void getDocs(collection(db, 'third_parties'))
      .then((snapshot) => {
        const list: ThirdParty[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            name: data.name || '',
            document: data.document || '',
            phone: data.phone || '',
            email: data.email || '',
            company: data.company || '',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy || ''
          });
        });
        setThirdParties(list);
      })
      .catch((error) => {
        handleFirestoreError(error, OperationType.LIST, 'third_parties');
      });

    // Loans Listener
    const unsubLoans = onSnapshot(
      collection(db, 'loans'),
      (snapshot) => {
        const list: ComponentLoan[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            thirdPartyId: data.thirdPartyId || '',
            thirdPartyName: data.thirdPartyName || '',
            thirdPartyDocument: data.thirdPartyDocument || '',
            thirdPartyCompany: data.thirdPartyCompany || '',
            items: data.items || [],
            loanDate: data.loanDate || '',
            estimatedReturnDate: data.estimatedReturnDate || '',
            actualReturnDate: data.actualReturnDate || '',
            status: data.status || 'Ativo',
            contractNumber: data.contractNumber || '',
            notes: data.notes || '',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy || ''
          });
        });
        setLoans(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'loans');
      }
    );

    // Maintenances Listener
    const unsubMaintenances = onSnapshot(
      collection(db, 'maintenances'),
      (snapshot) => {
        const list: ComponentMaintenance[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            componentId: data.componentId || '',
            componentSerial: data.componentSerial || '',
            componentName: data.componentName || '',
            componentBrand: data.componentBrand || 'Trimble',
            componentType: data.componentType || '',
            sentDate: data.sentDate || '',
            returnDate: data.returnDate || '',
            providerId: data.providerId || '',
            providerName: data.providerName || '',
            issueDescription: data.issueDescription || '',
            replacedParts: data.replacedParts || '',
            servicesPerformed: data.servicesPerformed || '',
            cost: data.cost || 0,
            status: data.status || 'Em Manutenção',
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy || ''
          });
        });
        setMaintenances(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'maintenances');
      }
    );

    // Providers Listener
    const unsubProviders = onSnapshot(
      collection(db, 'providers'),
      (snapshot) => {
        const list: MaintenanceProvider[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            name: data.name || '',
            phone: data.phone || '',
            email: data.email || '',
            address: data.address || '',
            contactPerson: data.contactPerson || '',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy || ''
          });
        });
        setProviders(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'providers');
      }
    );

    const unsubPartners = onSnapshot(
      collection(db, 'partners'),
      (snapshot) => {
        const list: Partner[] = [];
        snapshot.forEach((entry) => {
          const data = entry.data();
          list.push({
            id: entry.id,
            legalName: data.legalName || '',
            tradingName: data.tradingName || '',
            personType: data.personType === 'PF' ? 'PF' : data.personType === 'PJ' ? 'PJ' : (String(data.document || '').replace(/\D/g, '').length <= 11 ? 'PF' : 'PJ'),
            document: data.document || '',
            phone: data.phone || '',
            email: data.email || '',
            cep: data.cep || '',
            address: data.address || '',
            contactPerson: data.contactPerson || '',
            contacts: Array.isArray(data.contacts) ? data.contacts : [],
            types: Array.isArray(data.types) ? data.types : [],
            active: data.active !== false,
            notes: data.notes || '',
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy || ''
          });
        });
        setPartners(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'partners')
    );

    // Type Registry Listener
    const unsubTypeRegistry = onSnapshot(
      collection(db, 'type_registry'),
      (snapshot) => {
        const list: RegisteredType[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          // Normalize legacy category: equipment_machine → vehicle
          const category = data.category === 'equipment_machine' ? 'vehicle' : (data.category || 'partner');
          list.push({
            id: d.id,
            category: category as RegisteredTypeCategory,
            name: data.name || '',
            active: data.active !== false,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy || ''
          });
        });
        setTypeRegistry(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'type_registry')
    );

    // Company Profile Listener
    const unsubCompany = onSnapshot(
      doc(db, 'settings', 'company'),
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setCompanyProfile({
            name: data.name || DEFAULT_COMPANY_PROFILE.name,
            tradingName: data.tradingName || DEFAULT_COMPANY_PROFILE.tradingName || '',
            cnpj: data.cnpj || DEFAULT_COMPANY_PROFILE.cnpj,
            phone: data.phone || DEFAULT_COMPANY_PROFILE.phone || '',
            email: data.email || DEFAULT_COMPANY_PROFILE.email || '',
            address: data.address || DEFAULT_COMPANY_PROFILE.address || '',
            logoUrl: data.logoUrl || '',
            updatedAt: data.updatedAt || DEFAULT_COMPANY_PROFILE.updatedAt,
            updatedBy: data.updatedBy || DEFAULT_COMPANY_PROFILE.updatedBy
          });
        } else {
          setCompanyProfile(DEFAULT_COMPANY_PROFILE);
        }
      },
      (error) => {
        console.error("Error loading company profile:", error);
      }
    );

    // Users List Listener (only for Admin)
    let unsubUsers = () => {};
    if (user.role === 'administrador' || user.role === 'ADMINISTRADOR') {
      unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          const list: UserProfile[] = [];
          snapshot.forEach((d) => {
            const data = d.data();
            list.push({
              uid: d.id,
              email: data.email || '',
              name: data.name || '',
              firstName: data.firstName || '',
              lastName: data.lastName || '',
              username: data.username || '',
              passwordEncrypted: data.passwordEncrypted || '',
              role: (data.role === 'administrador' ? 'ADMINISTRADOR' : (data.role === 'tecnico' ? 'TECNICO_CAMPO' : data.role)) as UserRole,
              photoURL: data.photoURL || '',
              createdAt: data.createdAt || new Date().toISOString()
            });
          });
          setUsersList(list);
        },
        (error) => {
          console.error("Error loading users list:", error);
        }
      );
    }

    return () => {
      unsubComponents();
      unsubMachines();
      unsubMovements();
      unsubFieldData();
      unsubLicenses();
      unsubThirdParties();
      unsubLoans();
      unsubMaintenances();
      unsubProviders();
      unsubPartners();
      unsubTypeRegistry();
      unsubCompany();
      unsubUsers();
    };
  }, [user, isDemoMode]);

  // Background auto-elevation for endriuse@hotmail.com
  useEffect(() => {
    if (!user || isDemoMode || !(user.role === 'administrador' || user.role === 'ADMINISTRADOR')) return;

    const elevateSpecialUser = async () => {
      try {
        const q = query(collection(db, 'users'), where('email', '==', 'endriuse@hotmail.com'));
        const snap = await getDocs(q);
        
        for (const d of snap.docs) {
          const uData = d.data();
          if (uData.role !== 'administrador') {
            console.log(`Auto-elevating user endriuse@hotmail.com (${d.id}) to administrator...`);
            await updateDoc(doc(db, 'users', d.id), { role: 'administrador' });
            console.log("Elevation completed successfully!");
          }
        }
      } catch (err) {
        console.error("Error in background user auto-elevation:", err);
      }
    };

    elevateSpecialUser();
  }, [user, isDemoMode]);

  // Local storage management for Demo Mode
  useEffect(() => {
    if (!isDemoMode) return;

    // Load from local storage or set empty
    const localComponents = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}components`);
    const localMachines = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}machines`);
    const localMovements = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}movements`);
    const localLicenses = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}licenses`);
    const localThirdParties = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}third_parties`);
    const localLoans = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}loans`);
    const localMaintenances = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}maintenances`);
    const localProviders = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}providers`);
    const localPartners = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}partners`);
    const localCompany = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}company_profile`);
    const localUsers = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}users`);
    const localFieldData = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}field_data_collections`);
    const localTypeRegistry = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}type_registry`);
 
    if (localComponents) setComponents(JSON.parse(localComponents));
    if (localMachines) setMachines(JSON.parse(localMachines));
    if (localMovements) setMovements(JSON.parse(localMovements));
    if (localLicenses) setLicenses(JSON.parse(localLicenses));
    if (localThirdParties) setThirdParties(JSON.parse(localThirdParties));
    if (localLoans) setLoans(JSON.parse(localLoans));
    if (localMaintenances) setMaintenances(JSON.parse(localMaintenances));
    if (localProviders) setProviders(JSON.parse(localProviders));
    if (localPartners) setPartners(JSON.parse(localPartners));
    if (localFieldData) setFieldDataCollections(JSON.parse(localFieldData));
    if (localTypeRegistry) {
      // Normalize legacy category: equipment_machine → vehicle
      const parsed = JSON.parse(localTypeRegistry);
      const normalized = parsed.map((t: RegisteredType) => ({
        ...t,
        category: ((t as any).category === 'equipment_machine' ? 'vehicle' : t.category) as RegisteredTypeCategory
      }));
      setTypeRegistry(normalized);
    } else {
      setTypeRegistry(DEFAULT_REGISTERED_TYPES);
    }
    if (localCompany) {
      setCompanyProfile(JSON.parse(localCompany));
    } else {
      setCompanyProfile(DEFAULT_COMPANY_PROFILE);
    }

    if (localUsers) {
      setUsersList(JSON.parse(localUsers));
    } else {
      const initialUsers: UserProfile[] = [
        { 
          uid: 'demo_user_carlos', 
          email: 'carlos.admin@agrostock.com.br', 
          name: 'Carlos Santos (Demo)', 
          firstName: 'Carlos',
          lastName: 'Santos (Demo)',
          username: 'carlossantos',
          role: 'ADMINISTRADOR', 
          createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() 
        },
        { 
          uid: 'demo_user_felipe', 
          email: 'felipe.tecnico@agrostock.com.br', 
          name: 'Felipe Neves (Demo)', 
          firstName: 'Felipe',
          lastName: 'Neves (Demo)',
          username: 'felipeneves',
          role: 'TECNICO_CAMPO', 
          createdAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString() 
        },
        { 
          uid: 'demo_user_rodrigo', 
          email: 'rodrigo.tecnico@agrostock.com.br', 
          name: 'Rodrigo Antunes (Demo)', 
          firstName: 'Rodrigo',
          lastName: 'Antunes (Demo)',
          username: 'rodrigoantunes',
          role: 'TECNICO_CAMPO', 
          createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString() 
        }
      ];
      setUsersList(initialUsers);
      saveDemoData('users', initialUsers);
    }
  }, [isDemoMode]);

  // Sync demo mode states to localStorage
  const saveDemoData = (type: 'components' | 'machines' | 'movements' | 'licenses' | 'third_parties' | 'loans' | 'maintenances' | 'providers' | 'partners' | 'company_profile' | 'users' | 'field_data_collections' | 'type_registry', data: any) => {
    if (!isDemoMode) return;
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${type}`, JSON.stringify(data));
  };

  // Login handler
  const handleAuthSuccess = (profile: UserProfile) => {
    setUser(profile);
    setIsDemoMode(false);
  };

  // Demo entry
  const handleEnterDemo = (role: UserRole, customName?: string, customEmail?: string) => {
    setIsDemoMode(true);
    setUser({
      uid: 'demo_user_' + Math.random().toString(36).substr(2, 9),
      email: customEmail || 'demo@agrostockgps.com.br',
      name: customName || (role === 'administrador' ? 'Carlos (Admin Demo)' : 'Felipe (Técnico Demo)'),
      role: role,
      createdAt: new Date().toISOString()
    });
    // Check if demo data exists, if not seed it immediately in demo local state!
    const localComponents = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}components`);
    if (!localComponents) {
      seedDemoInitialData();
    }
  };

  // Sign out
  const handleLogout = async () => {
    if (isDemoMode) {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(LOCAL_STORAGE_KEY_PREFIX));
      keys.forEach(k => localStorage.removeItem(k));
      setIsDemoMode(false);
      setUser(null);
      setComponents([]);
      setMachines([]);
      setMovements([]);
      setLicenses([]);
      setThirdParties([]);
      setLoans([]);
      setMaintenances([]);
      setTypeRegistry([]);
    } else {
      try {
        await signOut(auth);
        setUser(null);
      } catch (err) {
        console.error('Error signing out', err);
      }
    }
  };

  // Seed initial values (either to Firestore or LocalStorage depending on mode)
  const seedDemoInitialData = () => {
    const initialMachines: Machine[] = [
      { id: 'mac1', prefix: 'T01', type: 'Trator', model: 'John Deere 8320R', brand: 'John Deere', fleet: 'Frente 01 - Plantio', updatedAt: new Date().toISOString() },
      { id: 'mac2', prefix: 'T02', type: 'Trator', model: 'Valtra T250', brand: 'Valtra', fleet: 'Frente 01 - Plantio', updatedAt: new Date().toISOString() },
      { id: 'mac3', prefix: 'C12', type: 'Colhedora', model: 'Case IH CH570', brand: 'Case IH', fleet: 'Frente 02 - Colheita', updatedAt: new Date().toISOString() },
      { id: 'mac4', prefix: 'C15', type: 'Colhedora', model: 'John Deere CH950', brand: 'John Deere', fleet: 'Frente 02 - Colheita', updatedAt: new Date().toISOString() },
      { id: 'mac5', prefix: 'P08', type: 'Pulverizador', model: 'John Deere M4040', brand: 'John Deere', fleet: 'Frente 03 - Tratos', updatedAt: new Date().toISOString() },
    ];

    const initialComponents: AutopilotComponent[] = [
      { id: 'comp1', serialNumber: 'TR-750-9981', name: 'Trimble GFX-750 Monitor', brand: 'Trimble', type: 'Monitor/Display', status: 'Em Uso', currentMachine: 'T01', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      { id: 'comp2', serialNumber: 'TR-372-4011', name: 'Trimble AG-372 Receptor', brand: 'Trimble', type: 'Antena/Receptor', status: 'Em Uso', currentMachine: 'T01', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      { id: 'comp3', serialNumber: 'TP-X35-3001', name: 'Topcon X35 Display', brand: 'Topcon', type: 'Monitor/Display', status: 'Em Uso', currentMachine: 'C12', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      { id: 'comp4', serialNumber: 'TP-AGM-9912', name: 'Topcon AGM-1 Receptor', brand: 'Topcon', type: 'Antena/Receptor', status: 'Em Uso', currentMachine: 'C12', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      { id: 'comp5', serialNumber: 'TR-NAV-8088', name: 'NavController III', brand: 'Trimble', type: 'Controladora', status: 'Disponível', currentMachine: '', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      { id: 'comp6', serialNumber: 'TR-372-8821', name: 'Trimble AG-372 Receptor', brand: 'Trimble', type: 'Antena/Receptor', status: 'Manutenção', currentMachine: '', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      { id: 'comp7', serialNumber: 'TP-AES-4451', name: 'Topcon AES-35 Motor', brand: 'Topcon', type: 'Motor de Passo', status: 'Disponível', currentMachine: '', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
    ];

    const initialMovements: MovementLog[] = [
      { id: 'move1', componentId: 'comp1', componentSerial: 'TR-750-9981', componentName: 'Trimble GFX-750 Monitor', machineId: 'mac1', machinePrefix: 'T01', action: 'Instalação', technicianId: 'tech_1', technicianName: 'Felipe Neves', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), notes: 'Instalado com chicote original no console superior do trator T01.', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), osNumber: 1, status: 'Concluída', history: [{ timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), actorName: 'Felipe Neves', action: 'O.S. criada' }, { timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), actorName: 'Felipe Neves', action: 'O.S. concluída' }], completedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), updatedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), updatedBy: 'Felipe Neves' },
      { id: 'move2', componentId: 'comp2', componentSerial: 'TR-372-4011', componentName: 'Trimble AG-372 Receptor', machineId: 'mac1', machinePrefix: 'T01', action: 'Instalação', technicianId: 'tech_1', technicianName: 'Felipe Neves', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), notes: 'Instalada no teto do trator T01 e calibrada com sinal RangePoint RTX.', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), osNumber: 2, status: 'Em Atendimento', history: [{ timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), actorName: 'Felipe Neves', action: 'O.S. criada' }, { timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), actorName: 'Felipe Neves', action: 'Atendimento iniciado' }], updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), updatedBy: 'Felipe Neves' },
      { id: 'move3', componentId: 'comp6', componentSerial: 'TR-372-8821', componentName: 'Trimble AG-372 Receptor', machinePrefix: 'Almoxarifado', action: 'Manutenção', technicianId: 'tech_2', technicianName: 'Rodrigo Antunes', date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), notes: 'Aparelho perdendo conexão RTK de forma intermitente. Enviado para reparo.', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), osNumber: 3, status: 'Cancelada', history: [{ timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), actorName: 'Rodrigo Antunes', action: 'O.S. criada' }, { timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), actorName: 'Rodrigo Antunes', action: 'O.S. cancelada' }], cancelledAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), updatedBy: 'Rodrigo Antunes' },
    ];

    const initialLicenses: License[] = [
      { id: 'lic1', name: 'Trimble CenterPoint RTX (1 Ano)', brand: 'Trimble', type: 'Assinatura de Sinal', code: 'RTX-YEARLY-9921-X', status: 'Ativa', associatedComponentSerial: 'TR-372-4011', associatedMachinePrefix: 'T01', expirationDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      { id: 'lic2', name: 'Topcon RTK Correction Premium', brand: 'Topcon', type: 'Assinatura de Sinal', code: 'TP-RTK-5521-A', status: 'Ativa', associatedComponentSerial: 'TP-AGM-9912', associatedMachinePrefix: 'C12', expirationDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      { id: 'lic3', name: 'Licença Monitor GFX-750 Autopilot', brand: 'Trimble', type: 'Ativação de Tela', code: 'TR-GFX-AUTO-8822', status: 'Ativa', associatedComponentSerial: 'TR-750-9981', associatedMachinePrefix: 'T01', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      { id: 'lic4', name: 'Trimble Section Control Activation', brand: 'Trimble', type: 'Ativação de Tela', code: 'TR-SC-6611-L', status: 'Disponível', associatedComponentSerial: '', associatedMachinePrefix: '', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      { id: 'lic5', name: 'Topcon OmniSTAR Signal Subscription', brand: 'Topcon', type: 'Assinatura de Sinal', code: 'TP-OMNI-2210', status: 'Expirada', associatedComponentSerial: '', associatedMachinePrefix: '', expirationDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: 'Sistema' }
    ];

    const initialThirdParties: ThirdParty[] = [
      { id: 'tp1', name: 'Rodrigo da Costa Meireles', document: '144.551.992-01', phone: '(17) 99812-3304', email: 'rodrigo.meireles@agroterceiros.com', company: 'Soluções Agrícolas Meireles', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      { id: 'tp2', name: 'Juliana Fernandes de Souza', document: '211.455.192-88', phone: '(16) 98115-4422', email: 'juliana@servicoscampo.com.br', company: 'JS Serviços de Plantio', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'Sistema' }
    ];

    const initialLoans: ComponentLoan[] = [
      { id: 'loan1', thirdPartyId: 'tp1', thirdPartyName: 'Rodrigo da Costa Meireles', thirdPartyDocument: '144.551.992-01', thirdPartyCompany: 'Soluções Agrícolas Meireles', items: [{ componentId: 'comp5', componentSerial: 'TR-NAV-8088', componentName: 'NavController III', componentBrand: 'Trimble', componentType: 'Controladora' }], loanDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], estimatedReturnDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], status: 'Ativo', contractNumber: 'CO-2026-0001', notes: 'Item entregue para calibração em colhedora terceira.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: 'Sistema' }
    ];

    const initialMaintenances: ComponentMaintenance[] = [
      {
        id: 'maint1',
        componentId: 'comp6',
        componentSerial: 'TR-372-8821',
        componentName: 'Trimble AG-372 Receptor',
        componentBrand: 'Trimble',
        componentType: 'Antena/Receptor',
        sentDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        providerName: 'Laboratório Centro-Oeste GPS',
        issueDescription: 'Aparelho perdendo conexão RTK de forma intermitente.',
        status: 'Em Manutenção',
        updatedAt: new Date().toISOString(),
        updatedBy: 'Sistema'
      }
    ];

    // Mark comp5 as Em Uso by comodato in initialComponents
    initialComponents[4].status = 'Em Uso';
    initialComponents[4].currentMachine = 'Comodato: S. Meireles';

    setMachines(initialMachines);
    setComponents(initialComponents);
    setMovements(initialMovements);
    setLicenses(initialLicenses);
    setThirdParties(initialThirdParties);
    setLoans(initialLoans);
    setMaintenances(initialMaintenances);

    if (isDemoMode) {
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}machines`, JSON.stringify(initialMachines));
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}components`, JSON.stringify(initialComponents));
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}movements`, JSON.stringify(initialMovements));
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}licenses`, JSON.stringify(initialLicenses));
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}third_parties`, JSON.stringify(initialThirdParties));
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}loans`, JSON.stringify(initialLoans));
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}maintenances`, JSON.stringify(initialMaintenances));
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}type_registry`, JSON.stringify(DEFAULT_REGISTERED_TYPES));
    }
  };

  const handleSeedRealDatabase = async () => {
    if (isDemoMode || !user || user.role !== 'administrador') return;

    setLoadingApp(true);
    try {
      const initialMachines: Omit<Machine, 'id'>[] = [
        { prefix: 'T01', type: 'Trator', model: 'John Deere 8320R', brand: 'John Deere', fleet: 'Frente 01 - Plantio', updatedAt: new Date().toISOString() },
        { prefix: 'T02', type: 'Trator', model: 'Valtra T250', brand: 'Valtra', fleet: 'Frente 01 - Plantio', updatedAt: new Date().toISOString() },
        { prefix: 'C12', type: 'Colhedora', model: 'Case IH CH570', brand: 'Case IH', fleet: 'Frente 02 - Colheita', updatedAt: new Date().toISOString() },
        { prefix: 'C15', type: 'Colhedora', model: 'John Deere CH950', brand: 'John Deere', fleet: 'Frente 02 - Colheita', updatedAt: new Date().toISOString() },
        { prefix: 'P08', type: 'Pulverizador', model: 'John Deere M4040', brand: 'John Deere', fleet: 'Frente 03 - Tratos', updatedAt: new Date().toISOString() },
      ];

      const initialComponents: Omit<AutopilotComponent, 'id'>[] = [
        { serialNumber: 'TR-750-9981', name: 'Trimble GFX-750 Monitor', brand: 'Trimble', type: 'Monitor/Display', status: 'Em Uso', currentMachine: 'T01', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
        { serialNumber: 'TR-372-4011', name: 'Trimble AG-372 Receptor', brand: 'Trimble', type: 'Antena/Receptor', status: 'Em Uso', currentMachine: 'T01', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
        { serialNumber: 'TP-X35-3001', name: 'Topcon X35 Display', brand: 'Topcon', type: 'Monitor/Display', status: 'Em Uso', currentMachine: 'C12', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
        { serialNumber: 'TP-AGM-9912', name: 'Topcon AGM-1 Receptor', brand: 'Topcon', type: 'Antena/Receptor', status: 'Em Uso', currentMachine: 'C12', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
        { serialNumber: 'TR-NAV-8088', name: 'NavController III', brand: 'Trimble', type: 'Controladora', status: 'Disponível', currentMachine: '', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
        { serialNumber: 'TR-372-8821', name: 'Trimble AG-372 Receptor', brand: 'Trimble', type: 'Antena/Receptor', status: 'Manutenção', currentMachine: '', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
        { serialNumber: 'TP-AES-4451', name: 'Topcon AES-35 Motor', brand: 'Topcon', type: 'Motor de Passo', status: 'Disponível', currentMachine: '', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
      ];

      const initialLicenses: Omit<License, 'id'>[] = [
        { name: 'Trimble CenterPoint RTX (1 Ano)', brand: 'Trimble', type: 'Assinatura de Sinal', code: 'RTX-YEARLY-9921-X', status: 'Ativa', associatedComponentSerial: 'TR-372-4011', associatedMachinePrefix: 'T01', expirationDate: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
        { name: 'Topcon RTK Correction Premium', brand: 'Topcon', type: 'Assinatura de Sinal', code: 'TP-RTK-5521-A', status: 'Ativa', associatedComponentSerial: 'TP-AGM-9912', associatedMachinePrefix: 'C12', expirationDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
        { name: 'Licença Monitor GFX-750 Autopilot', brand: 'Trimble', type: 'Ativação de Tela', code: 'TR-GFX-AUTO-8822', status: 'Ativa', associatedComponentSerial: 'TR-750-9981', associatedMachinePrefix: 'T01', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
        { name: 'Trimble Section Control Activation', brand: 'Trimble', type: 'Ativação de Tela', code: 'TR-SC-6611-L', status: 'Disponível', associatedComponentSerial: '', associatedMachinePrefix: '', updatedAt: new Date().toISOString(), updatedBy: 'Sistema' },
        { name: 'Topcon OmniSTAR Signal Subscription', brand: 'Topcon', type: 'Assinatura de Sinal', code: 'TP-OMNI-2210', status: 'Expirada', associatedComponentSerial: '', associatedMachinePrefix: '', expirationDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], updatedAt: new Date().toISOString(), updatedBy: 'Sistema' }
      ];

      // Insert machines
      for (const m of initialMachines) {
        const docRef = doc(collection(db, 'machines'));
        await setDoc(docRef, { ...m, id: docRef.id });
      }

      // Insert components
      for (const c of initialComponents) {
        const docRef = doc(collection(db, 'components'));
        await setDoc(docRef, { 
          ...c, 
          id: docRef.id,
          updatedAt: serverTimestamp()
        });
      }

      // Insert licenses
      for (const l of initialLicenses) {
        const docRef = doc(collection(db, 'licenses'));
        await setDoc(docRef, { 
          ...l, 
          id: docRef.id,
          updatedAt: serverTimestamp()
        });
      }

      // Insert default type registry
      const registrySnap = await getDocs(collection(db, 'type_registry'));
      if (registrySnap.empty) {
        for (const t of DEFAULT_REGISTERED_TYPES) {
          const docRef = doc(collection(db, 'type_registry'));
          await setDoc(docRef, {
            id: docRef.id,
            category: t.category,
            name: t.name,
            active: true,
            updatedAt: serverTimestamp(),
            updatedBy: user?.name || user?.email || 'Sistema'
          });
        }
      }

      // We will let Firestore listener update the local react state automatically!
      showToast('success', 'Banco de dados populado com sucesso com dados da frota, estoque e licenças!');
    } catch (err) {
      console.error('Error seeding Firestore', err);
      showToast('error', 'Erro ao popular banco de dados real. Certifique-se de que as regras do Firestore foram implantadas.');
    } finally {
      setLoadingApp(false);
    }
  };

  // Add Component (Firestore or Demo)
  const handleAddComponent = async (comp: Omit<AutopilotComponent, 'id' | 'updatedAt' | 'updatedBy'>) => {
    const timestampStr = new Date().toISOString();
    if (isDemoMode) {
      const newComp: AutopilotComponent = {
        ...comp,
        id: 'demo_comp_' + Math.random().toString(36).substr(2, 9),
        updatedAt: timestampStr,
        updatedBy: user?.name || 'Sistema'
      };
      const updatedList = [...components, newComp];
      setComponents(updatedList);
      saveDemoData('components', updatedList);
    } else {
      try {
        const docRef = doc(collection(db, 'components'));
        await setDoc(docRef, {
          ...comp,
          id: docRef.id,
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Sistema'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'components');
      }
    }
  };

  // Edit Component (Firestore or Demo)
  const handleEditComponent = async (id: string, updates: Partial<AutopilotComponent>) => {
    const timestampStr = new Date().toISOString();
    if (isDemoMode) {
      const updatedList = components.map(c => {
        if (c.id === id) {
          return {
            ...c,
            ...updates,
            updatedAt: timestampStr,
            updatedBy: user?.name || 'Sistema'
          };
        }
        return c;
      });
      setComponents(updatedList);
      saveDemoData('components', updatedList);
    } else {
      try {
        const docRef = doc(db, 'components', id);
        await updateDoc(docRef, {
          ...updates,
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Sistema'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `components/${id}`);
      }
    }
  };

  // Delete Component (Firestore or Demo)
  const handleDeleteComponent = async (id: string) => {
    if (isDemoMode) {
      const updatedList = components.filter(c => c.id !== id);
      setComponents(updatedList);
      saveDemoData('components', updatedList);
    } else {
      try {
        await deleteDoc(doc(db, 'components', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `components/${id}`);
      }
    }
  };

  // Type Registry (Settings > Cadastro)
  const handleAddRegisteredType = async (category: RegisteredTypeCategory, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (typeRegistry.some(t => t.category === category && t.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast('error', 'Já existe um tipo com esse nome nesta lista.');
      return;
    }
    if (isDemoMode) {
      const newType: RegisteredType = {
        id: 'demo_type_' + Math.random().toString(36).substr(2, 9),
        category,
        name: trimmed,
        active: true,
        updatedAt: new Date().toISOString(),
        updatedBy: user?.name || 'Sistema'
      };
      const updatedList = [...typeRegistry, newType];
      setTypeRegistry(updatedList);
      saveDemoData('type_registry', updatedList);
    } else {
      try {
        const docRef = doc(collection(db, 'type_registry'));
        await setDoc(docRef, {
          id: docRef.id,
          category,
          name: trimmed,
          active: true,
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Sistema'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'type_registry');
      }
    }
  };

  // Propagate type rename across all referencing collections
  const propagateTypeName = async (
    category: RegisteredTypeCategory,
    oldName: string,
    newName: string
  ) => {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    const actor = user?.name || user?.email || 'Sistema';

    switch (category) {
      case 'vehicle': {
        const machinesSnap = await getDocs(query(collection(db, 'machines'), where('type', '==', oldName)));
        machinesSnap.forEach(d => batch.update(d.ref, { type: newName, updatedAt: now }));
        const fdcSnap = await getDocs(query(collection(db, 'field_data_collections'), where('machineType', '==', oldName)));
        fdcSnap.forEach(d => batch.update(d.ref, { machineType: newName, updatedAt: now }));
        break;
      }
      case 'equipment_component': {
        const compSnap = await getDocs(query(collection(db, 'components'), where('type', '==', oldName)));
        compSnap.forEach(d => batch.update(d.ref, { type: newName, updatedAt: now, updatedBy: actor }));
        const loansSnap = await getDocs(query(collection(db, 'loans'), where('status', '==', 'Ativo')));
        loansSnap.forEach(loanDoc => {
          const loan = loanDoc.data();
          const items = (loan.items || []).map((item: any) =>
            item.componentType === oldName ? { ...item, componentType: newName } : item
          );
          batch.update(loanDoc.ref, { items, updatedAt: now, updatedBy: actor });
        });
        break;
      }
      case 'partner': {
        const partnersSnap = await getDocs(query(collection(db, 'partners'), where('types', 'array-contains', oldName)));
        for (const d of partnersSnap.docs) {
          await updateDoc(d.ref, {
            types: arrayRemove(oldName),
            updatedAt: now,
            updatedBy: actor
          });
          await updateDoc(d.ref, {
            types: arrayUnion(newName),
            updatedAt: now,
            updatedBy: actor
          });
        }
        return; // Already handled, skip batch.commit()
      }
      case 'service': {
        const mvSnap = await getDocs(query(
          collection(db, 'movements'),
          where('action', '==', oldName),
          where('status', 'in', ['Aberta', 'Agendada'])
        ));
        mvSnap.forEach(d => batch.update(d.ref, { action: newName, updatedAt: now }));
        const mtSnap = await getDocs(query(collection(db, 'maintenances'), where('serviceType', '==', oldName)));
        mtSnap.forEach(d => batch.update(d.ref, { serviceType: newName, updatedAt: now, updatedBy: actor }));
        break;
      }
    }

    await batch.commit();
  };

  const handleUpdateRegisteredType = async (id: string, updates: Partial<Omit<RegisteredType, 'id' | 'updatedAt' | 'updatedBy'>>) => {
    // Detect rename and propagate across referencing collections
    if (updates.name) {
      const current = typeRegistry.find(t => t.id === id);
      if (current && current.name !== updates.name) {
        if (isDemoMode) {
          // Demo mode: propagate in-memory
          const oldName = current.name;
          const newName = updates.name;
          const cat = current.category;
          if (cat === 'vehicle') {
            setMachines(prev => prev.map(m => m.type === oldName ? { ...m, type: newName as any } : m));
            setFieldDataCollections(prev => prev.map(f => f.machineType === oldName ? { ...f, machineType: newName as any } : f));
          } else if (cat === 'equipment_component') {
            setComponents(prev => prev.map(c => c.type === oldName ? { ...c, type: newName } : c));
            setLoans(prev => prev.map(l => ({
              ...l,
              items: l.items.map(i => i.componentType === oldName ? { ...i, componentType: newName } : i)
            })));
          } else if (cat === 'partner') {
            setPartners(prev => prev.map(p => ({
              ...p,
              types: p.types.map(t => t === oldName ? newName as any : t)
            })));
          } else if (cat === 'service') {
            setMovements(prev => prev.map(mv =>
              mv.action === oldName && (mv.status === 'Aberta' || mv.status === 'Agendada')
                ? { ...mv, action: newName as any } : mv
            ));
            setMaintenances(prev => prev.map(m => m.serviceType === oldName ? { ...m, serviceType: newName } : m));
          }
        } else {
          await propagateTypeName(current.category, current.name, updates.name);
        }
      }
    }

    if (isDemoMode) {
      const updatedList = typeRegistry.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString(), updatedBy: user?.name || 'Sistema' } : t);
      setTypeRegistry(updatedList);
      saveDemoData('type_registry', updatedList);
    } else {
      try {
        await updateDoc(doc(db, 'type_registry', id), {
          ...updates,
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Sistema'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `type_registry/${id}`);
      }
    }
  };

  const handleDeleteRegisteredType = async (id: string) => {
    if (isDemoMode) {
      const updatedList = typeRegistry.filter(t => t.id !== id);
      setTypeRegistry(updatedList);
      saveDemoData('type_registry', updatedList);
    } else {
      try {
        await deleteDoc(doc(db, 'type_registry', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `type_registry/${id}`);
      }
    }
  };

  // Active registered names for a category; falls back to defaults when registry is empty.
  const getActiveTypes = (category: RegisteredTypeCategory): string[] => {
    const entries = typeRegistry.filter(t => t.category === category && t.active).map(t => t.name);
    if (entries.length === 0) return DEFAULT_TYPE_NAMES[category];
    return Array.from(new Set(entries));
  };

  // How many records reference a given registered type name.
  const getTypeUsageCount = (category: RegisteredTypeCategory, name: string): number => {
    switch (category) {
      case 'partner':
        return partners.filter(p => p.types.includes(name as any)).length;
      case 'equipment_component':
        return components.filter(c => c.type === name).length
          + loans.filter(l => l.status === 'Ativo' && l.items.some(i => i.componentType === name)).length;
      case 'vehicle':
        return machines.filter(m => m.type === name).length
          + fieldDataCollections.filter(f => f.machineType === name).length;
      case 'service':
        return movements.filter(mv => mv.action === name).length
          + maintenances.filter(mt => mt.serviceType === name).length;
      default:
        return 0;
    }
  };

  // Add License (Firestore or Demo)
  const handleAddLicense = async (lic: Omit<License, 'id' | 'updatedAt' | 'updatedBy'>) => {
    const timestampStr = new Date().toISOString();
    if (isDemoMode) {
      const newLic: License = {
        ...lic,
        id: 'demo_lic_' + Math.random().toString(36).substr(2, 9),
        updatedAt: timestampStr,
        updatedBy: user?.name || 'Sistema'
      };
      const updatedList = [...licenses, newLic];
      setLicenses(updatedList);
      saveDemoData('licenses', updatedList);
    } else {
      try {
        const docRef = doc(collection(db, 'licenses'));
        await setDoc(docRef, {
          ...lic,
          id: docRef.id,
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Sistema'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'licenses');
      }
    }
  };

  // Edit License (Firestore or Demo)
  const handleEditLicense = async (id: string, updates: Partial<License>) => {
    const timestampStr = new Date().toISOString();
    if (isDemoMode) {
      const updatedList = licenses.map(l => {
        if (l.id === id) {
          return {
            ...l,
            ...updates,
            updatedAt: timestampStr,
            updatedBy: user?.name || 'Sistema'
          };
        }
        return l;
      });
      setLicenses(updatedList);
      saveDemoData('licenses', updatedList);
    } else {
      try {
        const docRef = doc(db, 'licenses', id);
        await updateDoc(docRef, {
          ...updates,
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Sistema'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `licenses/${id}`);
      }
    }
  };

  // Delete License (Firestore or Demo)
  const handleDeleteLicense = async (id: string) => {
    if (isDemoMode) {
      const updatedList = licenses.filter(l => l.id !== id);
      setLicenses(updatedList);
      saveDemoData('licenses', updatedList);
    } else {
      try {
        await deleteDoc(doc(db, 'licenses', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `licenses/${id}`);
      }
    }
  };

  // Add Machine (Firestore or Demo)
  const handleAddMachine = async (mac: Omit<Machine, 'id' | 'updatedAt'>) => {
    const timestampStr = new Date().toISOString();
    if (isDemoMode) {
      const newMac: Machine = {
        ...mac,
        id: 'demo_mac_' + Math.random().toString(36).substr(2, 9),
        updatedAt: timestampStr
      };
      const updatedList = [...machines, newMac];
      setMachines(updatedList);
      saveDemoData('machines', updatedList);
    } else {
      try {
        const docRef = doc(collection(db, 'machines'));
        await setDoc(docRef, {
          ...mac,
          id: docRef.id,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'machines');
      }
    }
  };

  // Edit Machine (Firestore or Demo)
  const handleEditMachine = async (id: string, updates: Partial<Machine>) => {
    if (isDemoMode) {
      const updatedList = machines.map(m => {
        if (m.id === id) {
          return {
            ...m,
            ...updates,
            updatedAt: new Date().toISOString()
          };
        }
        return m;
      });
      setMachines(updatedList);
      saveDemoData('machines', updatedList);
    } else {
      try {
        const docRef = doc(db, 'machines', id);
        await updateDoc(docRef, {
          ...updates,
          updatedAt: serverTimestamp()
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `machines/${id}`);
      }
    }
  };

  // Delete Machine (Firestore or Demo)
  const handleDeleteMachine = async (id: string) => {
    if (isDemoMode) {
      const updatedList = machines.filter(m => m.id !== id);
      setMachines(updatedList);
      saveDemoData('machines', updatedList);
    } else {
      try {
        await deleteDoc(doc(db, 'machines', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `machines/${id}`);
      }
    }
  };

  // Add Movement & Auto-Update Component State (Seamless integration)
  const handleAddMovement = async (log: Omit<MovementLog, 'id' | 'technicianId' | 'technicianName' | 'createdAt'>) => {
    const timestampStr = new Date().toISOString();
    const actorName = user?.name || 'Técnico';
    
    // Find target component
    const comp = components.find(c => c.id === log.componentId);
    if (!comp) throw new Error('Equipamento GPS correspondente não foi localizado.');
    const hasActiveOrder = movements.some(movement =>
      movement.componentId === log.componentId &&
      !['Concluída', 'Cancelada'].includes(movement.status || 'Aberta')
    );
    if (hasActiveOrder) throw new Error('Este equipamento já possui uma O.S. em aberto ou em atendimento.');

    // Compute next OS number (sequential)
    const maxOs = movements.reduce((max, m) => Math.max(max, m.osNumber || 0), 0);
    const osNumber = maxOs + 1;
    const history: MovementHistoryEntry[] = [{
      timestamp: timestampStr,
      actorName,
      action: 'O.S. criada',
      detail: `Tipo: ${log.action} · Equipamento: ${log.componentName} (S/N ${log.componentSerial})`
    }];

    if (isDemoMode) {
      // 1. Create movement
      const newMove: MovementLog = {
        ...log,
        id: 'demo_move_' + Math.random().toString(36).substr(2, 9),
        technicianId: user?.uid || 'demo_tech',
        technicianName: user?.name || 'Técnico Demo',
        createdAt: timestampStr,
        osNumber,
        status: 'Aberta',
        history,
        updatedAt: timestampStr,
        updatedBy: actorName
      };

      const updatedMovements = [...movements, newMove];
      setMovements(updatedMovements);
      saveDemoData('movements', updatedMovements);

    } else {
      try {
        const moveRef = doc(collection(db, 'movements'));
        await setDoc(moveRef, {
          ...log,
          id: moveRef.id,
          technicianId: user?.uid || 'system',
          technicianName: user?.name || 'Técnico',
          createdAt: serverTimestamp(),
          osNumber,
          status: 'Aberta',
          history,
          updatedAt: serverTimestamp(),
          updatedBy: actorName
        });

      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'movements');
        throw err;
      }
    }
  };

  // Transition an Order of Service lifecycle status (append history, preserve audit trail)
  const handleTransitionOSStatus = async (movement: MovementLog, nextStatus: MovementStatus, actionLabel: string, detail?: string) => {
    const timestampStr = new Date().toISOString();
    const actorName = user?.name || user?.email || 'Técnico';

    const history = movement.history || [];
    const normalizedDetail = detail?.trim();
    const entry: MovementHistoryEntry = {
      timestamp: timestampStr,
      actorName,
      action: actionLabel,
      ...(normalizedDetail ? { detail: normalizedDetail } : {})
    };

    const currentStatus = movement.status || 'Aberta';
    const allowedTransitions: Record<MovementStatus, MovementStatus[]> = {
      'Aberta': ['Agendada', 'Em Atendimento', 'Cancelada'],
      'Agendada': ['Aberta', 'Em Atendimento', 'Cancelada'],
      'Em Atendimento': ['Agendada', 'Concluída', 'Cancelada'],
      'Concluída': [],
      'Cancelada': []
    };
    if (!allowedTransitions[currentStatus].includes(nextStatus)) {
      throw new Error(`Não é possível alterar uma O.S. de ${currentStatus} para ${nextStatus}.`);
    }

    const payload: Record<string, any> = {
      status: nextStatus,
      history: [...history, entry],
      updatedAt: timestampStr,
      updatedBy: actorName
    };

    if (nextStatus === 'Concluída') payload.completedAt = timestampStr;
    if (nextStatus === 'Cancelada') payload.cancelledAt = timestampStr;

    if (isDemoMode) {
      const updated = movements.map(m => m.id === movement.id ? { ...m, ...payload } : m);
      setMovements(updated);
      saveDemoData('movements', updated);

      if (nextStatus === 'Concluída') {
        const updatedComponents = components.map(component => {
          if (component.id !== movement.componentId) return component;
          const placement = getComponentPlacementAfterOS(movement, component.status, component.currentMachine || '');
          return { ...component, ...placement, updatedAt: timestampStr, updatedBy: actorName };
        });
        setComponents(updatedComponents);
        saveDemoData('components', updatedComponents);
      }
      return;
    }

    try {
      const ref = doc(db, 'movements', movement.id);
      const batch = writeBatch(db);
      batch.update(ref, { ...payload, updatedAt: serverTimestamp() });

      if (nextStatus === 'Concluída') {
        const component = components.find(item => item.id === movement.componentId);
        if (!component) throw new Error('O equipamento vinculado à O.S. não foi encontrado.');
        const placement = getComponentPlacementAfterOS(movement, component.status, component.currentMachine || '');
        batch.update(doc(db, 'components', movement.componentId), {
          ...placement,
          updatedAt: serverTimestamp(),
          updatedBy: actorName
        });
      }

      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `movements/${movement.id}`);
      throw err;
    }
  };

  const handleUpdateMovement = async (movement: MovementLog, updates: Partial<MovementLog>) => {
    const status = movement.status || 'Aberta';
    if (!['Aberta', 'Agendada'].includes(status)) {
      throw new Error('Somente O.S. abertas ou agendadas podem ser editadas.');
    }
    if (!updates.componentId || !components.some(component => component.id === updates.componentId)) {
      throw new Error('Selecione um equipamento válido para a O.S.');
    }
    const hasConflictingOrder = movements.some(item =>
      item.id !== movement.id &&
      item.componentId === updates.componentId &&
      !['Concluída', 'Cancelada'].includes(item.status || 'Aberta')
    );
    if (hasConflictingOrder) throw new Error('O equipamento selecionado já possui outra O.S. ativa.');
    if (updates.action === 'Instalação' && (!updates.machineId || !updates.machinePrefix)) {
      throw new Error('Selecione o veículo de destino da instalação.');
    }

    const timestampStr = new Date().toISOString();
    const actorName = user?.name || user?.email || 'Técnico';
    const payload: Partial<MovementLog> = {
      ...updates,
      status: status as MovementStatus,
      history: [...(movement.history || []), {
        timestamp: timestampStr,
        actorName,
        action: 'Dados da O.S. atualizados'
      }],
      updatedAt: timestampStr,
      updatedBy: actorName
    };

    if (isDemoMode) {
      const updatedMovements = movements.map(item => item.id === movement.id ? { ...item, ...payload } : item);
      setMovements(updatedMovements);
      saveDemoData('movements', updatedMovements);
      return;
    }

    try {
      await updateDoc(doc(db, 'movements', movement.id), { ...payload, updatedAt: serverTimestamp() });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `movements/${movement.id}`);
      throw err;
    }
  };

  const handleDeleteMovement = async (movement: MovementLog) => {
    const status = movement.status || 'Aberta';
    const isAdmin = user?.role === 'administrador' || user?.role === 'ADMINISTRADOR';
    if (!isAdmin) throw new Error('Somente administradores podem excluir ordens de serviço.');
    if (!['Aberta', 'Agendada'].includes(status)) {
      throw new Error('Somente O.S. abertas ou agendadas podem ser excluídas. Use o cancelamento para preservar o histórico operacional.');
    }

    if (isDemoMode) {
      const updatedMovements = movements.filter(item => item.id !== movement.id);
      setMovements(updatedMovements);
      saveDemoData('movements', updatedMovements);
      return;
    }

    try {
      await deleteDoc(doc(db, 'movements', movement.id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `movements/${movement.id}`);
      throw err;
    }
  };

  // Materialize a weekly snapshot so pending machines remain auditable after the week ends.
  const handleEnsureFieldDataWeek = async (weekMachines: Machine[], targetWeekId: string) => {
    const existingMachineIds = new Set(
      fieldDataCollections
        .filter(item => item.weekId === targetWeekId)
        .map(item => item.machineId)
    );
    const missingMachines = weekMachines.filter(machine => !existingMachineIds.has(machine.id));
    if (missingMachines.length === 0) return;

    const timestamp = new Date().toISOString();
    const actorName = user?.name || user?.email || 'Sistema';
    const createSnapshot = (machine: Machine): FieldDataCollection => ({
      id: `${targetWeekId}_${machine.id}`,
      machineId: machine.id,
      machinePrefix: machine.prefix,
      machineBrand: machine.brand,
      machineModel: machine.model,
      machineType: machine.type,
      fleet: machine.fleet || 'Sem Frente',
      frente: machine.fleet || 'Sem Frente',
      weekId: targetWeekId,
      status: 'Pendente',
      history: [{ timestamp, actorName, action: 'Semana iniciada' }],
      createdAt: timestamp,
      updatedAt: timestamp
    });

    if (isDemoMode) {
      setFieldDataCollections(prev => {
        const known = new Set(prev.filter(item => item.weekId === targetWeekId).map(item => item.machineId));
        const snapshots = missingMachines.filter(machine => !known.has(machine.id)).map(createSnapshot);
        const updated = [...prev, ...snapshots];
        saveDemoData('field_data_collections', updated);
        return updated;
      });
      return;
    }

    try {
      await Promise.all(missingMachines.map(async machine => {
        const snapshot = createSnapshot(machine);
        await setDoc(doc(db, 'field_data_collections', snapshot.id), {
          ...snapshot,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }));
    } catch (error) {
      handleFirestoreError(error as any, OperationType.WRITE, 'field_data_collections_week_snapshot');
      throw error;
    }
  };

  // Keep the current week materialized even when the user does not open the Kanban tab.
  useEffect(() => {
    if (!user || machines.length === 0) return;

    const ensureCurrentWeek = () => {
      const weekId = getISOWeekId(new Date());
      const hasMissingRecords = machines.some(machine =>
        !fieldDataCollections.some(item => item.weekId === weekId && item.machineId === machine.id)
      );
      if (hasMissingRecords) {
        handleEnsureFieldDataWeek(machines, weekId).catch(error =>
          console.error('Falha ao preparar histórico semanal:', error)
        );
      }
    };

    ensureCurrentWeek();
    const interval = window.setInterval(ensureCurrentWeek, 60_000);
    return () => window.clearInterval(interval);
  }, [user?.uid, isDemoMode, machines, fieldDataCollections]);

  // Complete one machine collection. Completed records are not toggled back by a second tap.
  const handleCompleteFieldDataCollection = async (targetMachine: Machine, targetWeekId: string) => {
    const existing = fieldDataCollections.find(item => item.machineId === targetMachine.id && item.weekId === targetWeekId);
    if (existing?.status === 'Concluído') return;

    const timestamp = new Date().toISOString();
    const actorName = user?.name || user?.email || 'Técnico';
    const docId = existing?.id || `${targetWeekId}_${targetMachine.id}`;
    const history = [
      ...(existing?.history || [{ timestamp, actorName: 'Sistema', action: 'Semana iniciada' as const }]),
      { timestamp, actorName, action: 'Coleta concluída' as const }
    ];
    const payload: FieldDataCollection = {
      id: docId,
      machineId: targetMachine.id,
      machinePrefix: existing?.machinePrefix || targetMachine.prefix,
      machineBrand: existing?.machineBrand || targetMachine.brand,
      machineModel: existing?.machineModel || targetMachine.model,
      machineType: existing?.machineType || targetMachine.type,
      fleet: existing?.fleet || targetMachine.fleet || 'Sem Frente',
      frente: existing?.frente || targetMachine.fleet || 'Sem Frente',
      weekId: targetWeekId,
      status: 'Concluído',
      collectedAt: timestamp,
      collectedBy: actorName,
      history,
      createdAt: existing?.createdAt || timestamp,
      updatedAt: timestamp
    };

    if (isDemoMode) {
      setFieldDataCollections(prev => {
        const index = prev.findIndex(item => item.id === docId);
        const updated = index >= 0
          ? prev.map((item, itemIndex) => itemIndex === index ? payload : item)
          : [...prev, payload];
        saveDemoData('field_data_collections', updated);
        return updated;
      });
      return;
    }

    try {
      await setDoc(doc(db, 'field_data_collections', docId), {
        ...payload,
        createdAt: existing?.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error as any, OperationType.WRITE, 'field_data_collections');
      throw error;
    }
  };

  // Add Third Party (Firestore or Demo)
  const handleAddThirdParty = async (tp: Omit<ThirdParty, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => {
    const timestamp = new Date().toISOString();
    if (isDemoMode) {
      const newTp: ThirdParty = {
        ...tp,
        id: 'tp_' + Math.random().toString(36).substr(2, 9),
        createdAt: timestamp,
        updatedAt: timestamp,
        updatedBy: user?.name || 'Sistema'
      };
      const updated = [...thirdParties, newTp];
      setThirdParties(updated);
      saveDemoData('third_parties', updated);
    } else {
      try {
        const ref = doc(collection(db, 'third_parties'));
        await setDoc(ref, {
          ...tp,
          id: ref.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Sistema'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'third_parties');
      }
    }
  };

  // Edit Third Party (Firestore or Demo)
  const handleEditThirdParty = async (id: string, updates: Partial<ThirdParty>) => {
    const timestamp = new Date().toISOString();
    if (isDemoMode) {
      const updated = thirdParties.map(tp => {
        if (tp.id === id) {
          return {
            ...tp,
            ...updates,
            updatedAt: timestamp,
            updatedBy: user?.name || 'Sistema'
          };
        }
        return tp;
      });
      setThirdParties(updated);
      saveDemoData('third_parties', updated);
    } else {
      try {
        await updateDoc(doc(db, 'third_parties', id), {
          ...updates,
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Sistema'
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `third_parties/${id}`);
      }
    }
  };

  // Delete Third Party (Firestore or Demo)
  const handleDeleteThirdParty = async (id: string) => {
    if (isDemoMode) {
      const updated = thirdParties.filter(tp => tp.id !== id);
      setThirdParties(updated);
      saveDemoData('third_parties', updated);
    } else {
      try {
        await deleteDoc(doc(db, 'third_parties', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `third_parties/${id}`);
      }
    }
  };

  // Create Loan & Update Components to Em Uso with Comodato details (Firestore or Demo)
  const handleAddLoan = async (loan: Omit<ComponentLoan, 'id' | 'contractNumber' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => {
    const timestamp = new Date().toISOString();
    const contractNum = 'CO-2026-' + Math.floor(1000 + Math.random() * 9000);
    const newId = 'loan_' + Math.random().toString(36).substr(2, 9);

    if (isDemoMode) {
      const newLoan: ComponentLoan = {
        ...loan,
        id: newId,
        contractNumber: contractNum,
        createdAt: timestamp,
        updatedAt: timestamp,
        updatedBy: user?.name || 'Sistema'
      };

      const updatedLoans = [...loans, newLoan];
      setLoans(updatedLoans);
      saveDemoData('loans', updatedLoans);

      const newMovements = [...movements];
      const updatedComponents = components.map(comp => {
        const loanedItem = loan.items.find(it => it.componentId === comp.id);
        if (loanedItem) {
          newMovements.push({
            id: 'demo_move_' + Math.random().toString(36).substr(2, 9),
            componentId: comp.id,
            componentSerial: comp.serialNumber,
            componentName: comp.name,
            machinePrefix: `Empréstimo: ${loan.thirdPartyName}`,
            action: 'Instalação',
            technicianId: user?.uid || 'demo_tech',
            technicianName: user?.name || 'Técnico Demo',
            date: timestamp,
            notes: `Saída em empréstimo no termo ${contractNum}.`,
            createdAt: timestamp
          });

          return {
            ...comp,
            status: 'Em Uso',
            currentMachine: `Empréstimo: ${loan.thirdPartyName}`,
            updatedAt: timestamp,
            updatedBy: user?.name || 'Técnico Demo'
          };
        }
        return comp;
      });

      setComponents(updatedComponents);
      saveDemoData('components', updatedComponents);

      setMovements(newMovements);
      saveDemoData('movements', newMovements);
    } else {
      try {
        const ref = doc(collection(db, 'loans'));
        await setDoc(ref, {
          ...loan,
          id: ref.id,
          contractNumber: contractNum,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Sistema'
        });

        for (const item of loan.items) {
          await updateDoc(doc(db, 'components', item.componentId), {
            status: 'Em Uso',
            currentMachine: `Empréstimo: ${loan.thirdPartyName}`,
            updatedAt: serverTimestamp(),
            updatedBy: user?.name || user?.email || 'Sistema'
          });

          const moveRef = doc(collection(db, 'movements'));
          await setDoc(moveRef, {
            componentId: item.componentId,
            componentSerial: item.componentSerial,
            componentName: item.componentName,
            machinePrefix: `Empréstimo: ${loan.thirdPartyName}`,
            action: 'Instalação',
            technicianId: user?.uid || 'system',
            technicianName: user?.name || 'Sistema',
            date: timestamp,
            notes: `Saída em empréstimo no termo ${contractNum}.`,
            createdAt: serverTimestamp()
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'loans');
      }
    }
  };

  // Return Loan & Release Components back to Available (Firestore or Demo)
  const handleReturnLoan = async (id: string) => {
    const timestamp = new Date().toISOString();
    const todayStr = timestamp.split('T')[0];

    const targetLoan = loans.find(l => l.id === id);
    if (!targetLoan) return;

    if (isDemoMode) {
      const updatedLoans = loans.map(l => {
        if (l.id === id) {
          return {
            ...l,
            status: 'Devolvido' as const,
            actualReturnDate: todayStr,
            updatedAt: timestamp,
            updatedBy: user?.name || 'Sistema'
          };
        }
        return l;
      });
      setLoans(updatedLoans);
      saveDemoData('loans', updatedLoans);

      const newMovements = [...movements];
      const updatedComponents = components.map(comp => {
        const loanedItem = targetLoan.items.find(it => it.componentId === comp.id);
        if (loanedItem) {
          newMovements.push({
            id: 'demo_move_' + Math.random().toString(36).substr(2, 9),
            componentId: comp.id,
            componentSerial: comp.serialNumber,
            componentName: comp.name,
            machinePrefix: `Empréstimo: ${targetLoan.thirdPartyName}`,
            action: 'Remoção',
            technicianId: user?.uid || 'demo_tech',
            technicianName: user?.name || 'Técnico Demo',
            date: timestamp,
            notes: `Retorno de empréstimo do termo ${targetLoan.contractNumber}.`,
            createdAt: timestamp
          });

          return {
            ...comp,
            status: 'Disponível',
            currentMachine: '',
            updatedAt: timestamp,
            updatedBy: user?.name || 'Técnico Demo'
          };
        }
        return comp;
      });

      setComponents(updatedComponents);
      saveDemoData('components', updatedComponents);

      setMovements(newMovements);
      saveDemoData('movements', newMovements);
    } else {
      try {
        await updateDoc(doc(db, 'loans', id), {
          status: 'Devolvido',
          actualReturnDate: todayStr,
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Sistema'
        });

        for (const item of targetLoan.items) {
          await updateDoc(doc(db, 'components', item.componentId), {
            status: 'Disponível',
            currentMachine: '',
            updatedAt: serverTimestamp(),
            updatedBy: user?.name || user?.email || 'Sistema'
          });

          const moveRef = doc(collection(db, 'movements'));
          await setDoc(moveRef, {
            componentId: item.componentId,
            componentSerial: item.componentSerial,
            componentName: item.componentName,
            machinePrefix: `Empréstimo: ${targetLoan.thirdPartyName}`,
            action: 'Remoção',
            technicianId: user?.uid || 'system',
            technicianName: user?.name || 'Sistema',
            date: timestamp,
            notes: `Retorno de empréstimo do termo ${targetLoan.contractNumber}.`,
            createdAt: serverTimestamp()
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `loans/${id}`);
      }
    }
  };

  // Return PARTIAL Loan & Release selected Components back to Available (Firestore or Demo)
  const handlePartialReturnLoan = async (id: string, returnedItemIds: string[]) => {
    const timestamp = new Date().toISOString();

    const targetLoan = loans.find(l => l.id === id);
    if (!targetLoan) return;

    const itemsToReturn = targetLoan.items.filter(it => returnedItemIds.includes(it.componentId));
    const itemsToKeep = targetLoan.items.filter(it => !returnedItemIds.includes(it.componentId));
    const currentReturned = targetLoan.returnedItems || [];
    const updatedReturned = [...currentReturned, ...itemsToReturn];

    if (itemsToKeep.length === 0) {
      await handleReturnLoan(id);
      return;
    }

    const partialNotes = `\n[Devolução parcial em ${new Date().toLocaleDateString('pt-BR')} por ${user?.name || 'Sistema'}: Devolvido(s) ${itemsToReturn.map(it => `${it.componentName} (S/N: ${it.componentSerial})`).join(', ')}]`;
    const newNotes = (targetLoan.notes || '') + partialNotes;

    if (isDemoMode) {
      const updatedLoans = loans.map(l => {
        if (l.id === id) {
          return {
            ...l,
            items: itemsToKeep,
            returnedItems: updatedReturned,
            notes: newNotes,
            updatedAt: timestamp,
            updatedBy: user?.name || 'Sistema'
          };
        }
        return l;
      });
      setLoans(updatedLoans);
      saveDemoData('loans', updatedLoans);

      const newMovements = [...movements];
      const updatedComponents = components.map(comp => {
        const returnedItem = itemsToReturn.find(it => it.componentId === comp.id);
        if (returnedItem) {
          newMovements.push({
            id: 'demo_move_' + Math.random().toString(36).substr(2, 9),
            componentId: comp.id,
            componentSerial: comp.serialNumber,
            componentName: comp.name,
            machinePrefix: `Empréstimo: ${targetLoan.thirdPartyName}`,
            action: 'Remoção',
            technicianId: user?.uid || 'demo_tech',
            technicianName: user?.name || 'Técnico Demo',
            date: timestamp,
            notes: `Retorno parcial de empréstimo do termo ${targetLoan.contractNumber}.`,
            createdAt: timestamp
          });

          return {
            ...comp,
            status: 'Disponível',
            currentMachine: '',
            updatedAt: timestamp,
            updatedBy: user?.name || 'Técnico Demo'
          };
        }
        return comp;
      });

      setComponents(updatedComponents);
      saveDemoData('components', updatedComponents);

      setMovements(newMovements);
      saveDemoData('movements', newMovements);
    } else {
      try {
        await updateDoc(doc(db, 'loans', id), {
          items: itemsToKeep,
          returnedItems: updatedReturned,
          notes: newNotes,
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Sistema'
        });

        for (const item of itemsToReturn) {
          await updateDoc(doc(db, 'components', item.componentId), {
            status: 'Disponível',
            currentMachine: '',
            updatedAt: serverTimestamp(),
            updatedBy: user?.name || user?.email || 'Sistema'
          });

          const moveRef = doc(collection(db, 'movements'));
          await setDoc(moveRef, {
            componentId: item.componentId,
            componentSerial: item.componentSerial,
            componentName: item.componentName,
            machinePrefix: `Empréstimo: ${targetLoan.thirdPartyName}`,
            action: 'Remoção',
            technicianId: user?.uid || 'system',
            technicianName: user?.name || 'Sistema',
            date: timestamp,
            notes: `Retorno parcial de empréstimo do termo ${targetLoan.contractNumber}.`,
            createdAt: serverTimestamp()
          });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `loans/${id}`);
      }
    }
  };

  // Delete Loan (Firestore or Demo)
  const handleDeleteLoan = async (id: string) => {
    if (isDemoMode) {
      const updated = loans.filter(l => l.id !== id);
      setLoans(updated);
      saveDemoData('loans', updated);
    } else {
      try {
        await deleteDoc(doc(db, 'loans', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `loans/${id}`);
      }
    }
  };

  // Send to maintenance (Firestore or Demo)
  const handleSendToMaintenance = async (maint: Omit<ComponentMaintenance, 'id' | 'updatedAt' | 'updatedBy'>) => {
    const timestampStr = new Date().toISOString();
    const updatedByStr = user?.name || user?.email || 'Sistema';

    // 1. Update component status in local state/Firestore to "Manutenção"
    await handleEditComponent(maint.componentId, {
      status: 'Manutenção',
      currentMachine: ''
    });

    // 2. Insert maintenance record
    if (isDemoMode) {
      const newMaint: ComponentMaintenance = {
        ...maint,
        id: 'demo_maint_' + Math.random().toString(36).substr(2, 9),
        updatedAt: timestampStr,
        updatedBy: updatedByStr
      };
      const updatedList = [...maintenances, newMaint];
      setMaintenances(updatedList);
      saveDemoData('maintenances', updatedList);
    } else {
      try {
        const docRef = doc(collection(db, 'maintenances'));
        await setDoc(docRef, {
          ...maint,
          id: docRef.id,
          updatedAt: serverTimestamp(),
          updatedBy: updatedByStr
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'maintenances');
      }
    }

    // 3. Add movement log
    const moveNotes = `Equipamento enviado para manutenção externa na empresa ${maint.providerName}. Motivo: ${maint.issueDescription}`;
    const maxOs = movements.reduce((max, m) => Math.max(max, m.osNumber || 0), 0);
    const moveOsNumber = maxOs + 1;
    const moveActor = user?.name || user?.email || 'Sistema';
    if (isDemoMode) {
      const newMove: MovementLog = {
        id: 'demo_move_' + Math.random().toString(36).substr(2, 9),
        componentId: maint.componentId,
        componentSerial: maint.componentSerial,
        componentName: maint.componentName,
        machinePrefix: 'Almoxarifado',
        action: 'Manutenção',
        technicianId: user?.uid || 'demo_user',
        technicianName: user?.name || 'Sistema',
        date: timestampStr,
        notes: moveNotes,
        createdAt: timestampStr,
        osNumber: moveOsNumber,
        status: 'Concluída',
        history: [{ timestamp: timestampStr, actorName: moveActor, action: 'O.S. concluída', detail: 'Manutenção registrada pelo fluxo de manutenções.' }],
        completedAt: timestampStr,
        updatedAt: timestampStr,
        updatedBy: moveActor
      };
      const updatedMoves = [...movements, newMove];
      setMovements(updatedMoves);
      saveDemoData('movements', updatedMoves);
    } else {
      try {
        const docRef = doc(collection(db, 'movements'));
        await setDoc(docRef, {
          id: docRef.id,
          componentId: maint.componentId,
          componentSerial: maint.componentSerial,
          componentName: maint.componentName,
          machinePrefix: 'Almoxarifado',
          action: 'Manutenção',
          technicianId: user?.uid || 'user',
          technicianName: user?.name || user?.email || 'Sistema',
          date: serverTimestamp(),
          notes: moveNotes,
          createdAt: serverTimestamp(),
          osNumber: moveOsNumber,
          status: 'Concluída',
          history: [{ timestamp: timestampStr, actorName: moveActor, action: 'O.S. concluída', detail: 'Manutenção registrada pelo fluxo de manutenções.' }],
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: moveActor
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'movements');
      }
    }
  };

  // Return from maintenance (Firestore or Demo)
  const handleReturnFromMaintenance = async (maintId: string, returnData: {
    returnDate: string;
    replacedParts: string;
    servicesPerformed: string;
    cost: number;
    status: 'Concluído' | 'Sem Conserto';
  }) => {
    const timestampStr = new Date().toISOString();
    const updatedByStr = user?.name || user?.email || 'Sistema';

    // Find the maintenance record
    const maintRecord = maintenances.find(m => m.id === maintId);
    if (!maintRecord) return;

    // 1. Update component status to "Disponível" (or keep as is if "Sem Conserto", e.g. "Descartado")
    const newComponentStatus: ComponentStatus = returnData.status === 'Concluído' ? 'Disponível' : 'Descartado';
    await handleEditComponent(maintRecord.componentId, {
      status: newComponentStatus,
      currentMachine: ''
    });

    // 2. Update maintenance record
    if (isDemoMode) {
      const updatedList = maintenances.map(m => {
        if (m.id === maintId) {
          return {
            ...m,
            ...returnData,
            updatedAt: timestampStr,
            updatedBy: updatedByStr
          };
        }
        return m;
      });
      setMaintenances(updatedList);
      saveDemoData('maintenances', updatedList);
    } else {
      try {
        const docRef = doc(db, 'maintenances', maintId);
        await updateDoc(docRef, {
          ...returnData,
          updatedAt: serverTimestamp(),
          updatedBy: updatedByStr
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `maintenances/${maintId}`);
      }
    }

    // 3. Add movement log for return
    const moveNotes = returnData.status === 'Concluído' 
      ? `Retorno de manutenção concluído (${maintRecord.providerName}). Serviços: ${returnData.servicesPerformed || 'Nenhum'}. Peças trocadas: ${returnData.replacedParts || 'Nenhuma'}.`
      : `Equipamento retornado de manutenção SEM CONSERTO (${maintRecord.providerName}). Classificado como Descartado.`;
    const maxOs = movements.reduce((max, m) => Math.max(max, m.osNumber || 0), 0);
    const moveOsNumber = maxOs + 1;
    const moveActor = user?.name || user?.email || 'Sistema';

    if (isDemoMode) {
      const newMove: MovementLog = {
        id: 'demo_move_' + Math.random().toString(36).substr(2, 9),
        componentId: maintRecord.componentId,
        componentSerial: maintRecord.componentSerial,
        componentName: maintRecord.componentName,
        machinePrefix: 'Almoxarifado',
        action: 'Manutenção',
        technicianId: user?.uid || 'demo_user',
        technicianName: user?.name || 'Sistema',
        date: timestampStr,
        notes: moveNotes,
        createdAt: timestampStr,
        osNumber: moveOsNumber,
        status: 'Concluída',
        history: [{ timestamp: timestampStr, actorName: moveActor, action: 'O.S. concluída', detail: 'Retorno de manutenção registrado pelo fluxo de manutenções.' }],
        completedAt: timestampStr,
        updatedAt: timestampStr,
        updatedBy: moveActor
      };
      const updatedMoves = [...movements, newMove];
      setMovements(updatedMoves);
      saveDemoData('movements', updatedMoves);
    } else {
      try {
        const docRef = doc(collection(db, 'movements'));
        await setDoc(docRef, {
          id: docRef.id,
          componentId: maintRecord.componentId,
          componentSerial: maintRecord.componentSerial,
          componentName: maintRecord.componentName,
          machinePrefix: 'Almoxarifado',
          action: 'Manutenção',
          technicianId: user?.uid || 'user',
          technicianName: user?.name || user?.email || 'Sistema',
          date: serverTimestamp(),
          notes: moveNotes,
          createdAt: serverTimestamp(),
          osNumber: moveOsNumber,
          status: 'Concluída',
          history: [{ timestamp: timestampStr, actorName: moveActor, action: 'O.S. concluída', detail: 'Retorno de manutenção registrado pelo fluxo de manutenções.' }],
          completedAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: moveActor
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'movements');
      }
    }
  };

  // Add maintenance provider (assistance)
  const handleAddProvider = async (providerData: Omit<MaintenanceProvider, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => {
    const timestampStr = new Date().toISOString();
    const updatedByStr = user?.name || user?.email || 'Sistema';

    if (isDemoMode) {
      const newProvider: MaintenanceProvider = {
        ...providerData,
        id: 'demo_provider_' + Math.random().toString(36).substr(2, 9),
        createdAt: timestampStr,
        updatedAt: timestampStr,
        updatedBy: updatedByStr
      };
      const updatedList = [...providers, newProvider];
      setProviders(updatedList);
      saveDemoData('providers', updatedList);
    } else {
      try {
        const docRef = doc(collection(db, 'providers'));
        await setDoc(docRef, {
          ...providerData,
          id: docRef.id,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          updatedBy: updatedByStr
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'providers');
      }
    }
  };

  const handleAddPartner = async (partnerData: Omit<Partner, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => {
    const updatedBy = user?.name || user?.email || 'Sistema';
    if (isDemoMode) {
      const partner: Partner = { ...partnerData, id: `demo_partner_${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy };
      const updated = [...partners, partner];
      setPartners(updated); saveDemoData('partners', updated);
      return;
    }
    const ref = doc(collection(db, 'partners'));
    await setDoc(ref, { ...partnerData, id: ref.id, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy });
  };

  const handleEditPartner = async (id: string, updates: Partial<Partner>) => {
    const updatedBy = user?.name || user?.email || 'Sistema';
    if (isDemoMode) {
      const updated = partners.map(partner => partner.id === id ? { ...partner, ...updates, updatedAt: new Date().toISOString(), updatedBy } : partner);
      setPartners(updated); saveDemoData('partners', updated);
      return;
    }
    await updateDoc(doc(db, 'partners', id), { ...updates, updatedAt: serverTimestamp(), updatedBy });
  };

  const handleDeactivatePartner = async (id: string) => handleEditPartner(id, { active: false });

  const handleAddUnifiedThirdParty = async (thirdParty: Omit<ThirdParty, 'id' | 'createdAt' | 'updatedAt' | 'updatedBy'>) => {
    await handleAddPartner({
      legalName: thirdParty.company || thirdParty.name,
      tradingName: thirdParty.name,
      personType: thirdParty.document.replace(/\D/g, '').length <= 11 ? 'PF' : 'PJ',
      document: thirdParty.document,
      phone: thirdParty.phone,
      email: thirdParty.email,
      cep: '', address: '', contactPerson: thirdParty.name,
      contacts: [{ id: `contact_${Date.now()}`, name: thirdParty.name, phone: thirdParty.phone, email: thirdParty.email }],
      types: ['Recebedor de empréstimo'], active: true, notes: ''
    });
  };

  const handleEditUnifiedThirdParty = async (id: string, updates: Partial<ThirdParty>) => {
    if (!partners.some(partner => partner.id === id)) return handleEditThirdParty(id, updates);
    await handleEditPartner(id, {
      legalName: updates.company,
      tradingName: updates.name,
      document: updates.document,
      phone: updates.phone,
      email: updates.email
    });
  };

  const handleDeleteUnifiedThirdParty = async (id: string) => {
    if (!partners.some(partner => partner.id === id)) return handleDeleteThirdParty(id);
    await handleDeactivatePartner(id);
  };

  // Update Company Profile (Firestore or Demo)
  const handleUpdateCompany = async (updates: Omit<CompanyProfile, 'updatedAt' | 'updatedBy'>) => {
    const timestampStr = new Date().toISOString();
    const updatedByStr = user?.name || user?.email || 'Sistema';

    const fullProfile: CompanyProfile = {
      ...updates,
      updatedAt: timestampStr,
      updatedBy: updatedByStr
    };

    if (isDemoMode) {
      setCompanyProfile(fullProfile);
      saveDemoData('company_profile', fullProfile);
    } else {
      try {
        const docRef = doc(db, 'settings', 'company');
        await setDoc(docRef, {
          ...updates,
          updatedAt: serverTimestamp(),
          updatedBy: updatedByStr
        }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'settings/company');
      }
    }
  };

  // Add User Profile (Firestore or Demo)
  const handleAddUser = async (newUser: Omit<UserProfile, 'createdAt'>, password?: string) => {
    const isAuthorized = user?.role === 'administrador' || user?.role === 'ADMINISTRADOR';
    if (!isAuthorized) {
      throw new Error('Acesso Negado');
    }

    const timestampStr = new Date().toISOString();

    if (isDemoMode) {
      const created: UserProfile = {
        ...newUser,
        passwordEncrypted: password ? await hashPassword(password) : undefined,
        createdAt: timestampStr
      };
      const updated = [...usersList, created];
      setUsersList(updated);
      saveDemoData('users', updated);
      return;
    }

    try {
      if (password) {
        // 1. Create credential login in Firebase Auth using the secondary app instance
        const { getSecondaryAuth } = await import('./firebase');
        const secondaryAuth = getSecondaryAuth();
        if (!secondaryAuth) {
          throw new Error('Não foi possível obter a instância secundária do Firebase Auth.');
        }

        const { createUserWithEmailAndPassword, signOut: secondarySignOut } = await import('firebase/auth');
        
        let userCredential;
        try {
          userCredential = await createUserWithEmailAndPassword(secondaryAuth, newUser.email, password);
        } catch (authErr: any) {
          if (authErr.code === 'auth/operation-not-allowed') {
            throw new Error('O login por E-mail/Senha não está ativado no seu Console do Firebase. Por favor, acesse o Console do Firebase > Authentication > Sign-in method e ative o provedor de "E-mail/Senha" para permitir a criação de novos usuários.');
          }
          throw authErr;
        }

        const firebaseUser = userCredential.user;
        const hashedPass = await hashPassword(password);

        // 2. Save User Profile in Firestore
        const userDocRef = doc(db, 'users', firebaseUser.uid);
        const profile: UserProfile = {
          uid: firebaseUser.uid,
          email: newUser.email,
          name: newUser.name,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          username: newUser.username,
          passwordEncrypted: hashedPass,
          role: newUser.role,
          createdAt: serverTimestamp()
        };
        await setDoc(userDocRef, profile);
        
        // Clean up secondary auth session
        await secondarySignOut(secondaryAuth);
      } else {
        // Pre-registration only
        const userDocRef = doc(db, 'users', newUser.uid);
        const profile: UserProfile = {
          uid: newUser.uid,
          email: newUser.email,
          name: newUser.name,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          username: newUser.username,
          role: newUser.role,
          createdAt: serverTimestamp()
        };
        await setDoc(userDocRef, profile);
      }
    } catch (err: any) {
      if (err.code === 'auth/operation-not-allowed' || (err.message && err.message.includes('auth/operation-not-allowed'))) {
        throw new Error('O login por E-mail/Senha não está ativado no seu Console do Firebase. Por favor, acesse o Console do Firebase > Authentication > Sign-in method e ative o provedor de "E-mail/Senha" para cadastrar novos usuários.');
      }
      handleFirestoreError(err, OperationType.CREATE, `users/${newUser.uid}`);
    }
  };

  // Edit User Profile (Firestore or Demo)
  const handleEditUser = async (uid: string, updates: Partial<Omit<UserProfile, 'uid' | 'createdAt'>>, rawPassword?: string) => {
    const isAuthorized = user?.role === 'administrador' || user?.role === 'ADMINISTRADOR';
    if (!isAuthorized) {
      throw new Error('Acesso Negado');
    }

    // Hash the password if provided
    let passwordEncrypted: string | undefined = undefined;
    if (rawPassword) {
      passwordEncrypted = await hashPassword(rawPassword);
    }

    if (isDemoMode) {
      const updated = usersList.map(u => {
        if (u.uid === uid) {
          const finalUpdates: any = { ...updates };
          if (passwordEncrypted) {
            finalUpdates.passwordEncrypted = passwordEncrypted;
          }
          return { ...u, ...finalUpdates };
        }
        return u;
      });
      setUsersList(updated);
      saveDemoData('users', updated);
      return;
    }

    let authWarning: string | undefined = undefined;

    try {
      // 1. Update Firebase Auth via our backend API
      const authUpdates: any = {};
      if (updates.email) authUpdates.email = updates.email;
      if (rawPassword) authUpdates.password = rawPassword;
      if (updates.name) authUpdates.displayName = updates.name;

      if (Object.keys(authUpdates).length > 0) {
        try {
          const response = await fetch('/api/admin/users/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              uid,
              ...authUpdates
            }),
          });
          if (!response.ok) {
            const resData = await response.json().catch(() => ({}));
            const errStr = resData.error || '';
            console.warn('Backend Auth Update failed:', errStr);
            if (errStr.includes('identitytoolkit.googleapis.com')) {
              authWarning = 'A API "Identity Toolkit" do Firebase Admin não está habilitada em seu projeto Google Cloud. Os dados cadastrais foram salvos no banco de dados, mas as alterações de credenciais (e-mail ou senha) no sistema de autenticação foram ignoradas.';
            } else {
              authWarning = `Não foi possível atualizar o login no Firebase Auth: ${errStr}. Os dados cadastrais foram salvos com sucesso no banco de dados.`;
            }
          }
        } catch (apiErr: any) {
          console.error('Error calling backend update user API:', apiErr);
          authWarning = 'Falha ao se conectar com o servidor para atualizar o login. Os dados cadastrais foram salvos.';
        }
      }

      // 2. Update Firestore profile document
      const userDocRef = doc(db, 'users', uid);
      const firestoreUpdates: any = { ...updates };
      if (passwordEncrypted) {
        firestoreUpdates.passwordEncrypted = passwordEncrypted;
      }
      await updateDoc(userDocRef, firestoreUpdates);
      
      return { success: true, warning: authWarning };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleUpdateOwnProfile = async (
    updates: { name?: string; firstName?: string; lastName?: string; username?: string; photoURL?: string },
    rawPassword?: string
  ) => {
    if (!user) return { success: false, error: 'Usuário não autenticado' };

    const firstName = updates.firstName || user.firstName || '';
    const lastName = updates.lastName || user.lastName || '';
    const fullName = updates.name || `${firstName} ${lastName}`.trim() || user.name;
    const derivedEmail = updates.username ? `${updates.username}@agrostockgps.com` : user.email;

    const firestoreData: any = {
      name: fullName,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      username: updates.username || user.username || undefined,
      email: derivedEmail,
      role: user.role,
    };

    if (updates.photoURL !== undefined) {
      firestoreData.photoURL = updates.photoURL || null;
    }

    if (rawPassword) {
      firestoreData.passwordEncrypted = await hashPassword(rawPassword);
    }

    if (isDemoMode) {
      const users = JSON.parse(localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}users`) || '[]');
      const idx = users.findIndex((u: any) => u.uid === user.uid);
      if (idx !== -1) {
        users[idx] = { ...users[idx], ...firestoreData };
        localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}users`, JSON.stringify(users));
      }
      setUsersList(users);
      setUser({ ...user, ...firestoreData });
      return { success: true };
    }

    try {
      const userDocRef = doc(db, 'users', user.uid);
      await updateDoc(userDocRef, firestoreData);
      const updatedUser = { ...user, ...firestoreData, name: fullName, email: derivedEmail };
      if (firestoreData.photoURL === null) delete updatedUser.photoURL;
      setUser(updatedUser);
      return { success: true };
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.uid}`);
      return { success: false, error: 'Erro ao atualizar perfil' };
    }
  };

  // Delete User Profile (Firestore or Demo)
  const handleDeleteUser = async (uid: string) => {
    const isAuthorized = user?.role === 'administrador' || user?.role === 'ADMINISTRADOR';
    if (!isAuthorized) {
      throw new Error('Acesso Negado');
    }

    if (isDemoMode) {
      const updated = usersList.filter(u => u.uid !== uid);
      setUsersList(updated);
      saveDemoData('users', updated);
      return;
    }

    try {
      // 1. Delete from Firebase Auth via backend API
      await fetch('/api/admin/users/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ uid }),
      }).catch(err => console.warn("Failed to delete user in auth, continuing deletion in firestore:", err));

      // 2. Delete from Firestore
      const userDocRef = doc(db, 'users', uid);
      await deleteDoc(userDocRef);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
    }
  };

  // Nav helper
  const navigateToTab = (tab: string, subtab?: string, preset?: DashboardNavPreset) => {
    setCurrentTab(tab);
    setMovementsSubTab(subtab as 'os' | 'kanban' | undefined);
    setLicensePresetFilter(preset?.licenseFilter ?? null);
    setComponentPresetFilter(preset?.componentStatus || preset?.componentBrand ? preset : null);
    setMachinePresetFilter(preset?.machineType ? preset : null);
    setKanbanPresetFilter(preset?.kanbanStatus ? preset : null);
    setIsMobileMenuOpen(false);
    setIsUserMenuOpen(false);
    setIsRegistrationsMenuOpen(false);
  };

  if (loadingApp) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col justify-center items-center">
        <div className="p-4 bg-emerald-500/20 border border-emerald-500/30 rounded-3xl animate-pulse relative h-20 w-20 flex items-center justify-center">
          <Tractor className="h-10 w-10 text-emerald-400 mt-2" />
          <Satellite className="h-5 w-5 text-emerald-400 absolute top-2 right-2" />
        </div>
        <p translate="no" className="mt-4 text-slate-300 font-bold tracking-wide animate-pulse notranslate">Agro Stock GPS</p>
        <p className="text-xs text-slate-500 mt-1">Carregando sistema...</p>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen onAuthSuccess={handleAuthSuccess} onEnterDemo={handleEnterDemo} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans" id="app-root-container">
      
      {/* Top Banner / Navigation */}
      <nav className="bg-slate-900 text-white sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center gap-3">
            
            {/* Logo and Brand */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigateToTab('dashboard')}
                title="Ir para o Painel Inicial"
                className="p-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl relative h-10 w-10 flex items-center justify-center cursor-pointer hover:bg-emerald-500/30 hover:border-emerald-500/50 active:scale-95 transition-all focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                id="logo-home-button"
              >
                <Tractor className="h-5 w-5 text-emerald-400 mt-1" />
                <Satellite className="h-3 w-3 text-emerald-400 absolute top-1 right-1" />
              </button>
              <span 
                onClick={() => navigateToTab('dashboard')}
                title="Ir para o Painel Inicial"
                translate="no" 
                className="text-md font-extrabold tracking-tight notranslate cursor-pointer hover:text-emerald-300 transition-colors select-none"
              >
                Agro <span className="text-emerald-400">Stock</span> GPS
              </span>

              {/* Demo Mode Badge */}
              {isDemoMode && (
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  Modo Demonstração (Local)
                </span>
              )}
            </div>

            {/* Desktop Nav Items */}
            <div className="ml-6 hidden items-center gap-2 md:flex">
              <button
                onClick={() => navigateToTab('dashboard')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'dashboard' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'}`}
                id="nav-dashboard"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </button>

              <div className="relative" data-registrations-menu>
                <button
                  onClick={() => setIsRegistrationsMenuOpen(open => !open)}
                  className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${isRegistrationsMenuOpen || ['components', 'partners', 'licenses', 'machines'].includes(currentTab) ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'}`}
                  id="registrations-menu-button"
                  aria-haspopup="menu"
                  aria-expanded={isRegistrationsMenuOpen}
                >
                  <Database className="h-4 w-4" />
                  Cadastros
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isRegistrationsMenuOpen ? 'rotate-180' : ''}`} />
                </button>
                {isRegistrationsMenuOpen && (
                  <div id="registrations-menu-dropdown" role="menu" className="absolute left-0 top-full z-50 mt-2 w-56 rounded-2xl border border-slate-700 bg-slate-800 p-1.5 shadow-2xl shadow-slate-950/30">
                    <button onClick={() => navigateToTab('components')} role="menuitem" className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${currentTab === 'components' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-200 hover:bg-slate-700/60 hover:text-white'}`}>
                      <Cpu className="h-4 w-4" /> Equipamentos GPS
                    </button>
                    <button onClick={() => navigateToTab('partners')} role="menuitem" className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${currentTab === 'partners' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-200 hover:bg-slate-700/60 hover:text-white'}`}>
                      <Building2 className="h-4 w-4" /> Parceiros
                    </button>
                    <button onClick={() => navigateToTab('licenses')} role="menuitem" className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${currentTab === 'licenses' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-200 hover:bg-slate-700/60 hover:text-white'}`}>
                      <Key className="h-4 w-4" /> Licenças
                    </button>
                    <button onClick={() => navigateToTab('machines')} role="menuitem" className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${currentTab === 'machines' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-200 hover:bg-slate-700/60 hover:text-white'}`}>
                      <Tractor className="h-4 w-4" /> Frota
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => navigateToTab('movements')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'movements' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'}`}
                id="nav-movements"
              >
                <Wrench className="h-4 w-4" />
                Serviços de Campo
              </button>

              <button
                onClick={() => navigateToTab('loans')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'loans' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'}`}
                id="nav-loans"
              >
                <Handshake className="h-4 w-4" />
                Empréstimos
              </button>

            </div>

            {/* Notification center — shared by desktop and mobile */}
            <div className="ml-auto flex items-center">
              <AppNotificationCenter
                user={user}
                licenses={licenses}
                maintenances={maintenances}
                loans={loans}
                maintenanceOverdueDays={maintenanceSettings?.overdueDays || 7}
    onNavigate={(tab, itemId) => {
      navigateToTab(tab);
      setFocusTarget(itemId ? { tab, itemId } : null);
    }}
  />
            </div>

            {/* User Profile / Logout Area */}
            <div className="hidden items-center md:flex">
              <div className="relative">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsUserMenuOpen(!isUserMenuOpen);
                  }}
                  className={`group flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${isUserMenuOpen || ['profile', 'support', 'settings'].includes(currentTab) ? 'bg-slate-800/80' : 'hover:bg-slate-800/55'}`}
                  id="user-menu-button"
                  aria-haspopup="menu"
                  aria-expanded={isUserMenuOpen}
                  aria-label="Abrir menu do usuário"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-slate-800 ring-1 ring-emerald-400/20">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[11px] font-extrabold text-emerald-400 select-none">
                        {user.name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="hidden min-w-0 text-left md:block">
                    <span className="block max-w-24 truncate text-xs font-bold leading-tight text-white">{user.name.split(' ')[0]}</span>
                    <span className="mt-0.5 block text-[10px] font-medium leading-tight text-slate-400">
                      {user.role === 'administrador' || user.role === 'ADMINISTRADOR' ? 'Administrador' : 'Técnico de campo'}
                    </span>
                  </div>
                  <ChevronDown className={`hidden h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform duration-200 group-hover:text-slate-300 md:block ${isUserMenuOpen ? 'rotate-180 text-slate-300' : ''}`} aria-hidden="true" />
                </button>

                {isUserMenuOpen && (
                  <div
                    id="user-menu-dropdown"
                    role="menu"
                    className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-700 bg-slate-800 p-1.5 shadow-2xl shadow-slate-950/30"
                  >
                    <button
                      onClick={() => navigateToTab('profile')}
                      role="menuitem"
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${currentTab === 'profile' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-200 hover:bg-slate-700/60 hover:text-white'}`}
                    >
                      <User className="h-4 w-4" />
                      Meu Perfil
                    </button>
                    <button
                      onClick={() => navigateToTab('support')}
                      role="menuitem"
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${currentTab === 'support' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-200 hover:bg-slate-700/60 hover:text-white'}`}
                    >
                      <LifeBuoy className="h-4 w-4" />
                      Suporte
                    </button>
                    {(user.role === 'administrador' || user.role === 'ADMINISTRADOR') && (
                      <button
                        onClick={() => navigateToTab('settings')}
                        role="menuitem"
                        className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-colors ${currentTab === 'settings' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-200 hover:bg-slate-700/60 hover:text-white'}`}
                      >
                        <Settings className="h-4 w-4" />
                        Configurações
                      </button>
                    )}
                    <div className="my-1 border-t border-slate-700" />
                    <button
                      onClick={handleLogout}
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-xs font-bold text-rose-300 transition-colors hover:bg-rose-500/10"
                    >
                      <LogOut className="h-4 w-4" />
                      Sair
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Mobile menu button */}
            <div className="flex items-center md:hidden">
              <button
                onClick={() => {
                  setIsUserMenuOpen(false);
                  setIsMobileMenuOpen(!isMobileMenuOpen);
                }}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 focus:outline-none"
                id="mobile-menu-toggle"
              >
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>

          </div>
        </div>

        {/* Mobile menu dropdown */}
        {isMobileMenuOpen && (
          <div className="md:hidden bg-slate-800 border-t border-slate-700 px-4 pt-2 pb-4 space-y-2 animate-fade-in" id="mobile-menu-dropdown">
            
            <button
              onClick={() => navigateToTab('dashboard')}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${currentTab === 'dashboard' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </button>

            <div data-registrations-menu className={`rounded-xl ${['components', 'partners', 'licenses', 'machines'].includes(currentTab) ? 'bg-slate-900/45' : ''}`}>
              <button
                onClick={() => setIsRegistrationsMenuOpen(open => !open)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-all ${['components', 'partners', 'licenses', 'machines'].includes(currentTab) ? 'text-emerald-400' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}
                aria-expanded={isRegistrationsMenuOpen}
              >
                <Database className="h-4 w-4" />
                <span className="flex-1">Cadastros</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${isRegistrationsMenuOpen ? 'rotate-180' : ''}`} />
              </button>
              {isRegistrationsMenuOpen && (
                <div className="space-y-1 px-2 pb-2">
                  <button onClick={() => navigateToTab('components')} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${currentTab === 'components' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                    <Cpu className="h-4 w-4" /> Equipamentos GPS
                  </button>
                  <button onClick={() => navigateToTab('partners')} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${currentTab === 'partners' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                    <Building2 className="h-4 w-4" /> Parceiros
                  </button>
                  <button onClick={() => navigateToTab('licenses')} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${currentTab === 'licenses' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                    <Key className="h-4 w-4" /> Licenças
                  </button>
                  <button onClick={() => navigateToTab('machines')} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-xs font-semibold ${currentTab === 'machines' ? 'bg-emerald-500/15 text-emerald-300' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'}`}>
                    <Tractor className="h-4 w-4" /> Frota
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => navigateToTab('movements')}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${currentTab === 'movements' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}
            >
              <Wrench className="h-4 w-4" />
              Serviços de Campo
            </button>

            <button
              onClick={() => navigateToTab('loans')}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${currentTab === 'loans' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}
            >
              <Handshake className="h-4 w-4" />
              Empréstimos
            </button>

            <div className="mt-3 border-t border-slate-700/60 pt-3">
              <p className="mb-1 px-3 text-[9px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Conta e sistema</p>
              <button
                onClick={() => navigateToTab('profile')}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-all ${currentTab === 'profile' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}
              >
                <User className="h-4 w-4" />
                Meu Perfil
              </button>
              <button
                onClick={() => navigateToTab('support')}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-all ${currentTab === 'support' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}
              >
                <LifeBuoy className="h-4 w-4" />
                Suporte
              </button>
              {(user.role === 'administrador' || user.role === 'ADMINISTRADOR') && (
                <button
                  onClick={() => navigateToTab('settings')}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-bold transition-all ${currentTab === 'settings' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'}`}
                >
                  <Settings className="h-4 w-4" />
                  Configurações
                </button>
              )}
            </div>

            <div className="pt-3 border-t border-slate-700/60 mt-3">
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-rose-500/15 text-rose-300 font-bold text-xs rounded-xl hover:bg-rose-500/25 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sair do Sistema
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-8 relative">
        
        {/* Render Active Tab */}
        {currentTab === 'dashboard' && (
          <Dashboard 
            key={`dashboard-${components.length}-${machines.length}-${movements.length}-${licenses.length}-${fieldDataCollections.length}`}
            components={components} 
            machines={machines} 
            movements={movements} 
            licenses={licenses}
            fieldDataCollections={fieldDataCollections}
            role={user.role} 
            companyProfile={companyProfile}
            onNavigate={navigateToTab}
            onSeedData={isDemoMode ? seedDemoInitialData : handleSeedRealDatabase}
          />
        )}

        {currentTab === 'components' && (
          <ComponentsTab
            components={components}
            machines={machines}
            role={user.role}
            initialStatusFilter={componentPresetFilter?.componentStatus}
            initialBrandFilter={componentPresetFilter?.componentBrand}
            focusComponentId={focusTarget?.tab === 'components' ? focusTarget.itemId : null}
            onFocusConsumed={() => setFocusTarget(null)}
            componentTypes={getActiveTypes('equipment_component')}
            serviceTypes={getActiveTypes('service')}
            onAddComponent={handleAddComponent}
            onEditComponent={handleEditComponent}
            onDeleteComponent={handleDeleteComponent}
            maintenances={maintenances}
            onSendToMaintenance={handleSendToMaintenance}
            onReturnFromMaintenance={handleReturnFromMaintenance}
            providers={[
              ...providers,
              ...partners
                .filter(partner => partner.active && partner.types.includes('Assistência técnica'))
                .map(partner => ({
                  id: partner.id,
                  name: partner.tradingName || partner.legalName,
                  phone: partner.phone,
                  email: partner.email,
                  address: partner.address || '',
                  contactPerson: partner.contactPerson || '',
                  createdAt: partner.createdAt,
                  updatedAt: partner.updatedAt,
                  updatedBy: partner.updatedBy
                }))
            ]}
            onAddProvider={async provider => handleAddPartner({
              legalName: provider.name,
              tradingName: provider.name,
              personType: 'PJ',
              document: '',
              phone: provider.phone || '',
              email: provider.email || '',
              cep: '',
              address: provider.address || '',
              contactPerson: provider.contactPerson || '',
              contacts: provider.contactPerson || provider.phone || provider.email ? [{ id: `contact_${Date.now()}`, name: provider.contactPerson || provider.name, phone: provider.phone || '', email: provider.email || '' }] : [],
              types: ['Assistência técnica'],
              active: true,
              notes: ''
            })}
          />
        )}

        {currentTab === 'licenses' && (
          <LicensesTab
            licenses={licenses}
            components={components}
            role={user.role}
            currentUser={user}
            isDemoMode={isDemoMode}
            initialFilter={licensePresetFilter}
            focusLicenseId={focusTarget?.tab === 'licenses' ? focusTarget.itemId : null}
            onFocusConsumed={() => setFocusTarget(null)}
            onAddLicense={handleAddLicense}
            onEditLicense={handleEditLicense}
            onDeleteLicense={handleDeleteLicense}
          />
        )}

        {currentTab === 'machines' && (
          <MachinesTab
            machines={machines}
            movements={movements}
            fieldDataCollections={fieldDataCollections}
            role={user.role}
            initialTypeFilter={machinePresetFilter?.machineType}
            machineTypes={getActiveTypes('vehicle') as MachineType[]}
            onAddMachine={handleAddMachine}
            onEditMachine={handleEditMachine}
            onDeleteMachine={handleDeleteMachine}
          />
        )}

        {currentTab === 'movements' && (
          <MovementsTab
            movements={movements}
            components={components}
            machines={machines}
            fieldDataCollections={fieldDataCollections}
            role={user.role}
            currentUserId={user.uid}
            currentUserName={user.name}
            extraServiceActions={getActiveTypes('service').filter(a => !CORE_SERVICE_ACTIONS.includes(a))}
            companyProfile={companyProfile}
            onAddMovement={handleAddMovement}
            onUpdateMovement={handleUpdateMovement}
            onDeleteMovement={handleDeleteMovement}
            onCompleteCollection={handleCompleteFieldDataCollection}
            onEnsureWeekRecords={handleEnsureFieldDataWeek}
            onTransitionOSStatus={handleTransitionOSStatus}
            initialSubTab={movementsSubTab}
            initialKanbanStatus={kanbanPresetFilter?.kanbanStatus}
          />
        )}

        {currentTab === 'loans' && (
          <LoansTab
            components={components}
            thirdParties={partners
              .filter(partner => partner.active && partner.types.includes('Recebedor de empréstimo'))
              .map(partner => ({
                id: partner.id,
                name: partner.tradingName || partner.legalName,
                document: partner.document,
                phone: partner.phone,
                email: partner.email,
                company: partner.legalName,
                createdAt: partner.createdAt,
                updatedAt: partner.updatedAt,
                updatedBy: partner.updatedBy
              }))}
            loans={loans}
            role={user.role}
            currentUserName={user.name}
            companyProfile={companyProfile}
            focusLoanId={focusTarget?.tab === 'loans' ? focusTarget.itemId : null}
            onFocusConsumed={() => setFocusTarget(null)}
            onAddLoan={handleAddLoan}
            onReturnLoan={handleReturnLoan}
            onPartialReturnLoan={handlePartialReturnLoan}
            onDeleteLoan={handleDeleteLoan}
          />
        )}

        {currentTab === 'partners' && (
          <PartnersTab
            partners={partners}
            role={user.role}
            maintenances={maintenances}
            loans={loans}
            partnerTypes={getActiveTypes('partner') as PartnerType[]}
            onAddPartner={handleAddPartner}
            onEditPartner={handleEditPartner}
            onDeactivatePartner={handleDeactivatePartner}
          />
        )}

        {currentTab === 'support' && (
          <SupportTab
            user={user}
            onBackToDashboard={() => navigateToTab('dashboard')}
            focusTicketId={focusTarget?.tab === 'support' ? focusTarget.itemId : null}
            onFocusConsumed={() => setFocusTarget(null)}
          />
        )}

        {currentTab === 'profile' && (
          <ProfileTab
            user={user}
            onUpdateProfile={handleUpdateOwnProfile}
            onBack={() => setCurrentTab('dashboard')}
          />
        )}

        {currentTab === 'settings' && (user.role === 'administrador' || user.role === 'ADMINISTRADOR') && (
          <SettingsTab
            companyProfile={companyProfile}
            role={user.role}
            currentUserName={user.name}
            usersList={usersList}
            licenses={licenses}
            machines={machines}
            fieldDataCollections={fieldDataCollections}
            loans={loans}
            components={components}
            movements={movements}
            maintenances={maintenances}
            currentUser={user}
            isDemoMode={isDemoMode}
            typeRegistry={typeRegistry}
            onAddType={handleAddRegisteredType}
            onUpdateType={handleUpdateRegisteredType}
            onDeleteType={handleDeleteRegisteredType}
            getTypeUsageCount={getTypeUsageCount}
            onUpdateCompany={handleUpdateCompany}
            onAddUser={handleAddUser}
            onEditUser={handleEditUser}
            onDeleteUser={handleDeleteUser}
          />
        )}

      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-6 text-center text-xs mt-12 border-t border-slate-800">
        <p translate="no" className="font-semibold text-slate-300 notranslate">Agro Stock GPS © {new Date().getFullYear()}</p>
        <p className="mt-1.5 text-slate-500">
          NaneTech • Desenvolvimento de Software e Aplicativos
        </p>
      </footer>

    </div>
  );
}
