import { Button } from '@affine/component';
import {
  SettingHeader,
  SettingWrapper,
} from '@affine/component/setting-components';
import { GraphQLService } from '@affine/core/modules/cloud';
import { GuardService } from '@affine/core/modules/permissions';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import {
  localizeTaskTrackerStageTitle,
  type TaskTrackerTranslationKey,
  useTaskTrackerI18n,
} from '@affine/core/utils/task-tracker-i18n';
import { DeleteIcon, PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  updateTrackWorkWorkflowConfig,
  useTrackWorkWorkflowConfig,
} from '../../../../pages/workspace/task-tracker/workflow-config';
import {
  AUTOMATION_EVENT_TYPES,
  buildDefaultTransitions,
  buildDefaultTypeTransitions,
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_TITLE,
  DEFAULT_FLOW,
  resolveTaskTrackerBoards,
  sanitizeAutomationRules,
  sanitizeTransitions,
  sanitizeTypeTransitions,
  TASK_STATUS_PROPERTY,
  TASK_TYPES,
  type TaskFlowColumn,
  type TaskTrackerAutomationAction,
  type TaskTrackerAutomationEventType,
  type TaskTrackerAutomationRule,
  type TaskTrackerBoard,
  type TaskTrackerPropertyAdditionalData,
  type TaskType,
} from '../../../../pages/workspace/task-tracker/config';
import * as styles from './styles.css';

const TASK_TYPE_OPTIONS: TaskType[] = ['story', 'bug', 'task', 'epic'];
const EMPTY_ADDITIONAL_DATA: TaskTrackerPropertyAdditionalData = {};

const createDefaultBoardFlow = (): TaskFlowColumn[] => {
  return DEFAULT_FLOW.map(column => ({ ...column }));
};

