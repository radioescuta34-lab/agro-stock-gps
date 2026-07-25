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

export interface LicenseSettings {
  alertEmail: string;
  lastSent60?: string;
  lastSent30?: string;
  lastSent15?: string;
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


