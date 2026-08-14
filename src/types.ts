export type UserRole = 'ADMINISTRADOR' | 'TECNICO_CAMPO' | 'administrador' | 'tecnico';

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  firstName?: string;
  lastName?: string;
  username?: string;
  passwordEncrypted?: string;
  role: UserRole;
  photoURL?: string;
  createdAt: any; // Timestamp or ISO string
}

export type ComponentBrand = 'Trimble' | 'Topcon';

export type ComponentStatus = 'Disponível' | 'Em Uso' | 'Manutenção' | 'Descartado';

export interface AutopilotComponent {
  id: string;
  serialNumber: string;
  name: string;
  brand: ComponentBrand;
  type: string; // e.g. "Antena/Receptor", "Monitor/Display", "Controladora", "Motor de Passo", etc.
  status: ComponentStatus;
  currentMachine?: string; // Machine prefix where it is installed, e.g. "T01" or empty
  updatedAt: any;
  updatedBy: string; // User's email or name who last updated
}

export type LicenseBrand = 'Trimble' | 'Topcon';
export type LicenseType = 'Assinatura de Sinal' | 'Ativação de Tela'; // Signal subscription vs. permanent feature activation
export type LicenseStatus = 'Ativa' | 'Disponível' | 'Expirada' | 'Pendente';

export interface License {
  id: string;
  name: string;
  brand: LicenseBrand;
  type: LicenseType;
  code: string; // Activation code/serial
  status: LicenseStatus;
  associatedComponentSerial?: string; // Link to GFX-750 or AGM-1, etc.
  associatedMachinePrefix?: string; // e.g. T01
  expirationDate?: string; // ISO date or empty for lifetime
  startDate?: string; // YYYY-MM-DD
  deviceSerialNumber?: string; // S/N from activation
  deviceModel?: string; // Model (e.g. FmX, GFX-750) from activation
  masterUnlockKey?: string; // Trimble Master Unlock Key
  unlockStatus?: 'pendente' | 'desbloqueado'; // Equipment unlock status
  unlockedAt?: string; // Timestamp of equipment unlock
  unlockedBy?: string; // User who confirmed the unlock
  updatedAt: any;
  updatedBy: string;
}

export type MachineType = 'Trator' | 'Colhedora' | 'Pulverizador' | 'Outro';

export interface Machine {
  id: string;
  prefix: string; // e.g. "T01", "C12"
  type: MachineType;
  model: string;
  brand: string; // e.g. "John Deere", "Case IH", "New Holland"
  fleet?: string; // e.g. "Frente 01", "Frota Cana"
  updatedAt: any;
}

export type MovementAction = 'Instalação' | 'Remoção' | 'Manutenção' | 'Calibração';

export interface FieldDataCollection {
  id: string; // e.g., "coll_T01_2026-W32"
  machineId: string;
  machinePrefix: string;
  fleet?: string;
  frente?: string;
  weekId: string; // e.g., "2026-W32"
  status: 'Pendente' | 'Concluído';
  collectedAt?: any; // ISO string or timestamp
  collectedBy?: string;
  notes?: string;
  updatedAt: any;
}

export interface MovementLog {
  id: string;
  componentId: string;
  componentSerial: string;
  componentName: string;
  machinePrefix: string; // "Almoxarifado" or prefix of machine
  action: MovementAction;
  technicianId: string;
  technicianName: string;
  date: any; // Timestamp
  notes: string;
  createdAt: any; // Timestamp
}

// Preset applied when navigating from a dashboard indicator card
export interface DashboardNavPreset {
  subtab?: 'os' | 'kanban';
  licenseFilter?: 'active' | 'expired';
  componentStatus?: ComponentStatus;
  componentBrand?: string;
  machineType?: MachineType;
  kanbanStatus?: 'Pendente' | 'Concluído';
}

export interface ThirdParty {
  id: string;
  name: string;
  document: string; // CPF or CNPJ
  phone: string;
  email: string;
  company: string; // Empresa/Fazenda
  createdAt: any;
  updatedAt: any;
  updatedBy: string;
}

