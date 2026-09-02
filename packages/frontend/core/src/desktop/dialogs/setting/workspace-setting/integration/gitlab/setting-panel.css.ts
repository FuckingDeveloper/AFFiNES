import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const form = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '12px 16px',
  borderRadius: 8,
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  background: cssVarV2.layer.background.primary,
});

export const formGrid = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
});

export const label = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  fontSize: 14,
  fontWeight: 500,
  lineHeight: '22px',
  color: cssVarV2.text.primary,
});

export const input = style({
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${cssVarV2.layer.insideBorder.border}`,
  background: cssVarV2.layer.background.tertiary,
  fontSize: 14,
  lineHeight: '22px',
  color: cssVarV2.text.primary,
});

export const row = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
});

export const value = style({
  fontSize: 14,
  lineHeight: '22px',
  color: cssVarV2.text.primary,
  overflowWrap: 'anywhere',
});

export const muted = style({
  fontSize: 13,
  lineHeight: '20px',
  color: cssVarV2.text.secondary,
});

export const ok = style({
  fontSize: 13,
  lineHeight: '20px',
  color: cssVarV2.text.link,
});

export const error = style({
  fontSize: 13,
  lineHeight: '20px',
  color: cssVar('errorColor'),
});

export const separator = style({
  height: 1,
  background: cssVarV2.layer.insideBorder.border,
});

export const toggleLabel = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  lineHeight: '20px',
  color: cssVarV2.text.primary,
});

export const repositoryList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '8px 12px',
  borderRadius: 8,
  background: cssVarV2.layer.background.tertiary,
});
