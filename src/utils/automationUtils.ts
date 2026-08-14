import { CampoAlertSettings } from '../types';
import { getISOWeekId } from './dateUtils';

export const WEEKDAY_KEYS: { key: string; label: string }[] = [
  { key: 'segunda', label: 'Segunda-feira' },
  { key: 'terca', label: 'Terça-feira' },
  { key: 'quarta', label: 'Quarta-feira' },
  { key: 'quinta', label: 'Quinta-feira' },
  { key: 'sexta', label: 'Sexta-feira' },
  { key: 'sabado', label: 'Sábado' },
  { key: 'domingo', label: 'Domingo' }
];

export function getWeekdayKey(date: Date = new Date()): string {
  switch (date.getDay()) {
    case 1: return 'segunda';
    case 2: return 'terca';
    case 3: return 'quarta';
    case 4: return 'quinta';
    case 5: return 'sexta';
    case 6: return 'sabado';
    default: return 'domingo';
  }
}

export function getWeekdayLabel(key: string): string {
  const match = WEEKDAY_KEYS.find(w => w.key === key);
  return match ? match.label : 'Quinta-feira';
}

export function getTodayStr(date: Date = new Date()): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function getTimeStr(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Next occurrence of (dayKey, time) starting from the current instant.
// Returns null if it would fall beyond the next 7 days (shouldn't happen).
export function getNextOccurrence(dayKey: string, time: string, now: Date = new Date()): Date | null {
  const [h, m] = (time || '08:00').split(':').map(Number);
  const targetKey = getWeekdayKey(now);
  let diff = WEEKDAY_KEYS.findIndex(w => w.key === dayKey) - WEEKDAY_KEYS.findIndex(w => w.key === targetKey);
  if (diff < 0) diff += 7;

  const candidate = new Date(now);
  candidate.setDate(candidate.getDate() + diff);
  candidate.setHours(h || 8, m || 0, 0, 0);

  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 7);
  }
  return candidate;
}

// Human-friendly label for the next scheduled send: "Hoje às 08:00", "Amanhã às 08:00" or "Quinta-feira às 08:00"
export function formatNextSendLabel(dayKey: string, time: string, now: Date = new Date()): string {
  const next = getNextOccurrence(dayKey, time, now);
  if (!next) return '—';

  const today = getTodayStr(now);
  const nextStr = getTodayStr(next);
  const label = getWeekdayLabel(dayKey);

  if (nextStr === today) return `Hoje às ${time}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (nextStr === getTodayStr(tomorrow)) return `Amanhã às ${time}`;
  return `${label} às ${time}`;
}

export function isCampoAlertDue(campoSettings: CampoAlertSettings, now: Date = new Date()): boolean {
  if (!campoSettings.enabled || !(campoSettings.alertEmails?.length || (campoSettings as any).alertEmail)) return false;
  if (getWeekdayKey(now) !== campoSettings.scheduleDay) return false;
  if (getTimeStr(now) < (campoSettings.scheduleTime || '08:00')) return false;
  if (campoSettings.lastSentWeek === getISOWeekId(now)) return false;
  return true;
}

export function isLoansAlertDue(
  enabled: boolean,
  lastSentDate: string | undefined,
  overdueCount: number,
  now: Date = new Date()
): boolean {
  if (!enabled) return false;
  if (overdueCount <= 0) return false;
  return lastSentDate !== getTodayStr(now);
}

export function isLicenseAlertDue(
  enabled: boolean,
  thresholds: { '15': boolean; '30': boolean; '60': boolean },
  lastSent: { '15'?: string; '30'?: string; '60'?: string },
  expiring: { '15': number; '30': number; '60': number },
  now: Date = new Date()
): { '15': boolean; '30': boolean; '60': boolean } {
  const today = getTodayStr(now);
  const days = [15, 30, 60] as const;
  const result = { '15': false, '30': false, '60': false };
  days.forEach(d => {
    const key = String(d) as '15' | '30' | '60';
    result[key] = enabled && !!thresholds[key] && expiring[key] > 0 && lastSent[key] !== today;
  });
  return result;
}