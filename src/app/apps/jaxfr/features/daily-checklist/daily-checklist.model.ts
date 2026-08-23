import { RecordStatus } from '../../../../core/models/status.enum';

export interface DailyChecklistItem {
  tb_tyapp_dcl_itm_id: string;
  tb_tyapp_dcl_itm_seq_no: number;
  user_id: string;
  checklist_date: string;
  item_text: string;
  sort_order: number;
  completed_at: string | null;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyChecklistTemplateItem {
  tb_tyapp_dcl_tpl_itm_id: string;
  tb_tyapp_dcl_tpl_itm_seq_no: number;
  user_id: string;
  item_text: string;
  sort_order: number;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DailyChecklistSuggestion {
  item_text: string;
  lastUsedAt: string;
}

export type DailyChecklistDashboardRange = 'week' | 'last30' | 'all';

export interface DailyChecklistDateStat {
  checklist_date: string;
  completedCount: number;
  totalCount: number;
  percent: number;
}

export interface DailyChecklistTopItem {
  item_text: string;
  completedCount: number;
  latestCompletedAt: string;
}

export interface DailyChecklistRecentItem {
  item_text: string;
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
