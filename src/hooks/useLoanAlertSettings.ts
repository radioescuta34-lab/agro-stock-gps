import { useEffect, useState, useCallback } from 'react';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { LoanAlertSettings } from '../types';
import { parseEmails } from '../utils/emailUtils';

const LOCAL_STORAGE_KEY = 'agro_stock_gps_loan_alerts';

export function defaultLoanAlertSettings(): LoanAlertSettings {
  return {
    alertEmails: [],
    enabled: false,
    history: [],
    updatedAt: new Date().toISOString(),
    updatedBy: 'Sistema'
  };
}

function normalize(raw: Partial<LoanAlertSettings> & { alertEmail?: string }): LoanAlertSettings {
  const defaults = defaultLoanAlertSettings();
  const legacyEmails = parseEmails((raw as any).alertEmail);
  return {
    alertEmails: (raw.alertEmails && raw.alertEmails.length > 0 ? parseEmails(raw.alertEmails) : legacyEmails),
    enabled: raw.enabled ?? defaults.enabled,
    lastSentDate: raw.lastSentDate || '',
    history: raw.history || [],
    updatedAt: raw.updatedAt || defaults.updatedAt,
    updatedBy: raw.updatedBy || defaults.updatedBy
  };
}

export function useLoanAlertSettings(isDemoMode: boolean) {
  const [loanSettings, setLoanSettings] = useState<LoanAlertSettings | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        try {
          setLoanSettings(normalize(JSON.parse(saved)));
        } catch {
          setLoanSettings(defaultLoanAlertSettings());
        }
      } else {
        setLoanSettings(defaultLoanAlertSettings());
      }
      return;
    }

    const unsub = onSnapshot(
      doc(db, 'settings', 'loan_alerts'),
      (docSnap) => {
        if (docSnap.exists()) {
          setLoanSettings(normalize(docSnap.data() as Partial<LoanAlertSettings>));
        } else {
          setLoanSettings(defaultLoanAlertSettings());
        }
      },
      (err) => {
        console.error("Erro ao carregar configurações de alerta de empréstimos:", err);
      }
    );

    return () => unsub();
  }, [isDemoMode]);

  const saveLoanSettings = useCallback(async (settings: LoanAlertSettings) => {
    if (isDemoMode) {
      setLoanSettings(settings);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
      return;
    }

    const docRef = doc(db, 'settings', 'loan_alerts');
    await setDoc(docRef, {
      ...settings,
      updatedAt: serverTimestamp()
    }, { merge: true });
  }, [isDemoMode]);

  return { loanSettings, saveLoanSettings };
}
