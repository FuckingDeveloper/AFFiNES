import { Button, notify, useDraggable, useDropTarget } from '@affine/component';
import { useMutation } from '@affine/core/components/hooks/use-mutation';
import { useQuery } from '@affine/core/components/hooks/use-query';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { DocsService } from '@affine/core/modules/doc';
import { DocsSearchService } from '@affine/core/modules/docs-search';
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
  allocateTrackWorkTaskMutation,
  createDevelopmentBranchMutation,
  createDevelopmentMergeRequestMutation,
  developmentIntegrationsQuery,
  setTrackWorkTaskDocumentLinksMutation,
  syncTrackWorkTasksMutation,
  trackWorkActivityQuery,
  trackWorkTaskDevelopmentQuery,
} from '@affine/graphql';
import {
  formatTaskKey,
  normalizeTaskKey,
  parseTaskKey,
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
import { createPortal } from 'react-dom';
import { Observable } from 'rxjs';

import { applyAutomationRules } from './automation';
import {
  buildDefaultTransitions,
  buildDefaultTypeTransitions,
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_TITLE,
  DEFAULT_FLOW,
  parseAttachments,
  parseHistoryEntries,
  parseRelatedDocs,
  parseSubtasks,
  parseTaskRelations,
  resolveTaskTrackerBoards,
  sanitizeAutomationRules,
  stringifyAttachments,
  stringifyHistoryEntries,
  stringifyRelatedDocs,
  stringifySubtasks,
  stringifyTaskRelations,
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
  TASK_RELATED_DOCS_PROPERTY,
  TASK_RELATIONS_PROPERTY,
  TASK_STATUS_PROPERTY,
  TASK_SUBTASKS_PROPERTY,
  TASK_TRACKER_FLAG_PROPERTY,
  TASK_TYPE_PROPERTY,
  buildTaskActivityEntry,
  shouldMaterializeTrackWorkSchema,
  type TaskActivityOperation,
  type TaskActivitySource,
  type TaskAttachment,
  type TaskComplexity,
  type TaskFlowColumn,
  type TaskHistoryEntry,
  type TaskRelations,
  type TaskSubtask,
  type TaskTrackerBoard,
  type TaskTrackerPropertyAdditionalData,
  type TaskType,
  wouldCreateTaskCycle,
} from './config';
import * as styles from './task-tracker.css';

import { AuthService, GraphQLService } from '@affine/core/modules/cloud';
import { GuardService } from '@affine/core/modules/permissions';
import {
  updateTrackWorkWorkflowConfig,
  useTrackWorkWorkflowConfig,
} from './workflow-config';

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
  relatedDocs: string[];
  relations: TaskRelations;
};

const resolveStoredTaskKey = (
  workspacePrefix: string,
  storedValue: string | undefined
): string => {
  if (storedValue && parseTaskKey(storedValue)) {
    return normalizeTaskKey(storedValue);
  }

  const number = parseTaskNumber(storedValue);
  return number > 0 ? formatTaskKey(workspacePrefix, number) : '';
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
  hasActiveFilters,
  onOpenPreview,
  onOpenEditor,
  onOpenTaskDoc,
  onDeleteTask,
  onDraggingChange,
}: {
  task: TaskCard;
  columnId: string;
  tagNameMap: Map<string, string>;
  hasActiveFilters: boolean;
  onOpenPreview: (taskId: string) => void;
  onOpenEditor: (taskId: string) => void;
  onOpenTaskDoc: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
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
      className={styles.task}
      data-dragging={dragging}
      data-testid={`task-card:${task.id}`}
      onClick={() => {
        onOpenPreview(task.id);
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
    </article>
  );
};

const TaskModal = ({
  children,
  onClose,
  label,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
}) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className={styles.taskModalOverlay}
      onMouseDown={event => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        className={styles.taskModalSurface}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body
  );
};

