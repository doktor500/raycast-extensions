import { formatUserName, OnCallEvent } from "../domain/on-call-event";
import { Colors } from "../utils/colors";

export interface WeekSpanBar {
  startDayIdx: number;
  startFrac: number;
  endDayIdx: number;
  endFrac: number;
  label: string;
  color: string;
  lane: number;
}

export interface SummaryEntry {
  name: string;
  hours: number;
  color: string;
}

export const LAYOUT = {
  WIDTH: 1160,
  BLOCK_GAP: 40,
  BLOCK_HEADER_HEIGHT: 44,
  DAY_WIDTH: 1160 / 7,
  DAY_HEADER_HEIGHT: 30,
  ROW_TOP: 40,
  ROW_HEIGHT: 42,
  BAR_GAP: 4,
  ROW_BOTTOM_PAD: 10,
  H_GAP: 3,
  DAY_MS: 24 * 3600 * 1000,
  SUMMARY_GAP: 12,
} as const;

export const SUMMARY = {
  FONT: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
  BLOCK_HEIGHT: 100,
  MONTH_COL_WIDTH: 200,
  COLS_THRESHOLD: 5,
  VERTICAL_ROW_HEIGHT: 36,
  VERTICAL_PADDING: 14,
} as const;

export function weekRowHeight(maxLanes: number): number {
  return (
    LAYOUT.ROW_TOP + maxLanes * LAYOUT.ROW_HEIGHT + Math.max(0, maxLanes - 1) * LAYOUT.BAR_GAP + LAYOUT.ROW_BOTTOM_PAD
  );
}

export function summaryBlockHeight(n: number): number {
  if (n <= SUMMARY.COLS_THRESHOLD) return SUMMARY.BLOCK_HEIGHT;
  return n * SUMMARY.VERTICAL_ROW_HEIGHT + SUMMARY.VERTICAL_PADDING * 2;
}

export function formatDaysHours(totalHours: number): string {
  const days = Math.floor(totalHours / 24);
  const hours = Math.round(totalHours % 24);
  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  return `${hours}h`;
}

export function truncateLabel(label: string, availableWidth: number, fontSize: number): string {
  const charWidth = fontSize * 0.58;
  const maxChars = Math.floor(availableWidth / charWidth);
  if (label.length <= maxChars) return label;
  return label.slice(0, Math.max(maxChars - 1, 1)) + "…";
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function formatWeekday(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}

export function formatMonthLabel(currentMonth: { year: number; month: number }): string {
  return new Date(currentMonth.year, currentMonth.month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function assignSpanLanes(bars: Omit<WeekSpanBar, "lane">[]): WeekSpanBar[] {
  const laneEnds: number[] = [];
  return bars.map((bar) => {
    const absStart = bar.startDayIdx + bar.startFrac;
    const absEnd = bar.endDayIdx + bar.endFrac;
    let lane = laneEnds.findIndex((end) => end <= absStart);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = absEnd;
    return { ...bar, lane };
  });
}

export function buildWeekSpanBars(
  days: Date[],
  events: OnCallEvent[],
  currentMonth: { year: number; month: number },
  colorMap: Map<string, string>,
): WeekSpanBar[] {
  const dayStarts = days.map((d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime());

  const inMonthIndices = days
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.getFullYear() === currentMonth.year && d.getMonth() === currentMonth.month)
    .map(({ i }) => i);

  if (inMonthIndices.length === 0) return [];

  const firstInMonth = inMonthIndices[0];
  const lastInMonth = inMonthIndices[inMonthIndices.length - 1];
  const windowStart = dayStarts[firstInMonth];
  const windowEnd = dayStarts[lastInMonth] + LAYOUT.DAY_MS;

  const preBars: Omit<WeekSpanBar, "lane">[] = [];

  for (const event of events) {
    const evStart = new Date(event.started_at).getTime();
    const evEnd = new Date(event.ended_at).getTime();
    const overlapStart = Math.max(evStart, windowStart);
    const overlapEnd = Math.min(evEnd, windowEnd);

    if (overlapEnd <= overlapStart) continue;

    let startDayIdx = firstInMonth;
    let startFrac = 0;
    for (let i = firstInMonth; i <= lastInMonth; i++) {
      if (overlapStart >= dayStarts[i] && overlapStart < dayStarts[i] + LAYOUT.DAY_MS) {
        startDayIdx = i;
        startFrac = (overlapStart - dayStarts[i]) / LAYOUT.DAY_MS;
        break;
      }
    }

    let endDayIdx = lastInMonth;
    let endFrac = 1.0;
    for (let i = firstInMonth; i <= lastInMonth; i++) {
      if (overlapEnd > dayStarts[i] && overlapEnd <= dayStarts[i] + LAYOUT.DAY_MS) {
        endDayIdx = i;
        endFrac = (overlapEnd - dayStarts[i]) / LAYOUT.DAY_MS;
        break;
      }
    }

    const displayName = formatUserName(event.user);
    preBars.push({
      startDayIdx,
      startFrac,
      endDayIdx,
      endFrac,
      label: displayName,
      color: colorMap.get(displayName) ?? Colors.GREEN,
    });
  }

  preBars.sort((a, b) => a.startDayIdx + a.startFrac - (b.startDayIdx + b.startFrac));
  return assignSpanLanes(preBars);
}

export function computeMonthSummary(
  year: number,
  month: number,
  events: OnCallEvent[],
  colorMap: Map<string, string>,
): SummaryEntry[] {
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 1);
  const totalHours = new Map<string, number>();

  for (const event of events) {
    const start = new Date(event.started_at);
    const end = new Date(event.ended_at);
    const overlapStart = Math.max(start.getTime(), monthStart.getTime());
    const overlapEnd = Math.min(end.getTime(), monthEnd.getTime());
    if (overlapEnd <= overlapStart) continue;
    const hours = (overlapEnd - overlapStart) / (3600 * 1000);
    const displayName = formatUserName(event.user);
    totalHours.set(displayName, (totalHours.get(displayName) ?? 0) + hours);
  }

  return [...totalHours.entries()]
    .map(([name, hours]) => ({ name, hours, color: colorMap.get(name) ?? Colors.GREEN }))
    .sort((a, b) => b.hours - a.hours);
}
