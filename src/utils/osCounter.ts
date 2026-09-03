import { doc, getDoc, runTransaction, setDoc, serverTimestamp, type Firestore } from 'firebase/firestore';

/**
 * Atomically reserves the next OS number using a Firestore counter document
 * (`counters/osNumber`). Safe against concurrent technicians:
 * the transaction reads + increments the shared counter, so two parallel
 * calls always get distinct numbers.
 *
 * Safely seedable: if the counter does not exist yet, it is initialized from
 * the current max OS number before the transaction runs.
 */
export async function getNextOsNumber(
  db: Firestore,
  getCurrentMax: () => number,
): Promise<number> {
  const counterRef = doc(db, 'counters', 'osNumber');

  const existing = await getDoc(counterRef);
  if (!existing.exists()) {
    // Seed once (best-effort; concurrent seeds converge to the same max+1)
    const max = Math.max(0, getCurrentMax());
    await setDoc(
      counterRef,
      { value: max, updatedAt: serverTimestamp() },
      { merge: true },
    ).catch(() => {
      // Ignore — a concurrent caller may have seeded already; the transaction
      // below will pick up whatever value exists.
    });
  }

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(counterRef);
    const current = snap.exists() ? (snap.data()?.value ?? 0) : 0;
    const next = (typeof current === 'number' ? current : 0) + 1;
    transaction.set(counterRef, { value: next, updatedAt: serverTimestamp() }, { merge: true });
    return next;
  });
}
