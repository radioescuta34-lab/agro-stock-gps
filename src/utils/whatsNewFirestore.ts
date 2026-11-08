import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { WhatsNewCategory, WhatsNewItem } from '../constants/whatsNew';

export const WHATS_NEW_DOC_PATH = ['settings', 'whatsNew'] as const;
export const WHATS_NEW_DRAFT_DOC_PATH = ['settings', 'whatsNewDraft'] as const;

const whatsNewDocRef = doc(db, 'settings', 'whatsNew');
const whatsNewDraftDocRef = doc(db, 'settings', 'whatsNewDraft');

export interface PublishedWhatsNew {
  lastPublishedId: number;
  content: WhatsNewCategory[];
  publishedAt: unknown;
  publishedBy: string;
}

export interface WhatsNewDraftItem extends WhatsNewItem {
  selected: boolean;
}

export interface WhatsNewDraftCategory {
  title: string;
  items: WhatsNewDraftItem[];
}

export interface WhatsNewDraft {
  categories: WhatsNewDraftCategory[];
  updatedAt: unknown;
  updatedBy: string;
}

function toStringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toDraftItem(value: unknown): WhatsNewDraftItem | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  return {
    title: toStringValue(raw.title),
    description: toStringValue(raw.description),
    icon: toStringValue(raw.icon, 'Sparkles'),
    accent: toStringValue(raw.accent),
    selected: typeof raw.selected === 'boolean' ? raw.selected : true
  };
}

function toDraftCategory(value: unknown): WhatsNewDraftCategory {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const itemsRaw = Array.isArray(raw.items) ? raw.items : [];
  return {
    title: toStringValue(raw.title),
    items: itemsRaw.map(toDraftItem).filter((item): item is WhatsNewDraftItem => item !== null)
  };
}

export function normalizeDraftCategories(value: unknown): WhatsNewDraftCategory[] {
  if (!Array.isArray(value)) return [];
  return value.map(toDraftCategory);
}

export async function getPublishedWhatsNew(): Promise<PublishedWhatsNew | null> {
  const snapshot = await getDoc(whatsNewDocRef);
  if (!snapshot.exists()) return null;

  const data = snapshot.data() as Record<string, unknown>;
  const lastPublishedId = typeof data.lastPublishedId === 'number' ? data.lastPublishedId : null;
  const content = Array.isArray(data.content) ? (data.content as WhatsNewCategory[]) : [];

  if (lastPublishedId === null || lastPublishedId <= 0) return null;

  return {
    lastPublishedId,
    content,
    publishedAt: data.publishedAt ?? null,
    publishedBy: typeof data.publishedBy === 'string' ? data.publishedBy : ''
  };
}

export async function getWhatsNewDraft(): Promise<WhatsNewDraft | null> {
  const snapshot = await getDoc(whatsNewDraftDocRef);
  if (!snapshot.exists()) return null;

  const data = snapshot.data() as Record<string, unknown>;
  return {
    categories: normalizeDraftCategories(data.categories),
    updatedAt: data.updatedAt ?? null,
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : ''
  };
}

export async function saveWhatsNewDraft(categories: WhatsNewDraftCategory[], savedBy: string): Promise<void> {
  await setDoc(whatsNewDraftDocRef, {
    categories,
    updatedAt: serverTimestamp(),
    updatedBy: savedBy
  });
}

export interface PublishWhatsNewResult {
  newId: number;
}

export async function publishWhatsNew(params: {
  content: WhatsNewCategory[];
  publishedBy: string;
}): Promise<PublishWhatsNewResult> {
  return runTransaction(db, async transaction => {
    const snapshot = await transaction.get(whatsNewDocRef);
    const currentId = snapshot.exists()
      ? (typeof (snapshot.data() as Record<string, unknown>).lastPublishedId === 'number'
          ? (snapshot.data() as Record<string, unknown>).lastPublishedId as number
          : 0)
      : 0;

    const nextId = currentId + 1;

    transaction.set(
      whatsNewDocRef,
      {
        lastPublishedId: nextId,
        content: params.content,
        publishedAt: serverTimestamp(),
        publishedBy: params.publishedBy,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    return { newId: nextId };
  });
}
