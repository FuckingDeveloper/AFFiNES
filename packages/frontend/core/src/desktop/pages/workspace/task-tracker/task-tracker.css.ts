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
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  flexWrap: 'nowrap',
  padding: '8px 20px 0',
  minWidth: 0,
});

export const headerTitle = style({
  fontSize: 20,
  fontWeight: 600,
  color: cssVarV2('text/primary'),
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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
  flexWrap: 'nowrap',
  flexShrink: 0,
});

export const pageMeta = style({
  fontSize: 13,
  color: cssVarV2('text/secondary'),
  padding: '0 2px',
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
  gridTemplateColumns: 'minmax(0, 1fr) minmax(420px, 520px)',
  gap: 16,
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
  minHeight: 560,
});

export const column = style({
  width: 360,
  minWidth: 360,
  maxWidth: 360,
  height: '100%',
  minHeight: 560,
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
  display: 'flex',
  flexDirection: 'column',
  gap: 0,
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  borderRadius: 8,
  transition: 'background-color 0.12s ease',
});

export const tasksDropActive = style({
  background: 'rgba(12, 102, 228, 0.06)',
  boxShadow: 'inset 0 0 0 1px rgba(12, 102, 228, 0.16)',
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
  minHeight: 96,
  flex: 1,
  border: `1px dashed ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 10,
  background: 'transparent',
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

export const taskHero = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: 12,
  borderRadius: 10,
  background:
    'linear-gradient(135deg, rgba(12,102,228,0.08) 0%, rgba(106,160,255,0.03) 100%)',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const taskHeroTopline = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
});

export const taskHeroTitleRow = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
});

export const taskHeaderActionsInline = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  flexShrink: 0,
});

export const taskComplexityBadge = style({
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: '#0c66e4',
  borderRadius: 999,
  padding: '4px 8px',
  background: 'rgba(12, 102, 228, 0.12)',
});

export const taskHeroSummary = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
});

export const taskSummaryMetric = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '8px 10px',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.8)',
});

export const taskSummaryLabel = style({
  fontSize: 10,
  color: cssVarV2('text/secondary'),
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
});

export const taskSummaryValue = style({
  fontSize: 12,
  fontWeight: 700,
  color: cssVarV2('text/primary'),
});

export const taskSelected = style({
  borderColor: '#0c66e4',
  boxShadow: '0 0 0 2px rgba(12, 102, 228, 0.24)',
});

export const taskExpanded = style({
  gap: 14,
  padding: 14,
  borderRadius: 14,
  boxShadow: '0 12px 36px rgba(9, 30, 66, 0.14)',
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

export const expandButton = style([
  textButton,
  {
    fontWeight: 600,
    color: '#0c66e4',
    background: 'rgba(12, 102, 228, 0.08)',
    padding: '4px 10px',
    selectors: {
      '&:hover': {
        background: 'rgba(12, 102, 228, 0.14)',
        color: '#0c66e4',
      },
    },
  },
]);

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

export const sectionTitle = style({
  fontSize: 11,
  fontWeight: 700,
  color: cssVarV2('text/secondary'),
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
});

export const taskTag = style({
  fontSize: 11,
  color: '#172b4d',
  borderRadius: 6,
  padding: '2px 7px 3px',
  background: '#dfe1e6',
});

export const subtasksSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
});

export const subtasksListCompact = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
});

export const subtaskCompactItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 12,
  color: cssVarV2('text/secondary'),
});

export const subtaskIndicator = style({
  width: 8,
  height: 8,
  borderRadius: '50%',
  background: '#c1c7d0',
  flexShrink: 0,
});

export const subtaskIndicatorDone = style({
  background: '#22a06b',
});

export const subtaskCompactTitle = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const subtasksOverflowText = style({
  fontSize: 11,
  color: cssVarV2('text/secondary'),
  paddingLeft: 16,
});

export const historySectionCompact = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
});

export const historyListCompact = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
});

export const historyItemCompact = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
});

export const historyContentCompact = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
});

export const historyMessage = style({
  fontSize: 12,
  color: cssVarV2('text/primary'),
  lineHeight: 1.35,
});

export const historyTime = style({
  fontSize: 11,
  color: cssVarV2('text/secondary'),
});

export const historyDot = style({
  width: 7,
  height: 7,
  borderRadius: '50%',
  background: '#0c66e4',
  marginTop: 5,
  flexShrink: 0,
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
  borderRadius: 18,
  background: 'rgba(255,255,255,0.96)',
  padding: 16,
  minHeight: 0,
  maxHeight: 'calc(100vh - 140px)',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  position: 'sticky',
  top: 12,
  boxShadow: '0 18px 48px rgba(9, 30, 66, 0.14)',
});

export const editorSection = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 16,
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(247,248,252,0.98) 100%)',
  padding: 14,
});

export const editorSectionHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
});

export const editorFieldGrid = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(92px, 0.36fr) minmax(0, 1fr)',
  gap: '10px 12px',
  alignItems: 'center',
});

export const editorFieldLabel = style({
  color: cssVarV2('text/secondary'),
  fontSize: 12,
  fontWeight: 600,
});

export const editorTextArea = style([
  fieldTextarea,
  {
    minHeight: 92,
    padding: '10px 12px',
    lineHeight: 1.45,
    background: cssVarV2('layer/background/primary'),
  },
]);

export const editorTextAreaLarge = style([
  fieldTextarea,
  {
    minHeight: 132,
    padding: '12px 14px',
    lineHeight: 1.5,
    background: cssVarV2('layer/background/primary'),
  },
]);

export const editorEmptyState = style({
  border: `1px dashed ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 12,
  padding: '14px 16px',
  color: cssVarV2('text/secondary'),
  fontSize: 12,
  background: 'rgba(9, 30, 66, 0.03)',
});

