import { SseParser } from './sse-parser';

describe('SseParser', () => {
  it('parses complete events', () => {
    const p = new SseParser();
    expect(p.push('event: token\ndata: "Hi"\n\nevent: done\ndata: {}\n\n')).toEqual([
      { event: 'token', data: '"Hi"' },
      { event: 'done', data: '{}' },
    ]);
  });

  it('buffers events split across chunks', () => {
    const p = new SseParser();
    expect(p.push('event: tok')).toEqual([]);
    expect(p.push('en\ndata: "a')).toEqual([]);
    expect(p.push('b"\n\n')).toEqual([{ event: 'token', data: '"ab"' }]);
  });

  it('handles CRLF line endings and default event name', () => {
    const p = new SseParser();
    expect(p.push('data: x\r\n\r\n')).toEqual([{ event: 'message', data: 'x' }]);
  });
});
