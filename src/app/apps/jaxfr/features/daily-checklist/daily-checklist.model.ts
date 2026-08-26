import { RecordStatus } from '../../../../core/models/status.enum';

export const DCL_COLOUR_PRESET_KEYS = [
  'purple',
  'blue',
  'teal',
  'green',
  'gold',
  'orange',
  'red',
  'slate',
] as const;

export type DclColourPresetKey = (typeof DCL_COLOUR_PRESET_KEYS)[number];

export const DCL_COLOUR_PRESETS: {
  key: DclColourPresetKey;
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

export const DCL_EMOJI_PRESETS = [
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

export const DCL_MOOD_KEYS = [
  'green',
  'gold',
  'red',
  'blue',
  'purple',
] as const;

export type DclMoodKey = (typeof DCL_MOOD_KEYS)[number];

/** Display order. Keys stay the DB CHECK values in `DCL_MOOD_KEYS`. */
export const DCL_MOODS: readonly {
  key: DclMoodKey;
  emoji: string;
  label: string;
}[] = [
  { key: 'green', emoji: '😄', label: 'Happy' },
  { key: 'gold', emoji: '😌', label: 'Calm' },
  { key: 'purple', emoji: '😐', label: 'Meh' },
  { key: 'blue', emoji: '😢', label: 'Sad' },
  { key: 'red', emoji: '😠', label: 'Angry' },
];

export const DCL_SELECTED_DAY_BG = '#4a1f6b';

export interface DailyChecklistItem {
  tb_tyapp_dcl_itm_id: string;
  tb_tyapp_dcl_itm_seq_no: number;
  user_id: string;
  item_text: string;
  emoji: string | null;
  colour_preset_key: DclColourPresetKey;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyChecklistDayItem {
  tb_tyapp_dcl_day_id: string;
  tb_tyapp_dcl_day_seq_no: number;
  user_id: string;
  item_id: string;
  checklist_date: string;
  sort_order: number;
  completed_at: string | null;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyChecklistStandardItem {
  tb_tyapp_dcl_std_id: string;
  tb_tyapp_dcl_std_seq_no: number;
  user_id: string;
  item_id: string;
  sort_order: number;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyChecklistDayLog {
  tb_tyapp_dcl_dly_id: string;
  tb_tyapp_dcl_dly_seq_no: number;
  user_id: string;
  checklist_date: string;
  mood_key: DclMoodKey | null;
  title: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyChecklistShareGrant {
  tb_tyapp_dcl_shr_id: string;
  tb_tyapp_dcl_shr_seq_no: number;
  owner_user_id: string;
  viewer_user_id: string;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyChecklistDayRow extends DailyChecklistDayItem {
  catalog: DailyChecklistItem;
}

export interface DailyChecklistStandardRow extends DailyChecklistStandardItem {
  catalog: DailyChecklistItem;
}

export interface DailyChecklistWeekDay {
  date: string;
  weekday: string;
  dayNum: number;
  isToday: boolean;
  isSelected: boolean;
  totalCount: number;
  completedCount: number;
}

export type DailyChecklistDashboardRange = 'week' | 'last30' | 'all';

export interface DailyChecklistDateStat {
  checklist_date: string;
  completedCount: number;
  totalCount: number;
  percent: number;
}

export interface DailyChecklistTopItem {
  item_id: string;
  item_text: string;
  emoji: string | null;
  completedCount: number;
  latestCompletedAt: string;
}

export interface DailyChecklistRecentItem {
  item_id: string;
  item_text: string;
  emoji: string | null;
  checklist_date: string;
  completed_at: string;
}

export interface DailyChecklistDashboardVm {
  completedCount: number;
  incompleteCount: number;
  dateCount: number;
  byDate: DailyChecklistDateStat[];
  topCompleted: DailyChecklistTopItem[];
  recentlyCompleted: DailyChecklistRecentItem[];
}