const TaskPreview = ({
  task,
  workspace,
  tagNameMap,
  onEdit,
  onClose,
  onOpenTaskDoc,
  onDownloadAttachment,
}: {
  task: TaskCard;
  workspace: WorkspaceService['workspace'] | null;
  tagNameMap: Map<string, string>;
  onEdit: () => void;
  onClose: () => void;
  onOpenTaskDoc: (taskId: string) => void;
  onDownloadAttachment: (attachment: TaskAttachment) => void;
}) => {
  const { t, locale } = useTaskTrackerI18n();
  const complexity = complexityMeta(task.complexity);
  const subtaskDoneCount = task.subtasks.filter(item => item.done).length;
  const labels = task.labelIds
    .map(labelId => tagNameMap.get(labelId) ?? '')
    .filter(Boolean);

  return (
    <div className={styles.expandedCardMain}>
      <header className={styles.expandedCardHeader}>
        <div className={styles.expandedCardTitleBlock}>
          <span className={styles.detailTaskNumber}>{task.number}</span>
          <h2 id="task-preview-title" className={styles.expandedTitleText}>
            {task.title || t('untitledTask')}
          </h2>
        </div>
        <div className={styles.expandedCardHeaderActions}>
          <Button variant="plain" onClick={onEdit}>
            {t('openEditor')}
          </Button>
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
            className={styles.modalCloseButton}
            aria-label={t('close')}
            title={t('close')}
            onClick={onClose}
          >
            ×
          </button>
        </div>
      </header>

      <div className={styles.expandedTopGrid}>
        <section className={styles.expandedOverviewCard}>
          <div className={styles.expandedOverviewHeader}>
            <span className={styles.sectionTitle}>{t('parameters')}</span>
            <div className={styles.expandedMetaPills}>
              {labels.map(label => (
                <span className={styles.taskTag} key={label}>
                  {label}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.expandedOverviewStats}>
            <div className={styles.expandedOverviewStat}>
              <span className={styles.expandedOverviewLabel}>{t('type')}</span>
              <span className={styles.expandedOverviewValue}>
                {t(task.type)}
              </span>
            </div>
            <div className={styles.expandedOverviewStat}>
              <span className={styles.expandedOverviewLabel}>
                {t('priority')}
              </span>
              <span className={styles.expandedOverviewValue}>
                {t(task.priority)}
              </span>
            </div>
            <div className={styles.expandedOverviewStat}>
              <span className={styles.expandedOverviewLabel}>
                {t('complexity')}
              </span>
              <span className={styles.expandedOverviewValue}>
                {t(complexity.value)}
              </span>
            </div>
            <div className={styles.expandedOverviewStat}>
              <span className={styles.expandedOverviewLabel}>
                {t('dueDate')}
              </span>
              <span className={styles.expandedOverviewValue}>
                {formatDueDateLabel(task.dueDate, locale, t('noDueDate'))}
              </span>
            </div>
          </div>
          <div className={styles.expandedDescriptionBlock}>
            <span className={styles.sectionTitle}>{t('description')}</span>
            <div className={styles.expandedReadOnlyText}>
              {task.description || t('noDescription')}
            </div>
          </div>
          {task.extraInfo ? (
            <div className={styles.expandedNotesBlock}>
              <span className={styles.sectionTitle}>{t('extraInfo')}</span>
              <div className={styles.expandedReadOnlyText}>
                {task.extraInfo}
              </div>
            </div>
          ) : null}
        </section>

        <section className={styles.expandedFieldsCard}>
          <div className={styles.expandedFieldsHeader}>
            <span className={styles.sectionTitle}>{t('parameters')}</span>
          </div>
          <div className={styles.expandedFieldGrid}>
            <span className={styles.editorFieldLabel}>{t('assignee')}</span>
            <span className={styles.expandedFieldValue}>
              {task.assignee || t('unassigned')}
            </span>
            <span className={styles.editorFieldLabel}>{t('subtasks')}</span>
            <span className={styles.expandedFieldValue}>
              {subtaskDoneCount}/{task.subtasks.length}
            </span>
            <span className={styles.editorFieldLabel}>{t('files')}</span>
            <span className={styles.expandedFieldValue}>
              {task.attachments.length}
            </span>
          </div>
        </section>
      </div>

      <div className={styles.expandedBottomGrid}>
        <section className={styles.expandedSectionCard}>
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
        </section>

        <section className={styles.expandedSectionCard}>
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
        </section>
      </div>
    </div>
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
  taskIds,
  allTasks,
  onSelectTask,
  onSetParent,
  onAddRelation,
  onRemoveRelation,
  onCreateSubtask,
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
  taskIds: string[];
  allTasks: TaskCard[];
  onSelectTask: (taskId: string) => void;
  onSetParent: (taskId: string, parentId: string | undefined) => void;
  onAddRelation: (
    taskId: string,
    kind: 'blockedBy' | 'relatesTo' | 'duplicates',
    targetId: string
  ) => void;
  onRemoveRelation: (
    taskId: string,
    kind: 'blockedBy' | 'relatesTo' | 'duplicates',
    targetId: string
  ) => void;
  onCreateSubtask: (parentId: string) => void;
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
  const [developmentRevision, setDevelopmentRevision] = useState(0);
  const labelsText = task.labelIds
    .map(labelId => tagNameMap.get(labelId) ?? '')
    .filter(Boolean)
    .join(', ');
  const subtasksText = task.subtasks.map(item => item.title).join('\n');

  return (
    <div className={styles.detailPanel}>
      <div className={styles.detailHeader}>
        <span className={styles.detailTaskNumber}>{task.number}</span>
        <input
          id="task-editor-title"
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
          <button
            type="button"
            className={styles.modalCloseButton}
            aria-label={t('close')}
            title={t('close')}
            onClick={onClose}
          >
            ×
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
              done: String(task.subtasks.filter(item => item.done).length),
              total: String(task.subtasks.length),
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
          <span className={styles.sectionTitle}>{t('subTasksTitle')}</span>
        </div>
        <TaskSubTasksSection
          task={task}
          allTasks={allTasks}
          onSelectTask={onSelectTask}
          onSetParent={onSetParent}
          onCreateSubtask={onCreateSubtask}
          t={t}
        />
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>{t('relationsTitle')}</span>
        </div>
        <TaskRelationsSection
          task={task}
          allTasks={allTasks}
          onSelectTask={onSelectTask}
          onAddRelation={onAddRelation}
          onRemoveRelation={onRemoveRelation}
          t={t}
        />
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>{t('linkedTasks')}</span>
        </div>
        <div className={styles.editorEmptyState}>{t('noLinkedTasks')}</div>
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>{t('developmentActions')}</span>
        </div>
        <TaskGitLabActionsSection
          taskKey={task.number}
          taskTitle={task.title}
          t={t}
          onCreated={() => {
            setDevelopmentRevision(value => value + 1);
          }}
        />
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>{t('development')}</span>
        </div>
        <TaskDevelopmentSection
          key={`${task.id}:${developmentRevision}`}
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
          <span className={styles.sectionTitle}>{t('relatedDocs')}</span>
        </div>
        <TaskRelatedDocsSection task={task} t={t} />
      </section>

      <section className={styles.editorSection}>
        <div className={styles.editorSectionHeader}>
          <span className={styles.sectionTitle}>{t('references')}</span>
        </div>
        <TaskReferencesSection
          taskKey={task.number}
          excludeDocIds={taskIds}
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
    </div>
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

const pipelineStatusLabel = (
  t: TaskTrackerTranslator,
  status: string
): string => {
  switch (status) {
    case 'success':
      return t('pipelineStatusSuccess');
    case 'failed':
      return t('pipelineStatusFailed');
    case 'unstable':
      return t('pipelineStatusUnstable');
    case 'running':
      return t('pipelineStatusRunning');
    case 'queued':
      return t('pipelineStatusQueued');
    case 'canceled':
      return t('pipelineStatusCanceled');
    case 'skipped':
      return t('pipelineStatusSkipped');
    default:
      return t('pipelineStatusUnknown');
  }
};

const mergeRequestStatusLabel = (
  t: TaskTrackerTranslator,
  status: string
): string => {
  switch (status) {
    case 'open':
      return t('mrStatusOpen');
    case 'merged':
      return t('mrStatusMerged');
    case 'closed':
      return t('mrStatusClosed');
    case 'draft':
      return t('mrStatusDraft');
    default:
      return t('mrStatusUnknown');
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
  const { data, isLoading, error, mutate } = useQuery({
    query: trackWorkTaskDevelopmentQuery,
    variables: { workspaceId, taskKey },
  });

  const development = data?.trackWorkTaskDevelopment;

  if (error) {
    return (
      <div className={styles.editorEmptyState}>
        {t('developmentError')}
        <Button variant="plain" onClick={() => void mutate()}>
          {t('developmentRetry')}
        </Button>
      </div>
    );
  }

  if (isLoading || !development || !workspaceId) {
    return (
      <div className={styles.editorEmptyState}>
        {isLoading ? t('loading') : null}
      </div>
    );
  }

  const isEmpty =
    development.repositories.length === 0 &&
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
      {development.repositories.length > 0 ? (
        <div className={styles.developmentGroup}>
          <span className={styles.developmentGroupTitle}>
            {t('developmentRepository')}
          </span>
          {development.repositories.map(repository => (
            <div key={repository} className={styles.developmentItem}>
              <span className={styles.developmentItemTitle}>{repository}</span>
            </div>
          ))}
        </div>
      ) : null}

      {development.branches.length > 0 ? (
        <div className={styles.developmentGroup}>
          <span className={styles.developmentGroupTitle}>
            {t('developmentBranches')}
          </span>
          {development.branches.map(branch => (
            <div key={branch.name} className={styles.developmentItem}>
              <a
                className={styles.developmentLink}
                href={branch.url}
                target="_blank"
                rel="noreferrer"
              >
                {branch.name}
              </a>
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
                {mergeRequestStatusLabel(t, mr.status)}
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
                {pipelineStatusLabel(t, pipeline.status)}
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
  const { locale } = useTaskTrackerI18n();
  const { data, isLoading, error, mutate } = useQuery({
    query: trackWorkActivityQuery,
    variables: { workspaceId, taskKey, first: 20 },
  });

  const items = data?.trackWorkActivity?.items;

  if (error) {
    return (
      <div className={styles.editorEmptyState}>
        {t('developmentActivityError')}
        <Button variant="plain" onClick={() => void mutate()}>
          {t('developmentRetry')}
        </Button>
      </div>
    );
  }

  if (isLoading || !items || !workspaceId) {
    return (
      <div className={styles.editorEmptyState}>
        {isLoading ? t('loading') : null}
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
          <span className={styles.developmentItemMeta}>
            {new Intl.DateTimeFormat(locale, {
              hour: '2-digit',
              minute: '2-digit',
            }).format(new Date(item.createdAt))}
          </span>
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

const TaskRelatedDocsSection = ({
  task,
  t,
}: {
  task: TaskCard;
  t: TaskTrackerTranslator;
}) => {
  const docsService = useService(DocsService);
  const docsSearch = useService(DocsSearchService);
  const workbench = useService(WorkbenchService).workbench;
  const workspace = useService(WorkspaceService).workspace;
  const authService = useService(AuthService);
  const account = useLiveData(authService.session.account$);
  const { trigger: setDocumentLinks } = useMutation({
    mutation: setTrackWorkTaskDocumentLinksMutation,
  });
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);

  const queryTrimmed = query.trim();

  const searchResults = useLiveData(
    useMemo(() => {
      if (!queryTrimmed) {
        return LiveData.from(new Observable<string[]>(() => {}), []);
      }

      return LiveData.from(
        docsSearch.searchTitle$(queryTrimmed),
        [] as string[]
      ).map(results =>
        results.filter(
          docId => docId !== task.id && !task.relatedDocs.includes(docId)
        )
      );
    }, [docsSearch, queryTrimmed, task.id, task.relatedDocs])
  );

  const updateDocumentLinks = useCallback(
    async (documentIds: string[]) => {
      const doc = docsService.list.doc$(task.id).value;
      if (!doc) {
        return;
      }

      try {
        const result = await setDocumentLinks({
          input: {
            workspaceId: workspace.id,
            taskDocId: task.id,
            documentIds,
          },
        });
        doc.setCustomProperty(
          TASK_RELATED_DOCS_PROPERTY,
          stringifyRelatedDocs(
            result.setTrackWorkTaskDocumentLinks.relatedDocumentIds
          )
        );
        const nextHistory = [
          buildTaskActivityEntry('edited', 'Updated related documents', {
            operation: 'task.related_documents_changed',
            actorId: account?.id,
            actorName: account?.label,
            taskKey: task.number,
          }),
          ...(task.history ?? []),
        ].slice(0, 30);
        doc.setCustomProperty(
          TASK_HISTORY_PROPERTY,
          stringifyHistoryEntries(nextHistory)
        );
      } catch {
        notify.error({ title: t('relatedDocsUpdateFailed') });
        return false;
      }
      return true;
    },
    [
      account?.id,
      account?.label,
      docsService.list,
      setDocumentLinks,
      t,
      task.history,
      task.id,
      task.number,
      workspace.id,
    ]
  );

  const handleAdd = useCallback(
    async (docId: string) => {
      const updated = await updateDocumentLinks([...task.relatedDocs, docId]);
      if (!updated) {
        return;
      }
      setQuery('');
      setAdding(false);
    },
    [task.relatedDocs, updateDocumentLinks]
  );

  const handleRemove = useCallback(
    async (docId: string) => {
      await updateDocumentLinks(task.relatedDocs.filter(id => id !== docId));
    },
    [task.relatedDocs, updateDocumentLinks]
  );

  return (
    <div>
      {task.relatedDocs.length > 0 ? (
        <div className={styles.developmentGroup}>
          {task.relatedDocs.map(docId => (
            <div key={docId} className={styles.developmentItem}>
              <RelatedDocTitle docId={docId} onOpen={workbench.openDoc} />
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  void handleRemove(docId);
                }}
              >
                {t('relatedDocsRemove')}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.editorEmptyState}>{t('relatedDocsEmpty')}</div>
      )}

      {adding ? (
        <div className={styles.developmentGroup}>
          <input
            className={styles.fieldInput}
            value={query}
            placeholder={t('relatedDocsSearchPlaceholder')}
            onChange={event => {
              setQuery(event.target.value);
            }}
          />
          {searchResults.map(docId => (
            <div key={docId} className={styles.developmentItem}>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  void handleAdd(docId);
                }}
              >
                <RelatedDocTitle docId={docId} onOpen={() => undefined} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <Button
        variant="plain"
        onClick={() => {
          setAdding(current => !current);
        }}
      >
        <PlusIcon />
        {t('relatedDocsAdd')}
      </Button>
    </div>
  );
};

const TaskReferencesSection = ({
  taskKey,
  excludeDocIds,
  t,
}: {
  taskKey: string;
  excludeDocIds: string[];
  t: TaskTrackerTranslator;
}) => {
  const docsSearch = useService(DocsSearchService);
  const workbench = useService(WorkbenchService).workbench;

  const results = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsSearch.search$(taskKey),
          [] as Array<{
            docId: string;
            title: string;
          }>
        ).map(items =>
          items.filter(item => !excludeDocIds.includes(item.docId))
        ),
      [docsSearch, excludeDocIds, taskKey]
    )
  );

  if (results.length === 0) {
    return (
      <div className={styles.editorEmptyState}>{t('referencesEmpty')}</div>
    );
  }

  return (
    <div className={styles.developmentGroup}>
      {results.slice(0, 10).map(item => (
        <div key={item.docId} className={styles.developmentItem}>
          <RelatedDocTitle docId={item.docId} onOpen={workbench.openDoc} />
        </div>
      ))}
    </div>
  );
};

const RelatedDocTitle = ({
  docId,
  onOpen,
}: {
  docId: string;
  onOpen: (docId: string) => void;
}) => {
  const { t } = useTaskTrackerI18n();
  const docsService = useService(DocsService);
  const doc = docsService.list.doc$(docId).value;
  const title = useLiveData(
    useMemo(
      () =>
        doc?.meta$?.map(meta => meta.title) ??
        LiveData.from(new Observable<string>(() => {}), t('untitledDocument')),
      [doc, t]
    )
  );

  return (
    <button
      type="button"
      className={styles.textButton}
      onClick={() => {
        onOpen(docId);
      }}
    >
      {title}
    </button>
  );
};

const TaskSubTasksSection = ({
  task,
  allTasks,
  onSelectTask,
  onSetParent,
  onCreateSubtask,
  t,
}: {
  task: TaskCard;
  allTasks: TaskCard[];
  onSelectTask: (taskId: string) => void;
  onSetParent: (taskId: string, parentId: string | undefined) => void;
  onCreateSubtask: (parentId: string) => void;
  t: TaskTrackerTranslator;
}) => {
  const [linking, setLinking] = useState(false);
  const [query, setQuery] = useState('');

  const children = allTasks.filter(item => item.relations.parentId === task.id);

  const candidates = query.trim()
    ? allTasks.filter(
        item =>
          item.id !== task.id &&
          item.relations.parentId !== task.id &&
          (item.title.toLowerCase().includes(query.trim().toLowerCase()) ||
            item.number.toLowerCase().includes(query.trim().toLowerCase()))
      )
    : [];

  return (
    <div>
      {children.length > 0 ? (
        <div className={styles.developmentGroup}>
          {children.map(child => (
            <div key={child.id} className={styles.developmentItem}>
              <span className={styles.developmentItemMeta}>{child.number}</span>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  onSelectTask(child.id);
                }}
              >
                {child.title || t('untitledTask')}
              </button>
              <button
                type="button"
                className={styles.textButton}
                onClick={() => {
                  onSetParent(child.id, undefined);
                }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.editorEmptyState}>{t('subTasksEmpty')}</div>
      )}

      <Button
        variant="plain"
        onClick={() => {
          onCreateSubtask(task.id);
        }}
      >
        <PlusIcon />
        {t('addSubtask')}
      </Button>

      <Button
        variant="plain"
        onClick={() => {
          setLinking(current => !current);
        }}
      >
        {t('linkTask')}
      </Button>

      {linking ? (
        <div className={styles.developmentGroup}>
          <input
            className={styles.fieldInput}
            value={query}
            placeholder={t('relationSearchPlaceholder')}
            onChange={event => {
              setQuery(event.target.value);
            }}
          />
          {candidates.length === 0 ? (
            <div className={styles.editorEmptyState}>
              {t('taskSearchEmpty')}
            </div>
          ) : (
            candidates.slice(0, 8).map(candidate => (
              <div key={candidate.id} className={styles.developmentItem}>
                <button
                  type="button"
                  className={styles.textButton}
                  onClick={() => {
                    onSetParent(candidate.id, task.id);
                    setLinking(false);
                    setQuery('');
                  }}
                >
                  {candidate.number} {candidate.title || t('untitledTask')}
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};

const TaskRelationsSection = ({
  task,
  allTasks,
  onSelectTask,
  onAddRelation,
  onRemoveRelation,
  t,
}: {
  task: TaskCard;
  allTasks: TaskCard[];
  onSelectTask: (taskId: string) => void;
  onAddRelation: (
    taskId: string,
    kind: 'blockedBy' | 'relatesTo' | 'duplicates',
    targetId: string
  ) => void;
  onRemoveRelation: (
    taskId: string,
    kind: 'blockedBy' | 'relatesTo' | 'duplicates',
    targetId: string
  ) => void;
  t: TaskTrackerTranslator;
}) => {
  type RelationKind = 'blockedBy' | 'blocks' | 'relatesTo' | 'duplicates';

  const [activeKind, setActiveKind] = useState<RelationKind>('blockedBy');
  const [linking, setLinking] = useState(false);
  const [query, setQuery] = useState('');

  const taskById = new Map(allTasks.map(item => [item.id, item]));
  const blockedTasks = allTasks.filter(item =>
    item.relations.blockedBy.includes(task.id)
  );
  const relationTaskIds: Record<RelationKind, string[]> = {
    blockedBy: task.relations.blockedBy,
    blocks: blockedTasks.map(item => item.id),
    relatesTo: task.relations.relatesTo,
    duplicates: task.relations.duplicates,
  };
  const activeTaskIds = relationTaskIds[activeKind];
  const relatedTaskIds = new Set(Object.values(relationTaskIds).flat());
  const normalizedQuery = query.trim().toLowerCase();

  const candidates = normalizedQuery
    ? allTasks.filter(
        item =>
          item.id !== task.id &&
          !relatedTaskIds.has(item.id) &&
          (item.title.toLowerCase().includes(normalizedQuery) ||
            item.number.toLowerCase().includes(normalizedQuery))
      )
    : [];

  const renderRelationRow = (taskId: string) => {
    const linked = taskById.get(taskId);
    if (!linked) {
      return null;
    }
    return (
      <div key={taskId} className={styles.relationItem}>
        <span className={styles.relationItemKey}>{linked.number}</span>
        <button
          type="button"
          className={styles.relationItemTitle}
          onClick={() => {
            onSelectTask(taskId);
          }}
        >
          {linked.title || t('untitledTask')}
        </button>
        <button
          type="button"
          className={styles.relationRemoveButton}
          aria-label={t('relatedDocsRemove')}
          title={t('relatedDocsRemove')}
          onClick={() => {
            if (activeKind === 'blocks') {
              onRemoveRelation(taskId, 'blockedBy', task.id);
            } else {
              onRemoveRelation(task.id, activeKind, taskId);
            }
          }}
        >
          ×
        </button>
      </div>
    );
  };

  const relationKinds: RelationKind[] = [
    'blockedBy',
    'blocks',
    'relatesTo',
    'duplicates',
  ];

  return (
    <div className={styles.relationsEditor}>
      <div className={styles.relationTabs} role="tablist">
        {relationKinds.map(kind => (
          <button
            key={kind}
            type="button"
            role="tab"
            aria-selected={activeKind === kind}
            className={clsx(styles.relationTab, {
              [styles.relationTabActive]: activeKind === kind,
            })}
            onClick={() => {
              setActiveKind(kind);
              setLinking(false);
              setQuery('');
            }}
          >
            <span>{t(kind)}</span>
            <span className={styles.relationTabCount}>
              {relationTaskIds[kind].length}
            </span>
          </button>
        ))}
      </div>

      <div className={styles.relationPanel} role="tabpanel">
        <div className={styles.relationPanelHeader}>
          <span className={styles.relationPanelTitle}>{t(activeKind)}</span>
          <Button
            variant="plain"
            onClick={() => {
              setLinking(current => !current);
              setQuery('');
            }}
          >
            <PlusIcon />
            {t('linkTask')}
          </Button>
        </div>

        {activeTaskIds.length === 0 ? (
          <div className={styles.relationEmptyState}>{t('noLinkedTasks')}</div>
        ) : (
          <div className={styles.relationList}>
            {activeTaskIds.map(renderRelationRow)}
          </div>
        )}

        {linking ? (
          <div className={styles.relationSearch}>
            <input
              autoFocus
              className={styles.relationSearchInput}
              value={query}
              placeholder={t('relationSearchPlaceholder')}
              onChange={event => {
                setQuery(event.target.value);
              }}
            />
            {normalizedQuery && candidates.length === 0 ? (
              <div className={styles.relationSearchEmpty}>
                {t('taskSearchEmpty')}
              </div>
            ) : null}
            {candidates.length > 0 ? (
              <div className={styles.relationCandidateList}>
                {candidates.slice(0, 8).map(candidate => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={styles.relationCandidate}
                    onClick={() => {
                      if (activeKind === 'blocks') {
                        onAddRelation(candidate.id, 'blockedBy', task.id);
                      } else {
                        onAddRelation(task.id, activeKind, candidate.id);
                      }
                      setLinking(false);
                      setQuery('');
                    }}
                  >
                    <span className={styles.relationItemKey}>
                      {candidate.number}
                    </span>
                    <span className={styles.relationCandidateTitle}>
                      {candidate.title || t('untitledTask')}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const makeBranchSlug = (title: string): string =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'task';

const TaskGitLabActionsSection = ({
  taskKey,
  taskTitle,
  t,
  onCreated,
}: {
  taskKey: string;
  taskTitle: string;
  t: TaskTrackerTranslator;
  onCreated: () => void;
}) => {
  const workspaceService = useService(WorkspaceService);
  const workspaceId = workspaceService.workspace.id;
  const [mode, setMode] = useState<'branch' | 'mr' | null>(null);
  const [repositoryId, setRepositoryId] = useState('');
  const [baseBranch, setBaseBranch] = useState('main');
  const [branchName, setBranchName] = useState('');
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('main');
  const [mrTitle, setMrTitle] = useState('');
  const [mrDescription, setMrDescription] = useState('');

  const { data } = useQuery({
    query: developmentIntegrationsQuery,
    variables: { workspaceId },
  });

  const gitlabConnection = data?.workspace?.developmentIntegrations?.find(
    item => item.provider === 'gitlab' && item.enabled
  );

  const repositories =
    gitlabConnection?.repositories.filter(repository => repository.enabled) ??
    [];

  const { trigger: branchTrigger } = useMutation({
    mutation: createDevelopmentBranchMutation,
  });
  const { trigger: mrTrigger } = useMutation({
    mutation: createDevelopmentMergeRequestMutation,
  });

  const slug = makeBranchSlug(taskTitle);
  const suggestedBranch = `feature/${taskKey}-${slug}`;

  const openBranchForm = () => {
    setMode('branch');
    setRepositoryId(repositories[0]?.externalId ?? '');
    setBaseBranch(repositories[0]?.defaultBranch ?? 'main');
    setBranchName(suggestedBranch);
  };

  const openMrForm = () => {
    setMode('mr');
    setRepositoryId(repositories[0]?.externalId ?? '');
    setTargetBranch(repositories[0]?.defaultBranch ?? 'main');
    setSourceBranch(suggestedBranch);
    setMrTitle(`${taskKey} ${taskTitle}`);
    setMrDescription(`TrackWork: ${taskKey}`);
  };

  const handleCreateBranch = async () => {
    if (!gitlabConnection || !repositoryId || !branchName) {
      return;
    }
    try {
      await branchTrigger({
        input: {
          connectionId: gitlabConnection.id,
          repositoryId,
          baseBranch,
          name: branchName,
          taskKey,
        },
      });
      notify.success({ title: t('branchCreated') });
      onCreated();
      setMode(null);
    } catch {
      notify.error({ title: t('createBranchFailed') });
    }
  };

  const handleCreateMr = async () => {
    if (
      !gitlabConnection ||
      !repositoryId ||
      !sourceBranch ||
      !targetBranch ||
      !mrTitle
    ) {
      return;
    }
    try {
      await mrTrigger({
        input: {
          connectionId: gitlabConnection.id,
          repositoryId,
          sourceBranch,
          targetBranch,
          title: mrTitle,
          description: mrDescription || undefined,
          taskKey,
        },
      });
      notify.success({ title: t('mrCreated') });
      onCreated();
      setMode(null);
    } catch {
      notify.error({ title: t('createMrFailed') });
    }
  };

  if (!gitlabConnection || repositories.length === 0) {
    return (
      <div className={styles.editorEmptyState}>
        {t('gitlabActionsUnavailable')}
      </div>
    );
  }

  return (
    <div>
      <div className={styles.row}>
        <Button variant="plain" onClick={openBranchForm}>
          {t('createBranch')}
        </Button>
        <Button variant="plain" onClick={openMrForm}>
          {t('createMr')}
        </Button>
      </div>

      {mode === 'branch' ? (
        <div className={styles.form}>
          <label className={styles.label}>
            {t('repository')}
            <select
              className={styles.gitlabInput}
              value={repositoryId}
              onChange={event => {
                setRepositoryId(event.target.value);
                const repository = repositories.find(
                  item => item.externalId === event.target.value
                );
                setBaseBranch(repository?.defaultBranch ?? 'main');
              }}
            >
              {repositories.map(repository => (
                <option
                  key={repository.externalId}
                  value={repository.externalId}
                >
                  {repository.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            {t('baseBranch')}
            <input
              className={styles.gitlabInput}
              value={baseBranch}
              onChange={event => {
                setBaseBranch(event.target.value);
              }}
            />
          </label>
          <label className={styles.label}>
            {t('branchName')}
            <input
              className={styles.gitlabInput}
              value={branchName}
              onChange={event => {
                setBranchName(event.target.value);
              }}
            />
          </label>
          <Button onClick={() => void handleCreateBranch()}>
            {t('createBranch')}
          </Button>
        </div>
      ) : null}

      {mode === 'mr' ? (
        <div className={styles.form}>
          <label className={styles.label}>
            {t('repository')}
            <select
              className={styles.gitlabInput}
              value={repositoryId}
              onChange={event => {
                setRepositoryId(event.target.value);
                const repository = repositories.find(
                  item => item.externalId === event.target.value
                );
                setTargetBranch(repository?.defaultBranch ?? 'main');
              }}
            >
              {repositories.map(repository => (
                <option
                  key={repository.externalId}
                  value={repository.externalId}
                >
                  {repository.fullName}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.label}>
            {t('sourceBranch')}
            <input
              className={styles.gitlabInput}
              value={sourceBranch}
              onChange={event => {
                setSourceBranch(event.target.value);
              }}
            />
          </label>
          <label className={styles.label}>
            {t('targetBranch')}
            <input
              className={styles.gitlabInput}
              value={targetBranch}
              onChange={event => {
                setTargetBranch(event.target.value);
              }}
            />
          </label>
          <label className={styles.label}>
            {t('mrTitle')}
            <input
              className={styles.gitlabInput}
              value={mrTitle}
              onChange={event => {
                setMrTitle(event.target.value);
              }}
            />
          </label>
          <label className={styles.label}>
            {t('mrDescription')}
            <input
              className={styles.gitlabInput}
              value={mrDescription}
              onChange={event => {
                setMrDescription(event.target.value);
              }}
            />
          </label>
          <Button onClick={() => void handleCreateMr()}>{t('createMr')}</Button>
        </div>
      ) : null}
    </div>
  );
};

const TaskTrackerPage = () => {
  const { t, locale } = useTaskTrackerI18n();
  const authService = useService(AuthService);
  const account = useLiveData(authService.session.account$);
  const graphql = useService(GraphQLService);
  const guardService = useService(GuardService);
  const canManageProperties = useLiveData(
    guardService.can$('Workspace_Properties_Update')
  );
  const canManageWorkflow = useLiveData(
    guardService.can$('Workspace_TrackWork_Workflow_Manage')
  );
  const docsService = useService(DocsService);
  const tagService = useService(TagService);
  const workbench = useService(WorkbenchService).workbench;
  const workspacePropertyService = useService(WorkspacePropertyService);
  const workspaceDialogService = useService(WorkspaceDialogService);
  const workspace = useService(WorkspaceService).workspace;
  const { trigger: allocateTrackWorkTask } = useMutation({
    mutation: allocateTrackWorkTaskMutation,
  });
  const { trigger: syncTrackWorkTasks } = useMutation({
    mutation: syncTrackWorkTasksMutation,
  });
  const lastRegistrySyncRef = useRef('');

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

  const relatedDocsValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_RELATED_DOCS_PROPERTY}`),
          new Map<string, string | undefined>()
        ),
      [docsService]
    )
  );

  const relationsValues = useLiveData(
    useMemo(
      () =>
        LiveData.from(
          docsService.propertyValues$(`custom:${TASK_RELATIONS_PROPERTY}`),
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
  const [taskModalMode, setTaskModalMode] = useState<'view' | 'edit' | null>(
    null
  );
  const [uploadingTaskId, setUploadingTaskId] = useState<string | null>(null);
  const [activeDragTask, setActiveDragTask] = useState<ActiveDragTask | null>(
    null
  );

  const initializedPropertiesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Provisioning of missing TrackWork property definitions is aligned with
    // the server boundary: only users who may update the workspace
    // custom-property schema (Workspace.Properties.Update) materialize rows.
    // While the permission is still loading, nothing is written and no keys
    // are marked, so a later transition to allowed re-runs provisioning.
    if (!shouldMaterializeTrackWorkSchema(canManageProperties)) {
      return;
    }

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
    canManageProperties,
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

  const workflowConfig = useTrackWorkWorkflowConfig(workspace.id);
  const trackerAdditionalData = useMemo(() => {
    const serverConfig = workflowConfig.data?.config as
      | TaskTrackerPropertyAdditionalData
      | undefined;
    if (serverConfig?.taskTrackerBoards) {
      return serverConfig;
    }
    return (
      (statusPropertyInfo?.additionalData as
        | TaskTrackerPropertyAdditionalData
        | undefined) ?? {}
    );
  }, [statusPropertyInfo, workflowConfig.data]);

  const boards = useMemo(
    () => resolveTaskTrackerBoards(trackerAdditionalData),
    [trackerAdditionalData]
  );

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
          number: resolveStoredTaskKey(
            workspaceTaskKey,
            numberValues.get(docId)
          ),
          relatedDocs: parseRelatedDocs(relatedDocsValues.get(docId)),
          relations: parseTaskRelations(relationsValues.get(docId)),
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
    relatedDocsValues,
    relationsValues,
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
    if (workspace.flavour === 'local' || tasks.length === 0) {
      return;
    }

    const registryTasks = tasks.map(task => ({
      docId: task.id,
      taskKey: task.number,
      relatedDocumentIds: task.relatedDocs,
    }));
    const signature = JSON.stringify(registryTasks);
    if (lastRegistrySyncRef.current === signature) {
      return;
    }
    lastRegistrySyncRef.current = signature;

    syncTrackWorkTasks({
      input: {
        workspaceId: workspace.id,
        prefix: workspaceTaskKey,
        tasks: registryTasks,
      },
    })
      .then(result => {
        for (const registered of result.syncTrackWorkTasks) {
          const doc = docsService.list.doc$(registered.docId).value;
          if (!doc) {
            continue;
          }
          if (
            doc.customProperty$(TASK_NUMBER_PROPERTY).value !==
            registered.taskKey
          ) {
            doc.setCustomProperty(TASK_NUMBER_PROPERTY, registered.taskKey);
          }
          const relatedDocuments = stringifyRelatedDocs(
            registered.relatedDocumentIds
          );
          if (
            doc.customProperty$(TASK_RELATED_DOCS_PROPERTY).value !==
            relatedDocuments
          ) {
            doc.setCustomProperty(TASK_RELATED_DOCS_PROPERTY, relatedDocuments);
          }
        }
      })
      .catch(() => {
        lastRegistrySyncRef.current = '';
        notify.error({ title: t('registrySyncFailed') });
      });
  }, [
    docsService.list,
    syncTrackWorkTasks,
    t,
    tasks,
    workspace.flavour,
    workspace.id,
    workspaceTaskKey,
  ]);

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
      setTaskModalMode(null);
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

  const makeHistoryEntry = useCallback(
    (
      type: TaskHistoryEntry['type'],
      message: string,
      operation: TaskActivityOperation,
      taskKey?: string,
      source: TaskActivitySource = 'user'
    ): TaskHistoryEntry =>
      buildTaskActivityEntry(type, message, {
        operation,
        actorId: source === 'user' ? account?.id : undefined,
        actorName: source === 'user' ? account?.label : undefined,
        taskKey,
        source,
      }),
    [account]
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
          makeHistoryEntry(
            'edited',
            `${t('automationStatusChanged')}: ${
              stage ? localizeTaskTrackerStageTitle(stage, t) : update.stageId
            }`,
            'task.status_changed',
            task.number,
            'automation'
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

  const handleCreateTask = useCallback(async () => {
    const targetColumn = flow[0];
    if (!targetColumn) {
      return;
    }

    if (workspace.flavour === 'local') {
      notify.error({ title: t('registryRequired') });
      return;
    }

    const nextOrder =
      (allTasksByColumn.get(targetColumn.id)?.length ?? 0) * 1000 + 1000;

    const doc = docsService.createDoc({
      primaryMode: 'page',
    });

    let taskKey: string;
    try {
      const result = await allocateTrackWorkTask({
        input: {
          workspaceId: workspace.id,
          docId: doc.id,
          prefix: workspaceTaskKey,
          relatedDocumentIds: [],
          legacyTasks: tasks.map(task => ({
            docId: task.id,
            taskKey: task.number,
            relatedDocumentIds: task.relatedDocs,
          })),
        },
      });
      taskKey = result.allocateTrackWorkTask.taskKey;
    } catch {
      doc.moveToTrash();
      notify.error({ title: t('createTaskFailed') });
      return;
    }

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
    doc.setCustomProperty(TASK_NUMBER_PROPERTY, taskKey);
    doc.setCustomProperty(TASK_DESCRIPTION_PROPERTY, '');
    doc.setCustomProperty(TASK_EXTRA_INFO_PROPERTY, '');
    doc.setCustomProperty(TASK_ATTACHMENTS_PROPERTY, '[]');
    doc.setCustomProperty(TASK_COMPLEXITY_PROPERTY, 'medium');
    doc.setCustomProperty(TASK_SUBTASKS_PROPERTY, '[]');
    doc.setCustomProperty(
      TASK_HISTORY_PROPERTY,
      stringifyHistoryEntries([
        makeHistoryEntry(
          'created',
          `Created in ${targetColumn.title}`,
          'task.created',
          taskKey
        ),
      ])
    );

    docsService.changeDocTitle(doc.id, t('newTask')).catch(() => {
      notify.error({ title: t('setTitleFailed') });
    });
    setSelectedTaskId(doc.id);
    setTaskModalMode('edit');
    return doc.id;
  }, [
    allocateTrackWorkTask,
    allTasksByColumn,
    docsService,
    flow,
    selectedBoard,
    t,
    tasks,
    workspace.flavour,
    workspace.id,
    workspaceTaskKey,
  ]);

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
        makeHistoryEntry(
          'edited',
          `Renamed task to “${nextTitle}”`,
          'task.renamed',
          task.number
        ),
        task.history
      );
    },
    [appendTaskHistory, docsService, t, tasks]
  );

  const handleDeleteTask = useCallback(
    (taskId: string) => {
      const doc = docsService.list.doc$(taskId).value;
      const task = tasks.find(item => item.id === taskId);
      appendTaskHistory(
        taskId,
        makeHistoryEntry(
          'edited',
          'Task moved to trash',
          'task.trashed',
          task?.number
        ),
        task?.history
      );
      doc?.moveToTrash();
      if (selectedTaskId === taskId) {
        setSelectedTaskId(null);
        setTaskModalMode(null);
      }
    },
    [
      appendTaskHistory,
      docsService.list,
      makeHistoryEntry,
      selectedTaskId,
      tasks,
    ]
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
        makeHistoryEntry(
          'edited',
          `Changed priority to ${priority}`,
          'task.priority_changed',
          task.number
        ),
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
        makeHistoryEntry(
          'edited',
          `Changed type to ${type}`,
          'task.type_changed',
          task.number
        ),
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
        makeHistoryEntry(
          'edited',
          nextAssignee ? `Assigned to ${nextAssignee}` : 'Cleared assignee',
          'task.assignee_changed',
          task.number
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
        makeHistoryEntry(
          'edited',
          dueDate ? `Set due date to ${dueDate}` : 'Cleared due date',
          'task.due_date_changed',
          task.number
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
          makeHistoryEntry(
            'edited',
            labelIds.length > 0
              ? `Updated tags: ${names.join(', ')}`
              : 'Cleared tags',
            'task.labels_changed',
            task.number
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
        makeHistoryEntry(
          'edited',
          'Updated description',
          'task.description_changed',
          task.number
        ),
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
        makeHistoryEntry(
          'edited',
          'Updated extra info',
          'task.extra_info_changed',
          task.number
        ),
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
        makeHistoryEntry(
          'edited',
          `Changed complexity from ${complexityMeta(task.complexity).label} to ${complexityMeta(complexity).label}`,
          'task.complexity_changed',
          task.number
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
        makeHistoryEntry(
          'edited',
          nextSubtasks.length > task.subtasks.length
            ? `Updated subtasks to ${nextSubtasks.length} items`
            : `Reworked subtasks list (${nextSubtasks.length} items)`,
          'task.subtasks_changed',
          task.number
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
        makeHistoryEntry(
          'edited',
          `${changed.done ? 'Completed' : 'Reopened'} subtask “${changed.title}”`,
          'task.subtask_toggled',
          task.number
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
        appendTaskHistory(
          taskId,
          makeHistoryEntry(
            'edited',
            'Reordered in column',
            'task.reordered',
            draggedTask?.number
          ),
          draggedTask?.history
        );
      } else {
        setTaskStatusAndOrder(resolvedFromColumnId, sourceIds);
        setTaskStatusAndOrder(toColumnId, targetIds);
        appendTaskHistory(
          taskId,
          makeHistoryEntry(
            'moved',
            `Moved from ${
              flow.find(column => column.id === resolvedFromColumnId)?.title ??
              resolvedFromColumnId
            } to ${flow.find(column => column.id === toColumnId)?.title ?? toColumnId}`,
            'task.status_changed',
            draggedTask?.number
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
        appendTaskHistory(
          taskId,
          makeHistoryEntry(
            'edited',
            `Uploaded ${files.length} attachment${files.length === 1 ? '' : 's'}`,
            'task.attachments_changed',
            currentTask.number
          ),
          currentTask.history
        );
      } catch {
        notify.error({ title: t('uploadFailed') });
      } finally {
        setUploadingTaskId(current => (current === taskId ? null : current));
      }
    },
    [appendTaskHistory, docsService.list, makeHistoryEntry, t, tasks, workspace]
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

      // Workflow management goes through the authoritative semantic mutation;
      // only the already-validated returned config is mirrored into the
      // legacy additionalData copy. No draft is mirrored before server
      // acceptance.
      updateTrackWorkWorkflowConfig(graphql, {
        workspaceId: workspace.id,
        expectedRevision: workflowConfig.data?.revision ?? 0,
        config: {
          taskTrackerBoards: nextBoards.map(board => ({
            id: board.id,
            title: board.title,
            flow: board.flow,
            transitions: board.transitions,
            typeTransitions: board.typeTransitions,
          })),
          taskTrackerAutomationRules:
            trackerAdditionalData.taskTrackerAutomationRules,
        },
      })
        .then(result => {
          const firstBoard = result.config.taskTrackerBoards?.[0];
          workspacePropertyService.updatePropertyInfo(TASK_STATUS_PROPERTY, {
            additionalData: {
              ...trackerAdditionalData,
              taskTrackerBoards: result.config.taskTrackerBoards,
              taskTrackerFlow: firstBoard?.flow,
              taskTrackerTransitions: firstBoard?.transitions,
              taskTrackerAutomationRules:
                result.config.taskTrackerAutomationRules,
            },
          });
        })
        .catch(error => {
          notify.error({
            title: error instanceof Error ? error.message : String(error),
          });
        });
    },
    [
      graphql,
      notify,
      trackerAdditionalData,
      workflowConfig.data,
      workspace.id,
      workspacePropertyService,
    ]
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

  const updateTaskRelations = useCallback(
    (taskId: string, updater: (relations: TaskRelations) => TaskRelations) => {
      const task = tasks.find(item => item.id === taskId);
      if (!task) {
        return;
      }
      const doc = docsService.list.doc$(taskId).value;
      if (!doc) {
        return;
      }
      doc.setCustomProperty(
        TASK_RELATIONS_PROPERTY,
        stringifyTaskRelations(updater(task.relations))
      );
      appendTaskHistory(
        taskId,
        makeHistoryEntry(
          'edited',
          'Updated task relations',
          'task.relation_changed',
          task.number
        ),
        task.history
      );
    },
    [appendTaskHistory, docsService.list, makeHistoryEntry, tasks]
  );

  const setTaskParent = useCallback(
    (taskId: string, parentId: string | undefined) => {
      if (taskId === parentId) {
        notify.error({ title: t('relationCyclicError') });
        return;
      }

      if (parentId) {
        const getParent = (id: string) =>
          tasks.find(item => item.id === id)?.relations.parentId;
        if (wouldCreateTaskCycle(taskId, parentId, getParent)) {
          notify.error({ title: t('relationCyclicError') });
          return;
        }
      }

      updateTaskRelations(taskId, relations => ({
        ...relations,
        parentId,
      }));
    },
    [t, tasks, updateTaskRelations]
  );

  const addTaskRelation = useCallback(
    (
      taskId: string,
      kind: 'blockedBy' | 'relatesTo' | 'duplicates',
      targetId: string
    ) => {
      if (taskId === targetId) {
        return;
      }
      updateTaskRelations(taskId, relations => ({
        ...relations,
        [kind]: [...new Set([...relations[kind], targetId])],
      }));
      if (kind === 'relatesTo' || kind === 'duplicates') {
        updateTaskRelations(targetId, relations => ({
          ...relations,
          [kind]: [...new Set([...relations[kind], taskId])],
        }));
      }
    },
    [updateTaskRelations]
  );

  const removeTaskRelation = useCallback(
    (
      taskId: string,
      kind: 'blockedBy' | 'relatesTo' | 'duplicates',
      targetId: string
    ) => {
      updateTaskRelations(taskId, relations => ({
        ...relations,
        [kind]: relations[kind].filter(id => id !== targetId),
      }));
      if (kind === 'relatesTo' || kind === 'duplicates') {
        updateTaskRelations(targetId, relations => ({
          ...relations,
          [kind]: relations[kind].filter(id => id !== taskId),
        }));
      }
    },
    [updateTaskRelations]
  );

  const handleCreateSubtask = useCallback(
    async (parentId: string) => {
      const newTaskId = await handleCreateTask();
      if (newTaskId) {
        setTaskParent(newTaskId, parentId);
      }
    },
    [handleCreateTask, setTaskParent]
  );

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
            <Button onClick={() => void handleCreateTask()}>
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

            {canManageWorkflow === true && selectedBoard ? (
              <input
                className={styles.boardNameInput}
                defaultValue={localizeTaskTrackerBoardTitle(selectedBoard, t)}
                key={`${selectedBoard.id}:${locale}`}
                onBlur={event => {
                  handleRenameBoard(selectedBoard.id, event.target.value);
                }}
              />
            ) : null}

            {canManageWorkflow === true ? (
              <Button variant="plain" onClick={handleCreateBoard}>
                <PlusIcon />
                {t('newBoard')}
              </Button>
            ) : null}

            {canManageWorkflow === true ? (
              <Button
                variant="plain"
                disabled={boards.length <= 1}
                onClick={handleDeleteBoard}
              >
                <DeleteIcon />
                {t('deleteBoard')}
              </Button>
            ) : null}
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

          <div className={styles.boardLayout}>
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
                                  hasActiveFilters={hasActiveFilters}
                                  onOpenPreview={taskId => {
                                    setSelectedTaskId(taskId);
                                    setTaskModalMode('view');
                                  }}
                                  onOpenEditor={taskId => {
                                    setSelectedTaskId(taskId);
                                    setTaskModalMode('edit');
                                  }}
                                  onOpenTaskDoc={handleOpenTaskDoc}
                                  onDeleteTask={handleDeleteTask}
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
          </div>

          {selectedTask && taskModalMode === 'view' ? (
            <TaskModal
              label={`${selectedTask.number} ${selectedTask.title || t('untitledTask')}`}
              onClose={() => {
                setSelectedTaskId(null);
                setTaskModalMode(null);
              }}
            >
              <TaskPreview
                task={selectedTask}
                workspace={workspace}
                tagNameMap={tagNameMap}
                onEdit={() => {
                  setTaskModalMode('edit');
                }}
                onClose={() => {
                  setSelectedTaskId(null);
                  setTaskModalMode(null);
                }}
                onOpenTaskDoc={handleOpenTaskDoc}
                onDownloadAttachment={attachment => {
                  handleDownloadAttachment(attachment).catch(() => {});
                }}
              />
            </TaskModal>
          ) : null}

          {selectedTask && taskModalMode === 'edit' ? (
            <TaskModal
              label={`${selectedTask.number} ${selectedTask.title || t('untitledTask')}`}
              onClose={() => {
                setSelectedTaskId(null);
                setTaskModalMode(null);
              }}
            >
              <TaskDetailPanel
                key={selectedTask.id}
                task={selectedTask}
                workspace={workspace}
                taskIds={tasks.map(task => task.id)}
                allTasks={tasks}
                onSelectTask={taskId => {
                  setSelectedTaskId(taskId);
                  setTaskModalMode('edit');
                }}
                onSetParent={setTaskParent}
                onAddRelation={addTaskRelation}
                onRemoveRelation={removeTaskRelation}
                onCreateSubtask={handleCreateSubtask}
                tagNameMap={tagNameMap}
                uploading={uploadingTaskId === selectedTask.id}
                onClose={() => {
                  setSelectedTaskId(null);
                  setTaskModalMode(null);
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
            </TaskModal>
          ) : null}
        </div>
      </ViewBody>
    </>
  );
};

export const Component = () => {
  return <TaskTrackerPage />;
};
