import { useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { MaintenanceAlertSettings } from '../types';
import { parseEmails } from '../utils/emailUtils';

const LOCAL_STORAGE_KEY = 'agro_stock_gps_maintenance_alerts';

export function defaultMaintenanceAlertSettings(): MaintenanceAlertSettings {
  return {
    alertEmails: [],
    enabled: false,
    overdueDays: 7,
    notifyCompleted: true,
    history: [],
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sistema'
  };
}

function normalize(raw: Partial<MaintenanceAlertSettings> & { alertEmail?: string }): MaintenanceAlertSettings {
  const defaults = defaultMaintenanceAlertSettings();
  const legacyEmails = parseEmails((raw as any).alertEmail);
  return {
    alertEmails: (raw.alertEmails && raw.alertEmails.length > 0 ? parseEmails(raw.alertEmails) : legacyEmails),
    enabled: raw.enabled ?? defaults.enabled,
    overdueDays: raw.overdueDays ?? defaults.overdueDays,
    notifyCompleted: raw.notifyCompleted ?? defaults.notifyCompleted,
    lastSentDate: raw.lastSentDate || '',
    notifiedIds: Array.isArray(raw.notifiedIds) ? raw.notifiedIds : [],
    history: raw.history || [],
    updatedAt: raw.updatedAt || defaults.updatedAt,
    updatedBy: raw.updatedBy || defaults.updatedBy
  };
}

export function useMaintenanceAlertSettings(isDemoMode: boolean) {
  const [maintenanceSettings, setMaintenanceSettings] = useState<MaintenanceAlertSettings | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        try {
          setMaintenanceSettings(normalize(JSON.parse(saved)));
        } catch {
          setMaintenanceSettings(defaultMaintenanceAlertSettings());
        }
      } else {
        setMaintenanceSettings(defaultMaintenanceAlertSettings());
      }
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'settings', 'maintenance_alerts'),
      (docSnap) => {
        if (docSnap.exists()) {
          setMaintenanceSettings(normalize(docSnap.data() as Partial<MaintenanceAlertSettings>));
        } else {
          setMaintenanceSettings(defaultMaintenanceAlertSettings());
        }
      },
      (err) => {
        console.error("Erro ao carregar configurações de alerta de manutenções:", err);
      }
    );

    return () => unsub();
  }, [isDemoMode]);

  const saveMaintenanceSettings = useCallback(async (settings: MaintenanceAlertSettings) => {
    if (isDemoMode) {
      setMaintenanceSettings(settings);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
      return;
    }

    const docRef = doc(db, 'settings', 'maintenance_alerts');
    await setDoc(docRef, {
      ...settings,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }, [isDemoMode]);

  return { maintenanceSettings, saveMaintenanceSettings };
}