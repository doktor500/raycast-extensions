import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getOnCallForDay, type OnCallEvent } from "./dates";
import { buildColorMap, getTextColor } from "./colors";

interface WeekSegment {
  startDayIndex: number;
  endDayIndex: number;
  label: string;
  color: string;
}

const WIDTH = 1160;
const ROW_HEIGHT_TOTAL = 92;
const BLOCK_GAP = 40;
const BLOCK_HEADER_HEIGHT = 44;
const DAY_WIDTH = WIDTH / 7;
const DAY_HEADER_HEIGHT = 30;
const ROW_TOP = 40;
const ROW_HEIGHT = 42;

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

  // Find all calendar months covered by the window (in order)
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

  // Each month block gets all weeks that have at least one day in that month
  const monthGroups = monthList.map(({ year, month }) => ({
    year,
    month,
    weeks: allWeeks.filter((days) => days.some((d) => d.getFullYear() === year && d.getMonth() === month)),
  }));

  const calHeight = (g: (typeof monthGroups)[0]) => BLOCK_HEADER_HEIGHT + g.weeks.length * ROW_HEIGHT_TOTAL;
  const monthTotalHeight = (g: (typeof monthGroups)[0]) => calHeight(g) + SUMMARY_GAP + SUMMARY_BLOCK_HEIGHT;
  const totalHeight =
    monthGroups.reduce((sum, g) => sum + monthTotalHeight(g), 0) + (monthGroups.length - 1) * BLOCK_GAP;

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

  const columnBg = backgroundColor ?? "none";

  let currentY = 0;
  const blocksContent = monthGroups
    .map(({ year, month, weeks }, i) => {
      const ch = calHeight({ year, month, weeks });
      const calBlock = renderMonthBlock(
        weeks,
        currentY,
        ch,
        today,
        events,
        { year, month },
        colorMap,
        showTodayMarker,
        columnBg,
      );
      const summary = computeMonthSummary(year, month, events, colorMap, today);
      const summaryBlock = renderSummaryBlock(year, month, summary, currentY + ch + SUMMARY_GAP);
      const dividerY = currentY + monthTotalHeight({ year, month, weeks }) + BLOCK_GAP / 2;
      const divider =
        i < monthGroups.length - 1
          ? `<line x1="0" y1="${dividerY}" x2="${WIDTH}" y2="${dividerY}" stroke="#4A5568" stroke-width="2"/>`
          : "";
      currentY += monthTotalHeight({ year, month, weeks }) + BLOCK_GAP;
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
  events: OnCallEvent[],
  currentMonth: { year: number; month: number },
  colorMap: Map<string, string>,
  showTodayMarker: boolean,
  columnBg: string,
): string {
  const monthLabel = escapeXml(formatMonthLabel(currentMonth));

  const weeksContent = weeks
    .map((days, localIndex) => {
      const segments = buildWeekSegments(days, events, currentMonth, colorMap);
      return renderWeekGroup(
        days,
        segments,
        today,
        localIndex,
        BLOCK_HEADER_HEIGHT + localIndex * ROW_HEIGHT_TOTAL,
        currentMonth,
        showTodayMarker,
        columnBg,
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

function buildWeekSegments(
  days: Date[],
  events: OnCallEvent[],
  currentMonth: { year: number; month: number },
  colorMap: Map<string, string>,
): WeekSegment[] {
  const assignments = days.map((day) => {
    if (day.getFullYear() !== currentMonth.year || day.getMonth() !== currentMonth.month) return null;
    const person = getOnCallForDay(day, events);
    if (!person) return null;
    const fullName = `${person.first_name} ${person.last_name}`.trim();
    const displayName = fullName || person.email;
    return { label: displayName, color: colorMap.get(displayName) ?? "#16C77A" };
  });

  const segments: WeekSegment[] = [];
  let segmentStart = 0;

  while (segmentStart < assignments.length) {
    const assignment = assignments[segmentStart];
    if (!assignment) {
      segmentStart += 1;
      continue;
    }

    let segmentEnd = segmentStart;
    while (segmentEnd + 1 < assignments.length && assignments[segmentEnd + 1]?.label === assignment.label) {
      segmentEnd += 1;
    }

    segments.push({
      startDayIndex: segmentStart,
      endDayIndex: segmentEnd,
      label: assignment.label,
      color: assignment.color,
    });
    segmentStart = segmentEnd + 1;
  }

  return segments;
}

function renderWeekGroup(
  days: Date[],
  segments: WeekSegment[],
  today: Date,
  weekIndex: number,
  offsetY: number,
  currentMonth: { year: number; month: number },
  showTodayMarker: boolean,
  columnBg: string,
): string {
  const todayIndex = days.findIndex((day) => isSameDay(day, today));
  const divider = weekIndex > 0 ? `<line x1="0" y1="0" x2="${WIDTH}" y2="0" stroke="#303A50"/>` : "";

  return `<g transform="translate(0, ${offsetY})">
    ${divider}

    ${days.map((day, index) => renderDayColumn(day, index, currentMonth, columnBg)).join("\n    ")}
    ${segments.map((segment, index) => renderSegment(segment, (currentMonth.year * 12 + currentMonth.month) * 1000 + weekIndex * 100 + index)).join("\n    ")}
    ${showTodayMarker && todayIndex >= 0 ? renderTodayMarker(todayIndex, today) : ""}
  </g>`;
}

function renderDayColumn(
  day: Date,
  index: number,
  currentMonth: { year: number; month: number },
  columnBg: string,
): string {
  const x = index * DAY_WIDTH;
  const center = x + DAY_WIDTH / 2;
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const inMonth = day.getFullYear() === currentMonth.year && day.getMonth() === currentMonth.month;
  const bgRect =
    columnBg !== "none"
      ? `<rect x="${x}" y="0" width="${DAY_WIDTH}" height="${ROW_HEIGHT_TOTAL}" fill="${columnBg}"/>`
      : "";

  if (!inMonth) {
    return `<g>
      ${bgRect}
      ${isWeekend ? `<rect x="${x}" y="0" width="${DAY_WIDTH}" height="${ROW_HEIGHT_TOTAL}" fill="url(#hatch)" opacity="0.3"/>` : ""}
    </g>`;
  }

  return `<g>
      ${bgRect}
      ${isWeekend ? `<rect x="${x}" y="0" width="${DAY_WIDTH}" height="${ROW_HEIGHT_TOTAL}" fill="url(#hatch)"/>` : ""}
      <line x1="${x}" y1="0" x2="${x}" y2="${ROW_HEIGHT_TOTAL}" stroke="#2A3449"/>
      <line x1="${x}" y1="${DAY_HEADER_HEIGHT}" x2="${x + DAY_WIDTH}" y2="${DAY_HEADER_HEIGHT}" stroke="#2D374C"/>
      <text x="${center - 3}" y="22" text-anchor="end" fill="#707B96" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13" font-weight="600">${formatWeekday(day)}</text>
      <text x="${center + 3}" y="22" text-anchor="start" fill="#AEB8D3" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="16" font-weight="650">${day.getDate()}</text>
    </g>`;
}

function renderSegment(segment: WeekSegment, clipId: number): string {
  const x = segment.startDayIndex * DAY_WIDTH + 3;
  const width = (segment.endDayIndex - segment.startDayIndex + 1) * DAY_WIDTH - 6;
  const label = escapeXml(segment.label);
  const id = `seg-${clipId}`;

  return `<g>
      <clipPath id="${id}">
        <rect x="${x + 10}" y="${ROW_TOP}" width="${Math.max(width - 20, 1)}" height="${ROW_HEIGHT}"/>
      </clipPath>
      <rect x="${x}" y="${ROW_TOP}" width="${width}" height="${ROW_HEIGHT}" rx="6" fill="${segment.color}" filter="url(#shadow)"/>
      <rect x="${x + 1}" y="${ROW_TOP + 1}" width="${width - 2}" height="${ROW_HEIGHT - 2}" rx="5" fill="none" stroke="${getTextColor(segment.color)}" stroke-opacity="0.16"/>
      <text x="${x + 12}" y="${ROW_TOP + 27}" clip-path="url(#${id})" fill="${getTextColor(segment.color)}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="19" font-weight="650" text-rendering="geometricPrecision">${label}</text>
    </g>`;
}

function renderTodayMarker(index: number, today: Date): string {
  const fraction = (today.getHours() * 60 + today.getMinutes()) / (24 * 60);
  const x = index * DAY_WIDTH + fraction * DAY_WIDTH;
  return `<g>
      <line x1="${x}" y1="${DAY_HEADER_HEIGHT}" x2="${x}" y2="${ROW_HEIGHT_TOTAL}" stroke="#FFFFFF" stroke-width="4" opacity="0.85"/>
      <circle cx="${x}" cy="${DAY_HEADER_HEIGHT}" r="3" fill="#FFFFFF"/>
    </g>`;
}

interface SummaryEntry {
  name: string;
  days: number;
  remainingHours: number;
  color: string;
}

const FONT = "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
const SUMMARY_BLOCK_HEIGHT = 100;
const SUMMARY_MONTH_COL_WIDTH = 200;
const SUMMARY_GAP = 12;

export function buildSummarySvg(events: OnCallEvent[], today: Date, window: { start: Date; end: Date }): string {
  const monthGroups = getMonthsInWindow(window);

  const uniqueNames = [
    ...new Set(
      events.map((e) => {
        const fullName = `${e.user.first_name} ${e.user.last_name}`.trim();
        return fullName || e.user.email;
      }),
    ),
  ].sort();
  const colorMap = buildColorMap(uniqueNames);

  const totalHeight = monthGroups.length * SUMMARY_BLOCK_HEIGHT + (monthGroups.length - 1) * SUMMARY_GAP;

  let currentY = 0;
  const blocks = monthGroups
    .map(({ year, month }) => {
      const summary = computeMonthSummary(year, month, events, colorMap, today);
      const block = renderSummaryBlock(year, month, summary, currentY);
      currentY += SUMMARY_BLOCK_HEIGHT + SUMMARY_GAP;
      return block;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${totalHeight}" viewBox="0 0 ${WIDTH} ${totalHeight}">${blocks}</svg>`;
}

function getMonthsInWindow(window: { start: Date; end: Date }): Array<{ year: number; month: number }> {
  const seen = new Set<string>();
  const list: Array<{ year: number; month: number }> = [];
  const cur = new Date(window.start.getFullYear(), window.start.getMonth(), 1);
  const end = new Date(window.end.getFullYear(), window.end.getMonth(), 1);
  while (cur <= end) {
    const key = `${cur.getFullYear()}-${cur.getMonth()}`;
    if (!seen.has(key)) {
      seen.add(key);
      list.push({ year: cur.getFullYear(), month: cur.getMonth() });
    }
    cur.setMonth(cur.getMonth() + 1);
  }
  return list;
}

function computeMonthSummary(
  year: number,
  month: number,
  events: OnCallEvent[],
  colorMap: Map<string, string>,
  today: Date,
): SummaryEntry[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCounts = new Map<string, number>();

  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month, d);
    const person = getOnCallForDay(day, events);
    if (!person) continue;
    const fullName = `${person.first_name} ${person.last_name}`.trim();
    const displayName = fullName || person.email;
    totalCounts.set(displayName, (totalCounts.get(displayName) ?? 0) + 1);
  }

  // Remaining hours = hours left in the CURRENT running shift only.
  // Only the person on-call right now can have remaining hours.
  const currentPerson = getOnCallForDay(today, events);
  const currentPersonName = currentPerson
    ? `${currentPerson.first_name} ${currentPerson.last_name}`.trim() || currentPerson.email
    : null;

  let remainingHoursForCurrent = 0;
  if (currentPersonName && today.getFullYear() === year && today.getMonth() === month) {
    for (let d = today.getDate() + 1; d <= daysInMonth; d++) {
      const day = new Date(year, month, d);
      const person = getOnCallForDay(day, events);
      if (!person) break;
      const name = `${person.first_name} ${person.last_name}`.trim() || person.email;
      if (name !== currentPersonName) break;
      remainingHoursForCurrent += 24;
    }
  }

  return [...totalCounts.entries()]
    .map(([name, days]) => ({
      name,
      days,
      remainingHours: name === currentPersonName ? remainingHoursForCurrent : 0,
      color: colorMap.get(name) ?? "#16C77A",
    }))
    .sort((a, b) => b.days - a.days);
}

function renderSummaryBlock(year: number, month: number, summary: SummaryEntry[], offsetY: number): string {
  if (summary.length === 0) return "";

  const monthLabel = escapeXml(formatMonthLabel({ year, month }));
  const n = summary.length;
  const statsAreaWidth = WIDTH - SUMMARY_MONTH_COL_WIDTH;
  const cellWidth = statsAreaWidth / n;
  const dotR = 7;
  const midY = SUMMARY_BLOCK_HEIGHT / 2;

  const items = summary
    .map(({ name, days, color }, i) => {
      const cellX = SUMMARY_MONTH_COL_WIDTH + i * cellWidth;
      const dotCx = cellX + 20;
      const textX = dotCx + dotR + 10;
      const label = escapeXml(name);
      const stats = escapeXml(`${days}d`);
      return `<circle cx="${dotCx}" cy="${midY - 10}" r="${dotR}" fill="${color}"/>
    <text x="${textX}" y="${midY - 3}" fill="#AEB8D3" font-family="${FONT}" font-size="19" font-weight="600">${label}</text>
    <text x="${textX}" y="${midY + 20}" fill="#707B96" font-family="${FONT}" font-size="16">${stats}</text>`;
    })
    .join("\n  ");

  return `<g transform="translate(0, ${offsetY})">
  <rect width="${WIDTH}" height="${SUMMARY_BLOCK_HEIGHT}" rx="10" fill="#1F2433" fill-opacity="0.2"/>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${SUMMARY_BLOCK_HEIGHT - 1}" rx="10" fill="none" stroke="#303A50"/>
  <text x="24" y="${midY + 7}" fill="#F3F5FA" font-family="${FONT}" font-size="18" font-weight="700">${monthLabel}</text>
  <line x1="${SUMMARY_MONTH_COL_WIDTH}" y1="16" x2="${SUMMARY_MONTH_COL_WIDTH}" y2="${SUMMARY_BLOCK_HEIGHT - 16}" stroke="#303A50"/>
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
