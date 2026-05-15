import { Button, notify, useDraggable, useDropTarget } from '@affine/component';
import { DocsService } from '@affine/core/modules/doc';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { TagService } from '@affine/core/modules/tag';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { WorkspaceService } from '@affine/core/modules/workspace';
import {
  ViewBody,
  ViewHeader,
  ViewIcon,
  ViewTitle,
  WorkbenchService,
} from '@affine/core/modules/workbench';
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

import {
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_TITLE,
  DEFAULT_FLOW,
  type TaskAttachment,
  TASK_ASSIGNEE_PROPERTY,
  TASK_ATTACHMENTS_PROPERTY,
  TASK_BOARD_PROPERTY,
  TASK_DESCRIPTION_PROPERTY,
  TASK_DUE_DATE_PROPERTY,
  TASK_EXTRA_INFO_PROPERTY,
  TASK_ORDER_PROPERTY,
  TASK_PRIORITY_PROPERTY,
  TASK_NUMBER_PROPERTY,
  TASK_STATUS_PROPERTY,
  TASK_TRACKER_FLAG_PROPERTY,
  TASK_TYPE_PROPERTY,
  type TaskType,
  type TaskTrackerBoard,
  type TaskFlowColumn,
  type TaskTrackerPropertyAdditionalData,
  buildDefaultTypeTransitions,
  buildDefaultTransitions,
  parseAttachments,
  resolveTaskTrackerBoards,
  stringifyAttachments,
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

const parseTaskNumber = (value: string | undefined): number => {
  const parsed = Number(value?.split('-').at(-1));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toIsoDate = (date: Date): string => {
  return date.toISOString().slice(0, 10);
};

const formatDueDateLabel = (date: string): string => {
  if (!date) {
    return 'No due date';
  }

  return date;
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
  return DEFAULT_FLOW.map(column => ({
    id: nanoid(),
    title: column.title,
  }));
};

const AssigneeAvatar = ({
  assignee,
  size = 'sm',
}: {
  assignee: string;
  size?: 'xs' | 'sm';
}) => {
  return (
    <span
      className={clsx(styles.assigneeAvatar, {
        [styles.assigneeAvatarXs]: size === 'xs',
      })}
      title={assignee || 'Unassigned'}
    >
      {getInitials(assignee || 'Unassigned')}
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

    void load();

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
  selected,
  onSelectTask,
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
  selected: boolean;
  onSelectTask: (taskId: string) => void;
  onOpenTaskDoc: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onDownloadAttachment: (attachment: TaskAttachment) => void;
  onDraggingChange: (dragTask: ActiveDragTask | null) => void;
}) => {
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
    [columnId, hasActiveFilters, task.id]
  );

  const labels = task.labelIds
    .map(labelId => tagNameMap.get(labelId) ?? '')
    .filter(Boolean);
  const priorityTone = getPriorityTone(task.priority);

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
        [styles.taskSelected]: selected,
      })}
      data-dragging={dragging}
      data-testid={`task-card:${task.id}`}
      onClick={() => {
        onSelectTask(task.id);
      }}
    >
      <div className={styles.taskHeader}>
        <span className={styles.taskNumber}>{task.number}</span>
        <div className={styles.taskTitle}>{task.title || 'Untitled task'}</div>

        <button
          type="button"
          className={styles.textButton}
          onClick={event => {
            event.stopPropagation();
            onSelectTask(task.id);
          }}
          aria-label="Open task details"
        >
          Details
        </button>

        <button
          type="button"
          className={styles.iconButton}
          onClick={event => {
            event.stopPropagation();
            onOpenTaskDoc(task.id);
          }}
          aria-label="Open task document"
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
          aria-label="Delete task"
        >
          <DeleteIcon />
        </button>
      </div>

      <div className={styles.taskMetaRow}>
        <span className={styles.taskMetaBadge}>
          <AssigneeAvatar assignee={task.assignee} size="xs" />
          {task.assignee || 'Unassigned'}
        </span>
        <span
          className={clsx(styles.taskMetaBadge, styles.taskTypeBadge, {
            [styles.taskTypeStory]: task.type === 'story',
            [styles.taskTypeBug]: task.type === 'bug',
            [styles.taskTypeTask]: task.type === 'task',
            [styles.taskTypeEpic]: task.type === 'epic',
          })}
        >
          {TASK_TYPE_OPTIONS.find(option => option.value === task.type)?.label}
        </span>
        <span
          className={clsx(styles.taskMetaBadge, styles.priorityBadge, {
            [styles.priorityLow]: priorityTone === 'low',
            [styles.priorityMedium]: priorityTone === 'medium',
            [styles.priorityHigh]: priorityTone === 'high',
            [styles.priorityUrgent]: priorityTone === 'urgent',
          })}
        >
          {task.priority.toUpperCase()}
        </span>
        <span className={styles.taskMetaBadge}>
          {formatDueDateLabel(task.dueDate)}
        </span>
      </div>

      {task.description ? (
        <div className={styles.taskDescriptionPreview}>{task.description}</div>
      ) : null}

      <div className={styles.taskTagsRow}>
        {labels.map(label => (
          <span className={styles.taskTag} key={label}>
            {label}
          </span>
        ))}
      </div>

      <div className={styles.attachmentsSection}>
        <div className={styles.attachmentsHeader}>
          <span className={styles.attachmentsTitle}>
            Files ({task.attachments.length})
          </span>
        </div>

        {task.attachments.length === 0 ? (
          <div className={styles.emptyAttachments}>No previews</div>
        ) : (
          <AttachmentPreviewStrip
            attachments={task.attachments}
            workspace={workspace}
            onOpenAttachment={onDownloadAttachment}
          />
        )}
      </div>
    </article>
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
  onUploadAttachments,
  onDownloadAttachment,
  onRemoveAttachment,
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
  onUploadAttachments: (taskId: string, files: FileList | null) => void;
  onDownloadAttachment: (attachment: TaskAttachment) => void;
  onRemoveAttachment: (taskId: string, attachmentId: string) => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const labelsText = task.labelIds
    .map(labelId => tagNameMap.get(labelId) ?? '')
    .filter(Boolean)
    .join(', ');

  const handleFilesChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onUploadAttachments(task.id, event.target.files);
      event.target.value = '';
    },
    [onUploadAttachments, task.id]
  );

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
            onClick={() => {
              onOpenTaskDoc(task.id);
            }}
          >
            <LinkIcon />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              onDeleteTask(task.id);
            }}
          >
            <DeleteIcon />
          </button>
          <button type="button" className={styles.textButton} onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className={styles.fieldGrid}>
        <label className={styles.fieldLabel}>Assignee</label>
        <input
          className={styles.fieldInput}
          defaultValue={task.assignee}
          placeholder="Name or @handle"
          onBlur={event => {
            onAssigneeChange(task.id, event.target.value);
          }}
        />

        <label className={styles.fieldLabel}>Type</label>
        <select
          className={styles.fieldInput}
          value={task.type}
          onChange={event => {
            onTypeChange(task.id, sanitizeTaskType(event.target.value));
          }}
        >
          {TASK_TYPE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className={styles.fieldLabel}>Priority</label>
        <select
          className={styles.fieldInput}
          value={task.priority}
          onChange={event => {
            onPriorityChange(task.id, sanitizePriority(event.target.value));
          }}
        >
          {PRIORITY_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <label className={styles.fieldLabel}>Due date</label>
        <input
          className={styles.fieldInput}
          type="date"
          value={task.dueDate}
          onChange={event => {
            onDueDateChange(task.id, event.target.value);
          }}
        />

        <label className={styles.fieldLabel}>Labels</label>
        <input
          className={styles.fieldInput}
          defaultValue={labelsText}
          placeholder="frontend, bug, api"
          onBlur={event => {
            onLabelsChange(task.id, event.target.value);
          }}
        />

        <label className={styles.fieldLabel}>Description</label>
        <textarea
          className={styles.fieldTextarea}
          defaultValue={task.description}
          placeholder="Task summary and expected result"
          onBlur={event => {
            onDescriptionChange(task.id, event.target.value);
          }}
        />

        <label className={styles.fieldLabel}>Extra info</label>
        <textarea
          className={styles.fieldTextarea}
          defaultValue={task.extraInfo}
          placeholder="Links, acceptance criteria, notes"
          onBlur={event => {
            onExtraInfoChange(task.id, event.target.value);
          }}
        />
      </div>

      <div className={styles.attachmentsSection}>
        <div className={styles.attachmentsHeader}>
          <span className={styles.attachmentsTitle}>
            Files ({task.attachments.length})
          </span>
          <div className={styles.attachmentsActions}>
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
              {uploading ? 'Uploading...' : 'Attach file'}
            </Button>
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
          <div className={styles.emptyAttachments}>No files attached</div>
        ) : (
          <div className={styles.attachmentsList}>
            {task.attachments.map(attachment => (
              <div key={attachment.id} className={styles.attachmentRow}>
                <button
                  type="button"
                  className={styles.attachmentName}
                  onClick={() => {
                    onDownloadAttachment(attachment);
                  }}
                >
                  {attachment.name}
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  onClick={() => {
                    onRemoveAttachment(task.id, attachment.id);
                  }}
                  aria-label="Remove attachment"
                >
                  <DeleteIcon />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
};

const TaskTrackerPage = () => {
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

  const workspaceTaskKey = useLiveData(workspace.taskKey$) || 'TASK';

  const docTitles = (useLiveData(
    useMemo(() => LiveData.from(docsService.allDocTitle$(), []), [docsService])
  ) ?? []) as DocTitleItem[];

  const nonTrashDocIds = (useLiveData(
    useMemo(
      () => LiveData.from(docsService.allNonTrashDocIds$(), []),
      [docsService]
    )
  ) ?? []) as string[];

  const docTagIds = (useLiveData(
    useMemo(
      () => LiveData.from(docsService.allDocsTagIds$(), []),
      [docsService]
    )
  ) ?? []) as DocTagItem[];

  const tagMetas = (useLiveData(tagService.tagList.tagMetas$) ??
    []) as TagMetaItem[];

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
  const [uploadingByTaskId, setUploadingByTaskId] = useState<
    Record<string, boolean>
  >({});
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
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
  }, [
    assigneePropertyInfo,
    attachmentsPropertyInfo,
    boardPropertyInfo,
    descriptionPropertyInfo,
    dueDatePropertyInfo,
    extraInfoPropertyInfo,
    numberPropertyInfo,
    orderPropertyInfo,
    priorityPropertyInfo,
    statusPropertyInfo,
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
          number: numberValues.get(docId) || `${workspaceTaskKey}-0`,
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
        };
      });
  }, [
    assigneeValues,
    attachmentValues,
    boardValues,
    descriptionValues,
    dueDateValues,
    extraInfoValues,
    flow,
    nonTrashDocIds,
    numberValues,
    orderValues,
    priorityValues,
    statusValues,
    typeValues,
    tagIdsMap,
    titleMap,
    trackerEnabledValues,
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
          .sort((a, b) => a.localeCompare(b))
      )
    );
  }, [selectedBoardTasks]);

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
    const search = searchQuery.trim().toLowerCase();

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
        .toLowerCase();

      const attachmentText = task.attachments
        .map(attachment => attachment.name)
        .join(' ')
        .toLowerCase();
      const typeText =
        TASK_TYPE_OPTIONS.find(
          option => option.value === task.type
        )?.label.toLowerCase() ?? '';

      return (
        task.number.toLowerCase().includes(search) ||
        task.title.toLowerCase().includes(search) ||
        task.assignee.toLowerCase().includes(search) ||
        labelText.includes(search) ||
        task.description.toLowerCase().includes(search) ||
        task.extraInfo.toLowerCase().includes(search) ||
        attachmentText.includes(search) ||
        typeText.includes(search)
      );
    });
  }, [
    assigneeFilter,
    dueFilter,
    isDueInFilter,
    labelFilter,
    priorityFilter,
    searchQuery,
    tagNameMap,
    selectedBoardTasks,
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
        return a.title.localeCompare(b.title);
      });
    });

    return grouped;
  }, [filteredTasks, flow]);

  const selectedTask = useMemo(
    () => selectedBoardTasks.find(task => task.id === selectedTaskId) ?? null,
    [selectedBoardTasks, selectedTaskId]
  );

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
        notify.error({ title: 'Transition is blocked by workflow rules.' });
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
      }
    },
    [
      allTasksByColumn,
      hasActiveFilters,
      isTransitionAllowed,
      setTaskStatusAndOrder,
      selectedBoardTasks,
    ]
  );

  const handleCreateTask = useCallback(() => {
    const targetColumn = flow[0];
    if (!targetColumn) {
      return;
    }

    const nextOrder =
      (allTasksByColumn.get(targetColumn.id)?.length ?? 0) * 1000 + 1000;
    const nextNumber =
      Math.max(0, ...tasks.map(task => parseTaskNumber(task.number))) + 1;
    const taskNumber = `${workspaceTaskKey}-${nextNumber}`;

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
    doc.setCustomProperty(TASK_NUMBER_PROPERTY, taskNumber);
    doc.setCustomProperty(TASK_DESCRIPTION_PROPERTY, '');
    doc.setCustomProperty(TASK_EXTRA_INFO_PROPERTY, '');
    doc.setCustomProperty(TASK_ATTACHMENTS_PROPERTY, '[]');

    void docsService.changeDocTitle(doc.id, 'New task');
    setSelectedTaskId(doc.id);
  }, [
    allTasksByColumn,
    docsService,
    flow,
    selectedBoard,
    tasks,
    workspaceTaskKey,
  ]);

  const handleRenameTask = useCallback(
    (taskId: string, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) {
        return;
      }

      void docsService.changeDocTitle(taskId, nextTitle);
    },
    [docsService]
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
      doc?.setCustomProperty(TASK_PRIORITY_PROPERTY, priority);
    },
    [docsService.list]
  );

  const handleTypeChange = useCallback(
    (taskId: string, type: TaskType) => {
      const doc = docsService.list.doc$(taskId).value;
      doc?.setCustomProperty(TASK_TYPE_PROPERTY, type);
    },
    [docsService.list]
  );

  const handleAssigneeChange = useCallback(
    (taskId: string, assignee: string) => {
      const doc = docsService.list.doc$(taskId).value;
      doc?.setCustomProperty(TASK_ASSIGNEE_PROPERTY, assignee.trim());
    },
    [docsService.list]
  );

  const handleDueDateChange = useCallback(
    (taskId: string, dueDate: string) => {
      const doc = docsService.list.doc$(taskId).value;
      doc?.setCustomProperty(TASK_DUE_DATE_PROPERTY, dueDate);
    },
    [docsService.list]
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
      doc?.setMeta({ tags: labelIds });
    },
    [docsService.list, tagByLowercaseName, tagService]
  );

  const handleDescriptionChange = useCallback(
    (taskId: string, value: string) => {
      const doc = docsService.list.doc$(taskId).value;
      doc?.setCustomProperty(TASK_DESCRIPTION_PROPERTY, value.trim());
    },
    [docsService.list]
  );

  const handleExtraInfoChange = useCallback(
    (taskId: string, value: string) => {
      const doc = docsService.list.doc$(taskId).value;
      doc?.setCustomProperty(TASK_EXTRA_INFO_PROPERTY, value.trim());
    },
    [docsService.list]
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

      setUploadingByTaskId(prev => ({
        ...prev,
        [taskId]: true,
      }));

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
        notify.error({ title: 'Failed to upload attachments' });
      } finally {
        setUploadingByTaskId(prev => ({
          ...prev,
          [taskId]: false,
        }));
      }
    },
    [docsService.list, tasks, workspace]
  );

  const handleDownloadAttachment = useCallback(
    async (attachment: TaskAttachment) => {
      if (!workspace) {
        return;
      }

      try {
        const record = await workspace.engine.blob.get(attachment.id);
        if (!record) {
          notify.error({ title: 'Attachment not found' });
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
        notify.error({ title: 'Failed to download attachment' });
      }
    },
    [workspace]
  );

  const handleRemoveAttachment = useCallback(
    (taskId: string, attachmentId: string) => {
      const task = tasks.find(item => item.id === taskId);
      if (!task) {
        return;
      }

      const next = task.attachments.filter(item => item.id !== attachmentId);
      const doc = docsService.list.doc$(taskId).value;
      doc?.setCustomProperty(
        TASK_ATTACHMENTS_PROPERTY,
        stringifyAttachments(next)
      );
    },
    [docsService.list, tasks]
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
      title: `Board ${boards.length + 1}`,
      flow: boardFlow,
      transitions: buildDefaultTransitions(boardFlow),
      typeTransitions: buildDefaultTypeTransitions(boardFlow),
    };

    const nextBoards = [...boards, board];
    saveBoardsConfig(nextBoards);
    setSelectedBoardId(board.id);
  }, [boards, saveBoardsConfig]);

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
      const nextTitle = title.trim();
      if (!nextTitle) {
        return;
      }

      const nextBoards = boards.map(board =>
        board.id === boardId ? { ...board, title: nextTitle } : board
      );
      saveBoardsConfig(nextBoards);
    },
    [boards, saveBoardsConfig]
  );

  return (
    <>
      <ViewTitle title="Task Tracker" />
      <ViewIcon icon="collection" />
      <ViewHeader>
        <div className={styles.header}>
          <div className={styles.headerMain}>
            <div className={styles.headerTitle}>Task Tracker</div>
            <div className={styles.headerMeta}>
              {selectedBoardTasks.length} tasks in board • {flow.length} stages
              {' • '}
              {boards.length} boards
            </div>
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
              Board settings
            </Button>
            <Button onClick={() => handleCreateTask()}>
              <PlusIcon />
              New task
            </Button>
          </div>
        </div>
      </ViewHeader>

      <ViewBody>
        <div className={styles.page}>
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
                  {board.title}
                </option>
              ))}
            </select>

            {selectedBoard ? (
              <input
                className={styles.boardNameInput}
                defaultValue={selectedBoard.title}
                key={selectedBoard.id}
                onBlur={event => {
                  handleRenameBoard(selectedBoard.id, event.target.value);
                }}
              />
            ) : null}

            <Button variant="plain" onClick={handleCreateBoard}>
              <PlusIcon />
              New board
            </Button>

            <Button
              variant="plain"
              disabled={boards.length <= 1}
              onClick={handleDeleteBoard}
            >
              <DeleteIcon />
              Delete board
            </Button>
          </div>

          <div className={styles.toolbar}>
            <input
              className={styles.searchInput}
              value={searchQuery}
              onChange={event => {
                setSearchQuery(event.target.value);
              }}
              placeholder="Search tasks, assignee, labels, description"
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
              <option value="all">All priorities</option>
              {PRIORITY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
              <option value="all">All types</option>
              {TASK_TYPE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
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
              <option value="all">All assignees</option>
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
              <option value="all">All labels</option>
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
              <option value="all">Any due date</option>
              <option value="overdue">Overdue</option>
              <option value="today">Today</option>
              <option value="next-7-days">Next 7 days</option>
              <option value="no-date">No due date</option>
            </select>
          </div>

          {hasActiveFilters ? (
            <div className={styles.filterHint}>
              Drag-and-drop is disabled while filters/search are active.
            </div>
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
                          {column.title.toUpperCase()}
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

                      <div className={styles.tasks}>
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
                                  selected={selectedTaskId === task.id}
                                  onSelectTask={setSelectedTaskId}
                                  onOpenTaskDoc={handleOpenTaskDoc}
                                  onDeleteTask={handleDeleteTask}
                                  onDownloadAttachment={
                                    handleDownloadAttachment
                                  }
                                  onDraggingChange={handleDraggingChange}
                                />
                              </TaskCardDropTarget>
                            </div>
                          );
                        })}

                        <TaskDropZone
                          columnId={column.id}
                          index={columnTasks.length}
                          expanded
                          hasActiveFilters={hasActiveFilters}
                          isTransitionAllowed={isTransitionAllowed}
                          onDropTask={handleDropTask}
                        />
                      </div>
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
                uploading={!!uploadingByTaskId[selectedTask.id]}
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
                onUploadAttachments={handleUploadAttachments}
                onDownloadAttachment={handleDownloadAttachment}
                onRemoveAttachment={handleRemoveAttachment}
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
