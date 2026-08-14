import { useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { IdleAlertSettings } from '../types';
import { parseEmails } from '../utils/emailUtils';

const LOCAL_STORAGE_KEY = 'agro_stock_gps_idle_alerts';

export function defaultIdleAlertSettings(): IdleAlertSettings {
  return {
    alertEmails: [],
    enabled: false,
    idleDays: 30,
    history: [],
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sistema'
  };
}

function normalize(raw: Partial<IdleAlertSettings> & { alertEmail?: string }): IdleAlertSettings {
  const defaults = defaultIdleAlertSettings();
  const legacyEmails = parseEmails((raw as any).alertEmail);
  return {
    alertEmails: (raw.alertEmails && raw.alertEmails.length > 0 ? parseEmails(raw.alertEmails) : legacyEmails),
    enabled: raw.enabled ?? defaults.enabled,
    idleDays: raw.idleDays ?? defaults.idleDays,
    lastSentDate: raw.lastSentDate || '',
    history: raw.history || [],
    updatedAt: raw.updatedAt || defaults.updatedAt,
    updatedBy: raw.updatedBy || defaults.updatedBy
  };
}

export function useIdleAlertSettings(isDemoMode: boolean) {
  const [idleSettings, setIdleSettings] = useState<IdleAlertSettings | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        try {
          setIdleSettings(normalize(JSON.parse(saved)));
        } catch {
          setIdleSettings(defaultIdleAlertSettings());
        }
      } else {
        setIdleSettings(defaultIdleAlertSettings());
      }
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'settings', 'idle_alerts'),
      (docSnap) => {
        if (docSnap.exists()) {
          setIdleSettings(normalize(docSnap.data() as Partial<IdleAlertSettings>));
        } else {
          setIdleSettings(defaultIdleAlertSettings());
        }
      },
      (err) => {
        console.error("Erro ao carregar configurações de alerta de componentes ociosos:", err);
      }
    );

    return () => unsub();
  }, [isDemoMode]);

  const saveIdleSettings = useCallback(async (settings: IdleAlertSettings) => {
    if (isDemoMode) {
      setIdleSettings(settings);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
      return;
    }

    const docRef = doc(db, 'settings', 'idle_alerts');
    await setDoc(docRef, {
      ...settings,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }, [isDemoMode]);

  return { idleSettings, saveIdleSettings };
}