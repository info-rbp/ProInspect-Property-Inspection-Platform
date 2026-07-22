import { GoogleAuth } from 'google-auth-library';
import type { AnalysisClaim, AnalysisTask, ModelGateway } from '../index.js';

interface VertexResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  error?: { message?: string };
}

function prompt(task: AnalysisTask): string {
  return JSON.stringify({
    instruction: 'Return JSON only with a claims array. Record visible observations, cite evidence photo IDs, state uncertainty below 0.7 confidence, and never infer tenant liability or causation.',
    reportId: task.reportId,
    template: { id: task.templateId, version: task.templateVersion },
    evidence: task.evidence,
  });
}

function contentType(path: string): string {
  if (/\.png$/iu.test(path)) return 'image/png';
  if (/\.webp$/iu.test(path)) return 'image/webp';
  return 'image/jpeg';
}

export class VertexModelGateway implements ModelGateway {
  private readonly auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });

  constructor(
    private readonly projectId = process.env.GOOGLE_CLOUD_PROJECT ?? '',
    private readonly location = process.env.VERTEX_LOCATION ?? 'australia-southeast1',
  ) {}

  async analyse(task: AnalysisTask): Promise<{ claims: AnalysisClaim[]; usage?: { inputTokens?: number; outputTokens?: number } }> {
    if (!this.projectId) throw new Error('GOOGLE_CLOUD_PROJECT is required for Vertex analysis.');
    const client = await this.auth.getClient();
    const token = await client.getAccessToken();
    const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/locations/${encodeURIComponent(this.location)}/publishers/google/models/${encodeURIComponent(task.model)}:generateContent`;
    const bucket = process.env.ANALYSIS_BUCKET ?? process.env.UPLOAD_BUCKET;
    if (!bucket || task.evidence.some((item) => !item.objectPath)) throw new Error('ANALYSIS_BUCKET and immutable evidence object paths are required for grounded analysis.');
    const parts = [
      ...task.evidence.map((item) => ({ fileData: { mimeType: item.contentType ?? contentType(item.objectPath!), fileUri: `gs://${bucket}/${item.objectPath}` } })),
      { text: prompt(task) },
    ];
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${token.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        safetySettings: Object.entries(task.safetyConfiguration ?? {}).map(([category, threshold]) => ({ category, threshold })),
      }),
    });
    const payload = await response.json() as VertexResponse;
    if (!response.ok) throw new Error(payload.error?.message ?? `Vertex request failed with ${response.status}.`);
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
    if (!text) throw new Error('Vertex returned no structured analysis content.');
    const parsed = JSON.parse(text) as { claims?: AnalysisClaim[] };
    if (!Array.isArray(parsed.claims)) throw new Error('Vertex response does not contain a claims array.');
    return {
      claims: parsed.claims,
      usage: { inputTokens: payload.usageMetadata?.promptTokenCount, outputTokens: payload.usageMetadata?.candidatesTokenCount },
    };
  }
}
