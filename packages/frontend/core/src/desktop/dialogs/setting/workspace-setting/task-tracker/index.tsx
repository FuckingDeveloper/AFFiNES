import { Button } from '@affine/component';
import {
  SettingHeader,
  SettingWrapper,
} from '@affine/component/setting-components';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { DeleteIcon, PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  buildDefaultTransitions,
  buildDefaultTypeTransitions,
  DEFAULT_FLOW,
  resolveTaskTrackerBoards,
  sanitizeTransitions,
  sanitizeTypeTransitions,
  TASK_STATUS_PROPERTY,
  TASK_TYPES,
  type TaskFlowColumn,
  type TaskTrackerBoard,
  type TaskTrackerPropertyAdditionalData,
  type TaskType,
} from '../../../../pages/workspace/task-tracker/config';
import * as styles from './styles.css';

const TASK_TYPE_OPTIONS: Array<{ value: TaskType; label: string }> = [
  { value: 'story', label: 'Story' },
  { value: 'bug', label: 'Bug' },
  { value: 'task', label: 'Task' },
  { value: 'epic', label: 'Epic' },
];

const EMPTY_ADDITIONAL_DATA: TaskTrackerPropertyAdditionalData = {};

const createDefaultBoardFlow = (): TaskFlowColumn[] => {
  return DEFAULT_FLOW.map(column => ({
    id: nanoid(),
    title: column.title,
  }));
};

export const WorkspaceTaskTrackerSetting = () => {
  const workspacePropertyService = useService(WorkspacePropertyService);

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

  const boards = useMemo(
    () => resolveTaskTrackerBoards(additionalData),
    [additionalData]
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

  const saveBoards = useCallback(
    (nextBoards: TaskTrackerBoard[]) => {
      if (!nextBoards.length) {
        return;
      }

      const firstBoard = nextBoards[0];
      workspacePropertyService.updatePropertyInfo(TASK_STATUS_PROPERTY, {
        additionalData: {
          ...additionalData,
          taskTrackerBoards: nextBoards.map(board => ({
            id: board.id,
            title: board.title,
            flow: board.flow,
            transitions: board.transitions,
            typeTransitions: board.typeTransitions,
          })),
          taskTrackerFlow: firstBoard.flow,
          taskTrackerTransitions: firstBoard.transitions,
        },
      });
    },
    [additionalData, workspacePropertyService]
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
      title: `Board ${boards.length + 1}`,
      flow: boardFlow,
      transitions: buildDefaultTransitions(boardFlow),
      typeTransitions: buildDefaultTypeTransitions(boardFlow),
    };

    const nextBoards = [...boards, board];
    saveBoards(nextBoards);
    setSelectedBoardId(board.id);
  }, [boards, saveBoards]);

  const onRenameBoard = useCallback(
    (boardId: string, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) {
        return;
      }
      updateBoard(boardId, board => ({ ...board, title: nextTitle }));
    },
    [updateBoard]
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
      const nextFlow = [...board.flow, { id: nanoid(), title: 'New stage' }];
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
  }, [selectedBoard, updateBoard]);

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

  const hasProperty = !!statusPropertyInfo;

  return (
    <>
      <SettingHeader
        title="Task Tracker Flow"
        subtitle="Configure boards, statuses, and allowed drag transitions."
      />

      <SettingWrapper title="Boards">
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
                {board.title}
              </option>
            ))}
          </select>

          {selectedBoard ? (
            <input
              className={styles.input}
              key={selectedBoard.id}
              defaultValue={selectedBoard.title}
              onBlur={event => {
                onRenameBoard(selectedBoard.id, event.target.value);
              }}
              disabled={!hasProperty}
            />
          ) : null}

          <Button variant="plain" onClick={onAddBoard} disabled={!hasProperty}>
            <PlusIcon />
            New board
          </Button>
          <Button
            variant="plain"
            disabled={!hasProperty || boards.length <= 1 || !selectedBoard}
            onClick={() => {
              if (selectedBoard) {
                onDeleteBoard(selectedBoard.id);
              }
            }}
          >
            <DeleteIcon />
            Delete board
          </Button>
        </div>
      </SettingWrapper>

      <SettingWrapper title="Stages">
        <div className={styles.stagesList}>
          {flow.map(stage => (
            <div key={stage.id} className={styles.stageRow}>
              <input
                className={styles.input}
                value={stage.title}
                onChange={event => {
                  onRenameStage(stage.id, event.target.value);
                }}
                onBlur={event => {
                  const title = event.target.value.trim() || 'Untitled stage';
                  onRenameStage(stage.id, title);
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
          Add stage
        </Button>
      </SettingWrapper>

      <SettingWrapper title="Allowed transitions">
        <div className={styles.transitionHint}>
          Enable where tasks can be dragged from one stage to another.
        </div>
        <div className={styles.transitionTypeRow}>
          <label className={styles.transitionTypeLabel}>Task type</label>
          <select
            className={styles.input}
            value={selectedTaskType}
            onChange={event => {
              setSelectedTaskType(event.target.value as TaskType);
            }}
            disabled={!hasProperty}
          >
            {TASK_TYPE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.transitionTableScroller}>
          <table className={styles.transitionTable}>
            <thead>
              <tr>
                <th className={styles.tableHeaderSticky}>From \\ To</th>
                {flow.map(to => (
                  <th key={`head:${to.id}`} className={styles.tableHeader}>
                    {to.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {flow.map(from => (
                <tr key={`row:${from.id}`}>
                  <th className={styles.tableHeaderSticky}>{from.title}</th>
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
                          {checked ? 'Allowed' : 'Blocked'}
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

      {!hasProperty ? (
        <div className={styles.helperText}>
          Open Task Tracker board once to initialize workflow properties.
        </div>
      ) : null}
    </>
  );
};
