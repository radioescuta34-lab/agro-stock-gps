import { ComponentMaintenance } from '../types';

export function getOverdueMaintenances(maintenances: ComponentMaintenance[], overdueDays: number, now: Date = new Date()): ComponentMaintenance[] {
  if (!overdueDays || overdueDays <= 0) return [];
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - overdueDays);
  return maintenances.filter(m => {
    if (m.status !== 'Em Manutenção' || !m.sentDate) return false;
    return new Date(m.sentDate).getTime() <= cutoff.getTime();
  });
}

export function getCompletedMaintenances(maintenances: ComponentMaintenance[], notifiedIds: string[] = [], now: Date = new Date()): ComponentMaintenance[] {
  const windowMs = 7 * 24 * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - windowMs);
  return maintenances.filter(m => {
    if (m.status !== 'Concluído') return false;
    if (notifiedIds.includes(m.id)) return false;
    const completionDate = m.returnDate || (m.updatedAt as any)?.toDate?.()?.toISOString?.() || m.updatedAt;
    if (!completionDate) return true;
    const t = (completionDate as any)?.toDate ? completionDate.toDate().getTime() : new Date(completionDate as string).getTime();
    return t >= cutoff.getTime();
  });
}

export async function sendMaintenanceAlertEmail(alertEmails: string[], maintenances: ComponentMaintenance[], kind: 'overdue' | 'completed', overdueDays: number) {
  try {
    const payload = {
      alertEmails,
      kind,
      overdueDays,
      maintenances: maintenances.map(m => ({
        id: m.id,
        componentName: m.componentName,
        componentSerial: m.componentSerial,
        componentType: m.componentType,
        providerName: m.providerName,
        sentDate: m.sentDate,
        returnDate: m.returnDate || '',
        status: m.status
      }))
    };

    const res = await fetch('/api/maintenances/send-alert-email', {
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
    console.error('Erro ao enviar alerta de manutenções:', err);
    return { success: false, message: err.message || 'Erro de conexão' };
  }
}