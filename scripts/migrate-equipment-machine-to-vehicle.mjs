/**
 * Migration script: equipment_machine → vehicle
 *
 * This script updates all documents in the 'type_registry' Firestore collection
 * that have category 'equipment_machine' to 'vehicle'.
 *
 * Usage:
 *   node scripts/migrate-equipment-machine-to-vehicle.mjs
 *
 * Requirements:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY environment variable (JSON string)
 *   - Or run with Firebase Emulator
 *
 * Safety:
 *   - Only updates documents where category == 'equipment_machine'
 *   - Dry-run mode by default (set DRY_RUN=false to execute)
 */

import { initializeApp, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const DRY_RUN = process.env.DRY_RUN !== 'false';

async function main() {
  console.log('=== Migration: equipment_machine → vehicle ===');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'EXECUTE'}`);
  console.log('');

  // Initialize Firebase Admin
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      initializeApp({ credential: cert(serviceAccount) });
    } else {
      initializeApp({ credential: applicationDefault() });
    }
  } catch (error) {
    console.error('Failed to initialize Firebase:', error.message);
    console.log('');
    console.log('To run this script, set the FIREBASE_SERVICE_ACCOUNT_KEY environment variable:');
    console.log('  $env:FIREBASE_SERVICE_ACCOUNT_KEY = Get-Content service-account.json -Raw');
    process.exit(1);
  }

  const db = getFirestore();
  const collection = db.collection('type_registry');

  // Find all documents with category 'equipment_machine'
  const snapshot = await collection.where('category', '==', 'equipment_machine').get();

  console.log(`Found ${snapshot.size} document(s) with category 'equipment_machine'`);
  console.log('');

  if (snapshot.size === 0) {
    console.log('No documents to migrate. Done.');
    return;
  }

  // List documents to be migrated
  for (const doc of snapshot.docs) {
    const data = doc.data();
    console.log(`  - ${doc.id}: "${data.name}" (active: ${data.active})`);
  }

  console.log('');

  if (DRY_RUN) {
    console.log('DRY RUN: No changes made. Set DRY_RUN=false to execute migration.');
    return;
  }

  // Execute migration
  const batch = db.batch();
  for (const doc of snapshot.docs) {
    batch.update(doc.ref, { category: 'vehicle' });
  }

  await batch.commit();
  console.log(`Successfully migrated ${snapshot.size} document(s) from 'equipment_machine' to 'vehicle'.`);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