export const expandedCardSurface = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  borderTop: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  paddingTop: 14,
});

export const expandedCardMain = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
});

export const expandedCardHeader = style({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 12,
});

export const expandedCardTitleBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  minWidth: 0,
  flex: 1,
});

export const expandedTitleInput = style({
  border: 'none',
  background: 'transparent',
  color: cssVarV2('text/primary'),
  fontSize: 20,
  lineHeight: 1.25,
  fontWeight: 700,
  outline: 'none',
  padding: 0,
  borderRadius: 8,
  selectors: {
    '&:focus': {
      background: cssVarV2('layer/background/secondary'),
      padding: '6px 8px',
      margin: '-6px -8px',
    },
  },
});

export const expandedTitleText = style({
  color: cssVarV2('text/primary'),
  fontSize: 20,
  lineHeight: 1.25,
  fontWeight: 700,
});

export const expandedCardHeaderActions = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  flexShrink: 0,
});

export const expandedTopGrid = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.2fr) minmax(280px, 0.8fr)',
  gap: 14,
  '@media': {
    '(max-width: 1100px)': {
      gridTemplateColumns: '1fr',
    },
  },
});

export const expandedTopGridSingle = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 14,
});

export const expandedOverviewCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  borderRadius: 16,
  padding: 16,
  background:
    'linear-gradient(180deg, rgba(255,255,255,0.96) 0%, rgba(246,248,252,0.96) 100%)',
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const expandedOverviewHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
});

export const expandedMetaPills = style({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  flexWrap: 'wrap',
});

export const expandedOverviewStats = style({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: 8,
  '@media': {
    '(max-width: 860px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
});

export const expandedOverviewStat = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '12px 12px 10px',
  borderRadius: 12,
  background: 'rgba(9, 30, 66, 0.04)',
});

export const expandedOverviewLabel = style({
  fontSize: 11,
  fontWeight: 600,
  color: cssVarV2('text/secondary'),
  letterSpacing: '0.03em',
  textTransform: 'uppercase',
});