export const WorkspaceTaskTrackerSetting = () => {
  const { t } = useTaskTrackerI18n();
  const workspacePropertyService = useService(WorkspacePropertyService);
  const workspace = useService(WorkspaceService).workspace;
  const graphql = useService(GraphQLService);
  const guardService = useService(GuardService);
  const canManageWorkflow = useLiveData(
    guardService.can$('Workspace_TrackWork_Workflow_Manage')
  );
  const workflowConfig = useTrackWorkWorkflowConfig(workspace.id);
  const [workflowSaveError, setWorkflowSaveError] = useState<string | null>(
    null
  );
  const [workflowSavePending, setWorkflowSavePending] = useState(false);

  const statusPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_STATUS_PROPERTY)
  );

  const additionalData = useMemo(
    () =>
      (statusPropertyInfo?.additionalData as
        | TaskTrackerPropertyAdditionalData
        | undefined) ?? EMPTY_ADDITIONAL_DATA,
    [statusPropertyInfo?.additionalData]
  );

  // The server workflow config is authoritative while online; the local
  // additionalData copy is only a compatibility/offline mirror.
  const authoritativeAdditionalData = useMemo(() => {
    const serverConfig = workflowConfig.data?.config as
      | TaskTrackerPropertyAdditionalData
      | undefined;
    if (serverConfig?.taskTrackerBoards) {
      return serverConfig;
    }
    return additionalData;
  }, [workflowConfig.data, additionalData]);

  const boards = useMemo(
    () => resolveTaskTrackerBoards(authoritativeAdditionalData),
    [authoritativeAdditionalData]
  );

  const [selectedBoardId, setSelectedBoardId] = useState<string>(
    boards[0]?.id ?? ''
  );
  const [selectedTaskType, setSelectedTaskType] = useState<TaskType>('task');

  useEffect(() => {
    if (!boards.some(board => board.id === selectedBoardId)) {
      setSelectedBoardId(boards[0]?.id ?? '');
    }
  }, [boards, selectedBoardId]);

  const selectedBoard = useMemo(
    () => boards.find(board => board.id === selectedBoardId) ?? boards[0],
    [boards, selectedBoardId]
  );

  const flow = selectedBoard?.flow ?? DEFAULT_FLOW;
  const transitions = useMemo(() => {
    const typed =
      selectedBoard?.typeTransitions ?? buildDefaultTypeTransitions(flow);
    return typed[selectedTaskType] ?? sanitizeTransitions(flow, undefined);
  }, [flow, selectedBoard?.typeTransitions, selectedTaskType]);

  const localizedBoardTitle = useCallback(
    (board: TaskTrackerBoard) =>
      board.id === DEFAULT_BOARD_ID && board.title === DEFAULT_BOARD_TITLE
        ? t('defaultBoard')
        : board.title,
    [t]
  );

  const localizedStageTitle = useCallback(
    (stage: TaskFlowColumn) => {
      if (stage.id === 'todo' && stage.title === 'To Do') {
        return t('defaultTodo');
      }
      if (stage.id === 'in-progress' && stage.title === 'In Progress') {
        return t('defaultInProgress');
      }
      if (stage.id === 'done' && stage.title === 'Done') {
        return t('defaultDone');
      }
      return stage.title;
    },
    [t]
  );

  const saveWorkflowConfig = useCallback(
    (nextConfig: TaskTrackerPropertyAdditionalData) => {
      if (workflowSavePending) {
        return;
      }
      setWorkflowSaveError(null);
      setWorkflowSavePending(true);
      updateTrackWorkWorkflowConfig(graphql, {
        workspaceId: workspace.id,
        expectedRevision: workflowConfig.data?.revision ?? 0,
        config: nextConfig,
      })
        .then(result => {
          // The authoritative config is on the server; mirror the already
          // validated returned config into the legacy additionalData copy for
          // offline/compatibility rendering. Mirror failure never changes the
          // authoritative revision.
          const mirrorConfig =
            result.config as TaskTrackerPropertyAdditionalData;
          const firstBoard = result.config.taskTrackerBoards?.[0];
          workspacePropertyService.updatePropertyInfo(TASK_STATUS_PROPERTY, {
            additionalData: {
              ...additionalData,
              taskTrackerBoards: mirrorConfig.taskTrackerBoards,
              taskTrackerFlow: firstBoard?.flow,
              taskTrackerTransitions: firstBoard?.transitions,
              taskTrackerAutomationRules:
                mirrorConfig.taskTrackerAutomationRules,
            },
          });
        })
        .catch(error => {
          setWorkflowSaveError(
            error instanceof Error ? error.message : String(error)
          );
        })
        .finally(() => {
          setWorkflowSavePending(false);
        });
    },
    [
      additionalData,
      graphql,
      workflowConfig.data,
      workflowSavePending,
      workspace.id,
      workspacePropertyService,
    ]
  );

  const saveBoards = useCallback(
    (nextBoards: TaskTrackerBoard[]) => {
      if (!nextBoards.length) {
        return;
      }

      saveWorkflowConfig({
        taskTrackerBoards: nextBoards.map(board => ({
          id: board.id,
          title: board.title,
          flow: board.flow,
          transitions: board.transitions,
          typeTransitions: board.typeTransitions,
        })),
        taskTrackerAutomationRules:
          authoritativeAdditionalData.taskTrackerAutomationRules,
      });
    },
    [authoritativeAdditionalData, saveWorkflowConfig]
  );

  const updateBoard = useCallback(
    (
      boardId: string,
      updater: (board: TaskTrackerBoard) => TaskTrackerBoard
    ) => {
      const nextBoards = boards.map(board =>
        board.id === boardId ? updater(board) : board
      );
      saveBoards(nextBoards);
    },
    [boards, saveBoards]
  );

  const onAddBoard = useCallback(() => {
    const boardFlow = createDefaultBoardFlow();
    const board: TaskTrackerBoard = {
      id: nanoid(),
      title: t('boardNumber', { number: boards.length + 1 }),
      flow: boardFlow,
      transitions: buildDefaultTransitions(boardFlow),
      typeTransitions: buildDefaultTypeTransitions(boardFlow),
    };

    const nextBoards = [...boards, board];
    saveBoards(nextBoards);
    setSelectedBoardId(board.id);
  }, [boards, saveBoards, t]);

  const onRenameBoard = useCallback(
    (boardId: string, title: string) => {
      const board = boards.find(item => item.id === boardId);
      const nextTitle = title.trim();
      if (!board || !nextTitle) {
        return;
      }
      if (
        board.id === DEFAULT_BOARD_ID &&
        board.title === DEFAULT_BOARD_TITLE &&
        nextTitle === t('defaultBoard')
      ) {
        return;
      }
      updateBoard(boardId, current => ({ ...current, title: nextTitle }));
    },
    [boards, t, updateBoard]
  );

  const onDeleteBoard = useCallback(
    (boardId: string) => {
      if (boards.length <= 1) {
        return;
      }
      const nextBoards = boards.filter(board => board.id !== boardId);
      saveBoards(nextBoards);
      if (selectedBoardId === boardId) {
        setSelectedBoardId(nextBoards[0]?.id ?? '');
      }
    },
    [boards, saveBoards, selectedBoardId]
  );

  const onAddStage = useCallback(() => {
    if (!selectedBoard) {
      return;
    }

    updateBoard(selectedBoard.id, board => {
      const nextFlow = [...board.flow, { id: nanoid(), title: t('newStage') }];
      const nextTypeTransitions = sanitizeTypeTransitions(
        nextFlow,
        board.typeTransitions
      );
      return {
        ...board,
        flow: nextFlow,
        transitions: nextTypeTransitions.task,
        typeTransitions: nextTypeTransitions,
      };
    });
  }, [selectedBoard, t, updateBoard]);

  const onRenameStage = useCallback(
    (stageId: string, title: string) => {
      if (!selectedBoard) {
        return;
      }

      updateBoard(selectedBoard.id, board => {
        const nextFlow = board.flow.map(stage =>
          stage.id === stageId ? { ...stage, title } : stage
        );
        const nextTypeTransitions = sanitizeTypeTransitions(
          nextFlow,
          board.typeTransitions
        );
        return {
          ...board,
          flow: nextFlow,
          transitions: nextTypeTransitions.task,
          typeTransitions: nextTypeTransitions,
        };
      });
    },
    [selectedBoard, updateBoard]
  );

  const onDeleteStage = useCallback(
    (stageId: string) => {
      if (!selectedBoard || flow.length <= 1) {
        return;
      }

      updateBoard(selectedBoard.id, board => {
        const nextFlow = board.flow.filter(stage => stage.id !== stageId);
        const nextTransitions = Object.fromEntries(
          Object.entries(board.transitions)
            .filter(([from]) => from !== stageId)
            .map(([from, targets]) => [
              from,
              targets.filter(target => target !== stageId),
            ])
        );
        const nextTypeTransitions = Object.fromEntries(
          TASK_TYPES.map(type => {
            const typeMap = board.typeTransitions[type] ?? {};
            const cleaned = Object.fromEntries(
              Object.entries(typeMap)
                .filter(([from]) => from !== stageId)
                .map(([from, targets]) => [
                  from,
                  targets.filter(target => target !== stageId),
                ])
            );
            return [type, cleaned];
          })
        ) as typeof board.typeTransitions;

        return {
          ...board,
          flow: nextFlow,
          transitions: sanitizeTransitions(nextFlow, nextTransitions),
          typeTransitions: sanitizeTypeTransitions(
            nextFlow,
            nextTypeTransitions
          ),
        };
      });
    },
    [flow.length, selectedBoard, updateBoard]
  );

  const onToggleTransition = useCallback(
    (fromId: string, toId: string, enabled: boolean) => {
      if (!selectedBoard) {
        return;
      }

      updateBoard(selectedBoard.id, board => {
        const typeMap = board.typeTransitions[selectedTaskType] ?? {};
        const current = typeMap[fromId] ?? [];
        const nextTargets = enabled
          ? Array.from(new Set([...current, toId]))
          : current.filter(target => target !== toId);
        const nextTypeTransitions = sanitizeTypeTransitions(board.flow, {
          ...board.typeTransitions,
          [selectedTaskType]: {
            ...typeMap,
            [fromId]: nextTargets,
          },
        });

        return {
          ...board,
          typeTransitions: nextTypeTransitions,
          transitions: nextTypeTransitions.task,
        };
      });
    },
    [selectedBoard, selectedTaskType, updateBoard]
  );

  const automationRules = sanitizeAutomationRules(
    authoritativeAdditionalData?.taskTrackerAutomationRules
  );

  const saveRules = useCallback(
    (rules: TaskTrackerAutomationRule[]) => {
      saveWorkflowConfig({
        taskTrackerBoards: boards,
        taskTrackerAutomationRules: rules,
      });
    },
    [boards, saveWorkflowConfig]
  );

  const onAddRule = useCallback(() => {
    saveRules([
      ...automationRules,
      {
        id: nanoid(),
        eventType: 'merge_request.merged',
        action: 'set-status',
        stageId: flow[0]?.id,
        enabled: true,
      },
    ]);
  }, [automationRules, flow, saveRules]);

  const onDeleteRule = useCallback(
    (ruleId: string) => {
      saveRules(automationRules.filter(rule => rule.id !== ruleId));
    },
    [automationRules, saveRules]
  );

  const onToggleRule = useCallback(
    (ruleId: string, enabled: boolean) => {
      saveRules(
        automationRules.map(rule =>
          rule.id === ruleId ? { ...rule, enabled } : rule
        )
      );
    },
    [automationRules, saveRules]
  );

  const onUpdateRule = useCallback(
    (ruleId: string, patch: Partial<TaskTrackerAutomationRule>) => {
      saveRules(
        automationRules.map(rule =>
          rule.id === ruleId ? { ...rule, ...patch } : rule
        )
      );
    },
    [automationRules, saveRules]
  );

  const hasProperty = !!statusPropertyInfo;

  if (canManageWorkflow !== true) {
    return (
      <>
        <SettingHeader title={t('flowTitle')} subtitle={t('flowSubtitle')} />
        <SettingWrapper title={t('boards')}>
          <span className={styles.helperText}>
            {canManageWorkflow === false
              ? t('noWorkflowManagePermission')
              : t('workflowSettingsLoading')}
          </span>
        </SettingWrapper>
      </>
    );
  }

  return (
    <>
      <SettingHeader title={t('flowTitle')} subtitle={t('flowSubtitle')} />

      {workflowSaveError ? (
        <div className={styles.workflowSaveError}>
          <span>{workflowSaveError}</span>
          <Button
            variant="primary"
            onClick={() => {
              workflowConfig.mutate();
              setWorkflowSaveError(null);
            }}
          >
            Refetch
          </Button>
        </div>
      ) : null}

      <SettingWrapper title={t('boards')}>
        <div className={styles.boardControls}>
          <select
            className={styles.input}
            value={selectedBoard?.id ?? ''}
            onChange={event => {
              setSelectedBoardId(event.target.value);
            }}
            disabled={!hasProperty}
          >
            {boards.map(board => (
              <option key={board.id} value={board.id}>
                {localizedBoardTitle(board)}
              </option>
            ))}
          </select>

          {selectedBoard ? (
            <input
              className={styles.input}
              key={`${selectedBoard.id}:${t('defaultBoard')}`}
              defaultValue={localizedBoardTitle(selectedBoard)}
              onBlur={event => {
                onRenameBoard(selectedBoard.id, event.target.value);
              }}
              disabled={!hasProperty || workflowSavePending}
            />
          ) : null}

          <Button
            variant="plain"
            onClick={onAddBoard}
            disabled={!hasProperty || workflowSavePending}
          >
            <PlusIcon />
            {t('newBoard')}
          </Button>
          <Button
            variant="plain"
            disabled={
              !hasProperty ||
              boards.length <= 1 ||
              !selectedBoard ||
              workflowSavePending
            }
            onClick={() => {
              if (selectedBoard) {
                onDeleteBoard(selectedBoard.id);
              }
            }}
          >
            <DeleteIcon />
            {t('deleteBoard')}
          </Button>
        </div>
      </SettingWrapper>

      <SettingWrapper title={t('stages')}>
        <div className={styles.stagesList}>
          {flow.map(stage => (
            <div key={stage.id} className={styles.stageRow}>
              <input
                className={styles.input}
                value={localizedStageTitle(stage)}
                onChange={event => {
                  onRenameStage(stage.id, event.target.value);
                }}
                onBlur={event => {
                  const title = event.target.value.trim() || t('untitledStage');
                  const displayed = localizedStageTitle(stage);
                  if (title !== displayed || title === stage.title) {
                    onRenameStage(stage.id, title);
                  }
                }}
                disabled={!hasProperty}
              />

              <Button
                variant="plain"
                className={styles.deleteButton}
                disabled={!hasProperty || flow.length <= 1}
                onClick={() => {
                  onDeleteStage(stage.id);
                }}
              >
                <DeleteIcon />
              </Button>
            </div>
          ))}
        </div>

        <Button variant="primary" onClick={onAddStage} disabled={!hasProperty}>
          <PlusIcon />
          {t('addStage')}
        </Button>
      </SettingWrapper>

      <SettingWrapper title={t('allowedTransitions')}>
        <div className={styles.transitionHint}>{t('transitionHint')}</div>
        <div className={styles.transitionTypeRow}>
          <label className={styles.transitionTypeLabel}>{t('taskType')}</label>
          <select
            className={styles.input}
            value={selectedTaskType}
            onChange={event => {
              setSelectedTaskType(event.target.value as TaskType);
            }}
            disabled={!hasProperty}
          >
            {TASK_TYPE_OPTIONS.map(type => (
              <option key={type} value={type}>
                {t(type)}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.transitionTableScroller}>
          <table className={styles.transitionTable}>
            <thead>
              <tr>
                <th className={styles.tableHeaderSticky}>{t('fromTo')}</th>
                {flow.map(to => (
                  <th key={`head:${to.id}`} className={styles.tableHeader}>
                    {localizedStageTitle(to)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flow.map(from => (
                <tr key={`row:${from.id}`}>
                  <th className={styles.tableHeaderSticky}>
                    {localizedStageTitle(from)}
                  </th>
                  {flow.map(to => {
                    const checked =
                      from.id === to.id ||
                      (transitions[from.id] ?? []).includes(to.id);

                    return (
                      <td
                        key={`cell:${from.id}:${to.id}`}
                        className={styles.tableCell}
                      >
                        <button
                          type="button"
                          className={styles.transitionButton}
                          data-active={checked ? 'true' : 'false'}
                          disabled={from.id === to.id || !hasProperty}
                          onClick={() => {
                            onToggleTransition(from.id, to.id, !checked);
                          }}
                        >
                          {checked ? t('allowed') : t('blocked')}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SettingWrapper>

      <SettingWrapper title={t('automationTitle')}>
        <div className={styles.stagesList}>
          {automationRules.map(rule => (
            <div key={rule.id} className={styles.stageRow}>
              <select
                className={styles.input}
                value={rule.eventType}
                disabled={!hasProperty}
                onChange={event => {
                  onUpdateRule(rule.id, {
                    eventType: event.target
                      .value as TaskTrackerAutomationEventType,
                  });
                }}
              >
                {AUTOMATION_EVENT_TYPES.map(eventType => (
                  <option key={eventType} value={eventType}>
                    {t(
                      `event${eventType
                        .split('.')
                        .map(
                          part => part.charAt(0).toUpperCase() + part.slice(1)
                        )
                        .join('')}` as TaskTrackerTranslationKey
                    )}
                  </option>
                ))}
              </select>

              <select
                className={styles.input}
                value={rule.action}
                disabled={!hasProperty}
                onChange={event => {
                  const action = event.target
                    .value as TaskTrackerAutomationAction;
                  onUpdateRule(rule.id, {
                    action,
                    stageId:
                      action === 'set-status'
                        ? (rule.stageId ?? flow[0]?.id)
                        : undefined,
                  });
                }}
              >
                <option value="set-status">{t('actionSetStatus')}</option>
                <option value="warning">{t('actionWarning')}</option>
              </select>

              {rule.action === 'set-status' ? (
                <select
                  className={styles.input}
                  value={rule.stageId ?? ''}
                  disabled={!hasProperty}
                  onChange={event => {
                    onUpdateRule(rule.id, { stageId: event.target.value });
                  }}
                >
                  {flow.map(stage => (
                    <option key={stage.id} value={stage.id}>
                      {localizeTaskTrackerStageTitle(stage, t)}
                    </option>
                  ))}
                </select>
              ) : null}

              <input
                type="checkbox"
                checked={rule.enabled}
                disabled={!hasProperty}
                onChange={event => {
                  onToggleRule(rule.id, event.target.checked);
                }}
                title={t('automationEnabled')}
              />

              <Button
                variant="plain"
                className={styles.deleteButton}
                disabled={!hasProperty}
                onClick={() => {
                  onDeleteRule(rule.id);
                }}
              >
                <DeleteIcon />
              </Button>
            </div>
          ))}
        </div>

        {automationRules.length === 0 ? (
          <div className={styles.helperText}>{t('automationEmpty')}</div>
        ) : null}

        <Button variant="primary" onClick={onAddRule} disabled={!hasProperty}>
          <PlusIcon />
          {t('automationAdd')}
        </Button>
      </SettingWrapper>

      {!hasProperty ? (
        <div className={styles.helperText}>{t('initializeHint')}</div>
      ) : null}
    </>
  );
};
