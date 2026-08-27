import { Injectable } from '@nestjs/common';

import type { ScmProvider, ScmProviderType } from '../types';
import { GitLabScmProvider } from './gitlab';

@Injectable()
export class ScmProviderRegistry {
  private readonly providers = new Map<ScmProviderType, ScmProvider>();

  constructor(gitLabProvider: GitLabScmProvider) {
    this.providers.set(gitLabProvider.type, gitLabProvider);
  }

  get(type: ScmProviderType): ScmProvider {
    const provider = this.providers.get(type);

    if (!provider) {
      throw new Error(`Unsupported SCM provider: ${type}`);
    }

    return provider;
  }
}

export { GitLabScmProvider } from './gitlab';