export interface LoanedItem {
  componentId: string;
  componentSerial: string;
  componentName: string;
  componentBrand: ComponentBrand;
  componentType: string;
}

export interface ComponentLoan {
  id: string;
  thirdPartyId: string;
  thirdPartyName: string;
  thirdPartyDocument: string;
  thirdPartyCompany: string;
  items: LoanedItem[];
  returnedItems?: LoanedItem[];
  loanDate: string; // ISO format
  estimatedReturnDate?: string; // ISO format
  actualReturnDate?: string; // ISO format or empty
  status: 'Ativo' | 'Devolvido';
  contractNumber: string; // e.g., "CO-2026-001"
  notes?: string;
  createdAt: any;
  updatedAt: any;
  updatedBy: string;
}

export interface CompanyProfile {
  name: string;
  tradingName?: string;
  cnpj: string;
  phone: string;
  email: string;
  address: string;
  logoUrl?: string;
  updatedAt: any;
  updatedBy: string;
}

export interface AlertHistoryEntry {
  type: string;      // '15' | '30' | '60' | 'campo' | 'loans'
  date: string;      // ISO string
  recipient: string;
  status: 'Enviado' | 'Falhou';
}

export interface LicenseSettings {
  alertEmails: string[];
  enabled: boolean;
  thresholds: { '15': boolean; '30': boolean; '60': boolean };
  notifyExpired: boolean;
  lastSentExpired?: string;
  lastSent60?: string;
  lastSent30?: string;
  lastSent15?: string;
  history?: AlertHistoryEntry[];
  updatedAt: any;
  updatedBy: string;
}

export interface CampoAlertSettings {
  alertEmails: string[];
  enabled: boolean;
  scheduleDay: string;   // 'segunda' | 'terca' | ... | 'domingo'
  scheduleTime: string;  // 'HH:mm'
  lastSentWeek?: string; // ISO week, e.g. '2026-W32'
  history?: AlertHistoryEntry[];
  updatedAt: any;
  updatedBy: string;
}

export interface LoanAlertSettings {
  alertEmails: string[];
  enabled: boolean;
  lastSentDate?: string;
  history?: AlertHistoryEntry[];
  updatedAt: any;
  updatedBy: string;
}

export interface MaintenanceAlertSettings {
  alertEmails: string[];
  enabled: boolean;
  overdueDays: number;       // notify maintenances stuck in 'Em Manutenção' for more than N days
  notifyCompleted: boolean;  // send a one-time notice when a maintenance is completed
  lastSentDate?: string;     // daily marker for overdue maintenance alert
  notifiedIds?: string[];    // maintenance ids already notified about completion
  history?: AlertHistoryEntry[];
  updatedAt: any;
  updatedBy: string;
}

export interface IdleAlertSettings {
  alertEmails: string[];
  enabled: boolean;
  idleDays: number;      // components 'Disponível' without movement for more than N days
  lastSentDate?: string; // daily marker
  history?: AlertHistoryEntry[];
  updatedAt: any;
  updatedBy: string;
}

export interface ComponentMaintenance {
  id: string;
  componentId: string;
  componentSerial: string;
  componentName: string;
  componentBrand: ComponentBrand;
  componentType: string;
  sentDate: string; // ISO string
  returnDate?: string; // ISO string or empty
  providerName: string; // Maintenance company
  issueDescription: string; // Description of the problem
  replacedParts?: string; // Parts replaced during maintenance
  servicesPerformed?: string; // Services performed
  cost?: number; // Optional cost of repair
  status: 'Em Manutenção' | 'Concluído' | 'Sem Conserto';
  updatedAt: any;
  updatedBy: string;
}

export interface MaintenanceProvider {
  id: string;
  name: string; // Name of the provider
  phone?: string;
  email?: string;
  address?: string;
  contactPerson?: string;
  createdAt: any;
  updatedAt: any;
  updatedBy: string;
}


