# Security Spec - Agro Stock GPS

## Data Invariants
1. **User Role Locking**: Users cannot self-escalate or change their roles (`role`) after creation, nor can they create a profile with an invalid role.
2. **Component Integrity**: A component's `serialNumber` and `brand` are immutable after creation. Only administrators can create or delete components.
3. **Order of Service Audit**: O.S. lifecycle transitions and pre-execution corrections append an immutable history event. Only open or scheduled orders can be edited; only administrators can delete orders that have not started. Started, completed, and cancelled orders cannot be deleted.
4. **Machine Fleet Control**: Only administrators can modify the machine fleet registry.
5. **Field Data Collection**: Weekly field data collection records (`field_data_collections`) can only be created/updated by admins or technicians with a valid shape; deletion is forbidden to preserve the weekly audit trail.

## The "Dirty Dozen" Payloads

### 1. Self-Assigned Administrator Role
An unauthenticated user or new registrant attempts to set their own profile to `role: 'administrador'` to bypass access control.
- **Payload**: `setDoc(doc(db, 'users', 'malicious_user'), { uid: 'malicious_user', email: 'attacker@evil.com', name: 'Attacker', role: 'administrador', createdAt: request.time })`
- **Result**: `PERMISSION_DENIED`

### 2. Unauthorized Component Deletion by Technician
A technician attempts to delete a component from the system database.
- **Payload**: `deleteDoc(doc(db, 'components', 'comp123'))`
- **Result**: `PERMISSION_DENIED`

### 3. Modifying Component Brand / Serial Number
An admin or technician attempts to alter the brand or serial number of an existing component.
- **Payload**: `updateDoc(doc(db, 'components', 'comp123'), { brand: 'Topcon' })`
- **Result**: `PERMISSION_DENIED`

### 4. Unauthorized Movement Alteration (Log Spoofing)
An attacker attempts to edit an executed movement or overwrite its audit history to cover up a component change.
- **Payload**: `updateDoc(doc(db, 'movements', 'move123'), { machinePrefix: 'Warehouse' })`
- **Result**: `PERMISSION_DENIED`

### 5. Unauthenticated Component Creation
An unauthenticated user attempts to inject fake equipment records.
- **Payload**: `setDoc(doc(db, 'components', 'fake_comp'), { serialNumber: '9999', brand: 'Trimble', type: 'Antena', status: 'Disponível' })`
- **Result**: `PERMISSION_DENIED`

### 6. Email Spoofing Admin Profile Creation
Creating a profile with an administrator role but without verified credentials.
- **Payload**: `setDoc(doc(db, 'users', 'user123'), { uid: 'user123', email: 'admin@plant.com', name: 'Spoofer', role: 'administrador' })`
- **Result**: `PERMISSION_DENIED` (if using unverified account check, but here we require strict admin validation in auth/database check)

### 7. Overwriting Sibling Profile Roles
A standard technician attempts to change another technician's role to 'administrador'.
- **Payload**: `updateDoc(doc(db, 'users', 'tech_user'), { role: 'administrador' })`
- **Result**: `PERMISSION_DENIED`

### 8. Denial of Wallet ID Poisoning
An attacker attempts to write a component with a document ID of 1MB in size.
- **Payload**: Write doc where id length > 128 characters.
- **Result**: `PERMISSION_DENIED`

### 9. Temporal Integrity Bypass on Component Creation
Creating a component using a client-side timestamp instead of the server timestamp.
- **Payload**: `{ name: 'TMX', updatedAt: '2020-01-01T00:00:00Z' }` (should be `request.time`)
- **Result**: `PERMISSION_DENIED`

### 10. Blank Listing (Data Scraping)
Attempting to fetch the entire user list without specifying filters or query constraints.
- **Payload**: `getDocs(collection(db, 'users'))` by a technician.
- **Result**: `PERMISSION_DENIED`

### 11. Relational Check Bypass
An attacker attempts to create a component log with a non-existent component reference.
- **Payload**: `{ componentId: 'nonexistent' }`
- **Result**: `PERMISSION_DENIED` (handled by rules verification checks)

### 12. Deleting Fleet Records
A technician attempts to delete machine configurations from the plant registry.
- **Payload**: `deleteDoc(doc(db, 'machines', 'prefixT01'))`
- **Result**: `PERMISSION_DENIED`

### 13. Deleting Field Data Collection Records
A technician attempts to delete a weekly field data collection record to hide a missed collection.
- **Payload**: `deleteDoc(doc(db, 'field_data_collections', '2026-W32_machineId'))`
- **Result**: `PERMISSION_DENIED`

---

## Test Runner Mockup (firestore.rules.test.ts)
```typescript
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';

// Verification test suite to ensure that all 12 dirty dozen cases fail and that correct accesses succeed.
```
