import { WinstonLogger } from 'nest-winston';
import { createLogger, format, transports } from 'winston';

import { redactString, redactValue } from './redact';
import { AFFiNELogger as RawAFFiNELogger } from './service';

const moreMetadata = format(info => {
  info.requestId = RawAFFiNELogger.getRequestId();
  return info;
});

const flattenStack = format(info => {
  if (Array.isArray(info.stack)) {
    info.stack = info.stack.join('\n');
  }
  return info;
});

const redactFormat = format(info => {
  const redacted = redactValue(info) as Record<string, unknown>;
  for (const key of Object.keys(info)) {
    delete info[key];
  }
  Object.assign(info, redacted);
  if (typeof info.message === 'string') {
    info.message = redactString(info.message);
  }
  if (typeof info.stack === 'string') {
    info.stack = redactString(info.stack);
  }
  return info;
});

const serviceFormat = format(info => {
  info.service = 'trackwork-server';
  return info;
});

export function createStructuredLogger() {
  return createLogger({
    level: env.namespaces.canary ? 'debug' : 'info',
    format: format.combine(
      format.timestamp(),
      moreMetadata(),
      flattenStack(),
      redactFormat(),
      serviceFormat(),
      format.json()
    ),
    transports: [new transports.Console()],
  });
}

export class AFFiNEJsonLogger extends WinstonLogger {
  override error(
    message: any,
    stackOrError?: Error | string | unknown,
    context?: string
  ) {
    super.error(
      message,
      RawAFFiNELogger.formatStack(stackOrError) as string,
      context
    );
  }
}
