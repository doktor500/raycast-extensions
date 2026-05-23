import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { startOfWeek, addDays, isSameDay } from "../utils/dates";
import { buildColorMap, getTextColor } from "../utils/colors";
import {
  type WeekSpanBar,
  type SummaryEntry,
  LAYOUT,
  SUMMARY,
  weekRowHeight,
  summaryBlockHeight,
  formatDaysHours,
  truncateLabel,
  escapeXml,
  formatWeekday,
  formatMonthLabel,
  buildWeekSpanBars,
  computeMonthSummary,
} from "./layout-svg";
import { formatUserName, OnCallEvent } from "../domain/on-call-event";

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
  const uniqueNames = [...new Set(colorSourceEvents.map((e) => formatUserName(e.user)))].sort();
  const colorMap = buildColorMap(uniqueNames);

  const weekTimelinesByMonth = monthGroups.map(({ year, month, weeks }) =>
    weeks.map((days) => buildWeekSpanBars(days, events, { year, month }, colorMap)),
  );

  const weekRowHeightsByMonth = weekTimelinesByMonth.map((weekTimelines) =>
    weekTimelines.map((weekTimeline) => {
      const maxLanes = Math.max(1, ...weekTimeline.map((b) => b.lane + 1));
      return weekRowHeight(maxLanes);
    }),
  );

  const calHeight = (mi: number) => LAYOUT.BLOCK_HEADER_HEIGHT + weekRowHeightsByMonth[mi].reduce((a, b) => a + b, 0);
  const summaries = monthGroups.map(({ year, month }) => computeMonthSummary(year, month, events, colorMap));
  const monthTotalHeight = (idx: number) =>
    calHeight(idx) + LAYOUT.SUMMARY_GAP + summaryBlockHeight(summaries[idx].length);
  const totalHeight =
    monthGroups.reduce((sum, _g, idx) => sum + monthTotalHeight(idx), 0) + (monthGroups.length - 1) * LAYOUT.BLOCK_GAP;

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
      const summaryBlock = renderSummaryBlock(year, month, summary, currentY + ch + LAYOUT.SUMMARY_GAP);
      const dividerY = currentY + monthTotalHeight(i) + LAYOUT.BLOCK_GAP / 2;
      const divider =
        i < monthGroups.length - 1
          ? `<line x1="0" y1="${dividerY}" x2="${LAYOUT.WIDTH}" y2="${dividerY}" stroke="#4A5568" stroke-width="2"/>`
          : "";
      currentY += monthTotalHeight(i) + LAYOUT.BLOCK_GAP;
      return calBlock + summaryBlock + divider;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LAYOUT.WIDTH}" height="${totalHeight}" viewBox="0 0 ${LAYOUT.WIDTH} ${totalHeight}">
  <defs>
    <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
      ${columnBg !== "none" ? `<rect width="8" height="8" fill="${columnBg}"/>` : ""}
      <path d="M 0 0 L 0 8" stroke="#182033" stroke-width="1" opacity="0.50"/>
    </pattern>
    <filter id="shadow" x="-10%" y="-30%" width="120%" height="170%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#050816" flood-opacity="0.3"/>
    </filter>
  </defs>
  ${backgroundColor ? `<rect width="${LAYOUT.WIDTH}" height="${totalHeight}" fill="${backgroundColor}"/>` : ""}

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
      const offsetY = LAYOUT.BLOCK_HEADER_HEIGHT + weekRowHeights.slice(0, localIndex).reduce((a, b) => a + b, 0);
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
    <rect width="${LAYOUT.WIDTH}" height="${blockHeight}" rx="10" fill="#1F2433" fill-opacity="0.2"/>
    <rect x="0.5" y="0.5" width="${LAYOUT.WIDTH - 1}" height="${blockHeight - 1}" rx="10" fill="none" stroke="#303A50"/>
    <text x="${LAYOUT.WIDTH / 2}" y="${LAYOUT.BLOCK_HEADER_HEIGHT / 2 + 7}" text-anchor="middle" fill="#F3F5FA" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="17" font-weight="700">${monthLabel}</text>
    <line x1="0" y1="${LAYOUT.BLOCK_HEADER_HEIGHT}" x2="${LAYOUT.WIDTH}" y2="${LAYOUT.BLOCK_HEADER_HEIGHT}" stroke="#303A50"/>
    ${weeksContent}
  </g>`;
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
  const divider = weekIndex > 0 ? `<line x1="0" y1="0" x2="${LAYOUT.WIDTH}" y2="0" stroke="#303A50"/>` : "";

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
  const x = index * LAYOUT.DAY_WIDTH;
  const center = x + LAYOUT.DAY_WIDTH / 2;
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const inMonth = day.getFullYear() === currentMonth.year && day.getMonth() === currentMonth.month;
  const bgRect =
    columnBg !== "none" ? `<rect x="${x}" y="0" width="${LAYOUT.DAY_WIDTH}" height="${rowH}" fill="${columnBg}"/>` : "";

  if (!inMonth) {
    return `<g>
      ${bgRect}
      ${isWeekend ? `<rect x="${x}" y="0" width="${LAYOUT.DAY_WIDTH}" height="${rowH}" fill="url(#hatch)" opacity="0.3"/>` : ""}
    </g>`;
  }

  return `<g>
      ${bgRect}
      ${isWeekend ? `<rect x="${x}" y="0" width="${LAYOUT.DAY_WIDTH}" height="${rowH}" fill="url(#hatch)"/>` : ""}
      <line x1="${x}" y1="0" x2="${x}" y2="${rowH}" stroke="#2A3449"/>
      <line x1="${x}" y1="${LAYOUT.DAY_HEADER_HEIGHT}" x2="${x + LAYOUT.DAY_WIDTH}" y2="${LAYOUT.DAY_HEADER_HEIGHT}" stroke="#2D374C"/>
      <text x="${center - 3}" y="22" text-anchor="end" fill="#707B96" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="13" font-weight="600">${formatWeekday(day)}</text>
      <text x="${center + 3}" y="22" text-anchor="start" fill="#AEB8D3" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="16" font-weight="650">${day.getDate()}</text>
    </g>`;
}

function renderSpanBar(bar: WeekSpanBar, clipId: number): string {
  const leftX = bar.startDayIdx * LAYOUT.DAY_WIDTH + bar.startFrac * LAYOUT.DAY_WIDTH;
  const rightX = bar.endDayIdx * LAYOUT.DAY_WIDTH + bar.endFrac * LAYOUT.DAY_WIDTH;
  const barX = leftX + LAYOUT.H_GAP;
  const barWidth = Math.max(rightX - leftX - 2 * LAYOUT.H_GAP, 2);
  const barY = LAYOUT.ROW_TOP + bar.lane * (LAYOUT.ROW_HEIGHT + LAYOUT.BAR_GAP);
  const id = `bar-${clipId}`;
  const textColor = getTextColor(bar.color);
  const fontSize = 19;
  const rx = Math.min(6, Math.floor(barWidth / 3));
  const textAvailWidth = barWidth - 22;
  const label = textAvailWidth > 15 ? escapeXml(truncateLabel(bar.label, textAvailWidth, fontSize)) : "";

  return `<g>
      <clipPath id="${id}">
        <rect x="${barX + 10}" y="${barY}" width="${Math.max(barWidth - 20, 1)}" height="${LAYOUT.ROW_HEIGHT}"/>
      </clipPath>
      <rect x="${barX}" y="${barY}" width="${barWidth}" height="${LAYOUT.ROW_HEIGHT}" rx="${rx}" fill="${bar.color}" filter="url(#shadow)"/>
      <rect x="${barX + 1}" y="${barY + 1}" width="${barWidth - 2}" height="${LAYOUT.ROW_HEIGHT - 2}" rx="${Math.max(rx - 1, 0)}" fill="none" stroke="${textColor}" stroke-opacity="0.16"/>
      ${label ? `<text x="${barX + 12}" y="${barY + 27}" clip-path="url(#${id})" fill="${textColor}" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="${fontSize}" font-weight="650" text-rendering="geometricPrecision">${label}</text>` : ""}
    </g>`;
}

function renderTodayMarker(index: number, today: Date, rowH: number): string {
  const fraction = (today.getHours() * 60 + today.getMinutes()) / (24 * 60);
  const x = index * LAYOUT.DAY_WIDTH + fraction * LAYOUT.DAY_WIDTH;
  return `<g>
      <line x1="${x}" y1="${LAYOUT.DAY_HEADER_HEIGHT}" x2="${x}" y2="${rowH}" stroke="#FFFFFF" stroke-width="4" opacity="0.85"/>
      <circle cx="${x}" cy="${LAYOUT.DAY_HEADER_HEIGHT}" r="3" fill="#FFFFFF"/>
    </g>`;
}

function renderSummaryBlock(year: number, month: number, summary: SummaryEntry[], offsetY: number): string {
  if (summary.length === 0) return "";

  const monthLabel = escapeXml(formatMonthLabel({ year, month }));
  const n = summary.length;
  const height = summaryBlockHeight(n);
  const midY = height / 2;

  let items: string;

  if (n <= SUMMARY.COLS_THRESHOLD) {
    const statsAreaWidth = LAYOUT.WIDTH - SUMMARY.MONTH_COL_WIDTH;
    const cellWidth = statsAreaWidth / n;
    const dotR = 7;
    items = summary
      .map(({ name, hours, color }, i) => {
        const cellX = SUMMARY.MONTH_COL_WIDTH + i * cellWidth;
        const dotCx = cellX + 20;
        const textX = dotCx + dotR + 10;
        const label = escapeXml(name);
        const stats = escapeXml(formatDaysHours(hours));
        return `<circle cx="${dotCx}" cy="${midY - 10}" r="${dotR}" fill="${color}"/>
    <text x="${textX}" y="${midY - 3}" fill="#AEB8D3" font-family="${SUMMARY.FONT}" font-size="19" font-weight="600">${label}</text>
    <text x="${textX}" y="${midY + 20}" fill="#707B96" font-family="${SUMMARY.FONT}" font-size="16">${stats}</text>`;
      })
      .join("\n  ");
  } else {
    const dotR = 6;
    const rowH = SUMMARY.VERTICAL_ROW_HEIGHT;
    const padY = SUMMARY.VERTICAL_PADDING;
    const dotX = SUMMARY.MONTH_COL_WIDTH + 20;
    items = summary
      .map(({ name, hours, color }, i) => {
        const cy = padY + i * rowH + rowH / 2;
        const textX = dotX + dotR + 10;
        const label = escapeXml(name);
        const stats = escapeXml(formatDaysHours(hours));
        return `<circle cx="${dotX}" cy="${cy}" r="${dotR}" fill="${color}"/>
    <text x="${textX}" y="${cy + 5}" fill="#AEB8D3" font-family="${SUMMARY.FONT}" font-size="17" font-weight="600">${label}</text>
    <text x="${LAYOUT.WIDTH - 24}" y="${cy + 5}" text-anchor="end" fill="#707B96" font-family="${SUMMARY.FONT}" font-size="15">${stats}</text>`;
      })
      .join("\n  ");
  }

  return `<g transform="translate(0, ${offsetY})">
  <rect width="${LAYOUT.WIDTH}" height="${height}" rx="10" fill="#1F2433" fill-opacity="0.2"/>
  <rect x="0.5" y="0.5" width="${LAYOUT.WIDTH - 1}" height="${height - 1}" rx="10" fill="none" stroke="#303A50"/>
  <text x="24" y="${midY + 7}" fill="#F3F5FA" font-family="${SUMMARY.FONT}" font-size="18" font-weight="700">${monthLabel}</text>
  <line x1="${SUMMARY.MONTH_COL_WIDTH}" y1="16" x2="${SUMMARY.MONTH_COL_WIDTH}" y2="${height - 16}" stroke="#303A50"/>
  ${items}
</g>`;
}

const execFileAsync = promisify(execFile);

export function toSvgDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function svgToPng(svgPath: string, pngPath: string): Promise<void> {
  await execFileAsync("sips", ["-s", "format", "png", svgPath, "--out", pngPath]);
}

export async function copyImageToClipboard(pngPath: string): Promise<void> {
  const script = `set the clipboard to (read (POSIX file "${pngPath}") as «class PNGf»)`;
  await execFileAsync("osascript", ["-e", script]);
}

export async function exportSvgToClipboard(svg: string, supportPath: string): Promise<void> {
  const svgPath = path.join(supportPath, "schedule.svg");
  const pngPath = path.join(supportPath, "schedule.png");
  await fs.writeFile(svgPath, svg);
  await svgToPng(svgPath, pngPath);
  await copyImageToClipboard(pngPath);
  void fs.unlink(svgPath).catch(() => {});
  void fs.unlink(pngPath).catch(() => {});
}
