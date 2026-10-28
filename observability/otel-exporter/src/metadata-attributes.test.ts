import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { SpanType, TracingEventType } from '@mastra/core/observability';
import type { AnyExportedSpan } from '@mastra/core/observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OtelExporter } from './tracing';
import type { OtelExporterConfig } from './types';

type OtlpAttribute = { key: string; value: Record<string, unknown> };

describe('OtelExporter metadataAttributes', () => {
  let server: http.Server;
  let baseUrl: string;
  let bodies: string[];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => {
        bodies.push(body);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{}');
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
  });

  beforeEach(() => {
    bodies = [];
  });

  async function exportedAttributes(
    metadata: Record<string, unknown>,
    config: Partial<OtelExporterConfig> = {},
  ): Promise<Record<string, unknown>> {
    const exporter = new OtelExporter({
      provider: { custom: { endpoint: baseUrl, protocol: 'http/json' } },
      signals: { logs: false },
      ...config,
    });
    const now = new Date();
    await exporter.exportTracingEvent({
      type: TracingEventType.SPAN_ENDED,
      exportedSpan: {
        id: 'a1b2c3d4e5f60718',
        traceId: '0af7651916cd43dd8448eb211c80319c',
        type: SpanType.AGENT_RUN,
        name: 'agent run',
        startTime: now,
        endTime: now,
        isRootSpan: true,
        isEvent: false,
        attributes: {},
        metadata,
      } as unknown as AnyExportedSpan,
    });
    await exporter.flush();
    await exporter.shutdown();

    const spans = bodies.flatMap(body => JSON.parse(body).resourceSpans[0].scopeSpans[0].spans);
    expect(spans).toHaveLength(1);
    return Object.fromEntries(
      (spans[0].attributes as OtlpAttribute[]).map(({ key, value }) => [key, Object.values(value)[0]]),
    );
  }

  it('exports metadata only under mastra.metadata.* when no mapping is configured', async () => {
    const attributes = await exportedAttributes({ userId: 'user-123' });

    expect(attributes['mastra.metadata.userId']).toBe('user-123');
    expect(attributes['user.id']).toBeUndefined();
  });

  it('copies a mapped metadata key to the named span attribute', async () => {
    const attributes = await exportedAttributes(
      { userId: 'user-123', tenant: 'acme' },
      { metadataAttributes: { userId: 'user.id' } },
    );

    expect(attributes['user.id']).toBe('user-123');
    expect(attributes['mastra.metadata.userId']).toBe('user-123');
    expect(attributes['tenant']).toBeUndefined();
  });

  it('copies several metadata keys to attribute names the user picks', async () => {
    const attributes = await exportedAttributes(
      { userId: 'user-123', tenantId: 'acme', plan: 'pro' },
      { metadataAttributes: { userId: 'enduser.id', tenantId: 'tenant.id' } },
    );

    expect(attributes['enduser.id']).toBe('user-123');
    expect(attributes['tenant.id']).toBe('acme');
    expect(attributes['user.id']).toBeUndefined();
    expect(attributes['plan']).toBeUndefined();
  });

  it('exports a numeric metadata value as a string', async () => {
    const attributes = await exportedAttributes({ userId: 42 }, { metadataAttributes: { userId: 'user.id' } });

    expect(attributes['user.id']).toBe('42');
  });

  it.each([
    ['missing', {}],
    ['empty', { userId: '' }],
    ['null', { userId: null }],
  ])('leaves the attribute unset when the metadata value is %s', async (_label, metadata) => {
    const attributes = await exportedAttributes(metadata, { metadataAttributes: { userId: 'user.id' } });

    expect(attributes['user.id']).toBeUndefined();
  });
});
