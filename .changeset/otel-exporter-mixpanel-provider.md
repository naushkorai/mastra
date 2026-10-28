---
'@mastra/otel-exporter': minor
---

Added a `mixpanel` provider to `OtelExporter` for [Mixpanel Agent Intelligence](https://docs.mixpanel.com/docs/agent-intelligence). Set `MIXPANEL_PROJECT_TOKEN`, and optionally `MIXPANEL_REGION` (`us`, `eu` or `in`), then pass the user as `userId` in tracing metadata.

```ts
new OtelExporter({ provider: { mixpanel: {} }, signals: { logs: false } });
```
