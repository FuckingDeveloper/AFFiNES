import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const stagesList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginBottom: 12,
});

export const boardControls = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 1fr) minmax(220px, 1.2fr) auto auto',
  gap: 8,
  alignItems: 'center',
  '@media': {
    '(max-width: 1120px)': {
      gridTemplateColumns: '1fr 1fr',
    },
    '(max-width: 760px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

export const stageRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const input = style({
  flex: 1,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  height: 36,
  padding: '0 10px',
  fontSize: 13,
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
  outline: 'none',
  selectors: {
    '&:focus': {
      borderColor: cssVarV2('button/primary'),
    },
  },
});

export const deleteButton = style({
  width: 36,
  height: 36,
});

export const transitionHint = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  marginBottom: 8,
});

export const transitionTypeRow = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 10,
});

export const transitionTypeLabel = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  minWidth: 60,
});

export const transitionTableScroller = style({
  overflowX: 'auto',
});

export const transitionTable = style({
  width: '100%',
  minWidth: 560,
  borderCollapse: 'separate',
  borderSpacing: 6,
});

const tableCellBase = {
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  minHeight: 34,
  height: 34,
  textAlign: 'center' as const,
  fontSize: 12,
  color: cssVarV2('text/primary'),
  padding: '6px 10px',
};

export const tableHeader = style([
  tableCellBase,
  {
    background: cssVarV2('layer/background/secondary'),
    fontWeight: 600,
  },
]);

export const tableHeaderSticky = style([
  tableCellBase,
  {
    background: cssVarV2('layer/background/secondary'),
    textAlign: 'left',
    position: 'sticky',
    left: 0,
    zIndex: 1,
    minWidth: 140,
  },
]);

export const tableCell = style([
  tableCellBase,
  {
    background: cssVarV2('layer/background/primary'),
    padding: 4,
  },
]);

export const transitionButton = style({
  width: '100%',
  height: 28,
  borderRadius: 6,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  background: cssVarV2('layer/background/secondary'),
  color: cssVarV2('text/secondary'),
  fontSize: 12,
  cursor: 'pointer',
  selectors: {
    '&[data-active="true"]': {
      background: '#deebff',
      borderColor: '#4c9aff',
      color: '#0c66e4',
      fontWeight: 600,
    },
    '&:disabled': {
      opacity: 0.6,
      cursor: 'default',
    },
  },
});

export const helperText = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  marginTop: 8,
});
