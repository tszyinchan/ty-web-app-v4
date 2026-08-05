import { FitSessionDetail, FitSideCode } from './fit.model';

export class FitThreadFormatterUtil {
  static format(detail: FitSessionDetail): string {
    const lines: string[] = [];
    const session = detail.session;

    let header = `${session.session_date}：`;
    if (session.session_title?.trim()) {
      header += `\n${session.session_title.trim()}`;
    }
    lines.push(header);

    if (session.location?.trim()) {
      lines.push(`📍 ${session.location.trim()}`);
    }

    if (session.remarks?.trim()) {
      lines.push(session.remarks.trim());
    }
    lines.push('');

    detail.entries.forEach((entry) => {
      const typeLabel = this.getEntryTypeLabel(entry.entry_type);
      lines.push(`${entry.exercise_name || '未命名動作'} (${typeLabel})`);

      if (entry.source_url?.trim()) {
        lines.push(`🔗 ${entry.source_url.trim()}`);
      }

      if (entry.entry_type === 'cardio') {
        entry.sets.forEach((set, index) => {
          if (index > 0) lines.push('');

          if (set.duration_sec !== null) {
            const mins = Math.floor(set.duration_sec / 60);
            const secs = set.duration_sec % 60;
            lines.push(
              `時間 ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`,
            );
          }
          if (set.calories_value !== null) {
            lines.push(`Calories ${set.calories_value}`);
          }
          if (set.distance_value !== null) {
            lines.push(`距離 ${set.distance_value}${set.distance_unit || ''}`);
          }
          if (set.level_text?.trim()) {
            lines.push(`Level ${set.level_text.trim()}`);
          }
          if (set.incline_value !== null) {
            lines.push(`坡度 ${set.incline_value}`);
          }
          if (set.side_code) {
            lines.push(this.getSideLabel(set.side_code));
          }
          if (set.remarks?.trim()) {
            lines.push(`備註：${set.remarks.trim()}`);
          }
        });
      } else {
        const groupedSets: {
          side: string;
          core: string;
          remarks: string;
          count: number;
        }[] = [];
        let currentGroup: {
          side: string;
          core: string;
          remarks: string;
          count: number;
        } | null = null;

        entry.sets.forEach((set) => {
          const sideStr = set.side_code
            ? `${this.getSideLabel(set.side_code)} `
            : '';

          let coreStr = '';
          if (set.weight_value !== null)
            coreStr += `${set.weight_value}${set.weight_unit || ''}`;
          if (set.reps_value !== null)
            coreStr += coreStr ? `×${set.reps_value}` : `${set.reps_value}下`;
          if (set.duration_sec !== null) {
            const mins = Math.floor(set.duration_sec / 60);
            const secs = set.duration_sec % 60;
            const timeStr = mins > 0 ? `${mins}分${secs}秒` : `${secs}秒`;
            coreStr += coreStr ? ` · ${timeStr}` : timeStr;
          }
          if (!coreStr) coreStr = '完成';

          const remarkStr = set.remarks?.trim()
            ? ` (${set.remarks.trim()})`
            : '';

          if (
            currentGroup &&
            currentGroup.side === sideStr &&
            currentGroup.core === coreStr &&
            currentGroup.remarks === remarkStr
          ) {
            currentGroup.count++;
          } else {
            if (currentGroup) groupedSets.push(currentGroup);
            currentGroup = {
              side: sideStr,
              core: coreStr,
              remarks: remarkStr,
              count: 1,
            };
          }
        });

        if (currentGroup) groupedSets.push(currentGroup);

        groupedSets.forEach((g) => {
          let line = `${g.side}${g.core}`;
          if (g.count > 1) {
            line += `×${g.count}`;
          }
          line += g.remarks;
          lines.push(line);
        });
      }

      if (entry.remarks?.trim()) {
        lines.push(`💡 ${entry.remarks.trim()}`);
      }
      lines.push('');
    });

    return lines.join('\n').trim();
  }

  private static getEntryTypeLabel(type: string): string {
    const map: Record<string, string> = {
      strength: '重量訓練',
      cardio: '有氧',
      mobility: '伸展',
      bodyweight: '自體重',
    };
    return map[type] || type;
  }

  private static getSideLabel(side: FitSideCode): string {
    if (side === 'left') return '左手/左腳';
    if (side === 'right') return '右手/右腳';
    return '雙側';
  }
}
