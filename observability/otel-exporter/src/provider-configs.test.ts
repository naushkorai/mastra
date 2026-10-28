import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveProviderConfig } from './provider-configs';

describe('Provider Configurations', () => {
  describe('Mixpanel', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
      vi.restoreAllMocks();
    });

    it('maps userId metadata to user.id, since Mixpanel drops spans without it', () => {
      const config = resolveProviderConfig({ mixpanel: { projectToken: 'abc123' } });

      expect(config?.metadataAttributes).toEqual({ userId: 'user.id' });
    });

    it('sends to the US AI traces endpoint with the token as the Basic auth username', () => {
      const config = resolveProviderConfig({ mixpanel: { projectToken: 'abc123' } });

      expect(config?.endpoint).toBe('https://ingestion-us.mixpanel.com/v1/ai/otel/traces');
      expect(config?.headers['Authorization']).toBe(`Basic ${Buffer.from('abc123:').toString('base64')}`);
      expect(config?.protocol).toBe('http/protobuf');
    });

    it.each([
      ['eu', 'https://ingestion-eu.mixpanel.com/v1/ai/otel/traces'],
      ['in', 'https://ingestion-in.mixpanel.com/v1/ai/otel/traces'],
    ] as const)('uses the %s data residency endpoint', (region, endpoint) => {
      const config = resolveProviderConfig({ mixpanel: { projectToken: 'abc123', region } });

      expect(config?.endpoint).toBe(endpoint);
    });

    it('prefers an explicit endpoint over the region', () => {
      const config = resolveProviderConfig({
        mixpanel: { projectToken: 'abc123', region: 'eu', endpoint: 'https://proxy.example.com/v1/ai/otel/traces' },
      });

      expect(config?.endpoint).toBe('https://proxy.example.com/v1/ai/otel/traces');
    });

    it('reads the token, region and endpoint from the environment', () => {
      vi.stubEnv('MIXPANEL_PROJECT_TOKEN', 'env-token');
      vi.stubEnv('MIXPANEL_REGION', 'in');

      const config = resolveProviderConfig({ mixpanel: {} });

      expect(config?.endpoint).toBe('https://ingestion-in.mixpanel.com/v1/ai/otel/traces');
      expect(config?.headers['Authorization']).toBe(`Basic ${Buffer.from('env-token:').toString('base64')}`);

      vi.stubEnv('MIXPANEL_ENDPOINT', 'https://proxy.example.com/v1/ai/otel/traces');
      expect(resolveProviderConfig({ mixpanel: {} })?.endpoint).toBe('https://proxy.example.com/v1/ai/otel/traces');
    });

    it('disables tracing without a project token', () => {
      vi.stubEnv('MIXPANEL_PROJECT_TOKEN', '');
      const error = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(resolveProviderConfig({ mixpanel: {} })).toBeNull();
      expect(error).toHaveBeenCalledWith(expect.stringContaining('MIXPANEL_PROJECT_TOKEN'));
    });
  });

  describe('SigNoz', () => {
    it('should configure SigNoz with cloud endpoint', () => {
      const config = resolveProviderConfig({
        signoz: {
          apiKey: 'test-key',
          region: 'us',
        },
      });

      expect(config?.endpoint).toBe('https://ingest.us.signoz.cloud:443/v1/traces');
      expect(config?.headers['signoz-ingestion-key']).toBe('test-key');
      expect(config?.protocol).toBe('http/protobuf');
    });

    it('should handle self-hosted SigNoz', () => {
      const config = resolveProviderConfig({
        signoz: {
          apiKey: 'test-key',
          endpoint: 'https://my-signoz.example.com',
        },
      });

      expect(config?.endpoint).toBe('https://my-signoz.example.com');
      expect(config?.headers['signoz-ingestion-key']).toBe('test-key');
    });
  });

  describe('Dash0', () => {
    it('should configure Dash0 with proper headers', () => {
      const config = resolveProviderConfig({
        dash0: {
          apiKey: 'test-key',
          endpoint: 'ingress.us-west-2.aws.dash0.com:4317',
          dataset: 'production',
        },
      });

      expect(config?.endpoint).toBe('ingress.us-west-2.aws.dash0.com:4317/v1/traces');
      expect(config?.headers['authorization']).toBe('Bearer test-key');
      expect(config?.headers['dash0-dataset']).toBe('production');
      expect(config?.protocol).toBe('grpc');
    });
  });

  describe('New Relic', () => {
    it('should configure New Relic with default endpoint', () => {
      const config = resolveProviderConfig({
        newrelic: {
          apiKey: 'test-license-key',
        },
      });

      expect(config?.endpoint).toBe('https://otlp.nr-data.net:443/v1/traces');
      expect(config?.headers['api-key']).toBe('test-license-key');
      expect(config?.protocol).toBe('http/protobuf');
    });
  });

  describe('Traceloop', () => {
    it('should configure Traceloop with destination ID', () => {
      const config = resolveProviderConfig({
        traceloop: {
          apiKey: 'test-key',
          destinationId: 'my-destination',
        },
      });

      expect(config?.endpoint).toBe('https://api.traceloop.com/v1/traces');
      expect(config?.headers['Authorization']).toBe('Bearer test-key');
      expect(config?.headers['x-traceloop-destination-id']).toBe('my-destination');
      expect(config?.protocol).toBe('http/json');
    });
  });

  describe('Laminar', () => {
    it('should configure Laminar', () => {
      const config = resolveProviderConfig({
        laminar: {
          apiKey: 'test-key',
        },
      });

      expect(config?.endpoint).toBe('https://api.lmnr.ai/v1/traces');
      expect(config?.headers['Authorization']).toBe('Bearer test-key');
      expect(config?.protocol).toBe('http/protobuf');
    });

    it('should require apiKey', () => {
      // Clear env var to ensure config validation fails
      const originalApiKey = process.env.LMNR_PROJECT_API_KEY;
      delete process.env.LMNR_PROJECT_API_KEY;
      try {
        const config = resolveProviderConfig({
          laminar: {},
        });

        expect(config).toBeNull();
      } finally {
        if (originalApiKey !== undefined) process.env.LMNR_PROJECT_API_KEY = originalApiKey;
      }
    });
  });

  describe('Custom', () => {
    it('should configure custom provider', () => {
      const config = resolveProviderConfig({
        custom: {
          endpoint: 'https://my-collector.example.com',
          headers: { 'x-value': 'test' },
          protocol: 'http/protobuf',
        },
      });

      expect(config?.endpoint).toBe('https://my-collector.example.com');
      expect(config?.headers['x-value']).toBe('test');
      expect(config?.protocol).toBe('http/protobuf');
    });

    it('should require endpoint for custom provider', () => {
      const config = resolveProviderConfig({
        custom: {
          headers: { 'x-value': 'test' },
        },
      });

      expect(config).toBeNull();
    });
  });
});
