import { generateId } from '../../utils';
import type { Tenancy } from '../../types/platform';
import { isFirebaseConfigured, getFirestoreDb } from '../storageService';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { localGet, localList, localPut } from './localPlatformStore';

export type CreateTenancyInput = Omit<Tenancy, 'id' | 'status' | 'createdAt' | 'updatedAt'> & Partial<Pick<Tenancy, 'status'>>;

export const createTenancy = async (input: CreateTenancyInput): Promise<Tenancy> => {
  const timestamp = new Date().toISOString();
  const id = generateId();
  const tenancy: Tenancy = {
    ...input,
    id,
    status: input.status || 'active',
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  if (isFirebaseConfigured()) {
    const db = getFirestoreDb();
    if (db) {
      await setDoc(doc(db, 'tenancies', id), tenancy);
      return tenancy;
    }
  }

  await localPut('tenancies', tenancy);
  return tenancy;
};

export const getTenancy = async (tenancyId: string): Promise<Tenancy | undefined> => {
  if (isFirebaseConfigured()) {
    const db = getFirestoreDb();
    if (db) {
      try {
        const snap = await getDoc(doc(db, 'tenancies', tenancyId));
        if (snap.exists()) {
          return snap.data() as Tenancy;
        }
      } catch (error) {
        console.error('Firestore getTenancy error:', error);
      }
    }
  }
  return localGet<Tenancy>('tenancies', tenancyId);
};

export const listTenancies = async (): Promise<Tenancy[]> => {
  if (isFirebaseConfigured()) {
    const db = getFirestoreDb();
    if (db) {
      try {
        const snap = await getDocs(collection(db, 'tenancies'));
        return snap.docs.map(d => d.data() as Tenancy);
      } catch (error) {
        console.error('Firestore listTenancies error:', error);
      }
    }
  }
  return localList<Tenancy>('tenancies');
};

export const updateTenancy = async (tenancyId: string, updates: Partial<Omit<Tenancy, 'id' | 'createdAt'>>): Promise<Tenancy> => {
  const existing = await getTenancy(tenancyId);
  if (!existing) throw new Error('Tenancy not found.');

  const updatedTenancy: Tenancy = {
    ...existing,
    ...updates,
    id: tenancyId,
    updatedAt: new Date().toISOString(),
  };

  if (isFirebaseConfigured()) {
    const db = getFirestoreDb();
    if (db) {
      await setDoc(doc(db, 'tenancies', tenancyId), updatedTenancy, { merge: true });
      return updatedTenancy;
    }
  }

  await localPut('tenancies', updatedTenancy);
  return updatedTenancy;
};
