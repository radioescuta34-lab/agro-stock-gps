import { AutopilotComponent, MovementLog } from '../types';

export interface IdleComponentSummary {
  id: string;
  name: string;
  serialNumber: string;
  type: string;
  brand: string;
  lastMovementDate?: string;
}

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().getTime();
  const t = new Date(value).getTime();
  return isNaN(t) ? null : t;
}

export function getIdleComponents(
  components: AutopilotComponent[],
  movements: MovementLog[],
  idleDays: number,
  now: Date = new Date()
): IdleComponentSummary[] {
  if (!idleDays || idleDays <= 0) return [];
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - idleDays);

  const lastMovementByComponent: Record<string, number> = {};
  movements.forEach(mv => {
    const ts = toMillis(mv.createdAt);
    if (ts === null) return;
    const prev = lastMovementByComponent[mv.componentId];
    if (!prev || ts > prev) lastMovementByComponent[mv.componentId] = ts;
  });

  return components
    .filter(c => c.status === 'Disponível')
    .map(c => ({
      c,
      lastMovement: lastMovementByComponent[c.id] || null
    }))
    .filter(({ lastMovement }) => lastMovement === null || lastMovement <= cutoff.getTime())
    .map(({ c, lastMovement }) => ({
      id: c.id,
      name: c.name,
      serialNumber: c.serialNumber,
      type: c.type,
      brand: c.brand,
      lastMovementDate: lastMovement ? new Date(lastMovement).toISOString() : undefined
    }));
}

export async function sendIdleComponentsAlertEmail(alertEmails: string[], components: IdleComponentSummary[], idleDays: number) {
  try {
    const payload = {
      alertEmails,
      idleDays,
      components
    };

    const res = await fetch('/api/components/send-idle-alert-email', {
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
    console.error('Erro ao enviar alerta de componentes ociosos:', err);
    return { success: false, message: err.message || 'Erro de conexão' };
  }
}