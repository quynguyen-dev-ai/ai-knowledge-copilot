import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Thin HTTP client for the Python AI service. Keeps all AI concerns behind one boundary. */
@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
  }

  async ingest(workspaceId: string, documentId: string, text: string, metadata: Record<string, unknown>) {
    const res = await this.request('/ingest', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId, document_id: documentId, text, metadata }),
    });
    return (await res.json()) as { document_id: string; chunks: number };
  }

  async deleteDocument(workspaceId: string, documentId: string): Promise<void> {
    await this.request(`/documents/${encodeURIComponent(workspaceId)}/${encodeURIComponent(documentId)}`, {
      method: 'DELETE',
    }).catch((err) => this.logger.warn(`Vector cleanup failed for ${documentId}: ${err}`));
  }

  /** Returns the raw SSE stream from the AI service. */
  async query(workspaceId: string, question: string): Promise<ReadableStream<Uint8Array>> {
    const res = await this.request('/query', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId, question }),
    });
    if (!res.body) throw new ServiceUnavailableException('AI service returned no body');
    return res.body;
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(120_000),
      });
    } catch (err) {
      this.logger.error(`AI service unreachable: ${err}`);
      throw new ServiceUnavailableException('AI service unavailable');
    }
    if (!res.ok) {
      throw new ServiceUnavailableException(`AI service error ${res.status}`);
    }
    return res;
  }
}
