import { useTranslation } from '@affine/i18n';
import { useCallback, useMemo } from 'react';

const resources = {
  en: {
    title: 'Task Tracker',
    boardSettings: 'Board settings',
    newTask: 'New task',
    newBoard: 'New board',
    deleteBoard: 'Delete board',
    boards: 'Boards',
    stages: 'Stages',
    newStage: 'New stage',
    untitledStage: 'Untitled stage',
    addStage: 'Add stage',
    allowedTransitions: 'Allowed transitions',
    transitionHint:
      'Enable where tasks can be dragged from one stage to another.',
    taskType: 'Task type',
    fromTo: 'From \\ To',
    allowed: 'Allowed',
    blocked: 'Blocked',
    flowTitle: 'Task Tracker Flow',
    flowSubtitle: 'Configure boards, statuses, and allowed drag transitions.',
    initializeHint:
      'Open Task Tracker board once to initialize workflow properties.',
    defaultBoard: 'Main board',
    defaultTodo: 'To Do',
    defaultInProgress: 'In Progress',
    defaultDone: 'Done',
    boardNumber: 'Board {{number}}',
    boardMeta:
      '{{tasks}} tasks in board • {{stages}} stages • {{boards}} boards',
    searchPlaceholder: 'Search tasks, assignee, labels, description',
    allPriorities: 'All priorities',
    allTypes: 'All types',
    allAssignees: 'All assignees',
    allLabels: 'All labels',
    anyDueDate: 'Any due date',
    overdue: 'Overdue',
    today: 'Today',
    next7Days: 'Next 7 days',
    noDueDate: 'No due date',
    filtersDisableDrag:
      'Drag-and-drop is disabled while filters/search are active.',
    urgent: 'Urgent',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
    story: 'Story',
    bug: 'Bug',
    task: 'Task',
    epic: 'Epic',
    trivial: 'Trivial',
    easy: 'Easy',
    hard: 'Hard',
    extreme: 'Extreme',
    unassigned: 'Unassigned',
    untitledTask: 'Untitled task',
    openTaskEditor: 'Open task editor',
    openEditor: 'Open editor',
    openTaskDocument: 'Open task document',
    deleteTask: 'Delete task',
    complexity: 'Complexity',
    subtasks: 'Subtasks',
    files: 'Files',
    description: 'Description',
    noDescription: 'No description yet',
    completedCount: '{{done}}/{{total}} completed',
    noSubtasks: 'No subtasks yet',
    attachedCount: '{{count}} attached',
    noFiles: 'No files attached',
    uploading: 'Uploading...',
    attachFile: 'Attach file',
    close: 'Close',
    parameters: 'Parameters',
    assignee: 'Assignee',
    assigneePlaceholder: 'Name or @handle',
    type: 'Type',
    priority: 'Priority',
    dueDate: 'Due date',
    labels: 'Labels',
    labelsPlaceholder: 'frontend, bug, api',
    descriptionPlaceholder: 'Task summary and expected result',
    extraInfoPlaceholder: 'Links, acceptance criteria, notes',
    subtasksPlaceholder: 'One subtask per line',
    linkedTasks: 'Linked tasks',
    noLinkedTasks: 'No linked tasks yet',
    history: 'History',
    noHistory: 'No history yet',
    transitionBlocked: 'Transition is blocked by workflow rules.',
    uploadFailed: 'Failed to upload attachments',
    attachmentNotFound: 'Attachment not found',
    downloadFailed: 'Failed to download attachment',
    setTitleFailed: 'Failed to set task title',
    renameFailed: 'Failed to rename task',
    createdIn: 'Created in {{stage}}',
    renamedTo: 'Renamed task to “{{title}}”',
    changedPriority: 'Changed priority to {{priority}}',
    changedType: 'Changed type to {{type}}',
    assignedTo: 'Assigned to {{assignee}}',
    clearedAssignee: 'Cleared assignee',
    setDueDate: 'Set due date to {{date}}',
    clearedDueDate: 'Cleared due date',
    updatedTags: 'Updated tags: {{tags}}',
    clearedTags: 'Cleared tags',
    updatedDescription: 'Updated description',
    updatedExtraInfo: 'Updated extra info',
    changedComplexity: 'Changed complexity from {{from}} to {{to}}',
    updatedSubtasks: 'Updated subtasks to {{count}} items',
    reworkedSubtasks: 'Reworked subtasks list ({{count}} items)',
    completedSubtask: 'Completed subtask “{{title}}”',
    reopenedSubtask: 'Reopened subtask “{{title}}”',
    movedTask: 'Moved from {{from}} to {{to}}',
    workspaceTaskKey: 'Workspace task key',
    workspaceTaskKeyLabel: 'Workspace Task Key',
    workspaceTaskKeyInvalid: 'Workspace task key must contain 4 letters',
    workspaceTaskKeyUpdated: 'Update workspace task key success',
    development: 'Development',
    developmentEmpty: 'No development activity yet',
    developmentError: 'Failed to load development info',
    developmentRetry: 'Retry',
    developmentBranches: 'Branches',
    developmentMergeRequests: 'Merge Requests',
    developmentCommits: 'Commits',
    developmentPipelines: 'Pipelines',
    developmentRepository: 'Repository',
    developmentActivity: 'Activity',
    developmentActivityEmpty: 'No activity yet',
    developmentActivityError: 'Failed to load activity',
    activityCommitPushed: 'Commit pushed',
    activityBranchUpdated: 'Branch updated',
    activityMergeRequestOpened: 'Merge request opened',
    activityMergeRequestUpdated: 'Merge request updated',
    activityMergeRequestMerged: 'Merge request merged',
    activityPipelineSuccess: 'Pipeline succeeded',
    activityPipelineFailed: 'Pipeline failed',
    activityPipelineUnstable: 'Pipeline unstable',
    activityPipelineRunning: 'Pipeline running',
    activityPipelineQueued: 'Pipeline queued',
    activityPipelineCanceled: 'Pipeline canceled',
    activityPipelineSkipped: 'Pipeline skipped',
    activityPipelineUnknown: 'Pipeline status unknown',
    automationTitle: 'Automations',
    automationDesc:
      'Move tasks to a stage automatically when development events arrive.',
    automationAdd: 'Add rule',
    automationEventType: 'Event',
    automationAction: 'Action',
    automationTargetStage: 'Target stage',
    automationEnabled: 'Enabled',
    automationEmpty: 'No automation rules',
    automationStatusChanged: 'Status changed by automation',
    automationWarningTitle: 'Development event',
    actionSetStatus: 'Move to stage',
    actionWarning: 'Show warning',
    eventMergeRequestOpened: 'MR opened',
    eventMergeRequestUpdated: 'MR updated',
    eventMergeRequestMerged: 'MR merged',
    eventPipelineSuccess: 'Pipeline success',
    eventPipelineFailed: 'Pipeline failed',
    eventPipelineUnstable: 'Pipeline unstable',
    eventCommitPushed: 'Commit pushed',
    relatedDocs: 'Documents',
    relatedDocsEmpty: 'No related documents',
    relatedDocsAdd: 'Add document',
    relatedDocsSearchPlaceholder: 'Search documents',
    relatedDocsAdded: 'Document added',
    relatedDocsRemoved: 'Document removed',
    references: 'References',
    referencesEmpty: 'No documents reference this task',
    referencesSearching: 'Searching...',
    pipelineStatusSuccess: 'Success',
    pipelineStatusFailed: 'Failed',
    pipelineStatusUnstable: 'Unstable',
    pipelineStatusRunning: 'Running',
    pipelineStatusQueued: 'Queued',
    pipelineStatusCanceled: 'Canceled',
    pipelineStatusSkipped: 'Skipped',
    pipelineStatusUnknown: 'Unknown',
    mrStatusOpen: 'Open',
    mrStatusMerged: 'Merged',
    mrStatusClosed: 'Closed',
    mrStatusDraft: 'Draft',
    mrStatusUnknown: 'Unknown',
  },
  ru: {
    title: 'Трекер задач',
    boardSettings: 'Настройки доски',
    newTask: 'Новая задача',
    newBoard: 'Новая доска',
    deleteBoard: 'Удалить доску',
    boards: 'Доски',
    stages: 'Этапы',
    newStage: 'Новый этап',
    untitledStage: 'Без названия',
    addStage: 'Добавить этап',
    allowedTransitions: 'Разрешённые переходы',
    transitionHint: 'Укажите, между какими этапами можно перетаскивать задачи.',
    taskType: 'Тип задачи',
    fromTo: 'Из \\ В',
    allowed: 'Разрешён',
    blocked: 'Запрещён',
    flowTitle: 'Процесс трекера задач',
    flowSubtitle:
      'Настройте доски, статусы и разрешённые переходы при перетаскивании.',
    initializeHint:
      'Откройте доску трекера задач один раз, чтобы инициализировать свойства процесса.',
    defaultBoard: 'Основная доска',
    defaultTodo: 'К выполнению',
    defaultInProgress: 'В работе',
    defaultDone: 'Готово',
    boardNumber: 'Доска {{number}}',
    boardMeta:
      'Задач на доске: {{tasks}} • этапов: {{stages}} • досок: {{boards}}',
    searchPlaceholder: 'Поиск по задачам, исполнителям, меткам и описанию',
    allPriorities: 'Все приоритеты',
    allTypes: 'Все типы',
    allAssignees: 'Все исполнители',
    allLabels: 'Все метки',
    anyDueDate: 'Любой срок',
    overdue: 'Просрочено',
    today: 'Сегодня',
    next7Days: 'Следующие 7 дней',
    noDueDate: 'Без срока',
    filtersDisableDrag:
      'Перетаскивание отключено, пока активны фильтры или поиск.',
    urgent: 'Срочный',
    high: 'Высокий',
    medium: 'Средний',
    low: 'Низкий',
    story: 'История',
    bug: 'Ошибка',
    task: 'Задача',
    epic: 'Эпик',
    trivial: 'Тривиальная',
    easy: 'Лёгкая',
    hard: 'Сложная',
    extreme: 'Экстремальная',
    unassigned: 'Не назначен',
    untitledTask: 'Задача без названия',
    openTaskEditor: 'Открыть редактор задачи',
    openEditor: 'Редактировать',
    openTaskDocument: 'Открыть документ задачи',
    deleteTask: 'Удалить задачу',
    complexity: 'Сложность',
    subtasks: 'Подзадачи',
    files: 'Файлы',
    description: 'Описание',
    noDescription: 'Описание пока не добавлено',
    completedCount: 'Выполнено: {{done}}/{{total}}',
    noSubtasks: 'Подзадач пока нет',
    attachedCount: 'Прикреплено: {{count}}',
    noFiles: 'Файлы не прикреплены',
    uploading: 'Загрузка...',
    attachFile: 'Прикрепить файл',
    close: 'Закрыть',
    parameters: 'Параметры',
    assignee: 'Исполнитель',
    assigneePlaceholder: 'Имя или @пользователь',
    type: 'Тип',
    priority: 'Приоритет',
    dueDate: 'Срок',
    labels: 'Метки',
    labelsPlaceholder: 'frontend, ошибка, api',
    descriptionPlaceholder: 'Краткое описание задачи и ожидаемый результат',
    extraInfoPlaceholder: 'Ссылки, критерии приёмки, заметки',
    subtasksPlaceholder: 'Одна подзадача на строку',
    linkedTasks: 'Связанные задачи',
    noLinkedTasks: 'Связанных задач пока нет',
    history: 'История',
    noHistory: 'История пока пуста',
    transitionBlocked: 'Переход запрещён правилами процесса.',
    uploadFailed: 'Не удалось загрузить вложения',
    attachmentNotFound: 'Вложение не найдено',
    downloadFailed: 'Не удалось скачать вложение',
    setTitleFailed: 'Не удалось задать название задачи',
    renameFailed: 'Не удалось переименовать задачу',
    createdIn: 'Создано на этапе «{{stage}}»',
    renamedTo: 'Задача переименована в «{{title}}»',
    changedPriority: 'Приоритет изменён на «{{priority}}»',
    changedType: 'Тип изменён на «{{type}}»',
    assignedTo: 'Назначено: {{assignee}}',
    clearedAssignee: 'Исполнитель удалён',
    setDueDate: 'Срок установлен на {{date}}',
    clearedDueDate: 'Срок удалён',
    updatedTags: 'Метки обновлены: {{tags}}',
    clearedTags: 'Метки удалены',
    updatedDescription: 'Описание обновлено',
    updatedExtraInfo: 'Дополнительная информация обновлена',
    changedComplexity: 'Сложность изменена с «{{from}}» на «{{to}}»',
    updatedSubtasks: 'Подзадачи обновлены: {{count}}',
    reworkedSubtasks: 'Список подзадач изменён ({{count}})',
    completedSubtask: 'Подзадача «{{title}}» выполнена',
    reopenedSubtask: 'Подзадача «{{title}}» снова открыта',
    movedTask: 'Перемещено из «{{from}}» в «{{to}}»',
    workspaceTaskKey: 'Ключ задач рабочего пространства',
    workspaceTaskKeyLabel: 'Ключ задач рабочего пространства',
    workspaceTaskKeyInvalid:
      'Ключ задач рабочего пространства должен содержать 4 буквы',
    workspaceTaskKeyUpdated: 'Ключ задач рабочего пространства обновлён',
    development: 'Разработка',
    developmentEmpty: 'Активности разработки пока нет',
    developmentError: 'Не удалось загрузить данные разработки',
    developmentRetry: 'Повторить',
    developmentBranches: 'Ветки',
    developmentMergeRequests: 'Merge Request’ы',
    developmentCommits: 'Коммиты',
    developmentPipelines: 'Пайплайны',
    developmentRepository: 'Репозиторий',
    developmentActivity: 'Активность',
    developmentActivityEmpty: 'Активности пока нет',
    developmentActivityError: 'Не удалось загрузить активность',
    activityCommitPushed: 'Коммит запушен',
    activityBranchUpdated: 'Ветка обновлена',
    activityMergeRequestOpened: 'Merge request открыт',
    activityMergeRequestUpdated: 'Merge request обновлён',
    activityMergeRequestMerged: 'Merge request слит',
    activityPipelineSuccess: 'Пайплайн успешен',
    activityPipelineFailed: 'Пайплайн упал',
    activityPipelineUnstable: 'Пайплайн нестабилен',
    activityPipelineRunning: 'Пайплайн выполняется',
    activityPipelineQueued: 'Пайплайн в очереди',
    activityPipelineCanceled: 'Пайплайн отменён',
    activityPipelineSkipped: 'Пайплайн пропущен',
    activityPipelineUnknown: 'Статус пайплайна неизвестен',
    automationTitle: 'Автоматизации',
    automationDesc:
      'Автоматически перемещайте задачи на этап при событиях разработки.',
    automationAdd: 'Добавить правило',
    automationEventType: 'Событие',
    automationAction: 'Действие',
    automationTargetStage: 'Целевой этап',
    automationEnabled: 'Включено',
    automationEmpty: 'Нет правил автоматизации',
    automationStatusChanged: 'Статус изменён автоматически',
    automationWarningTitle: 'Событие разработки',
    actionSetStatus: 'Переместить на этап',
    actionWarning: 'Показать предупреждение',
    eventMergeRequestOpened: 'MR открыт',
    eventMergeRequestUpdated: 'MR обновлён',
    eventMergeRequestMerged: 'MR слит',
    eventPipelineSuccess: 'Пайплайн успешен',
    eventPipelineFailed: 'Пайплайн упал',
    eventPipelineUnstable: 'Пайплайн нестабилен',
    eventCommitPushed: 'Коммит запушен',
    relatedDocs: 'Документы',
    relatedDocsEmpty: 'Связанных документов нет',
    relatedDocsAdd: 'Добавить документ',
    relatedDocsSearchPlaceholder: 'Поиск документов',
    relatedDocsAdded: 'Документ добавлен',
    relatedDocsRemoved: 'Документ удалён',
    references: 'Ссылки',
    referencesEmpty: 'Ни один документ не ссылается на эту задачу',
    referencesSearching: 'Поиск...',
    pipelineStatusSuccess: 'Успешно',
    pipelineStatusFailed: 'Ошибка',
    pipelineStatusUnstable: 'Нестабильно',
    pipelineStatusRunning: 'Выполняется',
    pipelineStatusQueued: 'В очереди',
    pipelineStatusCanceled: 'Отменён',
    pipelineStatusSkipped: 'Пропущен',
    pipelineStatusUnknown: 'Неизвестно',
    mrStatusOpen: 'Открыт',
    mrStatusMerged: 'Слит',
    mrStatusClosed: 'Закрыт',
    mrStatusDraft: 'Черновик',
    mrStatusUnknown: 'Неизвестно',
  },
} as const;

