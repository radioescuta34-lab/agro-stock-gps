import { useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { CampoAlertSettings } from '../types';
import { parseEmails } from '../utils/emailUtils';

const LOCAL_STORAGE_KEY = 'agro_stock_gps_campo_alerts';

export function defaultCampoAlertSettings(): CampoAlertSettings {
  return {
    alertEmails: [],
    enabled: false,
    scheduleDay: 'quinta',
    scheduleTime: '08:00',
    history: [],
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sistema'
  };
}

function normalize(raw: Partial<CampoAlertSettings> & { alertEmail?: string }): CampoAlertSettings {
  const defaults = defaultCampoAlertSettings();
  const legacyEmails = parseEmails((raw as any).alertEmail);
  return {
    alertEmails: (raw.alertEmails && raw.alertEmails.length > 0 ? parseEmails(raw.alertEmails) : legacyEmails),
    enabled: raw.enabled ?? defaults.enabled,
    scheduleDay: raw.scheduleDay || defaults.scheduleDay,
    scheduleTime: raw.scheduleTime || defaults.scheduleTime,
    lastSentWeek: raw.lastSentWeek || '',
    history: raw.history || [],
    updatedAt: raw.updatedAt || defaults.updatedAt,
    updatedBy: raw.updatedBy || defaults.updatedBy
  };
}

// Migrates the legacy localStorage keys (field_data_alert_*) used by the old UI
function migrateLegacySettings(): CampoAlertSettings {
  const legacy = {
    alertEmail: localStorage.getItem('field_data_alert_email') || '',
    scheduleDay: localStorage.getItem('field_data_alert_day') || 'quinta',
    scheduleTime: localStorage.getItem('field_data_alert_time') || '08:00',
    enabled: localStorage.getItem('field_data_alert_active') === 'true'
  };

  if (legacy.alertEmail || legacy.enabled) {
    return normalize(legacy);
  }
  return defaultCampoAlertSettings();
}

export function useCampoAlertSettings(isDemoMode: boolean) {
  const [campoSettings, setCampoSettings] = useState<CampoAlertSettings | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        try {
          setCampoSettings(normalize(JSON.parse(saved)));
        } catch {
          setCampoSettings(migrateLegacySettings());
        }
      } else {
        setCampoSettings(migrateLegacySettings());
      }
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'settings', 'campo_alerts'),
      (docSnap) => {
        if (docSnap.exists()) {
          setCampoSettings(normalize(docSnap.data() as Partial<CampoAlertSettings>));
        } else {
          setCampoSettings(defaultCampoAlertSettings());
        }
      },
      (err) => {
        console.error("Erro ao carregar configurações de alerta de campo:", err);
      }
    );

    return () => unsub();
  }, [isDemoMode]);

  const saveCampoSettings = useCallback(async (settings: CampoAlertSettings) => {
    if (isDemoMode) {
      setCampoSettings(settings);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
      return;
    }

    const docRef = doc(db, 'settings', 'campo_alerts');
    await setDoc(docRef, {
      ...settings,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }, [isDemoMode]);

  return { campoSettings, saveCampoSettings };
}
