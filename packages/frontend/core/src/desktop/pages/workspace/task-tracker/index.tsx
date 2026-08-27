import { Button, notify, useDraggable, useDropTarget } from '@affine/component';
import { useQuery } from '@affine/core/components/hooks/use-query';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import { TagService } from '@affine/core/modules/tag';
import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
  WorkbenchService,
} from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import {
  localizeTaskTrackerBoardTitle,
  localizeTaskTrackerHistory,
  localizeTaskTrackerStageTitle,
  type TaskTrackerTranslationKey,
  type TaskTrackerTranslator,
  useTaskTrackerI18n,
} from '@affine/core/utils/task-tracker-i18n';
import {
  trackWorkActivityQuery,
  trackWorkTaskDevelopmentQuery,
} from '@affine/graphql';
import {
  formatTaskKey,
  nextTaskNumber,
  parseTaskNumber,
} from '@affine/trackwork';
import { DeleteIcon, LinkIcon, PlusIcon } from '@blocksuite/icons/rc';
import { LiveData, useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { nanoid } from 'nanoid';
import {
  type ChangeEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { applyAutomationRules } from './automation';
import {
  buildDefaultTransitions,
  buildDefaultTypeTransitions,
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_TITLE,
  DEFAULT_FLOW,
  parseAttachments,
  parseHistoryEntries,
  parseSubtasks,
  resolveTaskTrackerBoards,
  sanitizeAutomationRules,
  stringifyAttachments,
  stringifyHistoryEntries,
  stringifySubtasks,
  TASK_ASSIGNEE_PROPERTY,
  TASK_ATTACHMENTS_PROPERTY,
  TASK_AUTOMATION_APPLIED_PROPERTY,
  TASK_BOARD_PROPERTY,
  TASK_COMPLEXITY_PROPERTY,
  TASK_DESCRIPTION_PROPERTY,
  TASK_DUE_DATE_PROPERTY,
  TASK_EXTRA_INFO_PROPERTY,
  TASK_HISTORY_PROPERTY,
  TASK_NUMBER_PROPERTY,
  TASK_ORDER_PROPERTY,
  TASK_PRIORITY_PROPERTY,
  TASK_STATUS_PROPERTY,
  TASK_SUBTASKS_PROPERTY,
  TASK_TRACKER_FLAG_PROPERTY,
  TASK_TYPE_PROPERTY,
  type TaskAttachment,
  type TaskComplexity,
  type TaskFlowColumn,
  type TaskHistoryEntry,
  type TaskSubtask,
  type TaskTrackerBoard,
  type TaskTrackerPropertyAdditionalData,
  type TaskType,
} from './config';
import * as styles from './task-tracker.css';

type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type DueFilter = 'all' | 'overdue' | 'today' | 'next-7-days' | 'no-date';

type TaskCard = {
  id: string;
  number: string;
  title: string;
  boardId: string;
  status: string;
  type: TaskType;
  assignee: string;
  priority: TaskPriority;
  dueDate: string;
  order: number;
  labelIds: string[];
  description: string;
  extraInfo: string;
  attachments: TaskAttachment[];
  complexity: TaskComplexity;
  subtasks: TaskSubtask[];
  history: TaskHistoryEntry[];
};

type DocTitleItem = {
  id: string;
  title: string;
};

type DocTagItem = {
  id: string;
  tags: string[];
};

type TagMetaItem = {
  id: string;
  name: string;
};

const EMPTY_DOC_TITLES: DocTitleItem[] = [];
const EMPTY_DOC_IDS: string[] = [];
const EMPTY_DOC_TAG_IDS: DocTagItem[] = [];
const EMPTY_TAG_METAS: TagMetaItem[] = [];

type TaskTrackerDndData = {
  draggable: {
    type: 'task';
    taskId: string;
    fromColumnId: string;
    taskType: TaskType;
  };
  dropTarget: {
    columnId: string;
    index: number;
  };
};

type ActiveDragTask = {
  taskId: string;
  fromColumnId: string;
  taskType: TaskType;
};

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

const TASK_TYPE_OPTIONS: Array<{ value: TaskType; label: string }> = [
  { value: 'story', label: 'Story' },
  { value: 'bug', label: 'Bug' },
  { value: 'task', label: 'Task' },
  { value: 'epic', label: 'Epic' },
];

const COMPLEXITY_OPTIONS: Array<{
  value: TaskComplexity;
  label: string;
  short: string;
}> = [
  { value: 'trivial', label: 'Trivial', short: 'T0' },
  { value: 'easy', label: 'Easy', short: 'T1' },
  { value: 'medium', label: 'Medium', short: 'T2' },
  { value: 'hard', label: 'Hard', short: 'T3' },
  { value: 'extreme', label: 'Extreme', short: 'T4' },
];

const PRIORITY_WEIGHT: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const sanitizePriority = (value: string | undefined): TaskPriority => {
  switch (value) {
    case 'urgent':
    case 'high':
    case 'medium':
    case 'low':
      return value;
    default:
      return 'medium';
  }
};

const sanitizeTaskType = (value: string | undefined): TaskType => {
  switch (value) {
    case 'story':
    case 'bug':
    case 'task':
    case 'epic':
      return value;
    default:
      return 'task';
  }
};

const sanitizeComplexity = (value: string | undefined): TaskComplexity => {
  switch (value) {
    case 'trivial':
    case 'easy':
    case 'medium':
    case 'hard':
    case 'extreme':
      return value;
    default:
      return 'medium';
  }
};

const sanitizeDate = (value: string | undefined): string => {
  if (!value) {
    return '';
  }

  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
};

const parseOrder = (value: string | undefined): number => {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
};

const toIsoDate = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

const formatDueDateLabel = (
  date: string,
  locale: string,
  emptyLabel: string
): string => {
  if (!date) {
    return emptyLabel;
  }

  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(new Date(`${date}T00:00:00Z`));
  } catch {
    return date;
  }
};

const formatHistoryTime = (timestamp: number, locale: string): string => {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(timestamp);
  } catch {
    return '';
  }
};

const buildHistoryEntry = (
  type: TaskHistoryEntry['type'],
  message: string
): TaskHistoryEntry => ({
  id: nanoid(),
  type,
  message,
  createdAt: Date.now(),
});

const complexityMeta = (complexity: TaskComplexity) => {
  return (
    COMPLEXITY_OPTIONS.find(option => option.value === complexity) ??
    COMPLEXITY_OPTIONS[2]
  );
};

const parseSubtasksInput = (value: string): TaskSubtask[] => {
  return Array.from(
    new Set(
      value
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
    )
  ).map(title => ({
    id: nanoid(),
    title,
    done: false,
  }));
};

const toBlobPart = (data: Uint8Array): ArrayBuffer => {
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength
  ) as ArrayBuffer;
};

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) {
    return 'U';
  }
  return parts.map(part => part[0]?.toUpperCase() ?? '').join('');
};

const getStatusTone = (
  column: TaskFlowColumn
): 'todo' | 'inprogress' | 'done' | 'other' => {
  const key = `${column.id} ${column.title}`.toLowerCase();
  if (
    key.includes('done') ||
    key.includes('finish') ||
    key.includes('closed')
  ) {
    return 'done';
  }
  if (
    key.includes('progress') ||
    key.includes('review') ||
    key.includes('dev') ||
    key.includes('test')
  ) {
    return 'inprogress';
  }
  if (
    key.includes('todo') ||
    key.includes('to do') ||
    key.includes('backlog')
  ) {
    return 'todo';
  }
  return 'other';
};

const getPriorityTone = (
  priority: TaskPriority
): 'low' | 'medium' | 'high' | 'urgent' => priority;

const createDefaultBoardFlow = (): TaskFlowColumn[] => {
  return DEFAULT_FLOW.map(column => ({ ...column }));
};

const AssigneeAvatar = ({
  assignee,
  size = 'sm',
}: {
  assignee: string;
  size?: 'xs' | 'sm';
}) => {
  const { t } = useTaskTrackerI18n();
  const fallback = t('unassigned');
  return (
    <span
      className={clsx(styles.assigneeAvatar, {
        [styles.assigneeAvatarXs]: size === 'xs',
      })}
      title={assignee || fallback}
    >
      {getInitials(assignee || fallback)}
    </span>
  );
};

const AttachmentPreviewStrip = ({
  attachments,
  workspace,
  max = 3,
  onOpenAttachment,
  large = false,
}: {
  attachments: TaskAttachment[];
  workspace: WorkspaceService['workspace'] | null;
  max?: number;
  onOpenAttachment: (attachment: TaskAttachment) => void;
  large?: boolean;
}) => {
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      urlsRef.current.forEach(url => URL.revokeObjectURL(url));
      urlsRef.current = [];

      if (!workspace) {
        setPreviewUrls({});
        return;
      }

      const candidates = attachments
        .filter(attachment => (attachment.mime ?? '').startsWith('image/'))
        .slice(0, max);

      const next: Record<string, string> = {};
      for (const attachment of candidates) {
        const record = await workspace.engine.blob.get(attachment.id);
        if (cancelled || !record) {
          continue;
        }

        const blob = new Blob([toBlobPart(record.data)], {
          type: attachment.mime || record.mime || 'application/octet-stream',
        });
        const url = URL.createObjectURL(blob);
        urlsRef.current.push(url);
        next[attachment.id] = url;
      }

      if (!cancelled) {
        setPreviewUrls(next);
      }
    };

    load().catch(() => {
      if (!cancelled) {
        setPreviewUrls({});
      }
    });

    return () => {
      cancelled = true;
      urlsRef.current.forEach(url => URL.revokeObjectURL(url));
      urlsRef.current = [];
    };
  }, [attachments, max, workspace]);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className={styles.attachmentPreviewStrip}>
      {attachments.slice(0, max).map(attachment => {
        const previewUrl = previewUrls[attachment.id];
        return (
          <button
            key={attachment.id}
            type="button"
            className={clsx(styles.attachmentPreviewItem, {
              [styles.attachmentPreviewLarge]: large,
            })}
            onClick={() => {
              onOpenAttachment(attachment);
            }}
            title={attachment.name}
          >
            {previewUrl ? (
              <img
                className={styles.attachmentPreviewImage}
                src={previewUrl}
                alt={attachment.name}
              />
            ) : (
              <span className={styles.attachmentPreviewText}>
                {attachment.name}
              </span>
            )}
          </button>
        );
      })}
      {attachments.length > max ? (
        <div className={styles.attachmentPreviewMore}>
          +{attachments.length - max}
        </div>
      ) : null}
    </div>
  );
};

