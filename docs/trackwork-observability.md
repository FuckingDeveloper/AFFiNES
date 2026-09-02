# TrackWork self-hosted observability

TrackWork exposes operational telemetry through two channels:

1. **Prometheus-compatible metrics** — an OpenTelemetry pipeline with a
   Prometheus exporter (default port `9464`).
2. **Structured JSON logs** — emitted to container stdout for collection by
   external agents (Grafana Alloy, Promtail, Vector, Fluent Bit, Logstash,
   Data Prepper).

Business code never talks to Loki, Elasticsearch, OpenSearch or similar
systems directly. Logs are emitted once, in a structured format, and external
collectors forward them to the log store of your choice.

## Enabling metrics

Metrics are **disabled by default** (`metrics.enabled = false`). Enable them
explicitly via the server configuration (`config.json` or the `CUSTOM_CONFIG_PATH`
override file):

```json
{
  "metrics": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 9464
  }
}
```

| Key                      | Default   | Description                                                              |
| ------------------------ | --------- | ------------------------------------------------------------------------ |
| `metrics.enabled`        | `false`   | Enables the OpenTelemetry SDK, Prometheus exporter and instrumentations. |
| `metrics.host`           | `0.0.0.0` | Interface the Prometheus exporter binds to.                              |
| `metrics.port`           | `9464`    | Port the Prometheus exporter listens on.                                 |
| `metrics.zipkinEndpoint` | `''`      | Optional Zipkin endpoint for trace export. Empty disables trace export.  |

`metrics.host`, `metrics.port` and `metrics.zipkinEndpoint` are applied when
the OpenTelemetry SDK is created and require a **server restart** to take
effect. Only `metrics.enabled` can be toggled at runtime.

The exporter runs as a **separate listener** on the configured host/port —
it is intentionally not exposed on the application port (`3010`).

> **Security:** the metrics endpoint contains operational data and must NOT be
> exposed publicly. Bind it to an internal/monitoring network interface
> (`127.0.0.1` or a private address) and allow access only from Prometheus.

### Prometheus scrape configuration

```yaml
scrape_configs:
  - job_name: trackwork
    static_configs:
      - targets: ['trackwork-internal:9464']
```

Verify the endpoint:

```sh
curl http://127.0.0.1:9464/metrics
```

### What is exposed

Metrics follow the existing AFFiNE OpenTelemetry conventions (scoped metric
names, low-cardinality labels). TrackWork-specific metrics:

| Metric                                                          | Type                | Labels                                                                                                                                                                                    |
| --------------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trackwork_webhook_received_total`                              | counter             | `provider`                                                                                                                                                                                |
| `trackwork_webhook_total`                                       | counter             | `provider`, `result` (`queued`, `invalid_signature`, `payload_too_large`, `not_found`, `disabled`, `error`)                                                                               |
| `trackwork_webhook_event_total`                                 | counter             | `provider`, `eventType` (normalized, `unknown` fallback), `result` (`processed`, `duplicate`, `untracked_repository`, `error`)                                                            |
| `trackwork_webhook_retry_total`                                 | counter             | `provider` — increments when a webhook job is processed with `attemptsMade > 0`                                                                                                           |
| `trackwork_function_calls_total` / `trackwork_function_timer_*` | counter / histogram | `name` (`scm_request`, `webhook_ingest`), `provider`, `operation` (`test_connection`, `list_repositories`, `list_pipelines`, `create_branch`, `create_merge_request` — SCM only), `error` |
| `trackwork_task_allocation_total`                               | counter             | `result` (`allocated`, `existing`, `exhausted`, `invalid`)                                                                                                                                |
| `trackwork_task_registry_total`                                 | counter             | `operation` (`sync`, `set_links`), `result` (`success`, `invalid`, `exhausted`)                                                                                                           |
| `queue_job_depth`                                               | gauge               | `queue`, `state` (`waiting`, `active`, `delayed`, `failed`, `completed`)                                                                                                                  |
| `queue_job_failed_total`                                        | counter             | `queue`, `job`                                                                                                                                                                            |

Existing AFFiNE metrics also remain available: `gql_query_counter`,
`gql_query_duration`, `gql_query_error_counter`, `controllers_error_total`,
`queue_job_handler_*`, `event_event_handler_*`, `process_*`, `prisma_*`,
`system_*` (host metrics), `socketio_*`, `auth_*`, and others.

Metric labels are strictly bounded enumerations. **Never** place task IDs,
document IDs, workspace IDs, user IDs, URLs, connection IDs or exception
messages into metric labels — the label set above is the contract.

### Reserved metric names

The following names are reserved for capabilities that do not exist yet and
currently emit no time series:

- `trackwork_automation_execution_total{result}` — server-side automation
- `trackwork_notification_delivery_total{result}` — TrackWork notifications
- `trackwork_encryption_state` / unlock metrics — quorum encryption

Do not emit these until the corresponding capability ships.

## Structured JSON logging

Server logs are emitted as JSON lines to stdout/stderr when the logger is in
structured mode. The mode is controlled by `logger.mode`:

```json
{
  "logger": {
    "mode": "auto"
  }
}
```

| Mode             | Behavior                                                                                  |
| ---------------- | ----------------------------------------------------------------------------------------- |
| `auto` (default) | Pretty console logs in development and test environments; JSON in production/self-hosted. |
| `json`           | Always JSON lines to stdout.                                                              |
| `pretty`         | Always human-readable console output.                                                     |

Example line:

```json
{
  "level": "error",
  "message": "scm.webhook.process.failed",
  "timestamp": "2026-09-02T12:00:00.000Z",
  "context": "IntegrationJob",
  "service": "trackwork-server",
  "requestId": "selfhosted:http:1b2f...",
  "provider": "gitlab",
  "eventType": "merge_request.opened",
  "result": "error",
  "connectionId": "…",
  "stack": "…"
}
```

Canonical fields:

- `timestamp`, `level`, `message`
- `context` — component/service class name
- `requestId` — server-generated correlation ID, propagated through
  HTTP/GraphQL → BullMQ jobs → SCM provider calls → webhook processing
- `event` — stable event name where applicable (e.g. `scm.webhook.rejected`)
- `result`, `provider`, `operation`, `eventType` — bounded context fields
- `service` — constant `trackwork-server`

### Secret redaction

A centralized redaction layer runs inside the logger:

- keys matching `token`, `password`, `secret`, `authorization`, `cookie`,
  `apiKey`, `clientSecret`, `privateKey`, `keyShare`, `encryptionKey`,
  `cipher`-related names (case-insensitive) are replaced with `[REDACTED]`
  recursively;
- well-known credential formats inside strings are redacted: `Bearer …`,
  `Basic …`, GitLab (`glpat-…`), GitHub (`ghp_…`/`gho_…`), Slack
  (`xoxb-…`), and `key=value` secret assignments.

Logs must never contain request bodies, document/task contents, commit
messages, MR titles/descriptions, branch names, email bodies, provider
responses, HTTP headers, or decrypted secrets. Error stack traces are
preserved but sanitized.

## Log collection examples

### Grafana Loki via Grafana Alloy / Promtail

```yaml
# promtail.yaml
clients:
  - url: http://loki:3100/loki/api/v1/push
