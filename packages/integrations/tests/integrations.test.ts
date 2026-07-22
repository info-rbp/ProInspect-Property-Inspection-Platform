import { describe, expect, it } from 'vitest';
import { externalReferenceKey, parseCanonicalCsv, reconcileFields, validateConnectionMetadata } from '../src/index.js';

describe('integration contracts', () => {
  it('parses quoted canonical CSV without losing commas', () => {
    const result = parseCanonicalCsv('property_id,address\np1,"1 High St, Perth"\n', ['property_id', 'address']);
    expect(result.records).toEqual([{ property_id: 'p1', address: '1 High St, Perth' }]);
  });
  it('keeps manual conflicts out of automatic patches', () => {
    expect(reconcileFields({ address: 'A', note: 'local' }, { address: 'B', note: 'remote' }, { address: 'provider', note: 'manual_review' })).toMatchObject({ action: 'review', patch: { address: 'B' } });
  });
  it('accepts only secret references and creates stable external keys', () => {
    expect(() => validateConnectionMetadata({ id: 'c', agencyId: 'a', provider: 'p', status: 'draft', scopes: [], version: 1, credentialSecretRef: 'token' })).toThrow(/Secret Manager/);
    expect(externalReferenceKey({ provider: 'PMS', entityType: 'Property', externalId: 'ABC' })).toBe('pms:property:abc');
  });
});
