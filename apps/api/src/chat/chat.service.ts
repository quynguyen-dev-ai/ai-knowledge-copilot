import { Injectable } from '@nestjs/common';
import { AiClient } from '../common/ai-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { SseParser } from './sse-parser';

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
  ) {}

  history(workspaceId: string, limit = 50) {
    return this.prisma.chatMessage.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
      take: -limit,
    });
  }

  /**
   * Streams the AI service's SSE response through to the client unchanged, while
   * reassembling the answer so it can be persisted once the stream completes.
   */
  async *ask(workspaceId: string, question: string): AsyncGenerator<string> {
    await this.prisma.chatMessage.create({ data: { workspaceId, role: 'USER', content: question } });

    const stream = await this.ai.query(workspaceId, question);
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let answer = '';
    let sources: unknown = null;

    for await (const bytes of stream as unknown as AsyncIterable<Uint8Array>) {
      const text = decoder.decode(bytes, { stream: true });
      for (const evt of parser.push(text)) {
        if (evt.event === 'token') answer += JSON.parse(evt.data);
        if (evt.event === 'sources') sources = JSON.parse(evt.data);
      }
      yield text;
    }

    await this.prisma.chatMessage.create({
      data: { workspaceId, role: 'ASSISTANT', content: answer, sources: sources ?? undefined },
    });
  }
}
