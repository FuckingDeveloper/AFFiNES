import { useService } from '@toeverything/infra';
import useSWR from 'swr';

import { GraphQLService } from '@affine/core/modules/cloud';

export const TRACK_WORK_WORKFLOW_CONFIG_QUERY = `
  query TrackWorkWorkflowConfig($workspaceId: String!) {
    trackWorkWorkflowConfig(workspaceId: $workspaceId) {
      revision
      config
    }
  }
`;

export const UPDATE_TRACK_WORK_WORKFLOW_CONFIG_MUTATION = `
  mutation UpdateTrackWorkWorkflowConfig($input: UpdateTrackWorkWorkflowConfigInput!) {
    updateTrackWorkWorkflowConfig(input: $input) {
      revision
      config
    }
  }
`;

export type TrackWorkWorkflowConfigData = {
  revision: number;
  config: {
    taskTrackerBoards?: Array<{
      id: string;
      title: string;
      flow?: Array<{ id: string; title: string }>;
      transitions?: Record<string, string[]>;
      typeTransitions?: Record<string, Record<string, string[]>>;
    }>;
    taskTrackerAutomationRules?: Array<{
      id: string;
      eventType: string;
      action: string;
      stageId?: string;
      enabled: boolean;
    }>;
  };
};

export function useTrackWorkWorkflowConfig(workspaceId: string | undefined) {
  const graphql = useService(GraphQLService);
  const result = useSWR(
    workspaceId ? ['trackWorkWorkflowConfig', workspaceId] : null,
    async () => {
      const res = (await graphql.gql({
        query: TRACK_WORK_WORKFLOW_CONFIG_QUERY as never,
        variables: { workspaceId },
      } as never)) as unknown as {
        trackWorkWorkflowConfig: TrackWorkWorkflowConfigData;
      };
      return res.trackWorkWorkflowConfig;
    }
  );
  return {
    data: result.data,
    isLoading: result.isLoading,
    error: result.error,
    mutate: result.mutate,
  };
}

export async function updateTrackWorkWorkflowConfig(
  graphql: GraphQLService,
  input: {
    workspaceId: string;
    expectedRevision: number;
    config: unknown;
  }
): Promise<TrackWorkWorkflowConfigData> {
  const res = (await graphql.gql({
    query: UPDATE_TRACK_WORK_WORKFLOW_CONFIG_MUTATION as never,
    variables: { input },
  } as never)) as unknown as {
    updateTrackWorkWorkflowConfig: TrackWorkWorkflowConfigData;
  };
  return res.updateTrackWorkWorkflowConfig;
}
