import { renderToStaticMarkup } from "react-dom/server";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { promisify } from "node:util";
import path from "node:path";
import { Fragment } from "react";
import { startOfWeek, addDays } from "../../utils/dates";
import { buildColorMap } from "../../utils/colors";
import { LAYOUT, weekRowHeight, summaryBlockHeight, buildWeekSpanBars, computeMonthSummary } from "../layout";
import { formatUserName, OnCallEvent } from "../../domain/on-call-event";
import { MonthBlock } from "./components/month-block";
import { SummaryBlock } from "./components/summary-block";

type Props = {
  events: OnCallEvent[];
  today: Date;
  window: { start: Date; end: Date };
  backgroundColor?: string;
  showTodayMarker?: boolean;
  allEvents?: OnCallEvent[];
};

function CombinedScheduleSvg({ events, today, window, backgroundColor, showTodayMarker = true, allEvents }: Props) {
  const { start, end } = window;
  const firstWeekStart = startOfWeek(start);
  const lastWeekStart = startOfWeek(end);
  const allWeeks: Date[][] = [];

  for (let weekStart = firstWeekStart; weekStart <= lastWeekStart; weekStart = addDays(weekStart, 7)) {
    allWeeks.push(Array.from({ length: 7 }, (_, dayOffset) => addDays(weekStart, dayOffset)));
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
    weeks: allWeeks.filter((days) => days.some((day) => day.getFullYear() === year && day.getMonth() === month)),
  }));

  const colorSourceEvents = allEvents ?? events;
  const uniqueNames = [...new Set(colorSourceEvents.map((event) => formatUserName(event.user)))].sort();
  const colorMap = buildColorMap(uniqueNames);

  const weekTimelinesByMonth = monthGroups.map(({ year, month, weeks }) =>
    weeks.map((days) => buildWeekSpanBars(days, events, { year, month }, colorMap)),
  );

  const weekRowHeightsByMonth = weekTimelinesByMonth.map((weekTimelines) =>
    weekTimelines.map((weekTimeline) => {
      const maxLanes = Math.max(1, ...weekTimeline.map((bar) => bar.lane + 1));
      return weekRowHeight(maxLanes);
    }),
  );

  const calendarHeight = (monthIndex: number) =>
    LAYOUT.BLOCK_HEADER_HEIGHT + weekRowHeightsByMonth[monthIndex].reduce((sum, height) => sum + height, 0);

  const summaries = monthGroups.map(({ year, month }) => computeMonthSummary(year, month, events, colorMap));

  const monthTotalHeight = (monthIndex: number) =>
    calendarHeight(monthIndex) + LAYOUT.SUMMARY_GAP + summaryBlockHeight(summaries[monthIndex].length);

  const totalHeight =
    monthGroups.reduce((sum, _group, monthIndex) => sum + monthTotalHeight(monthIndex), 0) +
    (monthGroups.length - 1) * LAYOUT.BLOCK_GAP;

  const columnBg = backgroundColor ?? "none";

  let currentY = 0;
  const monthOffsets = monthGroups.map((_, monthIndex) => {
    const offsetY = currentY;
    currentY += monthTotalHeight(monthIndex) + LAYOUT.BLOCK_GAP;
    return offsetY;
  });

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={LAYOUT.WIDTH}
      height={totalHeight}
      viewBox={`0 0 ${LAYOUT.WIDTH} ${totalHeight}`}
    >
      <defs>
        <pattern id="hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(135)">
          {columnBg !== "none" && <rect width={8} height={8} fill={columnBg} />}
          <path d="M 0 0 L 0 8" stroke="#182033" strokeWidth={1} opacity={0.5} />
        </pattern>
        <filter id="shadow" x="-10%" y="-30%" width="120%" height="170%">
          <feDropShadow dx={0} dy={2} stdDeviation={2} floodColor="#050816" floodOpacity={0.3} />
        </filter>
      </defs>
      {backgroundColor && <rect width={LAYOUT.WIDTH} height={totalHeight} fill={backgroundColor} />}
      {monthGroups.map(({ year, month, weeks }, monthIndex) => (
        <Fragment key={monthIndex}>
          <MonthBlock
            weeks={weeks}
            blockOffsetY={monthOffsets[monthIndex]}
            blockHeight={calendarHeight(monthIndex)}
            today={today}
            weekTimelines={weekTimelinesByMonth[monthIndex]}
            currentMonth={{ year, month }}
            showTodayMarker={showTodayMarker}
            columnBg={columnBg}
            weekRowHeights={weekRowHeightsByMonth[monthIndex]}
          />
          <SummaryBlock
            year={year}
            month={month}
            summary={summaries[monthIndex]}
            offsetY={monthOffsets[monthIndex] + calendarHeight(monthIndex) + LAYOUT.SUMMARY_GAP}
          />
          {monthIndex < monthGroups.length - 1 && (
            <line
              x1={0}
              y1={monthOffsets[monthIndex] + monthTotalHeight(monthIndex) + LAYOUT.BLOCK_GAP / 2}
              x2={LAYOUT.WIDTH}
              y2={monthOffsets[monthIndex] + monthTotalHeight(monthIndex) + LAYOUT.BLOCK_GAP / 2}
              stroke="#4A5568"
              strokeWidth={2}
            />
          )}
        </Fragment>
      ))}
    </svg>
  );
}

export function buildCombinedScheduleSvg(props: Props): string {
  return renderToStaticMarkup(<CombinedScheduleSvg {...props} />);
}

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

const execFileAsync = promisify(execFile);
