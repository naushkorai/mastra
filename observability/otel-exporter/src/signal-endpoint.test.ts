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

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      paths.push(req.url ?? '');
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
      } as unknown as AnyExportedSpan,
    });
    await exporter.onLogEvent({
      type: 'log',
      log: { timestamp: now, level: 'info', message: 'hello' },
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
      } as unknown as AnyExportedSpan,
    });
    await exporter.flush();
    await exporter.shutdown();

    expect(paths).toEqual(['/v1/logs/otel']);
  });
});
