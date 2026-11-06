import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiClient } from '../common/ai-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { extractText, normalizeType } from './text-extractor';

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiClient,
  ) {}

  list(workspaceId: string) {
    return this.prisma.document.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } });
  }

  async upload(workspaceId: string, file: UploadedFileLike) {
    const text = (await extractText(file)).trim();
    if (!text) throw new BadRequestException('No extractable text found in file');

    const doc = await this.prisma.document.create({
      data: {
        workspaceId,
        filename: file.originalname,
        mimeType: normalizeType(file.mimetype, file.originalname),
        sizeBytes: file.size,
      },
    });

    // Index in the background so the upload request returns immediately.
    void this.index(workspaceId, doc.id, file.originalname, text);
    return doc;
  }

  async remove(workspaceId: string, id: string) {
    const { count } = await this.prisma.document.deleteMany({ where: { id, workspaceId } });
    if (count === 0) throw new NotFoundException('Document not found');
    await this.ai.deleteDocument(workspaceId, id);
  }

  private async index(workspaceId: string, id: string, filename: string, text: string) {
    try {
      const { chunks } = await this.ai.ingest(workspaceId, id, text, { filename });
      await this.prisma.document.update({ where: { id }, data: { status: 'READY', chunks } });
    } catch (err) {
      this.logger.error(`Indexing failed for ${id}: ${err}`);
      await this.prisma.document
        .update({ where: { id }, data: { status: 'FAILED', error: String(err) } })
        .catch(() => undefined);
    }
  }
}
