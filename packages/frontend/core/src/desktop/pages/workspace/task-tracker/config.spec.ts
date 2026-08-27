import { describe, expect, it } from 'vitest';

import {
  localizeTaskTrackerBoardTitle,
  localizeTaskTrackerStageTitle,
  type TaskTrackerTranslator,
} from '@affine/core/utils/task-tracker-i18n';

const ruLabels: Record<string, string> = {
  defaultBoard: 'Основная доска',
  defaultTodo: 'К выполнению',
  defaultInProgress: 'В работе',
  defaultDone: 'Готово',
};

const t: TaskTrackerTranslator = (key: string) => ruLabels[key] ?? key;

describe('task tracker default labels', () => {
  it('localizes system default stages', () => {
    expect(localizeTaskTrackerStageTitle({ id: 'todo', title: 'To Do' }, t)).toBe(
      'К выполнению'
    );
    expect(
      localizeTaskTrackerStageTitle({ id: 'in-progress', title: 'In Progress' }, t)
    ).toBe('В работе');
    expect(localizeTaskTrackerStageTitle({ id: 'done', title: 'Done' }, t)).toBe(
      'Готово'
    );
  });

  it('keeps renamed default stage titles', () => {
    expect(localizeTaskTrackerStageTitle({ id: 'todo', title: 'Очередь' }, t)).toBe(
      'Очередь'
    );
  });

  it('keeps custom stage titles', () => {
    expect(
      localizeTaskTrackerStageTitle({ id: 'custom-1', title: 'QA Testing' }, t)
    ).toBe('QA Testing');
  });

  it('localizes the default board', () => {
    expect(
      localizeTaskTrackerBoardTitle({ id: 'default', title: 'Main board' }, t)
    ).toBe('Основная доска');
  });

  it('keeps renamed and custom board titles', () => {
    expect(
      localizeTaskTrackerBoardTitle({ id: 'default', title: 'Release board' }, t)
    ).toBe('Release board');
    expect(
      localizeTaskTrackerBoardTitle({ id: 'board-2', title: 'Backend release' }, t)
    ).toBe('Backend release');
  });
});