const TaskDropZone = ({
  columnId,
  index,
  expanded = false,
  hasActiveFilters,
  isTransitionAllowed,
  onDropTask,
}: {
  columnId: string;
  index: number;
  expanded?: boolean;
  hasActiveFilters: boolean;
  isTransitionAllowed: (
    fromColumnId: string,
    toColumnId: string,
    taskType: TaskType
  ) => boolean;
  onDropTask: (
    taskId: string,
    fromColumnId: string,
    toColumnId: string,
    toIndex: number
  ) => void;
}) => {
  const { dropTargetRef, draggedOver } = useDropTarget<TaskTrackerDndData>(
    () => ({
      data: {
        columnId,
        index,
      },
      canDrop: (args: any) => {
        if (hasActiveFilters) {
          return false;
        }
        if (args.source.data?.type !== 'task') {
          return false;
        }

        return isTransitionAllowed(
          args.source.data.fromColumnId,
          columnId,
          args.source.data.taskType ?? 'task'
        );
      },
      onDrop: (args: any) => {
        if (args.source.data?.type !== 'task') {
          return;
        }

        onDropTask(
          args.source.data.taskId,
          args.source.data.fromColumnId,
          columnId,
          index
        );
      },
    }),
    [columnId, hasActiveFilters, index, isTransitionAllowed, onDropTask]
  );

  return (
    <div
      ref={dropTargetRef}
      className={clsx(styles.dropZone, {
        [styles.dropZoneActive]: draggedOver,
        [styles.dropZoneExpanded]: expanded,
      })}
    />
  );
};

const TaskColumnDropTarget = ({
  columnId,
  index,
  hasActiveFilters,
  isTransitionAllowed,
  onDropTask,
  children,
}: {
  columnId: string;
  index: number;
  hasActiveFilters: boolean;
  isTransitionAllowed: (
    fromColumnId: string,
    toColumnId: string,
    taskType: TaskType
  ) => boolean;
  onDropTask: (
    taskId: string,
    fromColumnId: string,
    toColumnId: string,
    toIndex: number
  ) => void;
  children: ReactNode;
}) => {
  const { dropTargetRef, draggedOver } = useDropTarget<TaskTrackerDndData>(
    () => ({
      data: {
        columnId,
        index,
      },
      isSticky: true,
      canDrop: (args: any) => {
        if (hasActiveFilters) {
          return false;
        }
        if (args.source.data?.type !== 'task') {
          return false;
        }

        return isTransitionAllowed(
          args.source.data.fromColumnId,
          columnId,
          args.source.data.taskType ?? 'task'
        );
      },
      onDrop: (args: any) => {
        if (args.source.data?.type !== 'task') {
          return;
        }

        onDropTask(
          args.source.data.taskId,
          args.source.data.fromColumnId,
          columnId,
          index
        );
      },
    }),
    [columnId, hasActiveFilters, index, isTransitionAllowed, onDropTask]
  );

  return (
    <div
      ref={dropTargetRef}
      className={clsx(styles.tasks, {
        [styles.tasksDropActive]: draggedOver,
      })}
    >
      {children}
    </div>
  );
};

const TaskCardDropTarget = ({
  columnId,
  index,
  hasActiveFilters,
  isTransitionAllowed,
  onDropTask,
  children,
}: {
  columnId: string;
  index: number;
  hasActiveFilters: boolean;
  isTransitionAllowed: (
    fromColumnId: string,
    toColumnId: string,
    taskType: TaskType
  ) => boolean;
  onDropTask: (
    taskId: string,
    fromColumnId: string,
    toColumnId: string,
    toIndex: number
  ) => void;
  children: ReactNode;
}) => {
  const { dropTargetRef, closestEdge } = useDropTarget<TaskTrackerDndData>(
    () => ({
      data: {
        columnId,
        index,
      },
      closestEdge: {
        allowedEdges: ['top', 'bottom'],
      },
      isSticky: true,
      canDrop: (args: any) => {
        if (hasActiveFilters) {
          return false;
        }
        if (args.source.data?.type !== 'task') {
          return false;
        }

        return isTransitionAllowed(
          args.source.data.fromColumnId,
          columnId,
          args.source.data.taskType ?? 'task'
        );
      },
      onDrop: (args: any) => {
        if (args.source.data?.type !== 'task') {
          return;
        }

        const edge = args.closestEdge;
        const toIndex = edge === 'bottom' ? index + 1 : index;
        onDropTask(
          args.source.data.taskId,
          args.source.data.fromColumnId,
          columnId,
          toIndex
        );
      },
    }),
    [columnId, hasActiveFilters, index, isTransitionAllowed, onDropTask]
  );

  return (
    <div
      ref={dropTargetRef}
      className={clsx(styles.cardDropTarget, {
        [styles.cardDropTop]: closestEdge === 'top',
        [styles.cardDropBottom]: closestEdge === 'bottom',
      })}
    >
      {children}
    </div>
  );
};