export type TaskTrackerTranslationKey = keyof (typeof resources)['en'];
export type TaskTrackerTranslator = (
  key: TaskTrackerTranslationKey,
  vars?: Record<string, string | number>
) => string;
type Vars = Record<string, string | number>;

const renderTemplate = (template: string, vars?: Vars) => {
  if (!vars) {
    return template;
  }
  return template.replace(/{{(\w+)}}/g, (_, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key)
      ? String(vars[key])
      : `{{${key}}}`
  );
};

const localizeKnownStageName = (title: string, t: TaskTrackerTranslator) => {
  if (title === 'To Do') {
    return t('defaultTodo');
  }
  if (title === 'In Progress') {
    return t('defaultInProgress');
  }
  if (title === 'Done') {
    return t('defaultDone');
  }
  return title;
};

export const localizeTaskTrackerBoardTitle = (
  board: { id: string; title: string },
  t: TaskTrackerTranslator
) =>
  board.id === 'default' && board.title === 'Main board'
    ? t('defaultBoard')
    : board.title;

export const localizeTaskTrackerStageTitle = (
  stage: { id: string; title: string },
  t: TaskTrackerTranslator
) => {
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
};

export const localizeTaskTrackerHistory = (
  message: string,
  t: TaskTrackerTranslator
) => {
  let match = /^Created in (.+)$/.exec(message);
  if (match) {
    return t('createdIn', { stage: localizeKnownStageName(match[1], t) });
  }
  match = /^Renamed task to “(.+)”$/.exec(message);
  if (match) {
    return t('renamedTo', { title: match[1] });
  }
  match = /^Changed priority to (low|medium|high|urgent)$/.exec(message);
  if (match) {
    return t('changedPriority', {
      priority: t(match[1] as 'low' | 'medium' | 'high' | 'urgent'),
    });
  }
  match = /^Changed type to (story|bug|task|epic)$/.exec(message);
  if (match) {
    return t('changedType', {
      type: t(match[1] as 'story' | 'bug' | 'task' | 'epic'),
    });
  }
  match = /^Assigned to (.+)$/.exec(message);
  if (match) {
    return t('assignedTo', { assignee: match[1] });
  }
  if (message === 'Cleared assignee') {
    return t('clearedAssignee');
  }
  match = /^Set due date to (.+)$/.exec(message);
  if (match) {
    return t('setDueDate', { date: match[1] });
  }
  if (message === 'Cleared due date') {
    return t('clearedDueDate');
  }
  match = /^Updated tags: (.+)$/.exec(message);
  if (match) {
    return t('updatedTags', { tags: match[1] });
  }
  if (message === 'Cleared tags') {
    return t('clearedTags');
  }
  if (message === 'Updated description') {
    return t('updatedDescription');
  }
  if (message === 'Updated extra info') {
    return t('updatedExtraInfo');
  }
  match = /^Changed complexity from (.+) to (.+)$/.exec(message);
  if (match) {
    return t('changedComplexity', { from: match[1], to: match[2] });
  }
  match = /^Updated subtasks to (\d+) items$/.exec(message);
  if (match) {
    return t('updatedSubtasks', { count: match[1] });
  }
  match = /^Reworked subtasks list \((\d+) items\)$/.exec(message);
  if (match) {
    return t('reworkedSubtasks', { count: match[1] });
  }
  match = /^Completed subtask “(.+)”$/.exec(message);
  if (match) {
    return t('completedSubtask', { title: match[1] });
  }
  match = /^Reopened subtask “(.+)”$/.exec(message);
  if (match) {
    return t('reopenedSubtask', { title: match[1] });
  }
  match = /^Moved from (.+) to (.+)$/.exec(message);
  if (match) {
    return t('movedTask', {
      from: localizeKnownStageName(match[1], t),
      to: localizeKnownStageName(match[2], t),
    });
  }
  return message;
};

export const useTaskTrackerI18n = () => {
  const { i18n } = useTranslation('translation');
  const language = (
    i18n.resolvedLanguage ||
    i18n.language ||
    'en'
  ).toLowerCase();
  const dictionary = language.startsWith('ru') ? resources.ru : resources.en;
  const locale = language.startsWith('ru') ? 'ru-RU' : 'en-US';

  const t = useCallback<TaskTrackerTranslator>(
    (key, vars) => renderTemplate(dictionary[key], vars),
    [dictionary]
  );

  return useMemo(() => ({ t, locale }), [locale, t]);
};
