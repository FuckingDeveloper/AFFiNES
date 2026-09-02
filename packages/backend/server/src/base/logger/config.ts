import { defineModuleConfig } from '../config';

declare global {
  interface AppConfigSchema {
    logger: {
      mode: 'auto' | 'pretty' | 'json';
    };
  }
}

defineModuleConfig('logger', {
  mode: {
    desc: 'Log output mode: auto (pretty in development, JSON in production), pretty, or json',
    default: 'auto',
    schema: { type: 'string', enum: ['auto', 'pretty', 'json'] },
  },
});
