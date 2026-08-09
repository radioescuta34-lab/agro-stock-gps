/**
 * Utility functions for weekly date calculations and ISO week handling
 */

/**
 * Calculates ISO week string e.g., "2026-W32"
 */
export function getISOWeekId(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const weekFormatted = weekNo < 10 ? `0${weekNo}` : `${weekNo}`;
  return `${d.getUTCFullYear()}-W${weekFormatted}`;
}

/**
 * Returns previous week ISO week ID e.g. "2026-W31"
 */
export function getPreviousISOWeekId(date: Date = new Date()): string {
  const prevDate = new Date(date);
  prevDate.setDate(prevDate.getDate() - 7);
  return getISOWeekId(prevDate);
}

/**
 * Returns day of week number: 1 = Monday, 2 = Tuesday, ..., 7 = Sunday
 */
export function getDayOfWeekNumber(date: Date = new Date()): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/**
 * Checks if current day is late in week (Friday = 5, Saturday = 6, Sunday = 7)
 */
export function isLateInWeek(date: Date = new Date()): boolean {
  return getDayOfWeekNumber(date) >= 5;
}

/**
 * Gets human readable label for week, e.g. "Semana 32 (03/08 a 09/08)"
 */
export function getWeekFormattedLabel(weekId: string): string {
  const match = weekId.match(/(\d{4})-W(\d{2})/);
  if (!match) return weekId;
  const weekNum = match[2];
  return `Semana ${weekNum}`;
}
