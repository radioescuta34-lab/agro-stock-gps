import { useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { LicenseSettings } from '../types';
import { parseEmails } from '../utils/emailUtils';

const LOCAL_STORAGE_KEY = 'agro_stock_gps_license_alerts';

export function defaultLicenseSettings(): LicenseSettings {
  return {
    alertEmails: [],
    enabled: false,
    thresholds: { '15': true, '30': true, '60': true },
    notifyExpired: false,
    history: [],
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sistema'
  };
}

function normalize(raw: Partial<LicenseSettings> & { alertEmail?: string }): LicenseSettings {
  const defaults = defaultLicenseSettings();
  const legacyEmails = parseEmails((raw as any).alertEmail);
  return {
    alertEmails: (raw.alertEmails && raw.alertEmails.length > 0 ? parseEmails(raw.alertEmails) : legacyEmails),
    enabled: raw.enabled ?? defaults.enabled,
    thresholds: {
      '15': raw.thresholds?.['15'] ?? defaults.thresholds['15'],
      '30': raw.thresholds?.['30'] ?? defaults.thresholds['30'],
      '60': raw.thresholds?.['60'] ?? defaults.thresholds['60']
    },
    notifyExpired: raw.notifyExpired ?? defaults.notifyExpired,
    lastSentExpired: raw.lastSentExpired || '',
    lastSent15: raw.lastSent15 || '',
    lastSent30: raw.lastSent30 || '',
    lastSent60: raw.lastSent60 || '',
    history: raw.history || [],
    updatedAt: raw.updatedAt || defaults.updatedAt,
    updatedBy: raw.updatedBy || defaults.updatedBy
  };
}

export function useLicenseAlertSettings(isDemoMode: boolean) {
  const [alertSettings, setAlertSettings] = useState<LicenseSettings | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        try {
          setAlertSettings(normalize(JSON.parse(saved)));
        } catch {
          setAlertSettings(defaultLicenseSettings());
        }
      } else {
        setAlertSettings(defaultLicenseSettings());
      }
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'settings', 'licenses'),
      (docSnap) => {
        if (docSnap.exists()) {
          setAlertSettings(normalize(docSnap.data() as Partial<LicenseSettings>));
        } else {
          setAlertSettings(defaultLicenseSettings());
        }
      },
      (err) => {
        console.error("Erro ao carregar configurações de alerta:", err);
      }
    );

    return () => unsub();
  }, [isDemoMode]);

  const saveAlertSettings = useCallback(async (settings: LicenseSettings) => {
    if (isDemoMode) {
      setAlertSettings(settings);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
      return;
    }

    const docRef = doc(db, 'settings', 'licenses');
    await setDoc(docRef, {
      ...settings,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }, [isDemoMode]);

  return { alertSettings, saveAlertSettings };
}
