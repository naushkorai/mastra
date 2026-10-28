---
'@mastra/otel-exporter': minor
---

Added a `metadataAttributes` option to `OtelExporter` that copies span metadata keys to top-level span attributes under names you choose. Use it for backends that read attributes such as `user.id` or `tenant.id`. Off by default, so existing exports are unchanged.

```ts
new OtelExporter({
  provider: { custom: { endpoint: 'https://collector.example.com/v1/traces' } },
  metadataAttributes: { userId: 'user.id', tenantId: 'tenant.id' },
});

await agent.generate('Weather in Paris?', {
  tracingOptions: { metadata: { userId: 'user-123', tenantId: 'acme' } },
});
```
