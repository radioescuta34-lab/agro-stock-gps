import { collection, doc, getDocs, runTransaction, serverTimestamp, type Firestore } from 'firebase/firestore';
import { planStorageCommand, type StorageCommand, type StorageState } from './storageModel';

// A revision document serializes destination operations, including creations (query phantoms).
// Individual transaction reads also protect against concurrent edits by older screens.
export async function executeStorageCommand(db: Firestore, command: StorageCommand, actor: { id: string; name: string; role: string }, operationId: string) {
  return runTransaction(db, async transaction => {
    const settingsRef = doc(db, 'storage_settings', 'main');
    const receiptRef = doc(db, 'storage_operations', operationId);
    const [settings, receipt] = await Promise.all([transaction.get(settingsRef), transaction.get(receiptRef)]);
    if (receipt.exists()) return;
    const names = ['components', 'locations', 'machines', 'partners', 'movements', 'loans', 'maintenances'] as const;
    const snapshots = await Promise.all(names.map(name => getDocs(collection(db, name))));
    const rows = await Promise.all(snapshots.map(snapshot => Promise.all(snapshot.docs.map(item => transaction.get(item.ref)))));
    const state = Object.fromEntries(names.map((name, index) => [name, rows[index].filter(item => item.exists()).map(item => ({ ...item.data(), id: item.id }))])) as unknown as StorageState;
    state.settings = settings.exists() ? settings.data() as StorageState['settings'] : { defaultLocationId: '', revision: 0 };
    const plan = planStorageCommand(state, command, actor, operationId, new Date().toISOString());
    for (const change of plan.changes) {
      const reference = doc(db, change.collection, change.id);
      if (!change.data) transaction.delete(reference);
      else transaction.set(reference, { ...cleanStorageData(change.data),
        ...(!state[change.collection].some(item => item.id === change.id) && change.data.createdAt ? { createdAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp() });
    }
    for (const event of plan.events) transaction.set(doc(db, 'location_events', event.id), { ...event, createdAt: serverTimestamp() });
    transaction.set(settingsRef, { ...plan.settings, updatedAt: serverTimestamp() });
    transaction.set(receiptRef, { actorId: actor.id, type: command.type, createdAt: serverTimestamp() });
  });
}

export function cleanStorageData(value: any): any {
  if (Array.isArray(value)) return value.map(cleanStorageData);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined).map(([key, entry]) => [key, cleanStorageData(entry)]));
  }
  return value;
}
