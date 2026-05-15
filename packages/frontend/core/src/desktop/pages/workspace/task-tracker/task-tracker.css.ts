import { cssVarV2 } from '@toeverything/theme/v2';
import { style } from '@vanilla-extract/css';

export const page = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  height: '100%',
  padding: '12px 20px 20px',
});

export const header = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'wrap',
  padding: '8px 20px 0',
});

export const headerTitle = style({
  fontSize: 20,
  fontWeight: 600,
  color: cssVarV2('text/primary'),
});

export const headerMeta = style({
  fontSize: 13,
  color: cssVarV2('text/secondary'),
});

export const headerMain = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
});

export const headerActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
});

export const boardToolbar = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(180px, 240px) minmax(220px, 1fr) auto auto',
  gap: 8,
  alignItems: 'center',
  '@media': {
    '(max-width: 1240px)': {
      gridTemplateColumns: '1fr 1fr',
    },
    '(max-width: 980px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

export const toolbar = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(260px, 1.2fr) repeat(5, minmax(140px, 1fr))',
  gap: 8,
  '@media': {
    '(max-width: 1440px)': {
      gridTemplateColumns: 'minmax(260px, 1fr) repeat(3, minmax(150px, 1fr))',
    },
    '(max-width: 1220px)': {
      gridTemplateColumns: 'minmax(260px, 1fr) repeat(2, minmax(150px, 1fr))',
    },
    '(max-width: 980px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

const inputBase = {
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 10,
  padding: '8px 10px',
  fontSize: 13,
  height: 36,
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
  outline: 'none',
  selectors: {
    '&:focus': {
      borderColor: cssVarV2('button/primary'),
    },
  },
} as const;

export const searchInput = style(inputBase);
export const input = style(inputBase);

export const select = style([
  inputBase,
  {
    paddingRight: 30,
  },
]);

export const boardSelect = style([
  inputBase,
  {
    minWidth: 220,
    paddingRight: 30,
  },
]);

export const boardNameInput = style([
  inputBase,
  {
    minWidth: 240,
  },
]);

export const columnComposer = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const filterHint = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  background: cssVarV2('layer/background/secondary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  padding: '6px 10px',
});

export const boardScroller = style({
  flex: 1,
  minHeight: 0,
  overflowX: 'auto',
  overflowY: 'hidden',
  paddingBottom: 8,
});

export const boardLayout = style({
  display: 'grid',
  gridTemplateColumns: '1fr minmax(360px, 420px)',
  gap: 12,
  minHeight: 0,
  flex: 1,
  '@media': {
    '(max-width: 1320px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

export const boardLayoutSingle = style({
  gridTemplateColumns: '1fr',
});

export const board = style({
  display: 'flex',
  gap: 12,
  minWidth: 'fit-content',
  height: '100%',
});

export const column = style({
  width: 360,
  minWidth: 360,
  maxWidth: 360,
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 10,
  background: cssVarV2('layer/background/secondary'),
  padding: 8,
  gap: 8,
  transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
});

export const columnDropAllowed = style({
  borderColor: '#4c9aff',
  boxShadow: 'inset 0 0 0 1px rgba(12, 102, 228, 0.2)',
});

export const columnDropBlocked = style({
  borderColor: '#f87168',
  boxShadow: 'inset 0 0 0 1px rgba(193, 44, 17, 0.2)',
});

export const columnHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 32,
});

export const columnTitleInput = style({
  flex: 1,
  border: 'none',
  background: 'transparent',
  color: cssVarV2('text/primary'),
  fontWeight: 600,
  fontSize: 15,
  outline: 'none',
  borderRadius: 8,
  padding: '2px 6px',
  selectors: {
    '&:focus': {
      background: cssVarV2('layer/background/primary'),
    },
  },
});

export const columnTitle = style({
  flex: '0 1 auto',
  color: cssVarV2('text/primary'),
  fontWeight: 700,
  fontSize: 12,
  lineHeight: 1.3,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  borderRadius: 999,
  padding: '4px 10px',
  letterSpacing: '0.02em',
  textTransform: 'uppercase',
  background: '#f1f2f4',
});

export const columnCount = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  borderRadius: 999,
  padding: '2px 8px',
  background: cssVarV2('layer/background/hoverOverlay'),
});

export const columnActions = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

export const smallButton = style({
  height: 28,
  fontSize: 12,
  padding: '0 8px',
});

export const tasks = style({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  borderRadius: 8,
  transition: 'background-color 0.12s ease',
});

