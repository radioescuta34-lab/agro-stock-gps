import { FieldDataCollection, Machine } from '../types';
import { getISOWeekId, getWeekFormattedLabel } from './dateUtils';

export interface FrentePendenteSummary {
  frente: string;
  machines: string[];
}

export interface FrenteEmAndamentoSummary {
  frente: string;
  totalCount: number;
  pendingCount: number;
  machines: string[];
}

export interface FieldDataReport {
  weekId: string;
  weekLabel: string;
  pendingMachinesCount: number;
  frentesPendente: FrentePendenteSummary[];
  frentesEmAndamento: FrenteEmAndamentoSummary[];
}

export function buildFieldDataReport(
  machines: Machine[],
  fieldDataCollections: FieldDataCollection[],
  weekId: string = getISOWeekId(new Date())
): FieldDataReport {
  const fleeteGroups: { [fleet: string]: Machine[] } = {};
  machines.forEach(m => {
    const fleetName = m.fleet?.trim() ? m.fleet.trim() : 'Sem Frente Atribuída';
    if (!fleeteGroups[fleetName]) {
      fleeteGroups[fleetName] = [];
    }
    fleeteGroups[fleetName].push(m);
  });

  const getMachineStatus = (machineId: string): 'Pendente' | 'Concluído' => {
    const rec = fieldDataCollections.find(c => c.machineId === machineId && c.weekId === weekId);
    return rec?.status === 'Concluído' ? 'Concluído' : 'Pendente';
  };

  const totalMachinesCount = machines.length;
  const completedMachinesCount = machines.filter(m => getMachineStatus(m.id) === 'Concluído').length;
  const pendingMachinesCount = totalMachinesCount - completedMachinesCount;

  const frentesPendente: FrentePendenteSummary[] = [];
  const frentesEmAndamento: FrenteEmAndamentoSummary[] = [];

  Object.keys(fleeteGroups).forEach(frenteName => {
    const frenteMachines = fleeteGroups[frenteName];
    const total = frenteMachines.length;
    const completed = frenteMachines.filter(m => getMachineStatus(m.id) === 'Concluído').length;
    const pending = total - completed;

    if (completed === 0) {
      frentesPendente.push({
        frente: frenteName,
        machines: frenteMachines.map(m => m.prefix)
      });
    } else if (pending > 0) {
      frentesEmAndamento.push({
        frente: frenteName,
        totalCount: total,
        pendingCount: pending,
        machines: frenteMachines.filter(m => getMachineStatus(m.id) === 'Pendente').map(m => m.prefix)
      });
    }
  });

  return {
    weekId,
    weekLabel: getWeekFormattedLabel(weekId),
    pendingMachinesCount,
    frentesPendente,
    frentesEmAndamento
  };
}

export async function sendFieldDataAlertEmail(alertEmails: string[], report: FieldDataReport) {
  try {
    const payload = {
      alertEmails,
      weekId: report.weekId,
      weekLabel: report.weekLabel,
      pendingMachinesCount: report.pendingMachinesCount,
      frentesPendente: report.frentesPendente,
      frentesEmAndamento: report.frentesEmAndamento
    };

    const res = await fetch('/api/field-data/send-alert-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Falha no envio de e-mail pela API');
    }
    return { success: true, message: data.message, simulated: data.simulated };
  } catch (err: any) {
    console.error('Erro ao enviar alerta de campo:', err);
    return { success: false, message: err.message || 'Erro de conexão' };
  }
}