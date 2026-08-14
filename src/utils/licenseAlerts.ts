import { License } from '../types';

export function getLicensesExpiringInDays(licenses: License[], days: number): License[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return licenses.filter(lic => {
    if (!lic.expirationDate) return false;
    const expDate = new Date(lic.expirationDate);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= days;
  });
}

export async function sendLicenseExpirationEmail(alertEmails: string[], days: number, expiringLics: License[], mode: 'upcoming' | 'expired' = 'upcoming') {
  try {
    const payload = {
      alertEmails,
      days,
      mode,
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
      headers: { 'Content-Type': 'application/json' },
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
}
