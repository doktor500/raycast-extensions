import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type OnCallEvent } from "./dates";
import { buildColorMap, getTextColor } from "./colors";

interface WeekSpanBar {
  startDayIdx: number; // 0-6 index into the week's days array
  startFrac: number; // 0.0–1.0 within start day
  endDayIdx: number;
  endFrac: number; // 0.0–1.0 within end day (1.0 = end of day)
  label: string;
  color: string;
  lane: number;
}

const WIDTH = 1160;
const BLOCK_GAP = 40;
const BLOCK_HEADER_HEIGHT = 44;
const DAY_WIDTH = WIDTH / 7;
const DAY_HEADER_HEIGHT = 30;
const ROW_TOP = 40;
const ROW_HEIGHT = 42;
const BAR_GAP = 4;
const ROW_BOTTOM_PAD = 10;
const H_GAP = 3;
const DAY_MS = 24 * 3600 * 1000;

function weekRowHeight(maxLanes: number): number {
  return ROW_TOP + maxLanes * ROW_HEIGHT + Math.max(0, maxLanes - 1) * BAR_GAP + ROW_BOTTOM_PAD;
}

export function buildCombinedScheduleSvg(
  events: OnCallEvent[],
  today: Date,
  window: { start: Date; end: Date },
  backgroundColor?: string,
  showTodayMarker = true,
  allEvents?: OnCallEvent[],
): string {
  const { start, end } = window;
  const firstWeekStart = startOfWeek(start);
  const lastWeekStart = startOfWeek(end);
  const allWeeks: Date[][] = [];

  for (let weekStart = firstWeekStart; weekStart <= lastWeekStart; weekStart = addDays(weekStart, 7)) {
    allWeeks.push(Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)));
  }

  const monthsSeen = new Set<string>();
  const monthList: Array<{ year: number; month: number }> = [];
  for (const week of allWeeks) {
    for (const day of week) {
      if (day >= start && day <= end) {
        const key = `${day.getFullYear()}-${day.getMonth()}`;
        if (!monthsSeen.has(key)) {
          monthsSeen.add(key);
          monthList.push({ year: day.getFullYear(), month: day.getMonth() });
        }
      }
    }
  }

  const monthGroups = monthList.map(({ year, month }) => ({
    year,
    month,
    weeks: allWeeks.filter((days) => days.some((d) => d.getFullYear() === year && d.getMonth() === month)),
  }));

  const colorSourceEvents = allEvents ?? events;
  const uniqueNames = [
    ...new Set(
      colorSourceEvents.map((e) => {
        const fullName = `${e.user.first_name} ${e.user.last_name}`.trim();
        return fullName || e.user.email;
      }),
    ),
  ].sort();
  const colorMap = buildColorMap(uniqueNames);

  // Pre-compute span timelines to determine dynamic row heights per week
  const weekTimelinesByMonth = monthGroups.map(({ year, month, weeks }) =>
    weeks.map((days) => buildWeekSpanBars(days, events, { year, month }, colorMap)),
  );

  const weekRowHeightsByMonth = weekTimelinesByMonth.map((weekTimelines) =>
    weekTimelines.map((weekTimeline) => {
      const maxLanes = Math.max(1, ...weekTimeline.map((b) => b.lane + 1));
      return weekRowHeight(maxLanes);
    }),
  );

  const calHeight = (mi: number) => BLOCK_HEADER_HEIGHT + weekRowHeightsByMonth[mi].reduce((a, b) => a + b, 0);

  const summaries = monthGroups.map(({ year, month }) => computeMonthSummary(year, month, events, colorMap));
  const monthTotalHeight = (idx: number) => calHeight(idx) + SUMMARY_GAP + summaryBlockHeight(summaries[idx].length);
  const totalHeight =
    monthGroups.reduce((sum, _g, idx) => sum + monthTotalHeight(idx), 0) + (monthGroups.length - 1) * BLOCK_GAP;

  const columnBg = backgroundColor ?? "none";

  let currentY = 0;
  const blocksContent = monthGroups
    .map(({ year, month, weeks }, i) => {
      const ch = calHeight(i);
      const calBlock = renderMonthBlock(
        weeks,
        currentY,
        ch,
        today,
        weekTimelinesByMonth[i],
        { year, month },
        showTodayMarker,
        columnBg,
        weekRowHeightsByMonth[i],
      );
      const summary = summaries[i];
      const summaryBlock = renderSummaryBlock(year, month, summary, currentY + ch + SUMMARY_GAP);
      const dividerY = currentY + monthTotalHeight(i) + BLOCK_GAP / 2;
      const divider =
        i < monthGroups.length - 1
          ? `<line x1="0" y1="${dividerY}" x2="${WIDTH}" y2="${dividerY}" stroke="#4A5568" stroke-width="2"/>`
          : "";
      currentY += monthTotalHeight(i) + BLOCK_GAP;
      return calBlock + summaryBlock + divider;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${totalHeight}" viewBox="0 0 ${WIDTH} ${totalHeight}">
  <defs>
    <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
      ${columnBg !== "none" ? `<rect width="8" height="8" fill="${columnBg}"/>` : ""}
      <path d="M 0 0 L 0 8" stroke="#182033" stroke-width="1" opacity="0.50"/>
    </pattern>
    <filter id="shadow" x="-10%" y="-30%" width="120%" height="170%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#050816" flood-opacity="0.3"/>
    </filter>
  </defs>
  ${backgroundColor ? `<rect width="${WIDTH}" height="${totalHeight}" fill="${backgroundColor}"/>` : ""}

  ${blocksContent}
</svg>`;
}

function renderMonthBlock(
  weeks: Date[][],
  blockOffsetY: number,
  blockHeight: number,
  today: Date,
  weekTimelines: WeekSpanBar[][],
  currentMonth: { year: number; month: number },
  showTodayMarker: boolean,
  columnBg: string,
  weekRowHeights: number[],
): string {
  const monthLabel = escapeXml(formatMonthLabel(currentMonth));

  const weeksContent = weeks
    .map((days, localIndex) => {
      const rowH = weekRowHeights[localIndex];
      const offsetY = BLOCK_HEADER_HEIGHT + weekRowHeights.slice(0, localIndex).reduce((a, b) => a + b, 0);
      return renderWeekGroup(
        days,
        weekTimelines[localIndex],
        today,
        localIndex,
        offsetY,
        currentMonth,
        showTodayMarker,
        columnBg,
        rowH,
      );
    })
    .join("");

  return `<g transform="translate(0, ${blockOffsetY})">
    <rect width="${WIDTH}" height="${blockHeight}" rx="10" fill="#1F2433" fill-opacity="0.2"/>
    <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${blockHeight - 1}" rx="10" fill="none" stroke="#303A50"/>
    <text x="${WIDTH / 2}" y="${BLOCK_HEADER_HEIGHT / 2 + 7}" text-anchor="middle" fill="#F3F5FA" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="17" font-weight="700">${monthLabel}</text>
    <line x1="0" y1="${BLOCK_HEADER_HEIGHT}" x2="${WIDTH}" y2="${BLOCK_HEADER_HEIGHT}" stroke="#303A50"/>
    ${weeksContent}
  </g>`;
}

export function toSvgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const execFileAsync = promisify(execFile);

export async function svgToPng(svgPath: string, pngPath: string): Promise<void> {
  await execFileAsync("sips", ["-s", "format", "png", svgPath, "--out", pngPath]);
}

export async function copyImageToClipboard(pngPath: string): Promise<void> {
  const script = `set the clipboard to (read (POSIX file "${pngPath}") as «class PNGf»)`;
  await execFileAsync("osascript", ["-e", script]);
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

function buildWeekSpanBars(
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
  const windowEnd = dayStarts[lastInMonth] + DAY_MS;

  const preBars: Omit<WeekSpanBar, "lane">[] = [];

  for (const event of events) {
    const evStart = new Date(event.started_at).getTime();
    const evEnd = new Date(event.ended_at).getTime();
    const overlapStart = Math.max(evStart, windowStart);
    const overlapEnd = Math.min(evEnd, windowEnd);

    if (overlapEnd <= overlapStart) continue;

    // Locate start day: ms in [dayStart, dayStart + DAY_MS)
    let startDayIdx = firstInMonth;
    let startFrac = 0;
    for (let i = firstInMonth; i <= lastInMonth; i++) {
      if (overlapStart >= dayStarts[i] && overlapStart < dayStarts[i] + DAY_MS) {
        startDayIdx = i;
        startFrac = (overlapStart - dayStarts[i]) / DAY_MS;
        break;
      }
    }

    // Locate end day: ms in (dayStart, dayStart + DAY_MS] so midnight snaps to previous day
    let endDayIdx = lastInMonth;
    let endFrac = 1.0;
    for (let i = firstInMonth; i <= lastInMonth; i++) {
      if (overlapEnd > dayStarts[i] && overlapEnd <= dayStarts[i] + DAY_MS) {
        endDayIdx = i;
        endFrac = (overlapEnd - dayStarts[i]) / DAY_MS;
        break;
      }
    }

    const fullName = `${event.user.first_name} ${event.user.last_name}`.trim();
    const displayName = fullName || event.user.email;

    preBars.push({
      startDayIdx,
      startFrac,
      endDayIdx,
      endFrac,
      label: displayName,
      color: colorMap.get(displayName) ?? "#16C77A",
    });
  }

  preBars.sort((a, b) => a.startDayIdx + a.startFrac - (b.startDayIdx + b.startFrac));
  return assignSpanLanes(preBars);
}

function renderWeekGroup(
  days: Date[],
  weekTimeline: WeekSpanBar[],
  today: Date,
  weekIndex: number,
  offsetY: number,
  currentMonth: { year: number; month: number },
  showTodayMarker: boolean,
  columnBg: string,
  rowH: number,
): string {
  const todayIndex = days.findIndex((day) => isSameDay(day, today));
  const divider = weekIndex > 0 ? `<line x1="0" y1="0" x2="${WIDTH}" y2="0" stroke="#303A50"/>` : "";

  const baseId = (currentMonth.year * 12 + currentMonth.month) * 1000 + weekIndex * 100;
  const allBarsMarkup = weekTimeline.map((bar, barIdx) => renderSpanBar(bar, baseId + barIdx)).join("\n    ");

  return `<g transform="translate(0, ${offsetY})">
    ${divider}

    ${days.map((day, index) => renderDayColumn(day, index, currentMonth, columnBg, rowH)).join("\n    ")}
    ${allBarsMarkup}
    ${showTodayMarker && todayIndex >= 0 ? renderTodayMarker(todayIndex, today, rowH) : ""}
  </g>`;
}

function renderDayColumn(
  day: Date,
  index: number,
  currentMonth: { year: number; month: number },
  columnBg: string,
  rowH: number,
): string {
  const x = index * DAY_WIDTH;
  const center = x + DAY_WIDTH / 2;
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const inMonth = day.getFullYear() === currentMonth.year && day.getMonth() === currentMonth.month;
  const bgRect =
    columnBg !== "none" ? `<rect x="${x}" y="0" width="${DAY_WIDTH}" height="${rowH}" fill="${columnBg}"/>` : "";

  if (!inMonth) {
    return `<g>
      ${bgRect}
      ${isWeekend ? `<rect x="${x}" y="0" width="${DAY_WIDTH}" height="${rowH}" fill="url(#hatch)" opacity="0.3"/>` : ""}
    </g>`;
  }

  return `<g>
      ${bgRect}
      ${isWeekend ? `<rect x="${x}" y="0" width="${DAY_WIDTH}" height="${rowH}" fill="url(#hatch)"/>` : ""}
      <line x1="${x}" y1="0" x2="${x}" y2="${rowH}" stroke="#2A3449"/>
      <line x1="${x}" y1="${DAY_HEADER_HEIGHT}" x2="${x + DAY_WIDTH}" y2="${DAY_HEADER_HEIGHT}" stroke="#2D374C"/>
      <text x="${center - 3}" y="22" text-anchor="end" fill="#707B96" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13" font-weight="600">${formatWeekday(day)}</text>
      <text x="${center + 3}" y="22" text-anchor="start" fill="#AEB8D3" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="16" font-weight="650">${day.getDate()}</text>
    </g>`;
}

function truncateLabel(label: string, availableWidth: number, fontSize: number): string {
  const charWidth = fontSize * 0.58;
  const maxChars = Math.floor(availableWidth / charWidth);
  if (label.length <= maxChars) return label;
  return label.slice(0, Math.max(maxChars - 1, 1)) + "…";
}

function renderSpanBar(bar: WeekSpanBar, clipId: number): string {
  const leftX = bar.startDayIdx * DAY_WIDTH + bar.startFrac * DAY_WIDTH;
  const rightX = bar.endDayIdx * DAY_WIDTH + bar.endFrac * DAY_WIDTH;
  const barX = leftX + H_GAP;
  const barWidth = Math.max(rightX - leftX - 2 * H_GAP, 2);
  const barY = ROW_TOP + bar.lane * (ROW_HEIGHT + BAR_GAP);
  const id = `bar-${clipId}`;
  const textColor = getTextColor(bar.color);
  const fontSize = 19;
  const rx = Math.min(6, Math.floor(barWidth / 3));
  const textAvailWidth = barWidth - 22;
  const label = textAvailWidth > 15 ? escapeXml(truncateLabel(bar.label, textAvailWidth, fontSize)) : "";

  return `<g>
      <clipPath id="${id}">
        <rect x="${barX + 10}" y="${barY}" width="${Math.max(barWidth - 20, 1)}" height="${ROW_HEIGHT}"/>
      </clipPath>
      <rect x="${barX}" y="${barY}" width="${barWidth}" height="${ROW_HEIGHT}" rx="${rx}" fill="${bar.color}" filter="url(#shadow)"/>
      <rect x="${barX + 1}" y="${barY + 1}" width="${barWidth - 2}" height="${ROW_HEIGHT - 2}" rx="${Math.max(rx - 1, 0)}" fill="none" stroke="${textColor}" stroke-opacity="0.16"/>
      ${label ? `<text x="${barX + 12}" y="${barY + 27}" clip-path="url(#${id})" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${fontSize}" font-weight="650" text-rendering="geometricPrecision">${label}</text>` : ""}
    </g>`;
}

function renderTodayMarker(index: number, today: Date, rowH: number): string {
  const fraction = (today.getHours() * 60 + today.getMinutes()) / (24 * 60);
  const x = index * DAY_WIDTH + fraction * DAY_WIDTH;
  return `<g>
      <line x1="${x}" y1="${DAY_HEADER_HEIGHT}" x2="${x}" y2="${rowH}" stroke="#FFFFFF" stroke-width="4" opacity="0.85"/>
      <circle cx="${x}" cy="${DAY_HEADER_HEIGHT}" r="3" fill="#FFFFFF"/>
    </g>`;
}

interface SummaryEntry {
  name: string;
  hours: number;
  color: string;
}

const FONT = "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
const SUMMARY_BLOCK_HEIGHT = 100;
const SUMMARY_MONTH_COL_WIDTH = 200;
const SUMMARY_GAP = 12;
const SUMMARY_COLS_THRESHOLD = 5;
const SUMMARY_VERTICAL_ROW_HEIGHT = 36;
const SUMMARY_VERTICAL_PADDING = 14;

function summaryBlockHeight(n: number): number {
  if (n <= SUMMARY_COLS_THRESHOLD) return SUMMARY_BLOCK_HEIGHT;
  return n * SUMMARY_VERTICAL_ROW_HEIGHT + SUMMARY_VERTICAL_PADDING * 2;
}

function formatDaysHours(totalHours: number): string {
  const days = Math.floor(totalHours / 24);
  const hours = Math.round(totalHours % 24);
  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  return `${hours}h`;
}

function computeMonthSummary(
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
    const fullName = `${event.user.first_name} ${event.user.last_name}`.trim();
    const displayName = fullName || event.user.email;
    totalHours.set(displayName, (totalHours.get(displayName) ?? 0) + hours);
  }

  return [...totalHours.entries()]
    .map(([name, hours]) => ({
      name,
      hours,
      color: colorMap.get(name) ?? "#16C77A",
    }))
    .sort((a, b) => b.hours - a.hours);
}

function renderSummaryBlock(year: number, month: number, summary: SummaryEntry[], offsetY: number): string {
  if (summary.length === 0) return "";

  const monthLabel = escapeXml(formatMonthLabel({ year, month }));
  const n = summary.length;
  const height = summaryBlockHeight(n);
  const midY = height / 2;

  let items: string;

  if (n <= SUMMARY_COLS_THRESHOLD) {
    const statsAreaWidth = WIDTH - SUMMARY_MONTH_COL_WIDTH;
    const cellWidth = statsAreaWidth / n;
    const dotR = 7;
    items = summary
      .map(({ name, hours, color }, i) => {
        const cellX = SUMMARY_MONTH_COL_WIDTH + i * cellWidth;
        const dotCx = cellX + 20;
        const textX = dotCx + dotR + 10;
        const label = escapeXml(name);
        const stats = escapeXml(formatDaysHours(hours));
        return `<circle cx="${dotCx}" cy="${midY - 10}" r="${dotR}" fill="${color}"/>
    <text x="${textX}" y="${midY - 3}" fill="#AEB8D3" font-family="${FONT}" font-size="19" font-weight="600">${label}</text>
    <text x="${textX}" y="${midY + 20}" fill="#707B96" font-family="${FONT}" font-size="16">${stats}</text>`;
      })
      .join("\n  ");
  } else {
    const dotR = 6;
    const rowH = SUMMARY_VERTICAL_ROW_HEIGHT;
    const padY = SUMMARY_VERTICAL_PADDING;
    const dotX = SUMMARY_MONTH_COL_WIDTH + 20;
    items = summary
      .map(({ name, hours, color }, i) => {
        const cy = padY + i * rowH + rowH / 2;
        const textX = dotX + dotR + 10;
        const label = escapeXml(name);
        const stats = escapeXml(formatDaysHours(hours));
        return `<circle cx="${dotX}" cy="${cy}" r="${dotR}" fill="${color}"/>
    <text x="${textX}" y="${cy + 5}" fill="#AEB8D3" font-family="${FONT}" font-size="17" font-weight="600">${label}</text>
    <text x="${WIDTH - 24}" y="${cy + 5}" text-anchor="end" fill="#707B96" font-family="${FONT}" font-size="15">${stats}</text>`;
      })
      .join("\n  ");
  }

  return `<g transform="translate(0, ${offsetY})">
  <rect width="${WIDTH}" height="${height}" rx="10" fill="#1F2433" fill-opacity="0.2"/>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${height - 1}" rx="10" fill="none" stroke="#303A50"/>
  <text x="24" y="${midY + 7}" fill="#F3F5FA" font-family="${FONT}" font-size="18" font-weight="700">${monthLabel}</text>
  <line x1="${SUMMARY_MONTH_COL_WIDTH}" y1="16" x2="${SUMMARY_MONTH_COL_WIDTH}" y2="${height - 16}" stroke="#303A50"/>
  ${items}
</g>`;
}

function startOfWeek(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatWeekday(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
}

function formatMonthLabel(currentMonth: { year: number; month: number }): string {
  return new Date(currentMonth.year, currentMonth.month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
