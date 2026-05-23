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
const BLOCK_GAP = 20;
const BLOCK_HEADER_HEIGHT = 44;
const DAY_WIDTH = WIDTH / 7;
const DAY_HEADER_HEIGHT = 30;
const ROW_TOP = 40;
const ROW_HEIGHT = 42;

export function buildCombinedScheduleSvg(
  events: OnCallEvent[],
  today: Date,
  window: { start: Date; end: Date },
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

  const blockHeight = (g: (typeof monthGroups)[0]) => BLOCK_HEADER_HEIGHT + g.weeks.length * ROW_HEIGHT_TOTAL;
  const totalHeight = monthGroups.reduce((sum, g) => sum + blockHeight(g), 0) + (monthGroups.length - 1) * BLOCK_GAP;

  const uniqueNames = [
    ...new Set(
      events.map((e) => {
        const fullName = `${e.user.first_name} ${e.user.last_name}`.trim();
        return fullName || e.user.email;
      }),
    ),
  ].sort();
  const colorMap = buildColorMap(uniqueNames);

  let currentY = 0;
  const blocksContent = monthGroups
    .map(({ year, month, weeks }) => {
      const bh = blockHeight({ year, month, weeks });
      const block = renderMonthBlock(weeks, currentY, bh, today, events, { year, month }, colorMap);
      currentY += bh + BLOCK_GAP;
      return block;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${totalHeight}" viewBox="0 0 ${WIDTH} ${totalHeight}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#182033"/>
      <stop offset="1" stop-color="#101827"/>
    </linearGradient>
    <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
      <path d="M 0 0 L 0 8" stroke="#33405A" stroke-width="1" opacity="0.55"/>
    </pattern>
    <filter id="shadow" x="-10%" y="-30%" width="120%" height="170%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#050816" flood-opacity="0.3"/>
    </filter>
  </defs>

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
      );
    })
    .join("");

  return `<g transform="translate(0, ${blockOffsetY})">
    <rect width="${WIDTH}" height="${blockHeight}" rx="10" fill="url(#bg)"/>
    <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${blockHeight - 1}" rx="10" fill="none" stroke="#303A50"/>
    <text x="${WIDTH / 2}" y="${BLOCK_HEADER_HEIGHT / 2 + 7}" text-anchor="middle" fill="#F3F5FA" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="17" font-weight="700">${monthLabel}</text>
    <line x1="0" y1="${BLOCK_HEADER_HEIGHT}" x2="${WIDTH}" y2="${BLOCK_HEADER_HEIGHT}" stroke="#303A50"/>
    ${weeksContent}
  </g>`;
}

export function toSvgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
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
): string {
  const todayIndex = days.findIndex((day) => isSameDay(day, today));
  const divider = weekIndex > 0 ? `<line x1="0" y1="0" x2="${WIDTH}" y2="0" stroke="#303A50"/>` : "";

  return `<g transform="translate(0, ${offsetY})">
    ${divider}

    ${days.map((day, index) => renderDayColumn(day, index, currentMonth)).join("\n    ")}
    ${segments.map((segment, index) => renderSegment(segment, weekIndex * 100 + index)).join("\n    ")}
    ${todayIndex >= 0 ? renderTodayMarker(todayIndex, today) : ""}
  </g>`;
}

function renderDayColumn(day: Date, index: number, currentMonth: { year: number; month: number }): string {
  const x = index * DAY_WIDTH;
  const center = x + DAY_WIDTH / 2;
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const inMonth = day.getFullYear() === currentMonth.year && day.getMonth() === currentMonth.month;

  if (!inMonth) {
    return `<g>
      <rect x="${x}" y="0" width="${DAY_WIDTH}" height="${ROW_HEIGHT_TOTAL}" fill="${isWeekend ? "url(#hatch)" : "transparent"}" opacity="0.3"/>
    </g>`;
  }

  return `<g>
      <rect x="${x}" y="0" width="${DAY_WIDTH}" height="${ROW_HEIGHT_TOTAL}" fill="${isWeekend ? "url(#hatch)" : "transparent"}"/>
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
