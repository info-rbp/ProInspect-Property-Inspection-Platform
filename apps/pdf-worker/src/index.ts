import { createHash } from 'node:crypto';
import { loadRuntimeConfig } from '@pcr/config';

const config = loadRuntimeConfig();

export interface RenderInput {
  agencyId?: string;
  reportId: string;
  reportVersionId: string;
  templateId: string;
  templateVersion: number;
  approvedAt: string;
  approvedBy: string;
  report: Record<string, unknown>;
  areas: Array<Record<string, unknown>>;
  assets: Array<{ photoId: string; objectPath: string; generation: string; sha256: string }>;
  /** Ephemeral in-memory render data. Excluded from canonical JSON and never persisted. */
  renderAssetData?: Record<string, string>;
  brandingSnapshot?: Record<string, unknown>;
  ownerSummary?: Record<string, unknown>;
  tenantResponse?: Record<string, unknown>;
  agentResponse?: Record<string, unknown>;
  outputLayoutVersion?: string;
}

export interface RenderPackage {
  renderId: string;
  reportId: string;
  reportVersionId: string;
  templateId: string;
  templateVersion: number;
  canonicalInputHash: string;
  outputObjectPath: string;
  rendererVersion: string;
  createdAt: string;
}

export interface ArchiveManifest {
  archiveId: string;
  reportId: string;
  reportVersionId: string;
  templateId: string;
  templateVersion: number;
  pdf: { objectPath: string; generation: string; sha256: string };
  assets: Array<{ photoId: string; objectPath: string; generation: string; sha256: string }>;
  canonicalInputHash: string;
  manifestHash: string;
  finalisedAt: string;
  finalisedBy: string;
  immutable: true;
}

export interface TenantResponseItem {
  componentId: string;
  response: 'agree' | 'disagree' | 'comment';
  comment?: string;
  photoIds: string[];
}

export interface TenantResponseSubmission {
  id: string;
  reportId: string;
  tenancyId: string;
  tenantUid: string;
  reportVersionId: string;
  items: TenantResponseItem[];
  submittedAt: string;
  contentHash: string;
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortValue(item)]));
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

export function buildRenderPackage(input: RenderInput, createdAt = new Date().toISOString()): RenderPackage {
  if (!input.reportId.trim() || !input.reportVersionId.trim()) throw new Error('Report and report version are required.');
  if (!input.templateId.trim() || input.templateVersion < 1) throw new Error('Published template identity is required.');
  const canonicalInput = { ...input };
  delete canonicalInput.renderAssetData;
  const canonicalInputHash = sha256(canonicalJson(canonicalInput));
  const renderId = sha256(`${input.reportId}|${input.reportVersionId}|${input.templateId}|${input.templateVersion}|${canonicalInputHash}`);
  return {
    renderId,
    reportId: input.reportId,
    reportVersionId: input.reportVersionId,
    templateId: input.templateId,
    templateVersion: input.templateVersion,
    canonicalInputHash,
    outputObjectPath: `final-report-assets/agencies/${input.agencyId ?? 'unscoped'}/reports/${input.reportId}/${input.reportVersionId}/${renderId}.pdf`,
    rendererVersion: 'proinspect-html-chromium-v1',
    createdAt,
  };
}

export function buildArchiveManifest(input: {
  render: RenderPackage;
  pdf: { objectPath: string; generation: string; sha256: string };
  assets: RenderInput['assets'];
  finalisedAt?: string;
  finalisedBy: string;
}): ArchiveManifest {
  if (!/^[a-f0-9]{64}$/.test(input.pdf.sha256)) throw new Error('PDF SHA-256 is required.');
  for (const asset of input.assets) if (!/^[a-f0-9]{64}$/.test(asset.sha256)) throw new Error(`Asset SHA-256 is invalid for ${asset.photoId}.`);
  const finalisedAt = input.finalisedAt ?? new Date().toISOString();
  const base = {
    reportId: input.render.reportId,
    reportVersionId: input.render.reportVersionId,
    templateId: input.render.templateId,
    templateVersion: input.render.templateVersion,
    pdf: input.pdf,
    assets: [...input.assets].sort((left, right) => left.photoId.localeCompare(right.photoId)),
    canonicalInputHash: input.render.canonicalInputHash,
    finalisedAt,
    finalisedBy: input.finalisedBy,
  };
  const manifestHash = sha256(canonicalJson(base));
  return {
    archiveId: manifestHash,
    ...base,
    manifestHash,
    immutable: true,
  };
}

