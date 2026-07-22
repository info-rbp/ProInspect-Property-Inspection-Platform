import { generateId } from '../../utils';
import type { Agency } from '../../types/platform';
import { isFirebaseConfigured, getFirestoreDb } from '../storageService';
import { runShellOperation } from '../runShellOperation';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { localGet, localList, localPut } from './localPlatformStore';

export type CreateAgencyInput = Omit<Agency, 'id' | 'status' | 'createdAt' | 'updatedAt'> & Partial<Pick<Agency, 'status'>>;

export const createAgency = async (input: CreateAgencyInput): Promise<Agency> => {
  const timestamp = new Date().toISOString();
  const id = generateId();
  const agency: Agency = {
    ...input,
    id,
    status: input.status || 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (isFirebaseConfigured()) {
    const db = getFirestoreDb();
    if (db) {
      return runShellOperation({ kind: 'save', title: 'Agency saved', persistence: 'cloud', source: id, dirtyScopeId: 'settings:agency:new', entityType: 'settings', entityId: id, action: 'create', announceSuccess: true }, async () => {
        await setDoc(doc(db, 'agencies', id), agency);
        return agency;
      });
    }
  }

  await localPut('agencies', agency, { dirtyScopeId: 'settings:agency:new', entityType: 'settings', entityId: id, action: 'create', announceSuccess: true });
  return agency;
};

export const getAgency = async (agencyId: string): Promise<Agency | undefined> => {
  if (isFirebaseConfigured()) {
    const db = getFirestoreDb();
    if (db) {
      try {
        const snap = await getDoc(doc(db, 'agencies', agencyId));
        if (snap.exists()) return snap.data() as Agency;
      } catch (error) {
        console.error('Firestore getAgency error:', error);
      }
    }
  }
  return localGet<Agency>('agencies', agencyId);
};

export const listAgencies = async (): Promise<Agency[]> => {
  if (isFirebaseConfigured()) {
    const db = getFirestoreDb();
    if (db) {
      try {
        const snap = await getDocs(collection(db, 'agencies'));
        return snap.docs.map((entry) => entry.data() as Agency);
      } catch (error) {
        console.error('Firestore listAgencies error:', error);
      }
    }
  }
  return localList<Agency>('agencies');
};

export const updateAgency = async (agencyId: string, updates: Partial<Omit<Agency, 'id' | 'createdAt'>>): Promise<Agency> => {
  const existing = await getAgency(agencyId);
  if (!existing) throw new Error('Agency not found.');

  const updatedAgency: Agency = {
    ...existing,
    ...updates,
    id: agencyId,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured()) {
    const db = getFirestoreDb();
    if (db) {
      return runShellOperation({ kind: 'save', title: 'Agency saved', persistence: 'cloud', source: agencyId, dirtyScopeId: `settings:agency:${agencyId}`, entityType: 'settings', entityId: agencyId, action: 'update', announceSuccess: true }, async () => {
        await setDoc(doc(db, 'agencies', agencyId), updatedAgency, { merge: true });
        return updatedAgency;
      });
    }
  }

  await localPut('agencies', updatedAgency, { dirtyScopeId: `settings:agency:${agencyId}`, entityType: 'settings', entityId: agencyId, action: 'update', announceSuccess: true });
  return updatedAgency;
};
