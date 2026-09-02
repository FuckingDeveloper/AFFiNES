import { defineModuleConfig } from '../config';

declare global {
  interface AppConfigSchema {
    metrics: {
      enabled: boolean;
      host: string;
      port: number;
      zipkinEndpoint: string;
    };
  }
}

defineModuleConfig('metrics', {
  enabled: {
    desc: 'Enable metric and tracing collection',
    default: false,
  },
  host: {
    desc: 'Host the Prometheus exporter listens on',
    default: '0.0.0.0',
  },
  port: {
    desc: 'Port the Prometheus exporter listens on',
    default: 9464,
  },
  zipkinEndpoint: {
    desc: 'Zipkin endpoint for trace export; empty disables trace export',
    default: '',
  },
});
