import { createHash } from 'node:crypto';

export interface ImportCandidateDraft {
  id: string;
  importJobId: string;
  sourceDocumentId: string;
  sourceLocator: { line: number };
  candidateType: 'area' | 'component' | 'commentary';
  extractedValue: Record<string, unknown>;
  confidence: number;
  reviewStatus: 'pending';
}

export interface ImportProcessingResult {
  candidates: ImportCandidateDraft[];
  warnings: Array<{ code: string; message: string; sourceDocumentId: string }>;
  sourceLineCount: number;
}

const COMMON_AREAS = new Set([
  'entry', 'hallway', 'lounge', 'living room', 'dining room', 'kitchen', 'laundry',
  'bathroom', 'ensuite', 'toilet', 'bedroom', 'master bedroom', 'garage', 'balcony',
  'courtyard', 'exterior', 'garden', 'grounds', 'security', 'general',
]);

function stableId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32);
}

function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

function areaHeading(line: string): string | undefined {
  const stripped = normaliseWhitespace(line.replace(/^#+\s*/u, '').replace(/:$/u, ''));
  if (!stripped || stripped.length > 60) return undefined;
  const normalised = stripped.toLowerCase();
  if (COMMON_AREAS.has(normalised)) return stripped;
  if (/^[A-Z][A-Z\s/&-]{2,}$/u.test(stripped)) return stripped.replace(/\b\w/g, (character) => character.toUpperCase()).toLowerCase().replace(/\b\w/g, (character) => character.toUpperCase());
  if (line.trim().endsWith(':') && !/[.!?]/u.test(stripped)) return stripped;
  return undefined;
}

function componentObservation(line: string): { component: string; commentary: string } | undefined {
  const stripped = normaliseWhitespace(line.replace(/^[-*•\d.)\s]+/u, ''));
  if (!stripped || stripped.length < 3) return undefined;
  const separator = stripped.match(/^([^:–—-]{2,80})\s*[:–—-]\s*(.+)$/u);
  if (separator?.[1] && separator[2]) {
    return { component: normaliseWhitespace(separator[1]), commentary: normaliseWhitespace(separator[2]) };
  }
  if (stripped.length >= 25 && /\b(condition|clean|mark|damage|working|fitting|painted|secured|visible|noted)\b/iu.test(stripped)) {
    return { component: 'Imported observation', commentary: stripped };
  }
  return undefined;
}

export function processPreviousReportText(importJobId: string, sourceDocumentId: string, text: string): ImportProcessingResult {
  const lines = text.split(/\r?\n/u);
  const candidates: ImportCandidateDraft[] = [];
  const warnings: ImportProcessingResult['warnings'] = [];
  let currentArea = 'Imported observations';
  let areaSequence = 0;
  let componentSequence = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = normaliseWhitespace(lines[index] ?? '');
    if (!line) continue;
    const heading = areaHeading(line);
    if (heading) {
      currentArea = heading;
      areaSequence += 1;
      candidates.push({
        id: stableId(`${importJobId}|${sourceDocumentId}|area|${index}|${heading}`),
        importJobId,
        sourceDocumentId,
        sourceLocator: { line: index + 1 },
        candidateType: 'area',
        extractedValue: { name: heading, sequence: areaSequence },
        confidence: COMMON_AREAS.has(heading.toLowerCase()) ? 0.98 : 0.82,
        reviewStatus: 'pending',
      });
      continue;
    }

    const observation = componentObservation(line);
    if (!observation) continue;
    componentSequence += 1;
    candidates.push({
      id: stableId(`${importJobId}|${sourceDocumentId}|component|${index}|${observation.component}|${observation.commentary}`),
      importJobId,
      sourceDocumentId,
      sourceLocator: { line: index + 1 },
      candidateType: 'component',
      extractedValue: {
        areaName: currentArea,
        component: observation.component,
        commentary: observation.commentary,
        sequence: componentSequence,
      },
      confidence: observation.component === 'Imported observation' ? 0.62 : 0.9,
      reviewStatus: 'pending',
    });
  }

  if (!candidates.some((candidate) => candidate.candidateType === 'component')) {
    warnings.push({ code: 'NO_COMPONENTS_DETECTED', message: 'No component observations were detected. Manual mapping is required.', sourceDocumentId });
  }
  if (text.trim().length < 40) {
    warnings.push({ code: 'LOW_TEXT_VOLUME', message: 'Very little text was available for deterministic extraction.', sourceDocumentId });
  }

  return { candidates, warnings, sourceLineCount: lines.length };
}
