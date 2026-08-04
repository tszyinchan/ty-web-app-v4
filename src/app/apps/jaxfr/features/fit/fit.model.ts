import { RecordStatus } from "../../../../core/models/status.enum";

export type FitEntryType = 'strength' | 'cardio' | 'mobility' | 'bodyweight';

export type FitSideCode = 'left' | 'right' | 'both';

export interface FitSession {
  tb_tyapp_fit_ssn_id: string;
  tb_tyapp_fit_ssn_seq_no: number;
  user_id: string;
  session_date: string;
  session_title: string | null;
  location: string | null;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FitEntry {
  tb_tyapp_fit_ntry_id: string;
  tb_tyapp_fit_ntry_seq_no: number;
  fit_session_id: string;
  sort_order: number;
  entry_type: FitEntryType;
  exercise_name: string;
  source_url: string | null;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FitEntrySet {
  tb_tyapp_fit_set_id: string;
  tb_tyapp_fit_set_seq_no: number;
  fit_entry_id: string;
  set_no: number;
  weight_value: number | null;
  weight_unit: string | null;
  reps_value: number | null;
  duration_sec: number | null;
  calories_value: number | null;
  distance_value: number | null;
  distance_unit: string | null;
  incline_value: number | null;
  level_text: string | null;
  side_code: FitSideCode | null;
  remarks: string | null;
  status: RecordStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface FitSessionDetail {
  session: FitSession;
  entries: FitEntryWithSets[];
}

export interface FitEntryWithSets extends FitEntry {
  sets: FitEntrySet[];
}

export interface FitEditSetInput {
  id?: string | null;
  set_no: number;
  weight_value: number | null;
  weight_unit: string | null;
  reps_value: number | null;
  duration_sec: number | null;
  calories_value: number | null;
  distance_value: number | null;
  distance_unit: string | null;
  incline_value: number | null;
  level_text: string | null;
  side_code: FitSideCode | null;
  remarks: string | null;
  status: RecordStatus;
}

export interface FitEditEntryInput {
  id?: string | null;
  sort_order: number;
  entry_type: FitEntryType;
  exercise_name: string;
  source_url: string | null;
  remarks: string | null;
  status: RecordStatus;
  sets: FitEditSetInput[];
  showAdvanced?: boolean;
  isExpanded?: boolean;
}

export interface FitEditSessionInput {
  id?: string | null;
  session_date: string;
  session_title: string | null;
  location: string | null;
  remarks: string | null;
  status: RecordStatus;
  entries: FitEditEntryInput[];
}