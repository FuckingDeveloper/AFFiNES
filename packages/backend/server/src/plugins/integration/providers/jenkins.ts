import { BadRequestException, Injectable } from '@nestjs/common';

import type {
  CiProvider,
  ConnectionTestResult,
  PipelineInfo,
  PipelineStatus,
} from '../types';

type JenkinsBuild = {
  number: number;
  result?: string | null;
  building?: boolean;
  timestamp?: number;
  duration?: number;
  url?: string;
  description?: string | null;
  actions?: Array<{
    parameters?: Array<{ name?: string; value?: unknown }>;
    lastBuiltRevision?: {
      SHA1?: string;
      branch?: Array<{ name?: string }>;
    };
  }>;
  changeSet?: { items?: Array<{ comment?: string; id?: string }> };
};

type JenkinsJob = {
  name: string;
  builds?: JenkinsBuild[];
};

type JenkinsResponse = {
  jobs?: JenkinsJob[];
};

const stringParameter = (build: JenkinsBuild, names: string[]) => {
  for (const action of build.actions ?? []) {
    for (const parameter of action.parameters ?? []) {
      if (
        parameter.name &&
        names.includes(parameter.name) &&
        typeof parameter.value === 'string'
      ) {
        return parameter.value;
      }
    }
  }
  return undefined;
};

const revisionMetadata = (build: JenkinsBuild) => {
  for (const action of build.actions ?? []) {
    if (action.lastBuiltRevision) {
      return action.lastBuiltRevision;
    }
  }
  return undefined;
};

const mapJenkinsStatus = (
  building: boolean | undefined,
  result: string | null | undefined
): PipelineStatus => {
  if (building) {
    return 'running';
  }

  switch (result) {
    case 'SUCCESS':
      return 'success';
    case 'FAILURE':
      return 'failed';
    case 'UNSTABLE':
      return 'unstable';
    case 'ABORTED':
      return 'canceled';
    case 'NOT_BUILT':
      return 'skipped';
    default:
      return 'unknown';
  }
};

export const validateJenkinsBaseUrl = (baseUrl: string): string => {
  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new BadRequestException('Invalid Jenkins URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new BadRequestException('Unsupported Jenkins URL protocol');
  }

  url.pathname = '/';
  url.search = '';
  url.hash = '';

  return url.toString().replace(/\/$/, '');
};

@Injectable()
export class JenkinsCiProvider implements CiProvider {
  readonly type = 'jenkins';

  private async request(
    baseUrl: string,
    path: string,
    username: string | undefined,
    token: string
  ) {
    const url = new URL(path, baseUrl);
    const credentials = Buffer.from(`${username ?? ''}:${token}`).toString(
      'base64'
    );

    const response = await fetch(url, {
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Jenkins API request failed (${response.status})`);
    }

    return response.json() as Promise<unknown>;
  }

  async testConnection(input: {
    baseUrl: string;
    username?: string;
    token: string;
  }): Promise<ConnectionTestResult> {
    try {
      const result = (await this.request(
        input.baseUrl,
        '/api/json?tree=nodeName',
        input.username,
        input.token
      )) as { nodeName?: string };

      return {
        ok: true,
        message: result.nodeName
          ? `Connected to ${result.nodeName}`
          : 'Connected',
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  async listPipelines(input: {
    baseUrl: string;
    username?: string;
    token: string;
    limit?: number;
  }): Promise<PipelineInfo[]> {
    const limit = input.limit ?? 200;

    const result = (await this.request(
      input.baseUrl,
      '/api/json?tree=jobs[name,color,builds[number,result,building,timestamp,duration,url,description,actions[parameters[name,value],lastBuiltRevision[SHA1,branch[name]]],changeSet[items[comment,id]]]{0,20}]',
      input.username,
      input.token
    )) as JenkinsResponse;

    if (!Array.isArray(result.jobs)) {
      return [];
    }

    const pipelines: PipelineInfo[] = [];

    for (const job of result.jobs ?? []) {
      if (pipelines.length >= limit) {
        break;
      }

      for (const build of job.builds ?? []) {
        if (pipelines.length >= limit) {
          break;
        }

        const status = mapJenkinsStatus(build.building, build.result);
        const startedAt = build.timestamp
          ? new Date(build.timestamp)
          : undefined;
        const finishedAt =
          build.building || !build.timestamp || !build.duration
            ? undefined
            : new Date(build.timestamp + build.duration);
        const revision = revisionMetadata(build);
        const branch =
          stringParameter(build, ['GIT_BRANCH', 'BRANCH_NAME']) ??
          revision?.branch?.[0]?.name;
        const commitSha =
          stringParameter(build, ['GIT_COMMIT']) ?? revision?.SHA1;
        const taskReference = stringParameter(build, [
          'TRACKWORK_TASK',
          'TRACKWORK_TASK_KEY',
        ]);
        const changeMessages = (build.changeSet?.items ?? [])
          .map(item => item.comment)
          .filter((value): value is string => !!value);
        const description = [
          build.description,
          taskReference,
          branch,
          ...changeMessages,
        ]
          .filter((value): value is string => !!value)
          .join('\n');

        pipelines.push({
          provider: 'jenkins',
          externalId: `${job.name}#${build.number}`,
          number: String(build.number),
          name: job.name,
          status,
          url: build.url,
          description: description || undefined,
          branch,
          commitSha,
          startedAt,
          finishedAt,
        });
      }
    }

    return pipelines;
  }
}
