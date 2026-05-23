import { renderToStaticMarkup } from "react-dom/server";
import { LAYOUT, SUMMARY, weekRowHeight, summaryBlockHeight } from "../../layout";
import { WeekRow } from "./components/week-row";
import { skeletonColors } from "./colors/skeleton-colors";

const NUM_WEEKS = 5;
const NUM_SUMMARY = 3;

const WEEK_BAR_SPANS = [
  [{ start: 0, end: 7 }],
  [{ start: 0, end: 7 }],
  [{ start: 0, end: 7 }],
  [{ start: 0, end: 7 }],
  [{ start: 0, end: 7 }],
];

function ScheduleSkeletonSvg() {
  const rowHeight = weekRowHeight(1);
  const calendarHeight = LAYOUT.BLOCK_HEADER_HEIGHT + NUM_WEEKS * rowHeight;
  const summaryHeight = summaryBlockHeight(NUM_SUMMARY);
  const totalHeight = calendarHeight + LAYOUT.SUMMARY_GAP + summaryHeight;
  const summaryOffsetY = calendarHeight + LAYOUT.SUMMARY_GAP;
  const summaryMidY = summaryHeight / 2;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={LAYOUT.WIDTH}
      height={totalHeight}
      viewBox={`0 0 ${LAYOUT.WIDTH} ${totalHeight}`}
    >
      <rect
        width={LAYOUT.WIDTH}
        height={calendarHeight}
        rx={10}
        fill={skeletonColors.blockBackground}
        fillOpacity={0.2}
      />
      <rect
        x={0.5}
        y={0.5}
        width={LAYOUT.WIDTH - 1}
        height={calendarHeight - 1}
        rx={10}
        fill="none"
        stroke={skeletonColors.border}
      />
      <rect x={LAYOUT.WIDTH / 2 - 80} y={13} width={160} height={18} fill={skeletonColors.placeholder} rx={4} />
      <line
        x1={0}
        y1={LAYOUT.BLOCK_HEADER_HEIGHT}
        x2={LAYOUT.WIDTH}
        y2={LAYOUT.BLOCK_HEADER_HEIGHT}
        stroke={skeletonColors.border}
      />
      {Array.from({ length: NUM_WEEKS }, (_, weekIndex) => (
        <WeekRow key={weekIndex} weekIndex={weekIndex} spans={WEEK_BAR_SPANS[weekIndex]} rowHeight={rowHeight} />
      ))}
      <g transform={`translate(0, ${summaryOffsetY})`}>
        <rect
          width={LAYOUT.WIDTH}
          height={summaryHeight}
          rx={10}
          fill={skeletonColors.blockBackground}
          fillOpacity={0.2}
        />
        <rect
          x={0.5}
          y={0.5}
          width={LAYOUT.WIDTH - 1}
          height={summaryHeight - 1}
          rx={10}
          fill="none"
          stroke={skeletonColors.border}
        />
        <rect x={24} y={summaryMidY - 5} width={90} height={14} fill={skeletonColors.placeholder} rx={3} />
        <line
          x1={SUMMARY.MONTH_COL_WIDTH}
          y1={16}
          x2={SUMMARY.MONTH_COL_WIDTH}
          y2={summaryHeight - 16}
          stroke={skeletonColors.border}
        />
      </g>
    </svg>
  );
}

export function buildScheduleSkeletonSvg(): string {
  return renderToStaticMarkup(<ScheduleSkeletonSvg />);
}