export function verifyArchiveManifest(manifest: ArchiveManifest): boolean {
  const base = { ...manifest } as Partial<ArchiveManifest>;
  delete base.archiveId;
  delete base.manifestHash;
  delete base.immutable;
  const expected = sha256(canonicalJson(base));
  return manifest.immutable === true && manifest.archiveId === expected && manifest.manifestHash === expected;
}

export function submitTenantResponse(input: Omit<TenantResponseSubmission, 'id' | 'contentHash'>): TenantResponseSubmission {
  if (!input.reportId.trim() || !input.reportVersionId.trim() || !input.tenancyId.trim() || !input.tenantUid.trim()) throw new Error('Tenant response identity is incomplete.');
  if (!input.items.length) throw new Error('Tenant response must contain at least one item.');
  for (const item of input.items) {
    if (!item.componentId.trim()) throw new Error('Tenant response component is required.');
    if ((item.response === 'disagree' || item.response === 'comment') && !item.comment?.trim()) throw new Error('Disagreement and comment responses require commentary.');
  }
  const contentHash = sha256(canonicalJson(input));
  return { id: contentHash, ...structuredClone(input), contentHash };
}

export async function handlePdfTask(reportId: string): Promise<{ reportId: string; status: 'accepted' }> {
  console.log(JSON.stringify({ level: config.logLevel, message: 'pdf.accepted', reportId }));
  return { reportId, status: 'accepted' };
}

export interface GeneratedPackageRecord {
  id: string;
  reportId: string;
  reportVersionId: string;
  render: RenderPackage;
  pdf: { objectPath: string; generation: string; sha256: string };
  canonicalJson: { objectPath: string; generation: string; sha256: string };
  manifest: ArchiveManifest;
  manifestObject: { objectPath: string; generation: string; sha256: string };
  status: 'ready';
  createdAt: string;
}

export interface PdfRenderer {
  render(html: string): Promise<Uint8Array>;
}

export interface PackageObjectWriter {
  write(objectPath: string, content: Uint8Array, contentType: string): Promise<{ objectPath: string; generation: string; sha256: string }>;
}

export interface PdfPackageStore {
  get(renderId: string): Promise<GeneratedPackageRecord | undefined>;
  save(record: GeneratedPackageRecord): Promise<void>;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function renderReportHtml(input: RenderInput): string {
  const address = escapeHtml(input.report.propertyAddress ?? 'Property inspection report');
  const areaHtml = input.areas.map((area) => {
    const components = Array.isArray(area.components) ? area.components as Array<Record<string, unknown>> : [];
    const rows = components.map((component) => `<tr><td><strong>${escapeHtml(component.component ?? component.name ?? component.id)}</strong></td><td>${escapeHtml(component.conditionCategory ?? '')}</td><td>${escapeHtml(component.cleanlinessCategory ?? '')}</td><td>${escapeHtml(component.workingStatus ?? '')}</td><td>${escapeHtml(component.commentary ?? '')}</td></tr>`).join('');
    return `<section><h2>${escapeHtml(area.name ?? area.id ?? 'Area')}</h2><p>${escapeHtml(area.overallCommentary ?? area.commentary ?? '')}</p>${rows ? `<table><thead><tr><th>Component</th><th>Condition</th><th>Cleanliness</th><th>Operation</th><th>Observed commentary</th></tr></thead><tbody>${rows}</tbody></table>` : ''}</section>`;
  }).join('');
  const gallery = input.assets.map((asset) => {
    const source = input.renderAssetData?.[asset.photoId];
    return source ? `<figure><img src="${source}" alt="Inspection evidence ${escapeHtml(asset.photoId)}"><figcaption>${escapeHtml(asset.photoId)} · generation ${escapeHtml(asset.generation)}</figcaption></figure>` : '';
  }).join('');
  const limitation = 'Visual inspection record only. It does not determine liability, legal compliance, structural adequacy or specialist trade condition.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><style>@page{size:A4;margin:15mm}@page{@bottom-right{content:"Page " counter(page) " of " counter(pages);font-size:8pt;color:#3a444b}}body{font-family:Arial,sans-serif;color:#141a1d;font-size:9.5pt}header{border-bottom:3px solid #208992;padding-bottom:12px;margin-bottom:20px}h1{font-size:24pt;margin:0}h2{font-size:15pt;border-bottom:1px solid #9ba3aa;padding-bottom:5px;margin-top:22px;break-after:avoid}p{line-height:1.55;white-space:pre-wrap}.identity{font:9pt monospace;color:#28323a}table{width:100%;border-collapse:collapse;font-size:8.5pt}th,td{border:1px solid #9ba3aa;padding:6px;vertical-align:top;text-align:left}th{background:#e7e9eb}tr,figure{break-inside:avoid}.gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.gallery img{display:block;width:100%;height:75mm;object-fit:contain;background:#e7e9eb}.gallery figcaption{font:7pt monospace;color:#28323a;margin-top:3px}footer{margin-top:28px;border-top:1px solid #9ba3aa;padding-top:10px;color:#28323a;font-size:8pt}</style></head><body><header><div class="identity">${escapeHtml(input.templateId)} v${input.templateVersion} · report version ${escapeHtml(input.reportVersionId)}</div><h1>${address}</h1></header>${areaHtml}${gallery ? `<section><h2>Inspection evidence</h2><div class="gallery">${gallery}</div></section>` : ''}<footer>${limitation}</footer></body></html>`;
}

export class DurablePdfProcessor {
  constructor(private readonly renderer: PdfRenderer, private readonly writer: PackageObjectWriter, private readonly store: PdfPackageStore) {}

