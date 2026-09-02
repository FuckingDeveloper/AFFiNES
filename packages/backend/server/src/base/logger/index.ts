import './config';

import { Global, Module, Provider } from '@nestjs/common';

import { Config, ConfigModule } from '../config';
import { AFFiNEJsonLogger, createStructuredLogger } from './json';
import { AFFiNELogger } from './service';

function useStructuredLogging(config: Config) {
  const mode = config.logger.mode;
  if (mode === 'json') {
    return true;
  }
  if (mode === 'pretty') {
    return false;
  }
  return !env.dev && !env.testing;
}

const LoggerProvider: Provider = {
  provide: AFFiNELogger,
  useFactory: (config: Config) => {
    if (useStructuredLogging(config)) {
      return new AFFiNEJsonLogger(createStructuredLogger());
    }
    return new AFFiNELogger();
  },
  inject: [Config],
};

@Global()
@Module({
  imports: [ConfigModule],
  providers: [LoggerProvider],
  exports: [AFFiNELogger],
})
export class LoggerModule {}

export { AFFiNEJsonLogger, createStructuredLogger } from './json';
export { isSensitiveKey, REDACTED, redactString, redactValue } from './redact';
export { AFFiNELogger } from './service';
