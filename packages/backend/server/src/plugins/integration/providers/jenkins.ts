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
};

type JenkinsJob = {
  name: string;
  builds?: JenkinsBuild[];
};

type JenkinsResponse = {
  jobs?: JenkinsJob[];
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
      const message = await response.text().catch(() => '');
      throw new Error(`Jenkins API error ${response.status}: ${message}`);
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
      '/api/json?tree=jobs[name,color,builds[number,result,building,timestamp,duration,url,description]{0,20}]',
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

        pipelines.push({
          provider: 'jenkins',
          externalId: `${job.name}#${build.number}`,
          number: String(build.number),
          name: job.name,
          status,
          url: build.url,
          description: build.description ?? undefined,
          startedAt,
          finishedAt,
        });
      }
    }

    return pipelines;
  }
}
