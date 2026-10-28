---
'@mastra/otel-exporter': patch
---

Fixed `OtelExporter` sending traces to the wrong URL when a provider serves OTLP under its own path. An endpoint such as `https://example.com/api/otel/traces` was turned into `https://example.com/api/otel/traces/v1/traces`, so every export failed. An endpoint with a path is now used as the traces URL as configured, and logs go to the same path with a trailing `traces` segment replaced by `logs`. Bare base URLs and `/v1/traces` endpoints behave as before.