const TaskCardItem = ({
  task,
  columnId,
  tagNameMap,
  workspace,
  hasActiveFilters,
  expanded,
  onToggleExpanded,
  onOpenEditor,
  onOpenTaskDoc,
  onDeleteTask,
  onDownloadAttachment,
  onDraggingChange,
}: {
  task: TaskCard;
  columnId: string;
  tagNameMap: Map<string, string>;
  workspace: WorkspaceService['workspace'] | null;
  hasActiveFilters: boolean;
  expanded: boolean;
  onToggleExpanded: (taskId: string) => void;
  onOpenEditor: (taskId: string) => void;
  onOpenTaskDoc: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onDownloadAttachment: (attachment: TaskAttachment) => void;
  onDraggingChange: (dragTask: ActiveDragTask | null) => void;
}) => {
  const { t, locale } = useTaskTrackerI18n();
  const { dragRef, dragging } = useDraggable<TaskTrackerDndData>(
    () => ({
      canDrag: !hasActiveFilters,
      data: {
        type: 'task',
        taskId: task.id,
        fromColumnId: columnId,
        taskType: task.type,
      },
    }),
    [columnId, hasActiveFilters, task.id, task.type]
  );

  const labels = task.labelIds
    .map(labelId => tagNameMap.get(labelId) ?? '')
    .filter(Boolean);
  const priorityTone = getPriorityTone(task.priority);
  const complexity = complexityMeta(task.complexity);
  const subtaskDoneCount = task.subtasks.filter(item => item.done).length;

  useEffect(() => {
    if (!dragging) {
      return;
    }

    onDraggingChange({
      taskId: task.id,
      fromColumnId: columnId,
      taskType: task.type,
    });
    return () => {
      onDraggingChange(null);
    };
  }, [columnId, dragging, onDraggingChange, task.id, task.type]);

  return (
    <article
      ref={dragRef}
      className={clsx(styles.task, {
        [styles.taskSelected]: expanded,
        [styles.taskExpanded]: expanded,
      })}
      data-dragging={dragging}
      data-testid={`task-card:${task.id}`}
      onClick={() => {
        onToggleExpanded(task.id);
      }}
    >
      <div className={styles.taskHero}>
        <div className={styles.taskHeroTopline}>
          <span className={styles.taskNumber}>{task.number}</span>
          <span className={styles.taskComplexityBadge}>{complexity.short}</span>
        </div>
        <div className={styles.taskHeroTitleRow}>
          <div className={styles.taskTitle}>
            {task.title || t('untitledTask')}
          </div>
          <div className={styles.taskHeaderActionsInline}>
            <button
              type="button"
              className={styles.expandButton}
              onClick={event => {
                event.stopPropagation();
                onOpenEditor(task.id);
              }}
              aria-label={t('openTaskEditor')}
            >
              {t('openEditor')}
            </button>

            <button
              type="button"
              className={styles.iconButton}
              onClick={event => {
                event.stopPropagation();
                onOpenTaskDoc(task.id);
              }}
              aria-label={t('openTaskDocument')}
            >
              <LinkIcon />
            </button>

            <button
              type="button"
              className={styles.iconButton}
              onClick={event => {
                event.stopPropagation();
                onDeleteTask(task.id);
              }}
              aria-label={t('deleteTask')}
            >
              <DeleteIcon />
            </button>
          </div>
        </div>
      </div>

      <div className={styles.taskHeader}>
        <div className={styles.taskHeroSummary}>
          <div className={styles.taskSummaryMetric}>
            <span className={styles.taskSummaryLabel}>{t('complexity')}</span>
            <span className={styles.taskSummaryValue}>
              {t(complexity.value)}
            </span>
          </div>
          <div className={styles.taskSummaryMetric}>
            <span className={styles.taskSummaryLabel}>{t('subtasks')}</span>
            <span className={styles.taskSummaryValue}>
              {subtaskDoneCount}/{task.subtasks.length}
            </span>
          </div>
          <div className={styles.taskSummaryMetric}>
            <span className={styles.taskSummaryLabel}>{t('files')}</span>
            <span className={styles.taskSummaryValue}>
              {task.attachments.length}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.taskMetaRow}>
        <span className={styles.taskMetaBadge}>
          <AssigneeAvatar assignee={task.assignee} size="xs" />
          {task.assignee || t('unassigned')}
        </span>
        <span
          className={clsx(styles.taskMetaBadge, styles.taskTypeBadge, {
            [styles.taskTypeStory]: task.type === 'story',
            [styles.taskTypeBug]: task.type === 'bug',
            [styles.taskTypeTask]: task.type === 'task',
            [styles.taskTypeEpic]: task.type === 'epic',
          })}
        >
          {t(task.type)}
        </span>
        <span
          className={clsx(styles.taskMetaBadge, styles.priorityBadge, {
            [styles.priorityLow]: priorityTone === 'low',
            [styles.priorityMedium]: priorityTone === 'medium',
            [styles.priorityHigh]: priorityTone === 'high',
            [styles.priorityUrgent]: priorityTone === 'urgent',
          })}
        >
          {t(task.priority)}
        </span>
        <span className={styles.taskMetaBadge}>
          {formatDueDateLabel(task.dueDate, locale, t('noDueDate'))}
        </span>
      </div>

      <div className={styles.taskTagsRow}>
        {labels.map(label => (
          <span className={styles.taskTag} key={label}>
            {label}
          </span>
        ))}
      </div>

      {expanded ? (
        <div className={styles.expandedCardSurface}>
          <div className={styles.expandedDescriptionBlock}>
            <span className={styles.sectionTitle}>{t('description')}</span>
            <div className={styles.expandedReadOnlyText}>
              {task.description || t('noDescription')}
            </div>
          </div>

          <div className={styles.expandedSectionCard}>
            <div className={styles.expandedSectionHeader}>
              <span className={styles.sectionTitle}>{t('subtasks')}</span>
              <span className={styles.expandedSectionMeta}>
                {t('completedCount', {
                  done: subtaskDoneCount,
                  total: task.subtasks.length,
                })}
              </span>
            </div>
            {task.subtasks.length > 0 ? (
              <div className={styles.subtasksListDetail}>
                {task.subtasks.map(subtask => (
                  <div
                    key={subtask.id}
                    className={clsx(styles.subtaskDetailItem, {
                      [styles.subtaskDetailItemDone]: subtask.done,
                    })}
                  >
                    <span
                      className={clsx(styles.subtaskIndicator, {
                        [styles.subtaskIndicatorDone]: subtask.done,
                      })}
                    />
                    <span className={styles.subtaskDetailTitle}>
                      {subtask.title}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.expandedEmptyState}>{t('noSubtasks')}</div>
            )}
          </div>

          <div className={styles.expandedSectionCard}>
            <div className={styles.expandedSectionHeader}>
              <span className={styles.sectionTitle}>{t('files')}</span>
              <span className={styles.expandedSectionMeta}>
                {t('attachedCount', { count: task.attachments.length })}
              </span>
            </div>
            <AttachmentPreviewStrip
              attachments={task.attachments}
              workspace={workspace}
              max={6}
              large
              onOpenAttachment={onDownloadAttachment}
            />
            {task.attachments.length === 0 ? (
              <div className={styles.expandedEmptyState}>{t('noFiles')}</div>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
};

const InlineAttachmentUploader = ({
  taskId,
  uploading,
  onUploadAttachments,
}: {
  taskId: string;
  uploading: boolean;
  onUploadAttachments: (taskId: string, files: FileList | null) => void;
}) => {
  const { t } = useTaskTrackerI18n();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onUploadAttachments(taskId, event.target.files);
      event.target.value = '';
    },
    [onUploadAttachments, taskId]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        className={styles.hiddenFileInput}
        type="file"
        multiple
        onChange={handleFilesChange}
      />
      <Button
        variant="plain"
        className={styles.smallButton}
        disabled={uploading}
        onClick={() => {
          fileInputRef.current?.click();
        }}
      >
        <PlusIcon />
        {uploading ? t('uploading') : t('attachFile')}
      </Button>
    </>
  );
};

const TaskDetailPanel = ({
  task,
  workspace,
  tagNameMap,
  uploading,
  onClose,
  onRenameTask,
  onOpenTaskDoc,
  onDeleteTask,
  onTypeChange,
  onPriorityChange,
  onAssigneeChange,
  onDueDateChange,
  onLabelsChange,
  onDescriptionChange,
  onExtraInfoChange,
  onComplexityChange,
  onSubtasksChange,
  onToggleSubtask,
  onUploadAttachments,
  onDownloadAttachment,
}: {
  task: TaskCard;
  workspace: WorkspaceService['workspace'] | null;
  tagNameMap: Map<string, string>;
  uploading: boolean;
  onClose: () => void;
  onRenameTask: (taskId: string, title: string) => void;
  onOpenTaskDoc: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onTypeChange: (taskId: string, type: TaskType) => void;
  onPriorityChange: (taskId: string, priority: TaskPriority) => void;
  onAssigneeChange: (taskId: string, assignee: string) => void;
  onDueDateChange: (taskId: string, dueDate: string) => void;
  onLabelsChange: (taskId: string, labels: string) => void;
  onDescriptionChange: (taskId: string, value: string) => void;
  onExtraInfoChange: (taskId: string, value: string) => void;
  onComplexityChange: (taskId: string, complexity: TaskComplexity) => void;
  onSubtasksChange: (taskId: string, value: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onUploadAttachments: (taskId: string, files: FileList | null) => void;
  onDownloadAttachment: (attachment: TaskAttachment) => void;
}) => {
  const { t, locale } = useTaskTrackerI18n();
  const labelsText = task.labelIds
    .map(labelId => tagNameMap.get(labelId) ?? '')
    .filter(Boolean)
    .join(', ');
  const subtasksText = task.subtasks.map(item => item.title).join('\n');

  return (
    <aside className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <span className={styles.detailTaskNumber}>{task.number}</span>
        <input
          className={styles.detailTitleInput}
          defaultValue={task.title}
          onBlur={event => {
            onRenameTask(task.id, event.target.value);
          }}
        />
        <div className={styles.detailHeaderActions}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t('openTaskDocument')}
            onClick={() => {
              onOpenTaskDoc(task.id);
            }}
          >
            <LinkIcon />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={t('deleteTask')}
            onClick={() => {
              onDeleteTask(task.id);
            }}
          >
            <DeleteIcon />
          </button>
          <button type="button" className={styles.textButton} onClick={onClose}>
            {t('close')}
          </button>
        </div>
      </div>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>{t('parameters')}</span>
        </div>
        <div className={styles.editorFieldGrid}>
          <div className={styles.editorFieldLabel}>{t('assignee')}</div>
          <input
            className={styles.fieldInput}
            defaultValue={task.assignee}
            placeholder={t('assigneePlaceholder')}
            onBlur={event => {
              onAssigneeChange(task.id, event.target.value);
            }}
          />

          <div className={styles.editorFieldLabel}>{t('type')}</div>
          <select
            className={styles.fieldInput}
            value={task.type}
            onChange={event => {
              onTypeChange(task.id, sanitizeTaskType(event.target.value));
            }}
          >
            {TASK_TYPE_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {t(option.value)}
              </option>
            ))}
          </select>

          <div className={styles.editorFieldLabel}>{t('priority')}</div>
          <select
            className={styles.fieldInput}
            value={task.priority}
            onChange={event => {
              onPriorityChange(task.id, sanitizePriority(event.target.value));
            }}
          >
            {PRIORITY_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {t(option.value)}
              </option>
            ))}
          </select>

          <div className={styles.editorFieldLabel}>{t('complexity')}</div>
          <select
            className={styles.fieldInput}
            value={task.complexity}
            onChange={event => {
              onComplexityChange(
                task.id,
                sanitizeComplexity(event.target.value)
              );
            }}
          >
            {COMPLEXITY_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {t(option.value)}
              </option>
            ))}
          </select>

          <div className={styles.editorFieldLabel}>{t('dueDate')}</div>
          <input
            className={styles.fieldInput}
            type="date"
            value={task.dueDate}
            onChange={event => {
              onDueDateChange(task.id, event.target.value);
            }}
          />

          <div className={styles.editorFieldLabel}>{t('labels')}</div>
          <input
            className={styles.fieldInput}
            defaultValue={labelsText}
            placeholder={t('labelsPlaceholder')}
            onBlur={event => {
              onLabelsChange(task.id, event.target.value);
            }}
          />
        </div>
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>{t('description')}</span>
        </div>
        <textarea
          className={styles.editorTextAreaLarge}
          defaultValue={task.description}
          placeholder={t('descriptionPlaceholder')}
          onBlur={event => {
            onDescriptionChange(task.id, event.target.value);
          }}
        />
        <textarea
          className={styles.editorTextArea}
          defaultValue={task.extraInfo}
          placeholder={t('extraInfoPlaceholder')}
          onBlur={event => {
            onExtraInfoChange(task.id, event.target.value);
          }}
        />
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>{t('subtasks')}</span>
          <span className={styles.expandedSectionMeta}>
            {t('completedCount', {
              done: task.subtasks.filter(item => item.done).length,
              total: task.subtasks.length,
            })}
          </span>
        </div>
        <div className={styles.detailSubtasksEditor}>
          <textarea
            className={styles.editorTextArea}
            defaultValue={subtasksText}
            placeholder={t('subtasksPlaceholder')}
            onBlur={event => {
              onSubtasksChange(task.id, event.target.value);
            }}
          />
          {task.subtasks.length > 0 ? (
            <div className={styles.subtasksListDetail}>
              {task.subtasks.map(subtask => (
                <button
                  key={subtask.id}
                  type="button"
                  className={clsx(styles.subtaskDetailItem, {
                    [styles.subtaskDetailItemDone]: subtask.done,
                  })}
                  onClick={() => {
                    onToggleSubtask(task.id, subtask.id);
                  }}
                >
                  <span
                    className={clsx(styles.subtaskIndicator, {
                      [styles.subtaskIndicatorDone]: subtask.done,
                    })}
                  />
                  <span className={styles.subtaskDetailTitle}>
                    {subtask.title}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className={styles.editorSection}>
        <div className={styles.attachmentsHeader}>
          <span className={styles.attachmentsTitle}>
            {t('files')} ({task.attachments.length})
          </span>
          <div className={styles.attachmentsActions}>
            <InlineAttachmentUploader
              taskId={task.id}
              uploading={uploading}
              onUploadAttachments={onUploadAttachments}
            />
          </div>
        </div>

        <AttachmentPreviewStrip
          attachments={task.attachments}
          workspace={workspace}
          max={6}
          large
          onOpenAttachment={onDownloadAttachment}
        />

        {task.attachments.length === 0 ? (
          <div className={styles.emptyAttachments}>{t('noFiles')}</div>
        ) : null}
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>{t('linkedTasks')}</span>
        </div>
        <div className={styles.editorEmptyState}>{t('noLinkedTasks')}</div>
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>{t('development')}</span>
        </div>
        <TaskDevelopmentSection
          workspaceId={workspace?.id ?? ''}
          taskKey={task.number}
          t={t}
        />
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>
            {t('developmentActivity')}
          </span>
        </div>
        <TaskActivitySection
          workspaceId={workspace?.id ?? ''}
          taskKey={task.number}
          t={t}
        />
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>{t('history')}</span>
        </div>
        {task.history.length > 0 ? (
          <div className={styles.historyListDetail}>
            {task.history.slice(0, 12).map(entry => (
              <div key={entry.id} className={styles.historyItemDetail}>
                <span className={styles.historyDot} />
                <div className={styles.historyContentDetail}>
                  <div className={styles.historyMessage}>
                    {localizeTaskTrackerHistory(entry.message, t)}
                  </div>
                  <div className={styles.historyTime}>
                    {formatHistoryTime(entry.createdAt, locale)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.editorEmptyState}>{t('noHistory')}</div>
        )}
      </section>
    </aside>
  );
};

const pipelineStatusClass = (status: string) => {
  switch (status) {
    case 'success':
      return styles.pipelineStatusSuccess;
    case 'failed':
      return styles.pipelineStatusFailed;
    case 'unstable':
      return styles.pipelineStatusUnstable;
    case 'running':
      return styles.pipelineStatusRunning;
    default:
      return undefined;
  }
};

const TaskDevelopmentSection = ({
  workspaceId,
  taskKey,
  t,
}: {
  workspaceId: string;
  taskKey: string;
  t: TaskTrackerTranslator;
}) => {
  const { data, isLoading, error } = useQuery({
    query: trackWorkTaskDevelopmentQuery,
    variables: { workspaceId, taskKey },
  });

  const development = data?.trackWorkTaskDevelopment;

  if (isLoading || error || !development || !workspaceId) {
    return (
      <div className={styles.editorEmptyState}>
        {error ? `${t('developmentError')}. ` : ''}
      </div>
    );
  }

  const isEmpty =
    development.commits.length === 0 &&
    development.branches.length === 0 &&
    development.mergeRequests.length === 0 &&
    development.pipelines.length === 0;

  if (isEmpty) {
    return (
      <div className={styles.editorEmptyState}>{t('developmentEmpty')}</div>
    );
  }

  return (
    <div>
      {development.branches.length > 0 ? (
        <div className={styles.developmentGroup}>
          <span className={styles.developmentGroupTitle}>
            {t('developmentBranches')}
          </span>
          {development.branches.map(branch => (
            <div key={branch.name} className={styles.developmentItem}>
              <span className={styles.developmentItemTitle}>{branch.name}</span>
            </div>
          ))}
        </div>
      ) : null}

      {development.mergeRequests.length > 0 ? (
        <div className={styles.developmentGroup}>
          <span className={styles.developmentGroupTitle}>
            {t('developmentMergeRequests')}
          </span>
          {development.mergeRequests.map(mr => (
            <div key={mr.externalId} className={styles.developmentItem}>
              <a
                className={styles.developmentLink}
                href={mr.url}
                target="_blank"
                rel="noreferrer"
              >
                !{mr.iid} {mr.title}
              </a>
              <span className={styles.developmentItemMeta}>
                {t(
                  `mrStatus${mr.status.charAt(0).toUpperCase()}${mr.status.slice(1)}` as TaskTrackerTranslationKey
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {development.pipelines.length > 0 ? (
        <div className={styles.developmentGroup}>
          <span className={styles.developmentGroupTitle}>
            {t('developmentPipelines')}
          </span>
          {development.pipelines.slice(0, 10).map(pipeline => (
            <div key={pipeline.externalId} className={styles.developmentItem}>
              <a
                className={styles.developmentLink}
                href={pipeline.url}
                target="_blank"
                rel="noreferrer"
              >
                {pipeline.name} #{pipeline.number}
              </a>
              <span
                className={clsx(
                  styles.developmentItemMeta,
                  pipelineStatusClass(pipeline.status)
                )}
              >
                {t(
                  `pipelineStatus${pipeline.status.charAt(0).toUpperCase()}${pipeline.status.slice(1)}` as TaskTrackerTranslationKey
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {development.commits.length > 0 ? (
        <div className={styles.developmentGroup}>
          <span className={styles.developmentGroupTitle}>
            {t('developmentCommits')}
          </span>
          {development.commits.slice(0, 10).map(commit => (
            <div key={commit.externalId} className={styles.developmentItem}>
              <span className={styles.developmentItemMeta}>
                {commit.shortSha}
              </span>
              <a
                className={styles.developmentLink}
                href={commit.url}
                target="_blank"
                rel="noreferrer"
              >
                {commit.title}
              </a>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};

const activityEventLabel = (
  t: TaskTrackerTranslator,
  eventType: string
): string => {
  const key = `activity${eventType
    .split('.')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')}` as TaskTrackerTranslationKey;
  return t(key);
};

const TaskActivitySection = ({
  workspaceId,
  taskKey,
  t,
}: {
  workspaceId: string;
  taskKey: string;
  t: TaskTrackerTranslator;
}) => {
  const { data, isLoading, error } = useQuery({
    query: trackWorkActivityQuery,
    variables: { workspaceId, taskKey, first: 20 },
  });

  const items = data?.trackWorkActivity?.items;

  if (isLoading || error || !items || !workspaceId) {
    return (
      <div className={styles.editorEmptyState}>
        {error ? `${t('developmentActivityError')}. ` : ''}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={styles.editorEmptyState}>
        {t('developmentActivityEmpty')}
      </div>
    );
  }

  return (
    <div className={styles.activityList}>
      {items.map(item => (
        <div key={item.id} className={styles.activityItem}>
          <span className={styles.activityItemType}>
            {activityEventLabel(t, item.eventType)}
          </span>
          <a
            className={styles.developmentLink}
            href={item.url}
            target="_blank"
            rel="noreferrer"
          >
            {item.title}
          </a>
          {item.authorName ? (
            <span className={styles.developmentItemMeta}>
              {item.authorName}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
};

const TaskTrackerPage = () => {
  const { t, locale } = useTaskTrackerI18n();
  const docsService = useService(DocsService);
  const tagService = useService(TagService);
  const workbench = useService(WorkbenchService).workbench;
  const workspacePropertyService = useService(WorkspacePropertyService);
  const workspaceDialogService = useService(WorkspaceDialogService);
  const workspace = useService(WorkspaceService).workspace;

  const trackerEnabledValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_TRACKER_FLAG_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const boardValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_BOARD_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const statusValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_STATUS_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const priorityValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_PRIORITY_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const typeValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_TYPE_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const assigneeValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_ASSIGNEE_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const dueDateValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_DUE_DATE_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const orderValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_ORDER_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const descriptionValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_DESCRIPTION_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const extraInfoValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_EXTRA_INFO_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const attachmentValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_ATTACHMENTS_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const numberValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_NUMBER_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const appliedEventsByDoc = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(
            `custom:${TASK_AUTOMATION_APPLIED_PROPERTY}`
          ),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const complexityValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_COMPLEXITY_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const subtaskValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_SUBTASKS_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const historyValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_HISTORY_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const workspaceTaskKey = useLiveData(workspace.taskKey$) || 'TASK';

  const docTitles = (useLiveData(
    useMemo(() => LiveData.from(docsService.allDocTitle$(), []), [docsService])
  ) ?? EMPTY_DOC_TITLES) as DocTitleItem[];

  const nonTrashDocIds = (useLiveData(
    useMemo(
      () => LiveData.from(docsService.allNonTrashDocIds$(), []),
      [docsService]
    )
  ) ?? EMPTY_DOC_IDS) as string[];

  const docTagIds = (useLiveData(
    useMemo(
      () => LiveData.from(docsService.allDocsTagIds$(), []),
      [docsService]
    )
  ) ?? EMPTY_DOC_TAG_IDS) as DocTagItem[];

  const tagMetas = (useLiveData(tagService.tagList.tagMetas$) ??
    EMPTY_TAG_METAS) as TagMetaItem[];

  const statusPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_STATUS_PROPERTY)
  );
  const boardPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_BOARD_PROPERTY)
  );
  const trackerFlagPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_TRACKER_FLAG_PROPERTY)
  );
  const priorityPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_PRIORITY_PROPERTY)
  );
  const typePropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_TYPE_PROPERTY)
  );
  const assigneePropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_ASSIGNEE_PROPERTY)
  );
  const dueDatePropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_DUE_DATE_PROPERTY)
  );
  const orderPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_ORDER_PROPERTY)
  );
  const descriptionPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_DESCRIPTION_PROPERTY)
  );
  const extraInfoPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_EXTRA_INFO_PROPERTY)
  );
  const attachmentsPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_ATTACHMENTS_PROPERTY)
  );
  const numberPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_NUMBER_PROPERTY)
  );
  const complexityPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_COMPLEXITY_PROPERTY)
  );
  const subtasksPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_SUBTASKS_PROPERTY)
  );
  const historyPropertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(TASK_HISTORY_PROPERTY)
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBoardId, setSelectedBoardId] =
    useState<string>(DEFAULT_BOARD_ID);
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>(
    'all'
  );
  const [typeFilter, setTypeFilter] = useState<'all' | TaskType>('all');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const [dueFilter, setDueFilter] = useState<DueFilter>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);
  const [activeDragTask, setActiveDragTask] = useState<ActiveDragTask | null>(
    null
  );

  const initializedPropertiesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ensureProperty = (
      key: string,
      exists: boolean,
      create: () => void
    ) => {
      if (exists || initializedPropertiesRef.current.has(key)) {
        return;
      }
      initializedPropertiesRef.current.add(key);
      create();
    };

    ensureProperty(
      TASK_TRACKER_FLAG_PROPERTY,
      !!trackerFlagPropertyInfo,
      () => {
        workspacePropertyService.createProperty({
          id: TASK_TRACKER_FLAG_PROPERTY,
          name: 'Task Tracker Item',
          type: 'checkbox',
          show: 'always-hide',
        });
      }
    );

    ensureProperty(TASK_BOARD_PROPERTY, !!boardPropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_BOARD_PROPERTY,
        name: 'Task Board',
        type: 'text',
        show: 'always-hide',
      });
    });

    ensureProperty(TASK_STATUS_PROPERTY, !!statusPropertyInfo, () => {
      const defaultTransitions = buildDefaultTransitions(DEFAULT_FLOW);
      const defaultTypeTransitions = buildDefaultTypeTransitions(DEFAULT_FLOW);
      workspacePropertyService.createProperty({
        id: TASK_STATUS_PROPERTY,
        name: 'Task Status',
        type: 'text',
        additionalData: {
          taskTrackerBoards: [
            {
              id: DEFAULT_BOARD_ID,
              title: DEFAULT_BOARD_TITLE,
              flow: DEFAULT_FLOW,
              transitions: defaultTransitions,
              typeTransitions: defaultTypeTransitions,
            },
          ],
          taskTrackerFlow: DEFAULT_FLOW,
          taskTrackerTransitions: defaultTransitions,
        },
      });
    });

    ensureProperty(TASK_PRIORITY_PROPERTY, !!priorityPropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_PRIORITY_PROPERTY,
        name: 'Task Priority',
        type: 'text',
      });
    });

    ensureProperty(TASK_TYPE_PROPERTY, !!typePropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_TYPE_PROPERTY,
        name: 'Task Type',
        type: 'text',
      });
    });

    ensureProperty(TASK_ASSIGNEE_PROPERTY, !!assigneePropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_ASSIGNEE_PROPERTY,
        name: 'Task Assignee',
        type: 'text',
      });
    });

    ensureProperty(TASK_DUE_DATE_PROPERTY, !!dueDatePropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_DUE_DATE_PROPERTY,
        name: 'Task Due Date',
        type: 'date',
      });
    });

    ensureProperty(TASK_ORDER_PROPERTY, !!orderPropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_ORDER_PROPERTY,
        name: 'Task Order',
        type: 'number',
        show: 'always-hide',
      });
    });

    ensureProperty(TASK_DESCRIPTION_PROPERTY, !!descriptionPropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_DESCRIPTION_PROPERTY,
        name: 'Task Description',
        type: 'text',
      });
    });

    ensureProperty(TASK_EXTRA_INFO_PROPERTY, !!extraInfoPropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_EXTRA_INFO_PROPERTY,
        name: 'Task Extra Info',
        type: 'text',
      });
    });

    ensureProperty(TASK_ATTACHMENTS_PROPERTY, !!attachmentsPropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_ATTACHMENTS_PROPERTY,
        name: 'Task Attachments',
        type: 'text',
        show: 'always-hide',
      });
    });

    ensureProperty(TASK_NUMBER_PROPERTY, !!numberPropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_NUMBER_PROPERTY,
        name: 'Task Number',
        type: 'text',
        show: 'always-hide',
      });
    });

    ensureProperty(TASK_COMPLEXITY_PROPERTY, !!complexityPropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_COMPLEXITY_PROPERTY,
        name: 'Task Complexity',
        type: 'text',
      });
    });

    ensureProperty(TASK_SUBTASKS_PROPERTY, !!subtasksPropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_SUBTASKS_PROPERTY,
        name: 'Task Subtasks',
        type: 'text',
        show: 'always-hide',
      });
    });

    ensureProperty(TASK_HISTORY_PROPERTY, !!historyPropertyInfo, () => {
      workspacePropertyService.createProperty({
        id: TASK_HISTORY_PROPERTY,
        name: 'Task History',
        type: 'text',
        show: 'always-hide',
      });
    });
  }, [
    assigneePropertyInfo,
    attachmentsPropertyInfo,
    boardPropertyInfo,
    complexityPropertyInfo,
    descriptionPropertyInfo,
    dueDatePropertyInfo,
    extraInfoPropertyInfo,
    historyPropertyInfo,
    numberPropertyInfo,
    orderPropertyInfo,
    priorityPropertyInfo,
    statusPropertyInfo,
    subtasksPropertyInfo,
    typePropertyInfo,
    trackerFlagPropertyInfo,
    workspacePropertyService,
  ]);

  const trackerAdditionalData = useMemo(() => {
    return (
      (statusPropertyInfo?.additionalData as
        | TaskTrackerPropertyAdditionalData
        | undefined) ?? {}
    );
  }, [statusPropertyInfo]);

  const boards = useMemo(
    () => resolveTaskTrackerBoards(trackerAdditionalData),
    [trackerAdditionalData]
  );

  useEffect(() => {
    if (!statusPropertyInfo) {
      return;
    }

    const hasBoards =
      Array.isArray(trackerAdditionalData.taskTrackerBoards) &&
      trackerAdditionalData.taskTrackerBoards.length > 0;

    if (hasBoards) {
      return;
    }

    const firstBoard = boards[0];
    workspacePropertyService.updatePropertyInfo(TASK_STATUS_PROPERTY, {
      additionalData: {
        ...trackerAdditionalData,
        taskTrackerBoards: boards.map(board => ({
          id: board.id,
          title: board.title,
          flow: board.flow,
          transitions: board.transitions,
          typeTransitions: board.typeTransitions,
        })),
        taskTrackerFlow: firstBoard?.flow ?? DEFAULT_FLOW,
        taskTrackerTransitions:
          firstBoard?.transitions ?? buildDefaultTransitions(DEFAULT_FLOW),
      },
    });
  }, [
    boards,
    statusPropertyInfo,
    trackerAdditionalData,
    workspacePropertyService,
  ]);

  useEffect(() => {
    if (!boards.some(board => board.id === selectedBoardId)) {
      setSelectedBoardId(boards[0]?.id ?? DEFAULT_BOARD_ID);
    }
  }, [boards, selectedBoardId]);

  const selectedBoard = useMemo(() => {
    return boards.find(board => board.id === selectedBoardId) ?? boards[0];
  }, [boards, selectedBoardId]);

  const boardMap = useMemo(() => {
    return new Map<string, TaskTrackerBoard>(
      boards.map(board => [board.id, board])
    );
  }, [boards]);

  const flow = selectedBoard?.flow ?? DEFAULT_FLOW;
  const typeTransitions =
    selectedBoard?.typeTransitions ?? buildDefaultTypeTransitions(flow);

  const isTransitionAllowed = useCallback(
    (fromColumnId: string, toColumnId: string, taskType: TaskType = 'task') => {
      if (fromColumnId === toColumnId) {
        return true;
      }

      return (
        typeTransitions[taskType]?.[fromColumnId]?.includes(toColumnId) ?? false
      );
    },
    [typeTransitions]
  );

  const titleMap = useMemo(() => {
    return new Map<string, string>(
      docTitles.map((item: DocTitleItem) => [item.id, item.title])
    );
  }, [docTitles]);

  const tagIdsMap = useMemo(() => {
    return new Map<string, string[]>(
      docTagIds.map((item: DocTagItem) => [item.id, item.tags])
    );
  }, [docTagIds]);

  const tagNameMap = useMemo(() => {
    return new Map<string, string>(
      tagMetas.map((tag: TagMetaItem) => [tag.id, tag.name])
    );
  }, [tagMetas]);

  const tagByLowercaseName = useMemo(() => {
    return new Map<string, TagMetaItem>(
      tagMetas.map((tag: TagMetaItem) => [tag.name.trim().toLowerCase(), tag])
    );
  }, [tagMetas]);

  const tasks = useMemo<TaskCard[]>(() => {
    const fallbackStatus = flow[0]?.id ?? DEFAULT_FLOW[0].id;

    return nonTrashDocIds
      .filter((docId: string) => trackerEnabledValues.get(docId) === 'true')
      .map((docId: string) => {
        return {
          id: docId,
          number: formatTaskKey(
            workspaceTaskKey,
            parseTaskNumber(numberValues.get(docId))
          ),
          title: titleMap.get(docId) ?? '',
          boardId: boardValues.get(docId) || DEFAULT_BOARD_ID,
          status: statusValues.get(docId) || fallbackStatus,
          type: sanitizeTaskType(typeValues.get(docId)),
          assignee: assigneeValues.get(docId)?.trim() || '',
          priority: sanitizePriority(priorityValues.get(docId)),
          dueDate: sanitizeDate(dueDateValues.get(docId)),
          order: parseOrder(orderValues.get(docId)),
          labelIds: tagIdsMap.get(docId) ?? [],
          description: descriptionValues.get(docId) ?? '',
          extraInfo: extraInfoValues.get(docId) ?? '',
          attachments: parseAttachments(attachmentValues.get(docId)),
          complexity: sanitizeComplexity(complexityValues.get(docId)),
          subtasks: parseSubtasks(subtaskValues.get(docId)),
          history: parseHistoryEntries(historyValues.get(docId)),
        };
      });
  }, [
    assigneeValues,
    attachmentValues,
    boardValues,
    complexityValues,
    descriptionValues,
    dueDateValues,
    extraInfoValues,
    flow,
    nonTrashDocIds,
    numberValues,
    orderValues,
    priorityValues,
    statusValues,
    subtaskValues,
    typeValues,
    tagIdsMap,
    titleMap,
    trackerEnabledValues,
    historyValues,
    workspaceTaskKey,
  ]);

  useEffect(() => {
    const sorted = [...tasks].sort((a, b) => a.id.localeCompare(b.id));
    const seen = new Set<number>();
    const toFix: TaskCard[] = [];

    for (const task of sorted) {
      const number = parseTaskNumber(task.number);
      if (number > 0 && !seen.has(number)) {
        seen.add(number);
      } else {
        toFix.push(task);
      }
    }

    if (toFix.length === 0) {
      return;
    }

    let next = Math.max(0, ...seen) + 1;
    for (const task of toFix) {
      const doc = docsService.list.doc$(task.id).value;
      if (!doc) {
        continue;
      }
      doc.setCustomProperty(TASK_NUMBER_PROPERTY, String(next));
      seen.add(next);
      next += 1;
    }
  }, [docsService.list, tasks]);

  const selectedBoardTasks = useMemo(() => {
    const currentBoardId = selectedBoard?.id;
    if (!currentBoardId) {
      return [];
    }

    return tasks.filter(task => task.boardId === currentBoardId);
  }, [selectedBoard?.id, tasks]);

  const assigneeOptions = useMemo(() => {
    return Array.from(
      new Set(
        selectedBoardTasks
          .map(task => task.assignee)
          .filter(value => value.length > 0)
          .sort((a, b) => a.localeCompare(b, locale))
      )
    );
  }, [locale, selectedBoardTasks]);

  const usedLabelIds = useMemo(() => {
    return Array.from(
      new Set(selectedBoardTasks.flatMap(task => task.labelIds))
    ).filter(id => tagNameMap.has(id));
  }, [selectedBoardTasks, tagNameMap]);

  const isDueInFilter = useCallback(
    (taskDueDate: string) => {
      if (dueFilter === 'all') {
        return true;
      }

      if (!taskDueDate) {
        return dueFilter === 'no-date';
      }

      if (dueFilter === 'no-date') {
        return false;
      }

      const today = toIsoDate(new Date());
      if (dueFilter === 'today') {
        return taskDueDate === today;
      }

      if (dueFilter === 'overdue') {
        return taskDueDate < today;
      }

      if (dueFilter === 'next-7-days') {
        const sevenDaysLater = new Date();
        sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
        const upperBound = toIsoDate(sevenDaysLater);
        return taskDueDate >= today && taskDueDate <= upperBound;
      }

      return true;
    },
    [dueFilter]
  );

  const filteredTasks = useMemo(() => {
    const search = searchQuery.trim().toLocaleLowerCase(locale);

    return selectedBoardTasks.filter(task => {
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) {
        return false;
      }

      if (typeFilter !== 'all' && task.type !== typeFilter) {
        return false;
      }

      if (assigneeFilter !== 'all' && task.assignee !== assigneeFilter) {
        return false;
      }

      if (labelFilter !== 'all' && !task.labelIds.includes(labelFilter)) {
        return false;
      }

      if (!isDueInFilter(task.dueDate)) {
        return false;
      }

      if (!search) {
        return true;
      }

      const labelText = task.labelIds
        .map(labelId => tagNameMap.get(labelId) ?? '')
        .join(' ')
        .toLocaleLowerCase(locale);

      const attachmentText = task.attachments
        .map(attachment => attachment.name)
        .join(' ')
        .toLocaleLowerCase(locale);
      const typeText =
        `${TASK_TYPE_OPTIONS.find(option => option.value === task.type)?.label ?? ''} ${t(task.type)}`.toLocaleLowerCase(
          locale
        );

      return (
        task.number.toLocaleLowerCase(locale).includes(search) ||
        task.title.toLocaleLowerCase(locale).includes(search) ||
        task.assignee.toLocaleLowerCase(locale).includes(search) ||
        labelText.includes(search) ||
        task.description.toLocaleLowerCase(locale).includes(search) ||
        task.extraInfo.toLocaleLowerCase(locale).includes(search) ||
        attachmentText.includes(search) ||
        typeText.includes(search)
      );
    });
  }, [
    assigneeFilter,
    isDueInFilter,
    labelFilter,
    locale,
    priorityFilter,
    searchQuery,
    tagNameMap,
    selectedBoardTasks,
    t,
    typeFilter,
  ]);

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    priorityFilter !== 'all' ||
    typeFilter !== 'all' ||
    assigneeFilter !== 'all' ||
    labelFilter !== 'all' ||
    dueFilter !== 'all';

  const tasksByColumn = useMemo(() => {
    const grouped = new Map<string, TaskCard[]>();
    flow.forEach(column => {
      grouped.set(column.id, []);
    });

    const fallbackColumnId = flow[0]?.id;

    filteredTasks.forEach(task => {
      const columnId = grouped.has(task.status)
        ? task.status
        : fallbackColumnId;
      if (!columnId) {
        return;
      }
      const target = grouped.get(columnId);
      if (!target) {
        return;
      }
      target.push(task);
    });

    grouped.forEach(columnTasks => {
      columnTasks.sort((a, b) => {
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        if (a.priority !== b.priority) {
          return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
        }
        return a.title.localeCompare(b.title, locale);
      });
    });

    return grouped;
  }, [filteredTasks, flow, locale]);

  const allTasksByColumn = useMemo(() => {
    const grouped = new Map<string, TaskCard[]>();
    flow.forEach(column => {
      grouped.set(column.id, []);
    });

    const fallbackColumnId = flow[0]?.id;

    selectedBoardTasks.forEach(task => {
      const columnId = grouped.has(task.status)
        ? task.status
        : fallbackColumnId;
      if (!columnId) {
        return;
      }
      const target = grouped.get(columnId);
      if (!target) {
        return;
      }
      target.push(task);
    });

    grouped.forEach(columnTasks => {
      columnTasks.sort((a, b) => a.order - b.order);
    });

    return grouped;
  }, [flow, selectedBoardTasks]);

  const selectedTask = useMemo(
    () => selectedBoardTasks.find(task => task.id === selectedTaskId) ?? null,
    [selectedBoardTasks, selectedTaskId]
  );

  useEffect(() => {
    if (
      selectedTaskId &&
      !selectedBoardTasks.some(task => task.id === selectedTaskId)
    ) {
      setSelectedTaskId(null);
    }
  }, [selectedBoardTasks, selectedTaskId]);

  useEffect(() => {
    if (
      activeDragTask &&
      !selectedBoardTasks.some(task => task.id === activeDragTask.taskId)
    ) {
      setActiveDragTask(null);
    }
  }, [activeDragTask, selectedBoardTasks]);

  useEffect(() => {
    const fallbackBoard = boards[0];
    if (!fallbackBoard) {
      return;
    }

    tasks.forEach(task => {
      const board =
        boardMap.get(task.boardId) ??
        boardMap.get(DEFAULT_BOARD_ID) ??
        fallbackBoard;

      const record = docsService.list.doc$(task.id).value;
      if (!record) {
        return;
      }

      if (!task.boardId || !boardMap.has(task.boardId)) {
        record.setCustomProperty(TASK_BOARD_PROPERTY, board.id);
      }

      const fallbackColumnId = board.flow[0]?.id;
      if (!fallbackColumnId) {
        return;
      }

      if (!board.flow.some(column => column.id === task.status)) {
        record.setCustomProperty(TASK_STATUS_PROPERTY, fallbackColumnId);
      }
    });
  }, [boardMap, boards, docsService.list, tasks]);

  const setTaskStatusAndOrder = useCallback(
    (columnId: string, orderedTaskIds: string[]) => {
      orderedTaskIds.forEach((taskId, index) => {
        const record = docsService.list.doc$(taskId).value;
        if (!record) {
          return;
        }
        record.setCustomProperty(TASK_STATUS_PROPERTY, columnId);
        record.setCustomProperty(
          TASK_ORDER_PROPERTY,
          String((index + 1) * 1000)
        );
      });
    },
    [docsService.list]
  );

  const appendTaskHistory = useCallback(
    (
      taskId: string,
      entry: TaskHistoryEntry,
      baseHistory?: TaskHistoryEntry[]
    ) => {
      const doc = docsService.list.doc$(taskId).value;
      if (!doc) {
        return;
      }

      const currentHistory =
        baseHistory ?? tasks.find(item => item.id === taskId)?.history ?? [];

      doc.setCustomProperty(
        TASK_HISTORY_PROPERTY,
        stringifyHistoryEntries([entry, ...currentHistory].slice(0, 30))
      );
    },
    [docsService.list, tasks]
  );

  const automationRules = useMemo(
    () =>
      sanitizeAutomationRules(
        statusPropertyInfo?.additionalData?.taskTrackerAutomationRules
      ),
    [statusPropertyInfo]
  );

  const { data: automationActivity } = useQuery({
    query: trackWorkActivityQuery,
    variables: { workspaceId: workspace.id, taskKey: undefined, first: 100 },
  });

  useEffect(() => {
    if (automationRules.length === 0) {
      return;
    }

    const events = automationActivity?.trackWorkActivity?.items ?? [];

    if (events.length === 0) {
      return;
    }

    const taskByKey = new Map<
      string,
      { docId: string; board?: TaskTrackerBoard }
    >();
    for (const task of tasks) {
      const board = boardMap.get(task.boardId);
      taskByKey.set(task.number, { docId: task.id, board });
    }

    for (const task of tasks) {
      const appliedIds = new Set<string>(
        JSON.parse(appliedEventsByDoc.get(task.id) ?? '[]') as string[]
      );

      const result = applyAutomationRules(
        automationRules,
        events.filter(event => event.taskKey === task.number),
        appliedIds,
        taskByKey
      );

      if (
        result.statusUpdates.length === 0 &&
        result.warningEvents.length === 0
      ) {
        continue;
      }

      const doc = docsService.list.doc$(task.id).value;
      if (!doc) {
        continue;
      }

      for (const update of result.statusUpdates) {
        doc.setCustomProperty(TASK_STATUS_PROPERTY, update.stageId);
        const stage = boardMap
          .get(task.boardId)
          ?.flow.find(column => column.id === update.stageId);
        appendTaskHistory(
          task.id,
          buildHistoryEntry(
            'edited',
            `${t('automationStatusChanged')}: ${
              stage ? localizeTaskTrackerStageTitle(stage, t) : update.stageId
            }`
          ),
          task.history
        );
      }

      for (const warning of result.warningEvents) {
        notify.error({
          title: `${t('automationWarningTitle')}: ${warning.eventType}`,
        });
      }

      const nextApplied = [...appliedIds, ...result.appliedEventIds];
      doc.setCustomProperty(
        TASK_AUTOMATION_APPLIED_PROPERTY,
        JSON.stringify(nextApplied)
      );
    }
  }, [
    appendTaskHistory,
    appliedEventsByDoc,
    automationActivity,
    automationRules,
    boardMap,
    docsService.list,
    t,
    tasks,
  ]);

  const handleCreateTask = useCallback(() => {
    const targetColumn = flow[0];
    if (!targetColumn) {
      return;
    }

    const nextOrder =
      (allTasksByColumn.get(targetColumn.id)?.length ?? 0) * 1000 + 1000;
    const nextNumber = nextTaskNumber(tasks.map(task => task.number));

    const doc = docsService.createDoc({
      primaryMode: 'page',
    });

    doc.setCustomProperty(TASK_TRACKER_FLAG_PROPERTY, 'true');
    doc.setCustomProperty(
      TASK_BOARD_PROPERTY,
      selectedBoard?.id || DEFAULT_BOARD_ID
    );
    doc.setCustomProperty(TASK_STATUS_PROPERTY, targetColumn.id);
    doc.setCustomProperty(TASK_TYPE_PROPERTY, 'task');
    doc.setCustomProperty(TASK_PRIORITY_PROPERTY, 'medium');
    doc.setCustomProperty(TASK_ASSIGNEE_PROPERTY, '');
    doc.setCustomProperty(TASK_DUE_DATE_PROPERTY, '');
    doc.setCustomProperty(TASK_ORDER_PROPERTY, String(nextOrder));
    doc.setCustomProperty(TASK_NUMBER_PROPERTY, String(nextNumber));
    doc.setCustomProperty(TASK_DESCRIPTION_PROPERTY, '');
    doc.setCustomProperty(TASK_EXTRA_INFO_PROPERTY, '');
    doc.setCustomProperty(TASK_ATTACHMENTS_PROPERTY, '[]');
    doc.setCustomProperty(TASK_COMPLEXITY_PROPERTY, 'medium');
    doc.setCustomProperty(TASK_SUBTASKS_PROPERTY, '[]');
    doc.setCustomProperty(
      TASK_HISTORY_PROPERTY,
      stringifyHistoryEntries([
        buildHistoryEntry('created', `Created in ${targetColumn.title}`),
      ])
    );

    docsService.changeDocTitle(doc.id, t('newTask')).catch(() => {
      notify.error({ title: t('setTitleFailed') });
    });
    setSelectedTaskId(doc.id);
  }, [allTasksByColumn, docsService, flow, selectedBoard, t, tasks]);

  const handleRenameTask = useCallback(
    (taskId: string, title: string) => {
      const nextTitle = title.trim();
      const task = tasks.find(item => item.id === taskId);
      if (!nextTitle || !task || task.title === nextTitle) {
        return;
      }

      docsService.changeDocTitle(taskId, nextTitle).catch(() => {
        notify.error({ title: t('renameFailed') });
      });
      appendTaskHistory(
        taskId,
        buildHistoryEntry('edited', `Renamed task to “${nextTitle}”`),
        task.history
      );
    },
    [appendTaskHistory, docsService, t, tasks]
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      const doc = docsService.list.doc$(taskId).value;
      doc?.moveToTrash();
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
      }
    },
    [docsService.list, selectedTaskId]
  );

  const handlePriorityChange = useCallback(
    (taskId: string, priority: TaskPriority) => {
      const doc = docsService.list.doc$(taskId).value;
      const task = tasks.find(item => item.id === taskId);
      if (!doc || !task || task.priority === priority) {
        return;
      }
      doc?.setCustomProperty(TASK_PRIORITY_PROPERTY, priority);
      appendTaskHistory(
        taskId,
        buildHistoryEntry('edited', `Changed priority to ${priority}`),
        task.history
      );
    },
    [appendTaskHistory, docsService.list, tasks]
  );

  const handleTypeChange = useCallback(
    (taskId: string, type: TaskType) => {
      const doc = docsService.list.doc$(taskId).value;
      const task = tasks.find(item => item.id === taskId);
      if (!doc || !task || task.type === type) {
        return;
      }
      doc?.setCustomProperty(TASK_TYPE_PROPERTY, type);
      appendTaskHistory(
        taskId,
        buildHistoryEntry('edited', `Changed type to ${type}`),
        task.history
      );
    },
    [appendTaskHistory, docsService.list, tasks]
  );

  const handleAssigneeChange = useCallback(
    (taskId: string, assignee: string) => {
      const doc = docsService.list.doc$(taskId).value;
      const task = tasks.find(item => item.id === taskId);
      const nextAssignee = assignee.trim();
      if (!doc || !task || task.assignee === nextAssignee) {
        return;
      }
      doc?.setCustomProperty(TASK_ASSIGNEE_PROPERTY, nextAssignee);
      appendTaskHistory(
        taskId,
        buildHistoryEntry(
          'edited',
          nextAssignee ? `Assigned to ${nextAssignee}` : 'Cleared assignee'
        ),
        task.history
      );
    },
    [appendTaskHistory, docsService.list, tasks]
  );

  const handleDueDateChange = useCallback(
    (taskId: string, dueDate: string) => {
      const doc = docsService.list.doc$(taskId).value;
      const task = tasks.find(item => item.id === taskId);
      if (!doc || !task || task.dueDate === dueDate) {
        return;
      }
      doc?.setCustomProperty(TASK_DUE_DATE_PROPERTY, dueDate);
      appendTaskHistory(
        taskId,
        buildHistoryEntry(
          'edited',
          dueDate ? `Set due date to ${dueDate}` : 'Cleared due date'
        ),
        task.history
      );
    },
    [appendTaskHistory, docsService.list, tasks]
  );

  const handleLabelsChange = useCallback(
    (taskId: string, labelsInput: string) => {
      const names = Array.from(
        new Set(
          labelsInput
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)
        )
      );

      const labelIds: string[] = [];
      names.forEach(name => {
        const normalized = name.toLowerCase();
        const existing = tagByLowercaseName.get(normalized);
        if (existing) {
          labelIds.push(existing.id);
          return;
        }

        const tag = tagService.tagList.createTag(
          name,
          tagService.randomTagColor()
        );
        labelIds.push(tag.id);
      });

      const doc = docsService.list.doc$(taskId).value;
      const task = tasks.find(item => item.id === taskId);
      doc?.setMeta({ tags: labelIds });
      if (task) {
        appendTaskHistory(
          taskId,
          buildHistoryEntry(
            'edited',
            labelIds.length > 0
              ? `Updated tags: ${names.join(', ')}`
              : 'Cleared tags'
          ),
          task.history
        );
      }
    },
    [appendTaskHistory, docsService.list, tagByLowercaseName, tagService, tasks]
  );

  const handleDescriptionChange = useCallback(
    (taskId: string, value: string) => {
      const doc = docsService.list.doc$(taskId).value;
      const task = tasks.find(item => item.id === taskId);
      const nextValue = value.trim();
      if (!doc || !task || task.description === nextValue) {
        return;
      }
      doc?.setCustomProperty(TASK_DESCRIPTION_PROPERTY, nextValue);
      appendTaskHistory(
        taskId,
        buildHistoryEntry('edited', 'Updated description'),
        task.history
      );
    },
    [appendTaskHistory, docsService.list, tasks]
  );

  const handleExtraInfoChange = useCallback(
    (taskId: string, value: string) => {
      const doc = docsService.list.doc$(taskId).value;
      const task = tasks.find(item => item.id === taskId);
      const nextValue = value.trim();
      if (!doc || !task || task.extraInfo === nextValue) {
        return;
      }
      doc?.setCustomProperty(TASK_EXTRA_INFO_PROPERTY, nextValue);
      appendTaskHistory(
        taskId,
        buildHistoryEntry('edited', 'Updated extra info'),
        task.history
      );
    },
    [appendTaskHistory, docsService.list, tasks]
  );

  const handleComplexityChange = useCallback(
    (taskId: string, complexity: TaskComplexity) => {
      const doc = docsService.list.doc$(taskId).value;
      const task = tasks.find(item => item.id === taskId);
      if (!doc || !task || task.complexity === complexity) {
        return;
      }

      doc.setCustomProperty(TASK_COMPLEXITY_PROPERTY, complexity);
      appendTaskHistory(
        taskId,
        buildHistoryEntry(
          'edited',
          `Changed complexity from ${complexityMeta(task.complexity).label} to ${complexityMeta(complexity).label}`
        ),
        task.history
      );
    },
    [appendTaskHistory, docsService.list, tasks]
  );

  const handleSubtasksChange = useCallback(
    (taskId: string, value: string) => {
      const doc = docsService.list.doc$(taskId).value;
      const task = tasks.find(item => item.id === taskId);
      if (!doc || !task) {
        return;
      }

      const nextSubtasks = parseSubtasksInput(value);
      const prevSignature = JSON.stringify(
        task.subtasks.map(item => ({ title: item.title, done: item.done }))
      );
      const nextSignature = JSON.stringify(
        nextSubtasks.map(item => ({ title: item.title, done: item.done }))
      );

      if (prevSignature === nextSignature) {
        return;
      }

      doc.setCustomProperty(
        TASK_SUBTASKS_PROPERTY,
        stringifySubtasks(nextSubtasks)
      );
      appendTaskHistory(
        taskId,
        buildHistoryEntry(
          'edited',
          nextSubtasks.length > task.subtasks.length
            ? `Updated subtasks to ${nextSubtasks.length} items`
            : `Reworked subtasks list (${nextSubtasks.length} items)`
        ),
        task.history
      );
    },
    [appendTaskHistory, docsService.list, tasks]
  );

  const handleToggleSubtask = useCallback(
    (taskId: string, subtaskId: string) => {
      const doc = docsService.list.doc$(taskId).value;
      const task = tasks.find(item => item.id === taskId);
      if (!doc || !task) {
        return;
      }

      const nextSubtasks = task.subtasks.map(item =>
        item.id === subtaskId ? { ...item, done: !item.done } : item
      );
      const changed = nextSubtasks.find(item => item.id === subtaskId);
      if (!changed) {
        return;
      }

      doc.setCustomProperty(
        TASK_SUBTASKS_PROPERTY,
        stringifySubtasks(nextSubtasks)
      );
      appendTaskHistory(
        taskId,
        buildHistoryEntry(
          'edited',
          `${changed.done ? 'Completed' : 'Reopened'} subtask “${changed.title}”`
        ),
        task.history
      );
    },
    [appendTaskHistory, docsService.list, tasks]
  );

  const handleDropTask = useCallback(
    (
      taskId: string,
      fromColumnId: string,
      toColumnId: string,
      toIndex: number
    ) => {
      if (hasActiveFilters) {
        return;
      }

      const resolvedFromColumnId =
        Array.from(allTasksByColumn.entries()).find(([, columnTasks]) =>
          columnTasks.some(task => task.id === taskId)
        )?.[0] ?? fromColumnId;
      const draggedTask =
        selectedBoardTasks.find(task => task.id === taskId) ?? null;
      const draggedTaskType = draggedTask?.type ?? 'task';

      if (
        !isTransitionAllowed(resolvedFromColumnId, toColumnId, draggedTaskType)
      ) {
        notify.error({ title: t('transitionBlocked') });
        return;
      }

      const sourceTasks = allTasksByColumn.get(resolvedFromColumnId) ?? [];
      const targetTasks = allTasksByColumn.get(toColumnId) ?? [];

      const sourceIds = sourceTasks.map(task => task.id);
      const targetIds = targetTasks.map(task => task.id);

      const sourceIndex = sourceIds.indexOf(taskId);
      if (sourceIndex === -1) {
        return;
      }

      sourceIds.splice(sourceIndex, 1);

      const boundedIndex = Math.max(0, Math.min(toIndex, targetIds.length));
      const insertIndex =
        resolvedFromColumnId === toColumnId && sourceIndex < boundedIndex
          ? boundedIndex - 1
          : boundedIndex;

      targetIds.splice(insertIndex, 0, taskId);

      if (resolvedFromColumnId === toColumnId) {
        setTaskStatusAndOrder(toColumnId, targetIds);
      } else {
        setTaskStatusAndOrder(resolvedFromColumnId, sourceIds);
        setTaskStatusAndOrder(toColumnId, targetIds);
        appendTaskHistory(
          taskId,
          buildHistoryEntry(
            'moved',
            `Moved from ${
              flow.find(column => column.id === resolvedFromColumnId)?.title ??
              resolvedFromColumnId
            } to ${flow.find(column => column.id === toColumnId)?.title ?? toColumnId}`
          ),
          draggedTask?.history
        );
      }
    },
    [
      appendTaskHistory,
      allTasksByColumn,
      flow,
      hasActiveFilters,
      isTransitionAllowed,
      selectedBoardTasks,
      setTaskStatusAndOrder,
      t,
    ]
  );

  const handleUploadAttachments = useCallback(
    async (taskId: string, files: FileList | null) => {
      if (!workspace || !files || files.length === 0) {
        return;
      }

      const currentTask = tasks.find(task => task.id === taskId);
      if (!currentTask) {
        return;
      }

      setUploadingTaskId(taskId);

      try {
        const nextAttachments = [...currentTask.attachments];

        for (const file of Array.from(files)) {
          const blobId = nanoid();
          const buffer = new Uint8Array(await file.arrayBuffer());

          await workspace.engine.blob.set({
            key: blobId,
            data: buffer,
            mime: file.type || 'application/octet-stream',
          });

          nextAttachments.push({
            id: blobId,
            name: file.name,
            mime: file.type,
            size: file.size,
            createdAt: Date.now(),
          });
        }

        const doc = docsService.list.doc$(taskId).value;
        doc?.setCustomProperty(
          TASK_ATTACHMENTS_PROPERTY,
          stringifyAttachments(nextAttachments)
        );
      } catch {
        notify.error({ title: t('uploadFailed') });
      } finally {
        setUploadingTaskId(current => (current === taskId ? null : current));
      }
    },
    [docsService.list, t, tasks, workspace]
  );

  const handleDownloadAttachment = useCallback(
    async (attachment: TaskAttachment) => {
      if (!workspace) {
        return;
      }

      try {
        const record = await workspace.engine.blob.get(attachment.id);
        if (!record) {
          notify.error({ title: t('attachmentNotFound') });
          return;
        }

        const blob = new Blob([toBlobPart(record.data)], {
          type: attachment.mime || record.mime || 'application/octet-stream',
        });

        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = attachment.name || 'attachment';
        document.body.append(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } catch {
        notify.error({ title: t('downloadFailed') });
      }
    },
    [t, workspace]
  );

  const handleOpenTaskDoc = useCallback(
    (taskId: string) => {
      workbench.openDoc(taskId, { at: 'active' });
    },
    [workbench]
  );

  const handleDraggingChange = useCallback(
    (dragTask: ActiveDragTask | null) => {
      setActiveDragTask(prev => {
        if (
          prev?.taskId === dragTask?.taskId &&
          prev?.fromColumnId === dragTask?.fromColumnId
        ) {
          return prev;
        }
        return dragTask;
      });
    },
    []
  );

  const saveBoardsConfig = useCallback(
    (nextBoards: TaskTrackerBoard[]) => {
      if (nextBoards.length === 0) {
        return;
      }

      const firstBoard = nextBoards[0];
      workspacePropertyService.updatePropertyInfo(TASK_STATUS_PROPERTY, {
        additionalData: {
          ...trackerAdditionalData,
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
    [trackerAdditionalData, workspacePropertyService]
  );

  const handleCreateBoard = useCallback(() => {
    const boardFlow = createDefaultBoardFlow();
    const board: TaskTrackerBoard = {
      id: nanoid(),
      title: t('boardNumber', { number: boards.length + 1 }),
      flow: boardFlow,
      transitions: buildDefaultTransitions(boardFlow),
      typeTransitions: buildDefaultTypeTransitions(boardFlow),
    };

    const nextBoards = [...boards, board];
    saveBoardsConfig(nextBoards);
    setSelectedBoardId(board.id);
  }, [boards, saveBoardsConfig, t]);

  const handleDeleteBoard = useCallback(() => {
    if (!selectedBoard || boards.length <= 1) {
      return;
    }

    const nextBoards = boards.filter(board => board.id !== selectedBoard.id);
    const fallbackBoard = nextBoards[0];
    if (!fallbackBoard) {
      return;
    }

    saveBoardsConfig(nextBoards);

    tasks
      .filter(task => task.boardId === selectedBoard.id)
      .forEach(task => {
        const record = docsService.list.doc$(task.id).value;
        if (!record) {
          return;
        }
        record.setCustomProperty(TASK_BOARD_PROPERTY, fallbackBoard.id);
        record.setCustomProperty(
          TASK_STATUS_PROPERTY,
          fallbackBoard.flow[0]?.id ?? DEFAULT_FLOW[0].id
        );
      });

    setSelectedBoardId(fallbackBoard.id);
  }, [boards, docsService.list, saveBoardsConfig, selectedBoard, tasks]);

  const handleRenameBoard = useCallback(
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

      const nextBoards = boards.map(board =>
        board.id === boardId ? { ...board, title: nextTitle } : board
      );
      saveBoardsConfig(nextBoards);
    },
    [boards, saveBoardsConfig, t]
  );

  return (
    <>
      <ViewTitle title={t('title')} />
      <ViewIcon icon="collection" />
      <ViewHeader>
        <div className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.headerTitle}>{t('title')}</div>
          </div>
          <div className={styles.headerActions}>
            <Button
              variant="plain"
              onClick={() => {
                workspaceDialogService.open('setting', {
                  activeTab: 'workspace:task-tracker',
                });
              }}
            >
              {t('boardSettings')}
            </Button>
            <Button onClick={() => handleCreateTask()}>
              <PlusIcon />
              {t('newTask')}
            </Button>
          </div>
        </div>
      </ViewHeader>

      <ViewBody>
        <div className={styles.page}>
          <div className={styles.pageMeta}>
            {t('boardMeta', {
              tasks: selectedBoardTasks.length,
              stages: flow.length,
              boards: boards.length,
            })}
          </div>

          <div className={styles.boardToolbar}>
            <select
              className={styles.boardSelect}
              value={selectedBoard?.id ?? ''}
              onChange={event => {
                setSelectedBoardId(event.target.value);
              }}
            >
              {boards.map(board => (
                <option key={board.id} value={board.id}>
                  {localizeTaskTrackerBoardTitle(board, t)}
                </option>
              ))}
            </select>

            {selectedBoard ? (
              <input
                className={styles.boardNameInput}
                defaultValue={localizeTaskTrackerBoardTitle(selectedBoard, t)}
                key={`${selectedBoard.id}:${locale}`}
                onBlur={event => {
                  handleRenameBoard(selectedBoard.id, event.target.value);
                }}
              />
            ) : null}

            <Button variant="plain" onClick={handleCreateBoard}>
              <PlusIcon />
              {t('newBoard')}
            </Button>

            <Button
              variant="plain"
              disabled={boards.length <= 1}
              onClick={handleDeleteBoard}
            >
              <DeleteIcon />
              {t('deleteBoard')}
            </Button>
          </div>

          <div className={styles.toolbar}>
            <input
              className={styles.searchInput}
              value={searchQuery}
              onChange={event => {
                setSearchQuery(event.target.value);
              }}
              placeholder={t('searchPlaceholder')}
            />

            <select
              className={styles.select}
              value={priorityFilter}
              onChange={event => {
                const value = event.target.value;
                if (value === 'all') {
                  setPriorityFilter('all');
                  return;
                }
                setPriorityFilter(sanitizePriority(value));
              }}
            >
              <option value="all">{t('allPriorities')}</option>
              {PRIORITY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {t(option.value)}
                </option>
              ))}
            </select>

            <select
              className={styles.select}
              value={typeFilter}
              onChange={event => {
                const value = event.target.value;
                if (value === 'all') {
                  setTypeFilter('all');
                  return;
                }
                setTypeFilter(sanitizeTaskType(value));
              }}
            >
              <option value="all">{t('allTypes')}</option>
              {TASK_TYPE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {t(option.value)}
                </option>
              ))}
            </select>

            <select
              className={styles.select}
              value={assigneeFilter}
              onChange={event => {
                setAssigneeFilter(event.target.value);
              }}
            >
              <option value="all">{t('allAssignees')}</option>
              {assigneeOptions.map(assignee => (
                <option key={assignee} value={assignee}>
                  {assignee}
                </option>
              ))}
            </select>

            <select
              className={styles.select}
              value={labelFilter}
              onChange={event => {
                setLabelFilter(event.target.value);
              }}
            >
              <option value="all">{t('allLabels')}</option>
              {usedLabelIds.map(labelId => (
                <option key={labelId} value={labelId}>
                  {tagNameMap.get(labelId)}
                </option>
              ))}
            </select>

            <select
              className={styles.select}
              value={dueFilter}
              onChange={event => {
                setDueFilter(event.target.value as DueFilter);
              }}
            >
              <option value="all">{t('anyDueDate')}</option>
              <option value="overdue">{t('overdue')}</option>
              <option value="today">{t('today')}</option>
              <option value="next-7-days">{t('next7Days')}</option>
              <option value="no-date">{t('noDueDate')}</option>
            </select>
          </div>

          {hasActiveFilters ? (
            <div className={styles.filterHint}>{t('filtersDisableDrag')}</div>
          ) : null}

          <div
            className={clsx(styles.boardLayout, {
              [styles.boardLayoutSingle]: !selectedTask,
            })}
          >
            <div className={styles.boardScroller}>
              <div className={styles.board}>
                {flow.map(column => {
                  const columnTasks = tasksByColumn.get(column.id) ?? [];
                  const tone = getStatusTone(column);
                  const transitionAllowed =
                    !!activeDragTask &&
                    !hasActiveFilters &&
                    isTransitionAllowed(
                      activeDragTask.fromColumnId,
                      column.id,
                      activeDragTask.taskType
                    );
                  const transitionBlocked =
                    !!activeDragTask &&
                    (!transitionAllowed || hasActiveFilters);
                  const assignees = Array.from(
                    new Set(
                      columnTasks
                        .map(task => task.assignee.trim())
                        .filter(Boolean)
                    )
                  ).slice(0, 4);

                  return (
                    <section
                      className={clsx(styles.column, {
                        [styles.columnDropAllowed]: transitionAllowed,
                        [styles.columnDropBlocked]: transitionBlocked,
                      })}
                      key={column.id}
                    >
                      <header className={styles.columnHeader}>
                        <span
                          className={clsx(styles.columnTitle, {
                            [styles.statusTodo]: tone === 'todo',
                            [styles.statusInProgress]: tone === 'inprogress',
                            [styles.statusDone]: tone === 'done',
                          })}
                        >
                          {localizeTaskTrackerStageTitle(
                            column,
                            t
                          ).toLocaleUpperCase(locale)}
                        </span>
                        <span className={styles.columnCount}>
                          {columnTasks.length}
                        </span>
                        <div className={styles.columnAssignees}>
                          {assignees.map(assignee => (
                            <AssigneeAvatar
                              key={`${column.id}:${assignee}`}
                              assignee={assignee}
                              size="xs"
                            />
                          ))}
                        </div>
                      </header>

                      <TaskColumnDropTarget
                        columnId={column.id}
                        index={columnTasks.length}
                        hasActiveFilters={hasActiveFilters}
                        isTransitionAllowed={isTransitionAllowed}
                        onDropTask={handleDropTask}
                      >
                        {columnTasks.map((task, index) => {
                          return (
                            <div key={task.id} className={styles.taskWrapper}>
                              <TaskCardDropTarget
                                columnId={column.id}
                                index={index}
                                hasActiveFilters={hasActiveFilters}
                                isTransitionAllowed={isTransitionAllowed}
                                onDropTask={handleDropTask}
                              >
                                <TaskCardItem
                                  task={task}
                                  columnId={column.id}
                                  tagNameMap={tagNameMap}
                                  workspace={workspace}
                                  hasActiveFilters={hasActiveFilters}
                                  expanded={expandedTaskId === task.id}
                                  onToggleExpanded={taskId => {
                                    setExpandedTaskId(current =>
                                      current === taskId ? null : taskId
                                    );
                                  }}
                                  onOpenEditor={setSelectedTaskId}
                                  onOpenTaskDoc={handleOpenTaskDoc}
                                  onDeleteTask={handleDeleteTask}
                                  onDownloadAttachment={attachment => {
                                    handleDownloadAttachment(attachment).catch(
                                      () => {}
                                    );
                                  }}
                                  onDraggingChange={handleDraggingChange}
                                />
                              </TaskCardDropTarget>
                            </div>
                          );
                        })}

                        <TaskDropZone
                          columnId={column.id}
                          index={columnTasks.length}
                          expanded={transitionAllowed}
                          hasActiveFilters={hasActiveFilters}
                          isTransitionAllowed={isTransitionAllowed}
                          onDropTask={handleDropTask}
                        />
                      </TaskColumnDropTarget>
                    </section>
                  );
                })}
              </div>
            </div>

            {selectedTask ? (
              <TaskDetailPanel
                task={selectedTask}
                workspace={workspace}
                tagNameMap={tagNameMap}
                uploading={uploadingTaskId === selectedTask.id}
                onClose={() => {
                  setSelectedTaskId(null);
                }}
                onRenameTask={handleRenameTask}
                onOpenTaskDoc={handleOpenTaskDoc}
                onDeleteTask={handleDeleteTask}
                onTypeChange={handleTypeChange}
                onPriorityChange={handlePriorityChange}
                onAssigneeChange={handleAssigneeChange}
                onDueDateChange={handleDueDateChange}
                onLabelsChange={handleLabelsChange}
                onDescriptionChange={handleDescriptionChange}
                onExtraInfoChange={handleExtraInfoChange}
                onComplexityChange={handleComplexityChange}
                onSubtasksChange={handleSubtasksChange}
                onToggleSubtask={handleToggleSubtask}
                onUploadAttachments={(taskId, files) => {
                  handleUploadAttachments(taskId, files).catch(() => {});
                }}
                onDownloadAttachment={attachment => {
                  handleDownloadAttachment(attachment).catch(() => {});
                }}
              />
            ) : null}
          </div>
        </div>
      </ViewBody>
    </>
  );
};

export const Component = () => {
  return <TaskTrackerPage />;
};