  async process(input: RenderInput, finalisedBy: string, now = new Date().toISOString()): Promise<GeneratedPackageRecord> {
    const render = buildRenderPackage(input, now);
    const existing = await this.store.get(render.renderId);
    if (existing) return existing;
    const canonicalInput = { ...input };
    delete canonicalInput.renderAssetData;
    const canonical = new TextEncoder().encode(canonicalJson(canonicalInput));
    const canonicalObject = await this.writer.write(render.outputObjectPath.replace(/\.pdf$/u, '.json'), canonical, 'application/json');
    const pdfBytes = await this.renderer.render(renderReportHtml(input));
    if (!pdfBytes.byteLength) throw new Error('PDF renderer returned an empty document.');
    const pdf = await this.writer.write(render.outputObjectPath, pdfBytes, 'application/pdf');
    const manifest = buildArchiveManifest({ render, pdf, assets: input.assets, finalisedAt: now, finalisedBy });
    const manifestBytes = new TextEncoder().encode(canonicalJson(manifest));
    const manifestObject = await this.writer.write(render.outputObjectPath.replace(/\.pdf$/u, '.manifest.json'), manifestBytes, 'application/json');
    const record: GeneratedPackageRecord = {
      id: render.renderId, reportId: input.reportId, reportVersionId: input.reportVersionId,
      render, pdf, canonicalJson: canonicalObject, manifest, manifestObject, status: 'ready', createdAt: now,
    };
    await this.store.save(record);
    return record;
  }
}

export async function processPdfTask(agencyId: string, input: RenderInput, finalisedBy: string): Promise<GeneratedPackageRecord> {
  const [{ ChromiumPdfRenderer }, { FirebasePackageObjectWriter, FirestorePdfPackageStore }] = await Promise.all([
    import('./renderers/chromiumPdfRenderer.js'), import('./repositories/firebasePackageStore.js'),
  ]);
  if (input.agencyId && input.agencyId !== agencyId) throw new Error('PDF task agency mismatch.');
  return new DurablePdfProcessor(new ChromiumPdfRenderer(), new FirebasePackageObjectWriter(), new FirestorePdfPackageStore(agencyId)).process({ ...input, agencyId }, finalisedBy);
}

export async function processQueuedPdfTask(agencyId: string, taskId: string): Promise<GeneratedPackageRecord> {
  const { processQueuedPdfJob } = await import('./queuedPdfTask.js');
  return processQueuedPdfJob(agencyId, taskId);
}

export { ChromiumPdfRenderer } from './renderers/chromiumPdfRenderer.js';
export { FirebasePackageObjectWriter, FirestorePdfPackageStore } from './repositories/firebasePackageStore.js';