scrape_configs:
  - job_name: trackwork
    docker_sd_configs:
      - host: unix:///var/run/docker.sock
        refresh_interval: 5s
    relabel_configs:
      - source_labels: ['__meta_docker_container_name']
        regex: 'trackwork.*'
        action: keep
      - source_labels: ['__meta_docker_container_name']
        target_label: 'instance'
```

Loki labels: `instance`, `service` (from the JSON `service` field if using a
pipeline), `level`. JSON log lines are indexed as structured fields — no text
parsing assumptions required.

### OpenSearch / Elasticsearch via Vector

```toml
# vector.toml
[sources.trackwork]
type = "docker_logs"
include_labels = ["com.docker.compose.service=trackwork"]

[transforms.trackwork_json]
type = "parse_json"
inputs = ["trackwork"]

[transforms.trackwork_remap]
type = "remap"
inputs = ["trackwork_json"]
source = '''
.ingest_timestamp = now()
'''

[sinks.opensearch]
type = "elasticsearch"
inputs = ["trackwork_remap"]
endpoints = ["http://opensearch:9200"]
index = "trackwork-logs"
mode = "bulk"
```

Fluent Bit, Logstash and Data Prepper can parse the same JSON lines — the
format is intentionally agent-agnostic.

## Alerting examples

Prometheus alert rules with bounded labels:

```yaml
groups:
  - name: trackwork
    rules:
      - alert: TrackWorkWebhookRejections
        expr: sum(rate(trackwork_webhook_total{result="invalid_signature"}[5m])) > 0
        for: 10m
        labels:
          severity: warning

      - alert: TrackWorkWebhookProcessingErrors
        expr: sum(rate(trackwork_webhook_event_total{result="error"}[5m])) > 0
        for: 5m
        labels:
          severity: warning

      - alert: TrackWorkScmProviderFailures
        expr: sum(rate(trackwork_function_calls_total{name="scm_request",error="true"}[5m])) > 0
        for: 15m
        labels:
          severity: warning

      - alert: TrackWorkQueueBacklog
        expr: queue_job_depth{state="waiting"} > 100
        for: 10m
        labels:
          severity: warning

      - alert: TrackWorkJobFailures
        expr: sum(rate(queue_job_failed_total[5m])) > 0
        for: 15m
        labels:
          severity: critical

      - alert: TrackWorkTaskAllocationExhausted
        expr: increase(trackwork_task_allocation_total{result="exhausted"}[5m]) > 0
        labels:
          severity: critical
```

## Correlation

Every HTTP request receives a server-generated `requestId` (returned in the
`X-Request-Id` response header) that is propagated through GraphQL handling,
BullMQ jobs (`$$requestId`), event handlers and SCM provider calls. The same
ID appears in structured log lines, allowing an operator to trace a webhook
delivery through job processing, provider calls and persistence. Inbound
`X-Request-Id` headers are not trusted; upstream correlation can be layered
later via a trusted-proxy configuration.

## Health endpoints

`/health/live` (liveness) and `/health/ready` (PostgreSQL + Redis readiness)
remain the orchestration contract. The metrics exporter is a separate
listener and does not affect application health.
