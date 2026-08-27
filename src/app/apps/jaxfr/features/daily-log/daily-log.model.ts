import { RecordStatus } from '../../../../core/models/status.enum';

export const DL_COLOUR_PRESET_KEYS = [
  'purple',
  'blue',
  'teal',
  'green',
  'gold',
  'orange',
  'red',
  'slate',
] as const;

export type DlColourPresetKey = (typeof DL_COLOUR_PRESET_KEYS)[number];

export const DL_COLOUR_PRESETS: {
  key: DlColourPresetKey;
  label: string;
  fill: string;
  tint: string;
}[] = [
  { key: 'purple', label: 'Purple', fill: '#5b3a8c', tint: 'rgba(91, 58, 140, 0.12)' },
  { key: 'blue', label: 'Blue', fill: '#1b5fa8', tint: 'rgba(27, 95, 168, 0.12)' },
  { key: 'teal', label: 'Teal', fill: '#1a7a72', tint: 'rgba(26, 122, 114, 0.12)' },
  { key: 'green', label: 'Green', fill: '#217346', tint: 'rgba(33, 115, 70, 0.12)' },
  { key: 'gold', label: 'Gold', fill: '#b07a12', tint: 'rgba(176, 122, 18, 0.12)' },
  { key: 'orange', label: 'Orange', fill: '#c05612', tint: 'rgba(192, 86, 18, 0.12)' },
  { key: 'red', label: 'Red', fill: '#a31f1f', tint: 'rgba(163, 31, 31, 0.12)' },
  { key: 'slate', label: 'Slate', fill: '#4a5a6a', tint: 'rgba(74, 90, 106, 0.12)' },
];

export const DL_EMOJI_PRESETS = [
  '✅',
  '📌',
  '🧹',
  '💧',
  '📝',
  '📞',
  '💻',
  '🏃',
  '🥗',
  '💊',
  '📦',
  '🔑',
] as const;

export const DL_MOOD_KEYS = [
  'green',
  'gold',
  'red',
  'blue',
  'purple',
  'grin',
  'rest',
  'blank',
  'cry',
  'mad',
] as const;

export type DlMoodKey = (typeof DL_MOOD_KEYS)[number];

/** Display order: 5×2 grid. Colour keys stay the original DB CHECK values.
 *  Each face has its own fill in /daily-log-moods/*.svg — not shared by column. */
export const DL_MOODS: readonly {
  key: DlMoodKey;
  emoji: string;
  label: string;
  image: string;
}[] = [
  { key: 'green', emoji: '😊', label: 'Happy', image: '/daily-log-moods/happy.svg' },
  { key: 'gold', emoji: '🙂', label: 'Calm', image: '/daily-log-moods/calm.svg' },
  { key: 'purple', emoji: '😑', label: 'Meh', image: '/daily-log-moods/meh.svg' },
  { key: 'blue', emoji: '😞', label: 'Sad', image: '/daily-log-moods/sad.svg' },
  { key: 'red', emoji: '😡', label: 'Angry', image: '/daily-log-moods/angry.svg' },
  { key: 'grin', emoji: '😄', label: 'Grin', image: '/daily-log-moods/grin.svg' },
  { key: 'rest', emoji: '😌', label: 'Rest', image: '/daily-log-moods/rest.svg' },
  { key: 'blank', emoji: '😐', label: 'Blank', image: '/daily-log-moods/blank.svg' },
  { key: 'cry', emoji: '😢', label: 'Cry', image: '/daily-log-moods/cry.svg' },
  { key: 'mad', emoji: '😠', label: 'Mad', image: '/daily-log-moods/mad.svg' },
];

export const DL_SELECTED_DAY_BG = '#4a1f6b';

export interface DailyLogLibraryItem {
  tb_tyapp_dl_itm_id: string;
  tb_tyapp_dl_itm_seq_no: number;
  user_id: string;
  item_text: string;
  emoji: string | null;
  colour_preset_key: DlColourPresetKey;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyLogDayItem {
  tb_tyapp_dl_day_id: string;
  tb_tyapp_dl_day_seq_no: number;
  user_id: string;
  item_id: string;
  log_date: string;
  sort_order: number;
  completed_at: string | null;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyLogTemplateItem {
  tb_tyapp_dl_tpl_id: string;
  tb_tyapp_dl_tpl_seq_no: number;
  user_id: string;
  item_id: string;
  sort_order: number;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyLogDay {
  tb_tyapp_dl_log_id: string;
  tb_tyapp_dl_log_seq_no: number;
  user_id: string;
  log_date: string;
  mood_key: DlMoodKey | null;
  title: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyLogViewerGrant {
  tb_tyapp_dl_shr_id: string;
  tb_tyapp_dl_shr_seq_no: number;
  owner_user_id: string;
  viewer_user_id: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyLogDayRow extends DailyLogDayItem {
  library: DailyLogLibraryItem;
}

export interface DailyLogTemplateRow extends DailyLogTemplateItem {
  library: DailyLogLibraryItem;
}

export interface DailyLogWeekDay {
  date: string;
  weekday: string;
  dayNum: number;
  isToday: boolean;
  isSelected: boolean;
  totalCount: number;
  completedCount: number;
}

export type DailyLogStatsRange = 'week' | 'last30' | 'all';

export interface DailyLogDateStat {
  log_date: string;
  completedCount: number;
  totalCount: number;
  percent: number;
}

export interface DailyLogTopItem {
  item_id: string;
  item_text: string;
  emoji: string | null;
  completedCount: number;
  latestCompletedAt: string;
}

export interface DailyLogRecentItem {
  item_id: string;
  item_text: string;
  emoji: string | null;
  log_date: string;
  completed_at: string;
}

export interface DailyLogStatsVm {
  completedCount: number;
  incompleteCount: number;
  dateCount: number;
  byDate: DailyLogDateStat[];
  topCompleted: DailyLogTopItem[];
  recentlyCompleted: DailyLogRecentItem[];
}
