import { Injectable } from '@nestjs/common';

import type { CiProvider } from '../types';
import { JenkinsCiProvider } from './jenkins';

@Injectable()
export class CiProviderRegistry {
  private readonly providers = new Map<string, CiProvider>();

  constructor(jenkinsProvider: JenkinsCiProvider) {
    this.providers.set(jenkinsProvider.type, jenkinsProvider);
  }

  get(type: string): CiProvider {
    const provider = this.providers.get(type);

    if (!provider) {
      throw new Error(`Unsupported CI provider: ${type}`);
    }

    return provider;
  }

  has(type: string): boolean {
    return this.providers.has(type);
  }
}

export type { CiProvider, ConnectionTestResult, PipelineInfo } from '../types';
export { JenkinsCiProvider } from './jenkins';
