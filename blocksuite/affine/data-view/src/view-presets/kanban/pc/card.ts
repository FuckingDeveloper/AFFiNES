import { popupTargetFromElement } from '@blocksuite/affine-components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { CenterPeekIcon, MoreHorizontalIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { signal } from '@preact/signals-core';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { html } from 'lit/static-html.js';

import type { KanbanColumn } from '../kanban-view-manager.js';
import type { KanbanViewUILogic } from './kanban-view-ui-logic.js';
import { openDetail, popCardMenu } from './menu.js';

type FooterColumns = {
  icon?: KanbanColumn;
  priority?: KanbanColumn;
  issueKey?: KanbanColumn;
  assignee?: KanbanColumn;
};

const styles = css`
  affine-data-view-kanban-card {
    display: flex;
    position: relative;
    flex-direction: column;
    border: 1px solid ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
    box-shadow: 0px 1px 2px rgba(9, 30, 66, 0.1);
    border-radius: 6px;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
    background-color: var(--affine-background-primary-color);
  }

  affine-data-view-kanban-card:hover {
    border-color: ${unsafeCSS(cssVarV2.layer.insideBorder.primaryBorder)};
    box-shadow:
      0px 2px 6px rgba(9, 30, 66, 0.15),
      0px 0px 1px rgba(9, 30, 66, 0.2);
  }

  affine-data-view-kanban-card .card-header {
    padding: 12px 12px 6px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  affine-data-view-kanban-card .card-header-title uni-lit {
    width: 100%;
  }

  .card-header.has-divider {
    border-bottom: 1px solid ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
  }

  affine-data-view-kanban-card .card-header-title {
    font-size: var(--data-view-cell-text-size);
    line-height: calc(var(--data-view-cell-text-line-height) + 2px);
    font-weight: 500;
    color: var(--affine-text-primary-color);
  }

  affine-data-view-kanban-card .card-body {
    display: flex;
    flex-direction: column;
    padding: 4px 12px 12px;
    gap: 6px;
  }

  affine-data-view-kanban-card .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 2px 12px 12px;
  }

  .card-footer-left,
  .card-footer-right {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .card-footer-left {
    flex: 1;
  }

  .card-footer-right {
    flex-shrink: 0;
  }

  .card-footer-icon,
  .card-footer-priority,
  .card-footer-issue-key,
  .card-footer-assignee {
    min-width: 0;
  }

  .card-footer-icon {
    max-width: 28px;
  }

  .card-footer-priority {
    max-width: 92px;
  }

  .card-footer-issue-key {
    max-width: 90px;
    color: var(--affine-text-secondary-color);
    font-size: 12px;
    font-weight: 600;
  }

  .card-footer-assignee {
    max-width: 24px;
  }

  .card-footer-icon affine-data-view-kanban-cell,
  .card-footer-priority affine-data-view-kanban-cell,
  .card-footer-issue-key affine-data-view-kanban-cell,
  .card-footer-assignee affine-data-view-kanban-cell {
    padding: 0;
    min-height: 16px;
  }

  .card-footer-assignee affine-data-view-kanban-cell .kanban-cell {
    overflow: hidden;
  }

  affine-data-view-kanban-card:hover .card-ops {
    visibility: visible;
    opacity: 1;
  }
  affine-data-view-kanban-card:has(.active) .card-ops {
    visibility: visible;
    opacity: 1;
  }

  affine-data-view-kanban-card:has([data-editing='true']) .card-ops {
    visibility: hidden;
    opacity: 0;
  }

  .card-ops {
    position: absolute;
    right: 8px;
    top: 8px;
    visibility: hidden;
    opacity: 0;
    display: flex;
    gap: 4px;
    cursor: pointer;
    transition: opacity 120ms ease;
  }

  .card-op {
    display: flex;
    position: relative;
    padding: 4px;
    border-radius: 6px;
    border: 1px solid ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
    background-color: var(--affine-background-primary-color);
  }

  .card-op:hover:before {
    content: '';
    border-radius: 6px;
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    bottom: 0;
    background-color: var(--affine-hover-color);
  }

  .card-op svg {
    fill: var(--affine-icon-color);
    color: var(--affine-icon-color);
    width: 16px;
    height: 16px;
  }
`;

