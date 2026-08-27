import { createHash, timingSafeEqual } from 'node:crypto';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { extractTrackWorkKeys } from '@affine/trackwork';

import {
  type DevelopmentEvent,
  type MergeRequestStatus,
  type RepositoryInfo,
  type ScmProvider,
  type ScmProviderType,
  type ConnectionTestResult,
} from '../types';

type GitLabProject = {
  id: number;
  path_with_namespace: string;
  name: string;
  web_url: string;
  default_branch?: string | null;
};

type GitLabCommit = {
  id: string;
  title: string;
  message: string;
  author_name: string;
  author_email?: string;
  timestamp?: string;
  url?: string;
};

type GitLabMergeRequest = {
  id: number;
  iid: number;
  title: string;
  description?: string | null;
  url?: string;
  state: string;
  action?: string;
  source_branch: string;
  target_branch: string;
  author?: { name?: string };
  created_at?: string;
  updated_at?: string;
  merged_at?: string | null;
  work_in_progress?: boolean;
};

type GitLabPushPayload = {
  object_kind?: string;
  ref?: string;
  project?: {
    id: number;
    path_with_namespace?: string;
    name?: string;
    web_url?: string;
  };
  commits?: GitLabCommit[];
};

type GitLabMergeRequestPayload = {
  object_kind?: string;
  project?: {
    id: number;
    path_with_namespace?: string;
    name?: string;
    web_url?: string;
  };
  object_attributes?: GitLabMergeRequest;
};

const mapMergeRequestStatus = (
  state: string,
  workInProgress?: boolean
): MergeRequestStatus => {
  if (workInProgress || state === 'draft') {
    return 'draft';
  }
  switch (state) {
    case 'opened':
      return 'open';
    case 'merged':
      return 'merged';
    case 'closed':
      return 'closed';
    default:
      return 'unknown';
  }
};

const mapMergeRequestEventType = (
  action: string | undefined,
  state: string
):
  | 'merge_request.opened'
  | 'merge_request.updated'
  | 'merge_request.merged' => {
  if (state === 'merged' || action === 'merge' || action === 'merge_request') {
    return 'merge_request.merged';
  }
  if (action === 'open' || action === 'reopen') {
    return 'merge_request.opened';
  }
  return 'merge_request.updated';
};

const isGitLabPushPayload = (body: unknown): body is GitLabPushPayload => {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const candidate = body as Record<string, unknown>;
  return candidate['object_kind'] === 'push';
};

const isGitLabMergeRequestPayload = (
  body: unknown
): body is GitLabMergeRequestPayload => {
  if (!body || typeof body !== 'object') {
    return false;
  }
  const candidate = body as Record<string, unknown>;
  return candidate['object_kind'] === 'merge_request';
};

@Injectable()
export class GitLabScmProvider implements ScmProvider {
  readonly type: ScmProviderType = 'gitlab';

  private readonly logger = new Logger(GitLabScmProvider.name);

