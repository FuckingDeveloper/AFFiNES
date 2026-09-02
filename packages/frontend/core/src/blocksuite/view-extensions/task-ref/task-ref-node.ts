import { ShadowlessElement } from '@blocksuite/affine/std';
import { css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('affine-task-ref')
export class AffineTaskRef extends ShadowlessElement {
  static override styles = css`
    .task-ref {
      color: var(--affine-link-color);
      cursor: pointer;
      text-decoration: none;
      border-bottom: 1px solid
        color-mix(in srgb, var(--affine-link-color) 40%, transparent);
    }
    .task-ref:hover {
      text-decoration: underline;
    }
  `;

  @property({ attribute: false })
  accessor key: string | undefined = undefined;

  @property({ attribute: false })
  accessor onClickHandler: (() => void) | undefined = undefined;

  override render() {
    return html`<span
      class="task-ref"
      @click=${(event: MouseEvent) => {
        event.stopPropagation();
        this.onClickHandler?.();
      }}
      >${this.key ?? ''}</span
    >`;
  }
}