export class KanbanCard extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  private readonly clickEdit = (e: MouseEvent) => {
    e.stopPropagation();
    const selection = this.getSelection();
    if (selection) {
      openDetail(this.kanbanViewLogic, this.cardId, selection);
    }
  };

  private readonly clickMore = (e: MouseEvent) => {
    e.stopPropagation();
    const selection = this.getSelection();
    const ele = e.currentTarget as HTMLElement;
    if (selection) {
      selection.selection = {
        selectionType: 'card',
        cards: [
          {
            groupKey: this.groupKey,
            cardId: this.cardId,
          },
        ],
      };
      popCardMenu(
        this.kanbanViewLogic,
        popupTargetFromElement(ele),
        this.cardId,
        selection
      );
    }
  };

  private readonly contextMenu = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const selection = this.getSelection();
    if (selection) {
      selection.selection = {
        selectionType: 'card',
        cards: [
          {
            groupKey: this.groupKey,
            cardId: this.cardId,
          },
        ],
      };
      const target = e.target as HTMLElement;
      const ref = target.closest('affine-data-view-kanban-cell') ?? this;
      popCardMenu(
        this.kanbanViewLogic,
        popupTargetFromElement(ref),
        this.cardId,
        selection
      );
    }
  };

  private getSelection() {
    return this.kanbanViewLogic.selectionController;
  }

  private renderBody(columns: KanbanColumn[]) {
    if (columns.length === 0) {
      return '';
    }
    return html` <div class="card-body">
      ${repeat(
        columns,
        v => v.id,
        column => {
          if (this.view.isInHeader(column.id)) {
            return '';
          }
          return html` <affine-data-view-kanban-cell
            .contentOnly="${false}"
            data-column-id="${column.id}"
            .groupKey="${this.groupKey}"
            .column="${column}"
            .cardId="${this.cardId}"
            .kanbanViewLogic="${this.kanbanViewLogic}"
          ></affine-data-view-kanban-cell>`;
        }
      )}
    </div>`;
  }

  private normalizeColumnName(column: KanbanColumn) {
    return column.name$.value.trim().toLowerCase();
  }

  private findByName(
    columns: KanbanColumn[],
    keywords: string[],
    excludes: Set<string>
  ) {
    return columns.find(column => {
      if (excludes.has(column.id)) {
        return false;
      }
      const name = this.normalizeColumnName(column);
      return keywords.some(keyword => name.includes(keyword));
    });
  }

  private pickFooterColumns(columns: KanbanColumn[]): FooterColumns {
    const footer: FooterColumns = {
      icon: this.view.getHeaderIcon(this.cardId),
    };
    const excludes = new Set<string>();

    footer.assignee =
      columns.find(column => {
        return (
          column.type$.value === 'member' || column.type$.value === 'created-by'
        );
      }) ??
      this.findByName(
        columns,
        [
          'assignee',
          'owner',
          'member',
          'executor',
          'responsible',
          'исполн',
          'ответствен',
        ],
        excludes
      );
    if (footer.assignee) {
      excludes.add(footer.assignee.id);
    }

    footer.priority = this.findByName(
      columns,
      ['priority', 'prio', 'severity', 'приоритет'],
      excludes
    );
    if (footer.priority) {
      excludes.add(footer.priority.id);
    }

    footer.issueKey = this.findByName(
      columns,
      [
        'issue key',
        'ticket key',
        'ticket',
        'task id',
        'issue id',
        'ticket id',
        'номер',
        'код',
      ],
      excludes
    );

    return footer;
  }

  private renderHeader(columns: KanbanColumn[]) {
    if (!this.view.hasHeader(this.cardId)) {
      return '';
    }
    const classList = classMap({
      'card-header': true,
      'has-divider': columns.length > 0,
    });
    return html` <div class="${classList}">${this.renderTitle()}</div> `;
  }

  private renderFooterCell(
    column: KanbanColumn | undefined,
    className: string
  ) {
    if (!column) {
      return;
    }
    return html`<div class="${className}">
      <affine-data-view-kanban-cell
        .contentOnly="${true}"
        data-column-id="${column.id}"
        .kanbanViewLogic="${this.kanbanViewLogic}"
        .groupKey="${this.groupKey}"
        .column="${column}"
        .cardId="${this.cardId}"
      ></affine-data-view-kanban-cell>
    </div>`;
  }

  private renderFooter(columns: FooterColumns) {
    if (
      !columns.icon &&
      !columns.priority &&
      !columns.issueKey &&
      !columns.assignee
    ) {
      return;
    }
    return html` <div class="card-footer">
      <div class="card-footer-left">
        ${this.renderFooterCell(columns.icon, 'card-footer-icon')}
        ${this.renderFooterCell(columns.priority, 'card-footer-priority')}
      </div>
      <div class="card-footer-right">
        ${this.renderFooterCell(columns.issueKey, 'card-footer-issue-key')}
        ${this.renderFooterCell(columns.assignee, 'card-footer-assignee')}
      </div>
    </div>`;
  }

  private renderOps() {
    if (this.view.readonly$.value) {
      return;
    }
    return html`
      <div class="card-ops">
        <div class="card-op" @click="${this.clickEdit}">
          ${CenterPeekIcon()}
        </div>
        <div class="card-op" @click="${this.clickMore}">
          ${MoreHorizontalIcon()}
        </div>
      </div>
    `;
  }

  private renderTitle() {
    const title = this.view.getHeaderTitle(this.cardId);
    if (!title) {
      return;
    }
    return html` <div class="card-header-title">
      <affine-data-view-kanban-cell
        .contentOnly="${true}"
        data-column-id="${title.id}"
        .kanbanViewLogic="${this.kanbanViewLogic}"
        .groupKey="${this.groupKey}"
        .column="${title}"
        .cardId="${this.cardId}"
      ></affine-data-view-kanban-cell>
    </div>`;
  }

  override connectedCallback() {
    super.connectedCallback();
    if (this.view.readonly$.value) {
      return;
    }
    this._disposables.addFromEvent(this, 'contextmenu', e => {
      this.contextMenu(e);
    });
    this._disposables.addFromEvent(this, 'click', e => {
      if (e.shiftKey) {
        this.getSelection()?.shiftClickCard(e);
        return;
      }
      const selection = this.getSelection();
      const preSelection = selection?.selection;

      if (preSelection?.selectionType !== 'card') return;

      if (selection) {
        selection.selection = undefined;
      }
      this.kanbanViewLogic.root.openDetailPanel({
        view: this.view,
        rowId: this.cardId,
        onClose: () => {
          if (selection) {
            selection.selection = preSelection;
          }
        },
      });
    });
  }

  override render() {
    const columns = this.view.properties$.value.filter(
      v => !this.view.isInHeader(v.id)
    );
    const footerColumns = this.pickFooterColumns(columns);
    const footerIds = new Set(
      [footerColumns.priority, footerColumns.issueKey, footerColumns.assignee]
        .map(column => column?.id)
        .filter((id): id is string => !!id)
    );
    const bodyColumns = columns.filter(column => !footerIds.has(column.id));
    if (this.isFocus$.value) {
      this.style.border = '1px solid var(--affine-primary-color)';
      this.style.boxShadow =
        '0px 0px 0px 1px var(--affine-primary-color), 0px 2px 6px rgba(9, 30, 66, 0.15)';
    } else {
      this.style.border = '';
      this.style.boxShadow = '';
    }
    return html`
      ${this.renderHeader(bodyColumns)} ${this.renderBody(bodyColumns)}
      ${this.renderFooter(footerColumns)} ${this.renderOps()}
    `;
  }

  @property({ attribute: false })
  accessor cardId!: string;

  @property({ attribute: false })
  accessor groupKey!: string;

  isFocus$ = signal(false);

  @property({ attribute: false })
  accessor kanbanViewLogic!: KanbanViewUILogic;

  get view() {
    return this.kanbanViewLogic.view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-kanban-card': KanbanCard;
  }
}