  private async request(
    baseUrl: string,
    token: string,
    path: string,
    init?: RequestInit
  ) {
    const url = new URL(path, baseUrl);

    const response = await fetch(url, {
      ...init,
      headers: {
        'PRIVATE-TOKEN': token,
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      this.logger.warn(`GitLab API request failed (${response.status})`);
      throw new Error(`GitLab API error ${response.status}: ${message}`);
    }

    return response.json() as Promise<unknown>;
  }

  async testConnection(input: {
    baseUrl: string;
    token: string;
  }): Promise<ConnectionTestResult> {
    try {
      const user = (await this.request(
        input.baseUrl,
        input.token,
        '/api/v4/user'
      )) as { username?: string };

      return {
        ok: true,
        message: user.username ? `Connected as @${user.username}` : 'Connected',
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async listRepositories(input: {
    baseUrl: string;
    token: string;
  }): Promise<RepositoryInfo[]> {
    const projects = (await this.request(
      input.baseUrl,
      input.token,
      '/api/v4/projects?membership=true&simple=true&per_page=100'
    )) as GitLabProject[];

    if (!Array.isArray(projects)) {
      return [];
    }

    return projects
      .filter(project => project && typeof project.id === 'number')
      .map(project => ({
        externalId: String(project.id),
        name: project.name ?? project.path_with_namespace,
        fullName: project.path_with_namespace ?? project.name ?? '',
        webUrl: project.web_url ?? '',
        defaultBranch: project.default_branch ?? undefined,
      }));
  }

  async verifyWebhook(input: {
    headers: Record<string, unknown>;
    body: unknown;
    webhookSecret?: string;
  }): Promise<boolean> {
    if (!input.webhookSecret) {
      return false;
    }

    const token = input.headers['x-gitlab-token'];

    if (typeof token !== 'string' || token.length === 0) {
      return false;
    }

    const digest = (value: string) =>
      createHash('sha256').update(value).digest();

    return timingSafeEqual(digest(token), digest(input.webhookSecret));
  }

  async parseWebhook(input: { body: unknown }): Promise<DevelopmentEvent[]> {
    if (isGitLabPushPayload(input.body)) {
      return this.parsePushEvent(input.body);
    }

    if (isGitLabMergeRequestPayload(input.body)) {
      return this.parseMergeRequestEvent(input.body);
    }

    return [];
  }

  private parsePushEvent(payload: GitLabPushPayload): DevelopmentEvent[] {
    const project = payload.project;
    const ref = payload.ref ?? '';

    if (
      !project ||
      !Array.isArray(payload.commits) ||
      payload.commits.length === 0
    ) {
      return [];
    }

    const repository = {
      externalId: String(project.id),
      name: project.path_with_namespace ?? project.name ?? '',
      url: project.web_url ?? '',
    };

    const branchName = ref.startsWith('refs/heads/')
      ? ref.slice('refs/heads/'.length)
      : ref;

    const events: DevelopmentEvent[] = [];

    for (const commit of payload.commits) {
      const taskKeys = extractTrackWorkKeys(commit.message);

      if (taskKeys.length === 0) {
        continue;
      }

      events.push({
        type: 'commit.pushed',
        idempotencyKey: ['gitlab', project.id, 'commit', commit.id].join(':'),
        repository,
        commit: {
          sha: commit.id,
          shortSha: commit.id.slice(0, 7),
          message: commit.title ?? commit.message,
          authorName: commit.author_name ?? '',
          authorEmail: commit.author_email,
          committedAt: commit.timestamp
            ? new Date(commit.timestamp)
            : undefined,
          url: commit.url,
          branch: branchName,
        },
        taskKeys,
      });
    }

    const branchTaskKeys = extractTrackWorkKeys(branchName);

    if (branchTaskKeys.length > 0) {
      events.push({
        type: 'branch.updated',
        idempotencyKey: ['gitlab', project.id, 'branch', branchName].join(':'),
        repository,
        branch: {
          name: branchName,
        },
        taskKeys: branchTaskKeys,
      });
    }

    return events;
  }

  private parseMergeRequestEvent(
    payload: GitLabMergeRequestPayload
  ): DevelopmentEvent[] {
    const project = payload.project;
    const mr = payload.object_attributes;

    if (!project || !mr) {
      return [];
    }

    const taskKeys = extractTrackWorkKeys(
      [mr.title, mr.description ?? '', mr.source_branch].join('\n')
    );

    if (taskKeys.length === 0) {
      return [];
    }

    const status = mapMergeRequestStatus(mr.state, mr.work_in_progress);

    return [
      {
        type: mapMergeRequestEventType(mr.action, mr.state),
        idempotencyKey: [
          'gitlab',
          project.id,
          'mr',
          mr.iid,
          mr.updated_at,
          mr.action ?? mr.state,
        ].join(':'),
        repository: {
          externalId: String(project.id),
          name: project.path_with_namespace ?? project.name ?? '',
          url: project.web_url ?? '',
        },
        mergeRequest: {
          externalId: String(mr.id),
          iid: String(mr.iid),
          title: mr.title,
          url: mr.url ?? project.web_url ?? '',
          sourceBranch: mr.source_branch,
          targetBranch: mr.target_branch,
          status,
          authorName: mr.author?.name,
          createdAt: mr.created_at ? new Date(mr.created_at) : undefined,
          updatedAt: mr.updated_at ? new Date(mr.updated_at) : undefined,
          mergedAt: mr.merged_at ? new Date(mr.merged_at) : undefined,
        },
        taskKeys,
      },
    ];
  }
}

export const validateGitLabBaseUrl = (baseUrl: string): string => {
  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new BadRequestException('Invalid GitLab URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException('Unsupported GitLab URL protocol');
  }

  url.pathname = '/';
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
};
