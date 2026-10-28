import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { SpanType, TracingEventType } from '@mastra/core/observability';
import type { AnyExportedSpan } from '@mastra/core/observability';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OtelExporter } from './tracing';

describe('OtelExporter export URLs', () => {
  let server: http.Server;
  let baseUrl: string;
  let paths: string[];
  let requests: http.IncomingHttpHeaders[];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      paths.push(req.url ?? '');
      requests.push(req.headers);
      req.resume();
      req.on('end', () => {
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
    paths = [];
    requests = [];
  });

  const rootSpan = (): AnyExportedSpan =>
    ({
      id: 'a1b2c3d4e5f60718',
      traceId: '0af7651916cd43dd8448eb211c80319c',
      type: SpanType.AGENT_RUN,
      name: 'agent run',
      startTime: new Date(),
      endTime: new Date(),
      isRootSpan: true,
      isEvent: false,
      attributes: {},
      metadata: { userId: 'user-123' },
    }) as unknown as AnyExportedSpan;

  it('sends Mixpanel traces as protobuf to the AI traces path with the project token', async () => {
    const exporter = new OtelExporter({
      provider: { mixpanel: { projectToken: 'abc123', endpoint: `${baseUrl}/v1/ai/otel/traces` } },
      signals: { logs: false },
    });

    await exporter.exportTracingEvent({ type: TracingEventType.SPAN_ENDED, exportedSpan: rootSpan() });
    await exporter.flush();
    await exporter.shutdown();

    expect(paths).toEqual(['/v1/ai/otel/traces']);
    expect(requests[0]?.['content-type']).toBe('application/x-protobuf');
    expect(requests[0]?.authorization).toBe(`Basic ${Buffer.from('abc123:').toString('base64')}`);
  });

  // Vendors that serve OTLP under their own path (e.g. Mixpanel's /v1/ai/otel/traces) got
  // /v1/traces appended to it, so every export went to a URL that does not exist.
  it.each([
    ['a bare base URL', '', '/v1/traces', '/v1/logs'],
    ['a standard /v1/traces endpoint', '/v1/traces', '/v1/traces', '/v1/logs'],
    ['a standard endpoint with a trailing slash', '/v1/traces/', '/v1/traces', '/v1/logs'],
    ['a vendor traces path', '/v1/ai/otel/traces', '/v1/ai/otel/traces', '/v1/ai/otel/logs'],
  ])('sends traces and logs to the right URLs for %s', async (_label, endpointPath, tracesPath, logsPath) => {
    const exporter = new OtelExporter({
      provider: { custom: { endpoint: `${baseUrl}${endpointPath}`, protocol: 'http/json' } },
    });

    await exporter.exportTracingEvent({ type: TracingEventType.SPAN_ENDED, exportedSpan: rootSpan() });
    await exporter.onLogEvent({
      type: 'log',
      log: { timestamp: new Date(), level: 'info', message: 'hello' },
    });
    await exporter.flush();
    await exporter.shutdown();

    expect(paths).toContain(tracesPath);
    expect(paths).toContain(logsPath);
    expect(paths.every(path => path === tracesPath || path === logsPath)).toBe(true);
  });

  it('sends traces to a vendor path that does not end in a signal segment', async () => {
    const exporter = new OtelExporter({
      provider: { custom: { endpoint: `${baseUrl}/v1/logs/otel`, protocol: 'http/json' } },
      signals: { logs: false },
    });

    await exporter.exportTracingEvent({ type: TracingEventType.SPAN_ENDED, exportedSpan: rootSpan() });
    await exporter.flush();
    await exporter.shutdown();

    expect(paths).toEqual(['/v1/logs/otel']);
  });
});
