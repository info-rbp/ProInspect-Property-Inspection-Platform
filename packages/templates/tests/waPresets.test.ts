import { describe, expect, it } from 'vitest';
import { validateTemplate } from '../src/index.js';
import { WA_RESIDENTIAL_V1_TEMPLATES } from '../src/presets/wa/index.js';

describe('WA residential production templates', () => {
  it('publishes Entry, Routine and Exit as valid immutable identities', () => {
    expect(WA_RESIDENTIAL_V1_TEMPLATES.map((template) => template.inspectionType)).toEqual(['entry', 'routine', 'exit']);
    for (const template of WA_RESIDENTIAL_V1_TEMPLATES) {
      expect(() => validateTemplate(template)).not.toThrow();
      expect(template.status).toBe('published');
      expect(template.contentHash).toMatch(/^fnv1a64:/u);
      expect(template.areas.length).toBeGreaterThan(10);
    }
  });

  it('requires an immutable baseline for Exit and tenant review for Entry', () => {
    const [entry, , exit] = WA_RESIDENTIAL_V1_TEMPLATES;
    expect(entry.workflowProfile?.tenantReview).toBe('required');
    expect(exit.comparisonBaselineRequired).toBe(true);
  });
});