export const taskWrapper = style({
  display: 'flex',
  flexDirection: 'column',
});

export const cardDropTarget = style({
  position: 'relative',
});

export const cardDropTop = style({
  selectors: {
    '&::before': {
      content: '""',
      position: 'absolute',
      left: 8,
      right: 8,
      top: -3,
      height: 3,
      borderRadius: 999,
      background: '#0c66e4',
      pointerEvents: 'none',
      zIndex: 1,
    },
  },
});

export const cardDropBottom = style({
  selectors: {
    '&::after': {
      content: '""',
      position: 'absolute',
      left: 8,
      right: 8,
      bottom: -3,
      height: 3,
      borderRadius: 999,
      background: '#0c66e4',
      pointerEvents: 'none',
      zIndex: 1,
    },
  },
});

export const dropZone = style({
  height: 8,
  borderRadius: 999,
  margin: '4px 0',
  transition: 'all 0.12s ease',
});

export const dropZoneActive = style({
  background: cssVarV2('button/primary'),
  height: 10,
});

export const dropZoneExpanded = style({
  minHeight: 64,
  flex: 1,
  border: `1px dashed ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 10,
  background: cssVarV2('layer/background/primary'),
  marginTop: 8,
});

export const task = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  background: cssVarV2('layer/background/primary'),
  padding: 12,
  cursor: 'pointer',
  boxShadow: '0 1px 2px rgba(9, 30, 66, 0.08)',
  transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
  selectors: {
    '&[data-dragging="true"]': {
      opacity: 0.45,
    },
    '&:hover': {
      boxShadow: '0 2px 6px rgba(9, 30, 66, 0.16)',
    },
  },
});

export const taskSelected = style({
  borderColor: '#0c66e4',
  boxShadow: '0 0 0 2px rgba(12, 102, 228, 0.24)',
});

export const taskHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
});

export const taskTitle = style({
  flex: 1,
  color: cssVarV2('text/primary'),
  fontSize: 14,
  fontWeight: 600,
  lineHeight: 1.4,
});

export const taskNumber = style({
  color: cssVarV2('text/secondary'),
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.02em',
});

export const taskTitleInput = style({
  flex: 1,
  border: 'none',
  background: 'transparent',
  color: cssVarV2('text/primary'),
  outline: 'none',
  fontSize: 14,
  fontWeight: 600,
  borderRadius: 6,
  padding: '2px 4px',
  selectors: {
    '&:focus': {
      background: cssVarV2('layer/background/secondary'),
    },
  },
});

export const iconButton = style({
  width: 24,
  height: 24,
  borderRadius: 6,
  border: 'none',
  background: 'transparent',
  color: cssVarV2('icon/secondary'),
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  selectors: {
    '&:hover': {
      background: cssVarV2('layer/background/hoverOverlay'),
      color: cssVarV2('icon/primary'),
    },
  },
});

export const textButton = style({
  border: 'none',
  background: 'transparent',
  color: cssVarV2('text/secondary'),
  fontSize: 12,
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: 6,
  selectors: {
    '&:hover': {
      background: cssVarV2('layer/background/hoverOverlay'),
      color: cssVarV2('text/primary'),
    },
  },
});

export const taskMetaRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
});

export const taskMetaBadge = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  fontSize: 11,
  color: '#44546f',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 999,
  padding: '2px 8px 3px',
  background: '#f1f2f4',
});

export const taskDescriptionPreview = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  lineHeight: 1.4,
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
});

export const taskTagsRow = style({
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
});

export const taskTag = style({
  fontSize: 11,
  color: '#172b4d',
  borderRadius: 6,
  padding: '2px 7px 3px',
  background: '#dfe1e6',
});

export const fieldGrid = style({
  display: 'grid',
  gridTemplateColumns: '84px 1fr',
  gap: '6px 8px',
  alignItems: 'start',
});

export const detailTaskNumber = style({
  alignSelf: 'center',
  color: cssVarV2('text/secondary'),
  fontSize: 13,
  fontWeight: 700,
  letterSpacing: '0.02em',
});

export const fieldLabel = style({
  color: cssVarV2('text/secondary'),
  fontSize: 12,
  lineHeight: '30px',
});

export const fieldInput = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
  fontSize: 12,
  height: 30,
  padding: '0 8px',
  outline: 'none',
  selectors: {
    '&:focus': {
      borderColor: cssVarV2('button/primary'),
    },
  },
});

export const fieldTextarea = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  background: cssVarV2('layer/background/primary'),
  color: cssVarV2('text/primary'),
  fontSize: 12,
  minHeight: 56,
  padding: '6px 8px',
  outline: 'none',
  resize: 'vertical',
  selectors: {
    '&:focus': {
      borderColor: cssVarV2('button/primary'),
    },
  },
});

export const attachmentsSection = style({
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  paddingTop: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
});

export const attachmentsHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});

export const attachmentsTitle = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  fontWeight: 500,
});

export const attachmentsActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
});

export const hiddenFileInput = style({
  display: 'none',
});

export const emptyAttachments = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
});

export const attachmentsList = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const attachmentPreviewStrip = style({
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
});

export const attachmentPreviewItem = style({
  width: 48,
  height: 48,
  borderRadius: 6,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  overflow: 'hidden',
  background: cssVarV2('layer/background/secondary'),
  padding: 0,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
});

export const attachmentPreviewLarge = style({
  width: 72,
  height: 72,
});

export const attachmentPreviewImage = style({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
});

export const attachmentPreviewText = style({
  fontSize: 10,
  color: cssVarV2('text/secondary'),
  padding: 4,
  textAlign: 'center',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  width: '100%',
});

export const attachmentPreviewMore = style({
  fontSize: 11,
  color: cssVarV2('text/secondary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  minWidth: 34,
  height: 34,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 6px',
});

export const attachmentRow = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  padding: '4px 6px',
});

export const attachmentName = style({
  flex: 1,
  textAlign: 'left',
  border: 'none',
  background: 'transparent',
  color: cssVarV2('text/primary'),
  fontSize: 12,
  cursor: 'pointer',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  selectors: {
    '&:hover': {
      textDecoration: 'underline',
    },
  },
});

export const detailPanel = style({
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 12,
  background: cssVarV2('layer/background/secondary'),
  padding: 12,
  minHeight: 0,
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  boxShadow: '0 1px 2px rgba(9, 30, 66, 0.08)',
});

export const detailHeader = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
});

export const detailTitleInput = style({
  flex: 1,
  border: 'none',
  background: 'transparent',
  color: cssVarV2('text/primary'),
  fontSize: 18,
  fontWeight: 700,
  outline: 'none',
  borderRadius: 8,
  padding: '6px 8px',
  selectors: {
    '&:focus': {
      background: cssVarV2('layer/background/primary'),
    },
  },
});

export const detailHeaderActions = style({
  display: 'flex',
  alignItems: 'center',
  gap: 4,
});

export const statusTodo = style({
  background: '#dfe1e6',
  color: '#44546f',
});

export const statusInProgress = style({
  background: '#deebff',
  color: '#0c66e4',
});

export const statusDone = style({
  background: '#dcfff1',
  color: '#216e4e',
});

export const columnAssignees = style({
  display: 'inline-flex',
  alignItems: 'center',
  marginLeft: 'auto',
  paddingRight: 2,
});

export const assigneeAvatar = style({
  width: 22,
  height: 22,
  borderRadius: '50%',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 10,
  fontWeight: 700,
  color: '#172b4d',
  border: `1px solid ${cssVarV2('layer/background/primary')}`,
  background: '#cce0ff',
  marginLeft: -6,
  selectors: {
    '&:first-child': {
      marginLeft: 0,
    },
  },
});

export const assigneeAvatarXs = style({
  width: 18,
  height: 18,
  fontSize: 9,
});

export const priorityBadge = style({
  borderColor: 'transparent',
  fontWeight: 600,
  letterSpacing: '0.02em',
});

export const priorityLow = style({
  background: '#f1f2f4',
  color: '#44546f',
});

export const priorityMedium = style({
  background: '#fff3e0',
  color: '#a54800',
});

export const priorityHigh = style({
  background: '#ffeceb',
  color: '#ae2a19',
});

export const priorityUrgent = style({
  background: '#ffd5d2',
  color: '#5d1f1a',
});

export const taskTypeBadge = style({
  borderColor: 'transparent',
  fontWeight: 600,
});

export const taskTypeStory = style({
  background: '#e3fcef',
  color: '#216e4e',
});

export const taskTypeBug = style({
  background: '#ffeceb',
  color: '#ae2a19',
});

export const taskTypeTask = style({
  background: '#deebff',
  color: '#0c66e4',
});

export const taskTypeEpic = style({
  background: '#f3f0ff',
  color: '#5e4db2',
});
