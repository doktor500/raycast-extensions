import { getOnCallForDay, getThreeMonthWindow, type OnCallEvent } from "./dates";
import { getSvgColorForPerson } from "./colors";

interface WeekSchedule {
  label: string;
  svg: string;
}

interface WeekSegment {
  startDayIndex: number;
  endDayIndex: number;
  label: string;
  color: string;
}

const WIDTH = 1160;
const HEIGHT = 136;
const LABEL_WIDTH = 245;
const DAY_WIDTH = (WIDTH - LABEL_WIDTH) / 7;
const HEADER_HEIGHT = 28;
const ROW_TOP = 58;
const ROW_HEIGHT = 46;

export function buildWeeklyScheduleSvgs(events: OnCallEvent[], today = new Date()): WeekSchedule[] {
  const { start, end } = getThreeMonthWindow();
  const firstWeekStart = startOfWeek(start);
  const lastWeekStart = startOfWeek(end);
  const weeks: WeekSchedule[] = [];

  for (let weekStart = firstWeekStart; weekStart <= lastWeekStart; weekStart = addDays(weekStart, 7)) {
    const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
    const segments = buildWeekSegments(days, events);

    weeks.push({
      label: formatWeekLabel(days),
      svg: renderWeekSvg(days, segments, start, end, today),
    });
  }

  return weeks;
}

export function toSvgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildWeekSegments(days: Date[], events: OnCallEvent[]): WeekSegment[] {
  const assignments = days.map((day) => {
    const person = getOnCallForDay(day, events);
    if (!person) {
      return null;
    }

    const fullName = `${person.first_name} ${person.last_name}`.trim();
    return {
      label: fullName || person.email,
      color: getSvgColorForPerson(fullName || person.email),
    };
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

function renderWeekSvg(days: Date[], segments: WeekSegment[], windowStart: Date, windowEnd: Date, today: Date): string {
  const weekLabel = escapeXml(formatWeekLabel(days));
  const todayIndex = days.findIndex((day) => isSameDay(day, today));
  const monthLabel = escapeXml(formatMonthLabel(days));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
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

  <rect width="${WIDTH}" height="${HEIGHT}" rx="10" fill="url(#bg)"/>
  <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="10" fill="none" stroke="#303A50"/>
  <line x1="0" y1="${HEADER_HEIGHT}" x2="${WIDTH}" y2="${HEADER_HEIGHT}" stroke="#2D374C"/>
  <line x1="${LABEL_WIDTH}" y1="0" x2="${LABEL_WIDTH}" y2="${HEIGHT}" stroke="#2D374C"/>

  <text x="24" y="20" fill="#AAB3CA" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="15" font-weight="600">${monthLabel}</text>
  <text x="${LABEL_WIDTH / 2}" y="88" fill="#F3F5FA" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18" font-weight="650" text-anchor="middle">Primary</text>
  <text x="${LABEL_WIDTH + 12}" y="120" fill="#77829A" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13">${weekLabel}</text>

  ${days.map((day, index) => renderDayColumn(day, index, windowStart, windowEnd)).join("\n  ")}
  ${segments.map((segment, index) => renderSegment(segment, index)).join("\n  ")}
  ${todayIndex >= 0 ? renderTodayMarker(todayIndex) : ""}
</svg>`;
}

function renderDayColumn(day: Date, index: number, windowStart: Date, windowEnd: Date): string {
  const x = LABEL_WIDTH + index * DAY_WIDTH;
  const center = x + DAY_WIDTH / 2;
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const isOutsideWindow = day < windowStart || day > windowEnd;
  const dateColor = isOutsideWindow ? "#515B72" : "#AEB8D3";
  const weekdayColor = isOutsideWindow ? "#455067" : "#707B96";

  return `<g>
    <rect x="${x}" y="0" width="${DAY_WIDTH}" height="${HEIGHT}" fill="${isWeekend ? "url(#hatch)" : "transparent"}" opacity="${isOutsideWindow ? "0.45" : "1"}"/>
    <line x1="${x}" y1="0" x2="${x}" y2="${HEIGHT}" stroke="#2A3449"/>
    <text x="${center}" y="19" text-anchor="middle" fill="${dateColor}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18" font-weight="650">${day.getDate()}</text>
    <text x="${center}" y="45" text-anchor="middle" fill="${weekdayColor}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="12" font-weight="600">${formatWeekday(day)}</text>
  </g>`;
}

function renderSegment(segment: WeekSegment, index: number): string {
  const x = LABEL_WIDTH + segment.startDayIndex * DAY_WIDTH + 3;
  const width = (segment.endDayIndex - segment.startDayIndex + 1) * DAY_WIDTH - 6;
  const label = escapeXml(segment.label);
  const clipId = `segment-label-${index}`;

  return `<g filter="url(#shadow)">
    <clipPath id="${clipId}">
      <rect x="${x + 10}" y="${ROW_TOP}" width="${Math.max(width - 20, 1)}" height="${ROW_HEIGHT}"/>
    </clipPath>
    <rect x="${x}" y="${ROW_TOP}" width="${width}" height="${ROW_HEIGHT}" rx="6" fill="${segment.color}"/>
    <rect x="${x + 1}" y="${ROW_TOP + 1}" width="${width - 2}" height="${ROW_HEIGHT - 2}" rx="5" fill="none" stroke="#FFFFFF" stroke-opacity="0.16"/>
    <text x="${x + 12}" y="${ROW_TOP + 29}" clip-path="url(#${clipId})" fill="#FFFFFF" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="18" font-weight="650">${label}</text>
  </g>`;
}

function renderTodayMarker(index: number): string {
  const x = LABEL_WIDTH + (index + 0.5) * DAY_WIDTH;

  return `<g>
    <line x1="${x}" y1="${HEADER_HEIGHT}" x2="${x}" y2="${HEIGHT - 8}" stroke="#FFFFFF" stroke-width="1.5" opacity="0.85"/>
    <circle cx="${x}" cy="${HEADER_HEIGHT}" r="3" fill="#FFFFFF"/>
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
  return date.toLocaleDateString("default", { weekday: "short" }).toUpperCase();
}

function formatWeekLabel(days: Date[]): string {
  const first = days[0];
  const last = days[6];
  return `${formatShortDate(first)} - ${formatShortDate(last)}`;
}

function formatMonthLabel(days: Date[]): string {
  const firstMonth = days[0].toLocaleDateString("default", {
    month: "long",
    year: "numeric",
  });
  const lastMonth = days[6].toLocaleDateString("default", {
    month: "long",
    year: "numeric",
  });

  return firstMonth === lastMonth ? firstMonth : `${firstMonth} / ${lastMonth}`;
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString("default", {
    month: "short",
    day: "numeric",
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
