import React, { useState, useEffect } from 'react';
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
  getDocs
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
  MaintenanceProvider
} from './types';
import AuthScreen from './components/AuthScreen';
import { hashPassword } from './utils/crypto';
import Dashboard from './components/Dashboard';
import ComponentsTab from './components/ComponentsTab';
import MachinesTab from './components/MachinesTab';
import MovementsTab from './components/MovementsTab';
import LicensesTab from './components/LicensesTab';
import LoansTab from './components/LoansTab';
import CompanyTab from './components/CompanyTab';
import { 
  Cpu, 
  Tractor,
  Satellite,
  Shield, 
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
  Building2,
  Download,
  Info
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

export default function App() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallBtn, setShowInstallBtn] = useState(true);
  const [showInstallTip, setShowInstallTip] = useState(false);

  // Core Data Lists
  const [components, setComponents] = useState<AutopilotComponent[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [movements, setMovements] = useState<MovementLog[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);
  const [loans, setLoans] = useState<ComponentLoan[]>([]);
  const [maintenances, setMaintenances] = useState<ComponentMaintenance[]>([]);
  const [providers, setProviders] = useState<MaintenanceProvider[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile>(DEFAULT_COMPANY_PROFILE);
  const [usersList, setUsersList] = useState<UserProfile[]>([]);

  const [loadingApp, setLoadingApp] = useState(true);

  // Listener para capturar o prompt de instalação do PWA
  useEffect(() => {
    // Detectar se já está em modo standalone (PWA instalado)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    if (isStandalone) {
      setShowInstallBtn(false);
      return;
    }

    // Verificar se o script inline já capturou o evento antes do React montar
    if ((window as any).__deferredInstallPrompt) {
      setDeferredPrompt((window as any).__deferredInstallPrompt);
    }

    // Escutar o custom event disparado pelo script inline em index.html
    const handleInstallReady = () => {
      setDeferredPrompt((window as any).__deferredInstallPrompt);
    };

    window.addEventListener('__installPromptReady', handleInstallReady);

    return () => {
      window.removeEventListener('__installPromptReady', handleInstallReady);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) {
      setShowInstallTip(true);
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`Resposta do usuário para a instalação: ${outcome}`);
    setDeferredPrompt(null);
    setShowInstallBtn(false);
    setShowInstallTip(false);
  };

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
              role: data.role as UserRole,
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
            machinePrefix: data.machinePrefix || '',
            action: data.action || 'Instalação',
            technicianId: data.technicianId || '',
            technicianName: data.technicianName || '',
            date: data.date,
            notes: data.notes || '',
            createdAt: data.createdAt
          });
        });
        setMovements(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'movements');
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

    // Third Parties Listener
    const unsubThirdParties = onSnapshot(
      collection(db, 'third_parties'),
      (snapshot) => {
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
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'third_parties');
      }
    );

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
      unsubLicenses();
      unsubThirdParties();
      unsubLoans();
      unsubMaintenances();
      unsubProviders();
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
    const localCompany = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}company_profile`);
    const localUsers = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}users`);
 
    if (localComponents) setComponents(JSON.parse(localComponents));
    if (localMachines) setMachines(JSON.parse(localMachines));
    if (localMovements) setMovements(JSON.parse(localMovements));
    if (localLicenses) setLicenses(JSON.parse(localLicenses));
    if (localThirdParties) setThirdParties(JSON.parse(localThirdParties));
    if (localLoans) setLoans(JSON.parse(localLoans));
    if (localMaintenances) setMaintenances(JSON.parse(localMaintenances));
    if (localProviders) setProviders(JSON.parse(localProviders));
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
  const saveDemoData = (type: 'components' | 'machines' | 'movements' | 'licenses' | 'third_parties' | 'loans' | 'maintenances' | 'providers' | 'company_profile' | 'users', data: any) => {
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
      { id: 'move1', componentId: 'comp1', componentSerial: 'TR-750-9981', componentName: 'Trimble GFX-750 Monitor', machinePrefix: 'T01', action: 'Instalação', technicianId: 'tech_1', technicianName: 'Felipe Neves', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), notes: 'Instalado com chicote original no console superior do trator T01.', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'move2', componentId: 'comp2', componentSerial: 'TR-372-4011', componentName: 'Trimble AG-372 Receptor', machinePrefix: 'T01', action: 'Instalação', technicianId: 'tech_1', technicianName: 'Felipe Neves', date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), notes: 'Instalada no teto do trator T01 e calibrada com sinal RangePoint RTX.', createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'move3', componentId: 'comp6', componentSerial: 'TR-372-8821', componentName: 'Trimble AG-372 Receptor', machinePrefix: 'Almoxarifado', action: 'Manutenção', technicianId: 'tech_2', technicianName: 'Rodrigo Antunes', date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), notes: 'Aparelho perdendo conexão RTK de forma intermitente. Enviado para reparo.', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() },
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

      // We will let Firestore listener update the local react state automatically!
      alert('Banco de dados populado com sucesso com dados da frota, estoque e licenças!');
    } catch (err) {
      console.error('Error seeding Firestore', err);
      alert('Erro ao popular banco de dados real. Certifique-se de que as regras do Firestore foram implantadas.');
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
    
    // Find target component
    const comp = components.find(c => c.id === log.componentId);
    if (!comp) throw new Error('Equipamento GPS correspondente não foi localizado.');

    // Determine target component new status and machine placement
    let nextStatus = comp.status;
    let nextMachine = comp.currentMachine || '';

    if (log.action === 'Instalação') {
      nextStatus = 'Em Uso';
      nextMachine = log.machinePrefix;
    } else if (log.action === 'Remoção') {
      nextStatus = 'Disponível';
      nextMachine = '';
    } else if (log.action === 'Manutenção') {
      nextStatus = 'Manutenção';
      nextMachine = '';
    }

    if (isDemoMode) {
      // 1. Create movement
      const newMove: MovementLog = {
        ...log,
        id: 'demo_move_' + Math.random().toString(36).substr(2, 9),
        technicianId: user?.uid || 'demo_tech',
        technicianName: user?.name || 'Técnico Demo',
        createdAt: timestampStr
      };

      const updatedMovements = [...movements, newMove];
      setMovements(updatedMovements);
      saveDemoData('movements', updatedMovements);

      // 2. Update component
      const updatedComponents = components.map(c => {
        if (c.id === log.componentId) {
          return {
            ...c,
            status: nextStatus,
            currentMachine: nextMachine,
            updatedAt: timestampStr,
            updatedBy: user?.name || 'Técnico Demo'
          };
        }
        return c;
      });
      setComponents(updatedComponents);
      saveDemoData('components', updatedComponents);

    } else {
      try {
        // Use an atomic sequential execution (equivalent of a database transaction / batch)
        // 1. Write the movement log
        const moveRef = doc(collection(db, 'movements'));
        await setDoc(moveRef, {
          ...log,
          id: moveRef.id,
          technicianId: user?.uid || 'system',
          technicianName: user?.name || 'Técnico',
          createdAt: serverTimestamp()
        });

        // 2. Update the component status
        const compRef = doc(db, 'components', log.componentId);
        await updateDoc(compRef, {
          status: nextStatus,
          currentMachine: nextMachine,
          updatedAt: serverTimestamp(),
          updatedBy: user?.name || user?.email || 'Técnico'
        });

      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'movements_and_components');
      }
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
        createdAt: timestampStr
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
          createdAt: serverTimestamp()
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
        createdAt: timestampStr
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
          createdAt: serverTimestamp()
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
  const navigateToTab = (tab: string) => {
    setCurrentTab(tab);
    setIsMobileMenuOpen(false);
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
          <div className="flex justify-between h-16">
            
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
            <div className="hidden md:flex items-center gap-2">
              <button
                onClick={() => navigateToTab('dashboard')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'dashboard' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white'}`}
                id="nav-dashboard"
              >
                <LayoutDashboard className="h-4 w-4" />
                Dashboard
              </button>

              <button
                onClick={() => navigateToTab('components')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'components' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white'}`}
                id="nav-components"
              >
                <Cpu className="h-4 w-4" />
                Estoque GPS
              </button>

              <button
                onClick={() => navigateToTab('licenses')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'licenses' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white'}`}
                id="nav-licenses"
              >
                <Key className="h-4 w-4" />
                Licenças
              </button>

              <button
                onClick={() => navigateToTab('movements')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'movements' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white'}`}
                id="nav-movements"
              >
                <Wrench className="h-4 w-4" />
                Serviços de Campo
              </button>

              <button
                onClick={() => navigateToTab('loans')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'loans' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white'}`}
                id="nav-loans"
              >
                <Handshake className="h-4 w-4" />
                Empréstimos
              </button>

              <button
                onClick={() => navigateToTab('machines')}
                className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'machines' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white'}`}
                id="nav-machines"
              >
                <Menu className="h-4 w-4" />
                Frota
              </button>

              {(user.role === 'administrador' || user.role === 'ADMINISTRADOR') && (
                <button
                  onClick={() => navigateToTab('company')}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${currentTab === 'company' ? 'bg-slate-800 text-emerald-400' : 'text-slate-300 hover:text-white'}`}
                  id="nav-company"
                >
                  <Building2 className="h-4 w-4" />
                  Minha Empresa
                </button>
              )}
            </div>

            {/* User Profile / Logout Area */}
            <div className="hidden md:flex items-center gap-4">
              {showInstallBtn && (
                <div className="relative">
                  <button
                    onClick={handleInstallApp}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md hover:scale-105 active:scale-95"
                    title="Instalar Aplicativo no Dispositivo"
                    id="install-pwa-btn-desktop"
                  >
                    <Download className="h-3.5 w-3.5 animate-bounce" />
                    Instalar App
                  </button>
                  {showInstallTip && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 bg-slate-800 border border-slate-600 text-white text-[11px] p-3 rounded-xl shadow-lg z-50 leading-relaxed">
                      <div className="flex items-start gap-2">
                        <Info className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                        <span>
                          <strong>Como instalar:</strong> Clique no ícone <Download className="inline h-3 w-3" /> na barra de endereços do Chrome, ou acesse o menu <strong>⋮</strong> → <strong>Instalar aplicativo</strong>.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="text-right">
                <span className="block text-xs font-bold text-white">{user.name}</span>
                <span className="inline-flex items-center gap-1 mt-0.5 text-[9px] font-extrabold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/25">
                  {user.role === 'administrador' || user.role === 'ADMINISTRADOR' ? (
                    <>
                      <Shield className="h-2.5 w-2.5" />
                      Admin
                    </>
                  ) : (
                    <>
                      <Wrench className="h-2.5 w-2.5" />
                      Técnico
                    </>
                  )}
                </span>
              </div>

              <button
                onClick={handleLogout}
                className="p-2.5 bg-slate-800/80 hover:bg-rose-500/10 hover:text-rose-400 border border-slate-700 hover:border-rose-500/20 rounded-xl transition-all text-slate-300"
                title="Desconectar"
                id="logout-btn"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>

            {/* Mobile menu button */}
            <div className="flex md:hidden items-center">
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
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
            
            {/* User card in mobile menu */}
            <div className="pb-3 border-b border-slate-700/60 mb-2 pt-1 flex items-center justify-between">
              <div>
                <span className="block text-xs font-bold text-white">{user.name}</span>
                <span className="block text-[10px] text-slate-400 mt-0.5">{user.email}</span>
              </div>
              <span className="bg-emerald-500/20 text-emerald-300 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border border-emerald-500/20">
                {user.role === 'administrador' || user.role === 'ADMINISTRADOR' ? 'Admin' : 'Técnico'}
              </span>
            </div>

            <button
              onClick={() => navigateToTab('dashboard')}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${currentTab === 'dashboard' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300'}`}
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </button>

            <button
              onClick={() => navigateToTab('components')}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${currentTab === 'components' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300'}`}
            >
              <Cpu className="h-4 w-4" />
              Estoque GPS
            </button>

            <button
              onClick={() => navigateToTab('licenses')}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${currentTab === 'licenses' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300'}`}
            >
              <Key className="h-4 w-4" />
              Licenças
            </button>

            <button
              onClick={() => navigateToTab('movements')}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${currentTab === 'movements' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300'}`}
            >
              <Wrench className="h-4 w-4" />
              Serviços de Campo
            </button>

            <button
              onClick={() => navigateToTab('loans')}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${currentTab === 'loans' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300'}`}
            >
              <Handshake className="h-4 w-4" />
              Empréstimos
            </button>

            <button
              onClick={() => navigateToTab('machines')}
              className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${currentTab === 'machines' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300'}`}
            >
              <Menu className="h-4 w-4" />
              Frota
            </button>

            {(user.role === 'administrador' || user.role === 'ADMINISTRADOR') && (
              <button
                onClick={() => navigateToTab('company')}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${currentTab === 'company' ? 'bg-slate-900 text-emerald-400' : 'text-slate-300'}`}
              >
                <Building2 className="h-4 w-4" />
                Minha Empresa
              </button>
            )}

            {showInstallBtn && (
              <div className="pt-2 relative">
                <button
                  onClick={handleInstallApp}
                  className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs rounded-xl transition-all shadow-md active:scale-95"
                >
                  <Download className="h-4 w-4 animate-bounce" />
                  Instalar Aplicativo (PWA)
                </button>
                {showInstallTip && (
                  <div className="mt-2 bg-slate-800 border border-slate-600 text-white text-[11px] p-3 rounded-xl shadow-lg leading-relaxed flex items-start gap-2">
                    <Info className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>Como instalar:</strong> No Chrome, acesse o menu <strong>⋮</strong> → <strong>Instalar aplicativo</strong>, ou toque no ícone de instalação na barra de endereços.
                    </span>
                  </div>
                )}
              </div>
            )}

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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative">
        
        {/* Render Active Tab */}
        {currentTab === 'dashboard' && (
          <Dashboard 
            key={`dashboard-${components.length}-${machines.length}-${movements.length}-${licenses.length}`}
            components={components} 
            machines={machines} 
            movements={movements} 
            licenses={licenses}
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
            onAddComponent={handleAddComponent}
            onEditComponent={handleEditComponent}
            onDeleteComponent={handleDeleteComponent}
            maintenances={maintenances}
            onSendToMaintenance={handleSendToMaintenance}
            onReturnFromMaintenance={handleReturnFromMaintenance}
            providers={providers}
            onAddProvider={handleAddProvider}
          />
        )}

        {currentTab === 'licenses' && (
          <LicensesTab
            licenses={licenses}
            components={components}
            role={user.role}
            currentUser={user}
            isDemoMode={isDemoMode}
            onAddLicense={handleAddLicense}
            onEditLicense={handleEditLicense}
            onDeleteLicense={handleDeleteLicense}
          />
        )}

        {currentTab === 'machines' && (
          <MachinesTab
            machines={machines}
            role={user.role}
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
            role={user.role}
            currentUserId={user.uid}
            currentUserName={user.name}
            onAddMovement={handleAddMovement}
          />
        )}

        {currentTab === 'loans' && (
          <LoansTab
            components={components}
            thirdParties={thirdParties}
            loans={loans}
            role={user.role}
            currentUserName={user.name}
            companyProfile={companyProfile}
            onAddThirdParty={handleAddThirdParty}
            onEditThirdParty={handleEditThirdParty}
            onDeleteThirdParty={handleDeleteThirdParty}
            onAddLoan={handleAddLoan}
            onReturnLoan={handleReturnLoan}
            onPartialReturnLoan={handlePartialReturnLoan}
            onDeleteLoan={handleDeleteLoan}
          />
        )}

        {currentTab === 'company' && (user.role === 'administrador' || user.role === 'ADMINISTRADOR') && (
          <CompanyTab
            companyProfile={companyProfile}
            role={user.role}
            currentUserName={user.name}
            onUpdateCompany={handleUpdateCompany}
            usersList={usersList}
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