export const expandedOverviewValue = style({
  fontSize: 14,
  fontWeight: 700,
  color: cssVarV2('text/primary'),
});

export const expandedDescriptionBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const expandedDescriptionTextarea = style([
  fieldTextarea,
  {
    minHeight: 104,
    fontSize: 13,
    lineHeight: 1.5,
    padding: '10px 12px',
  },
]);

export const expandedNotesBlock = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const expandedNotesTextarea = style([
  fieldTextarea,
  {
    minHeight: 88,
    fontSize: 13,
    lineHeight: 1.5,
    padding: '10px 12px',
  },
]);

export const expandedReadOnlyText = style({
  fontSize: 13,
  lineHeight: 1.55,
  color: cssVarV2('text/primary'),
  borderRadius: 12,
  background: 'rgba(9, 30, 66, 0.04)',
  padding: '12px 14px',
  whiteSpace: 'pre-wrap',
});

export const expandedFieldsCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  borderRadius: 16,
  padding: 16,
  background: cssVarV2('layer/background/primary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const expandedFieldsHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
});

export const expandedFieldGrid = style({
  display: 'grid',
  gridTemplateColumns: '96px 1fr',
  gap: '8px 10px',
  alignItems: 'center',
});

export const expandedFieldValue = style({
  minHeight: 30,
  display: 'flex',
  alignItems: 'center',
  borderRadius: 8,
  padding: '0 8px',
  fontSize: 12,
  color: cssVarV2('text/primary'),
  background: cssVarV2('layer/background/secondary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const expandedBottomGrid = style({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 14,
});

export const expandedSectionCard = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  borderRadius: 16,
  padding: 16,
  background: cssVarV2('layer/background/primary'),
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
});

export const expandedSectionHeader = style({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
});

export const expandedSectionMeta = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
});

export const expandedEmptyState = style({
  fontSize: 12,
  color: cssVarV2('text/secondary'),
  borderRadius: 10,
  border: `1px dashed ${cssVarV2('layer/insideBorder/border')}`,
  padding: '10px 12px',
  background: cssVarV2('layer/background/secondary'),
});

export const detailSubtasksEditor = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const subtasksListDetail = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
});

export const subtaskDetailItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 8,
  background: cssVarV2('layer/background/primary'),
  padding: '8px 10px',
  cursor: 'pointer',
});

export const subtaskDetailItemDone = style({
  opacity: 0.72,
});

export const subtaskDetailTitle = style({
  fontSize: 12,
  color: cssVarV2('text/primary'),
  textAlign: 'left',
});

export const historyPanel = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  border: `1px solid ${cssVarV2('layer/insideBorder/border')}`,
  borderRadius: 10,
  background: cssVarV2('layer/background/primary'),
  padding: 10,
});

export const historyListDetail = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
});

export const historyItemDetail = style({
  display: 'flex',
  alignItems: 'flex-start',
  gap: 8,
});

export const historyContentDetail = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  minWidth: 0,
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

export const developmentGroup = style({
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  marginBottom: 10,
});

export const developmentGroupTitle = style({
  fontSize: 12,
  fontWeight: 500,
  lineHeight: '16px',
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
});

export const developmentItem = style({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontSize: 13,
  lineHeight: '20px',
  minWidth: 0,
});

export const developmentItemTitle = style({
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  color: '#141414',
});

export const developmentItemMeta = style({
  flexShrink: 0,
  fontSize: 12,
  lineHeight: '16px',
  color: '#6b7280',
});

export const developmentLink = style({
  color: '#035f9f',
  textDecoration: 'none',
  selectors: {
    '&:hover': {
      textDecoration: 'underline',
    },
  },
});

export const pipelineStatusSuccess = style({ color: '#216e4e' });
export const pipelineStatusFailed = style({ color: '#ae2a19' });
export const pipelineStatusUnstable = style({ color: '#a15c00' });
export const pipelineStatusRunning = style({ color: '#0c66e4' });
