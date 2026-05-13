import { cssVar } from '@toeverything/theme';
import { globalStyle, style } from '@vanilla-extract/css';
export const profileInputWrapper = style({
  marginLeft: '20px',
});
globalStyle(`${profileInputWrapper} label`, {
  display: 'block',
  fontSize: cssVar('fontXs'),
  color: cssVar('textSecondaryColor'),
  marginBottom: '4px',
});
export const avatarWrapper = style({
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  position: 'relative',
  cursor: 'pointer',
  flexShrink: '0',
  selectors: {
    '&.disable': {
      cursor: 'default',
      pointerEvents: 'none',
    },
  },
});
globalStyle(`${avatarWrapper}:hover .camera-icon-wrapper`, {
  display: 'flex',
});
globalStyle(`${avatarWrapper} .camera-icon-wrapper`, {
  width: '56px',
  height: '56px',
  borderRadius: '50%',
  position: 'absolute',
  display: 'none',
  justifyContent: 'center',
  alignItems: 'center',
  backgroundColor: 'rgba(60, 61, 63, 0.5)',
  zIndex: '1',
  color: cssVar('white'),
  fontSize: cssVar('fontH4'),
});

export const successDeleteAccountContainer = style({
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  gap: '12px',
});
export const confirmContent = style({
  paddingLeft: '0',
  paddingRight: '0',
});
export const inputWrapper = style({
  marginTop: '12px',
});

export const twoFactorPanel = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: '16px',
  marginTop: '12px',
  flexWrap: 'wrap',
});

export const twoFactorQr = style({
  width: '140px',
  height: '140px',
  borderRadius: '8px',
  border: `1px solid ${cssVar('borderColor')}`,
  backgroundColor: cssVar('backgroundOverlayPanelColor'),
  overflow: 'hidden',
  flexShrink: 0,
});

export const twoFactorQrImg = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const twoFactorPanelContent = style({
  minWidth: '260px',
  maxWidth: '420px',
});

export const twoFactorPanelTitle = style({
  fontSize: cssVar('fontSm'),
  fontWeight: 600,
  marginBottom: '8px',
});

export const twoFactorSecret = style({
  fontFamily: 'monospace',
  fontSize: cssVar('fontXs'),
  padding: '8px 10px',
  borderRadius: '6px',
  border: `1px solid ${cssVar('borderColor')}`,
  backgroundColor: cssVar('backgroundOverlayPanelColor'),
  marginBottom: '10px',
  wordBreak: 'break-all',
});

export const twoFactorCodeInput = style({
  width: '180px',
  marginBottom: '10px',
});

export const twoFactorActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
});
