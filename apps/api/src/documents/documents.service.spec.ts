import { BadRequestException, NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common';
import { DocumentsService } from './documents.service';

const flush = () => new Promise((r) => setImmediate(r));

function setup() {
  const prisma = {
    document: {
      create: jest.fn().mockResolvedValue({ id: 'doc1', status: 'PROCESSING' }),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn(),
    },
  };
  const ai = {
    ingest: jest.fn().mockResolvedValue({ document_id: 'doc1', chunks: 4 }),
    deleteDocument: jest.fn().mockResolvedValue(undefined),
  };
  const service = new DocumentsService(prisma as any, ai as any);
  return { service, prisma, ai };
}

const file = (name: string, content: string, mimetype = 'text/plain') => ({
  originalname: name,
  mimetype,
  size: content.length,
  buffer: Buffer.from(content),
});

describe('DocumentsService', () => {
  it('stores the document and indexes it in the background', async () => {
    const { service, prisma, ai } = setup();
    const doc = await service.upload('ws1', file('notes.md', '# Title\nBody', 'application/octet-stream'));

    expect(doc.status).toBe('PROCESSING');
    expect(prisma.document.create.mock.calls[0][0].data.mimeType).toBe('text/markdown');
    await flush();
    expect(ai.ingest).toHaveBeenCalledWith('ws1', 'doc1', '# Title\nBody', { filename: 'notes.md' });
    expect(prisma.document.update).toHaveBeenCalledWith({
      where: { id: 'doc1' },
      data: { status: 'READY', chunks: 4 },
    });
  });

  it('marks the document FAILED when indexing fails', async () => {
    const { service, prisma, ai } = setup();
    ai.ingest.mockRejectedValue(new Error('boom'));
    await service.upload('ws1', file('a.txt', 'hello'));
    await flush();
    expect(prisma.document.update.mock.calls[0][0].data.status).toBe('FAILED');
  });

  it('rejects empty files and unsupported types', async () => {
    const { service } = setup();
    await expect(service.upload('ws1', file('a.txt', '   '))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload('ws1', file('a.exe', 'x', 'application/x-msdownload'))).rejects.toBeInstanceOf(
      UnsupportedMediaTypeException,
    );
  });

  it('only deletes documents inside the caller workspace', async () => {
    const { service, prisma, ai } = setup();
    prisma.document.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove('ws2', 'doc1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.document.deleteMany).toHaveBeenCalledWith({ where: { id: 'doc1', workspaceId: 'ws2' } });
    expect(ai.deleteDocument).not.toHaveBeenCalled();
  });
});
