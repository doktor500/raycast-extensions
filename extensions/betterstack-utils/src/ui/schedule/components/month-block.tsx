import { type WeekSpanBar, LAYOUT, formatMonthLabel } from "../../layout";
import { WeekGroup } from "./week-group";

const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

interface MonthBlockProps {
  weeks: Date[][];
  blockOffsetY: number;
  blockHeight: number;
  today: Date;
  weekTimelines: WeekSpanBar[][];
  currentMonth: { year: number; month: number };
  showTodayMarker: boolean;
  columnBg: string;
  weekRowHeights: number[];
}

export function MonthBlock({
  weeks,
  blockOffsetY,
  blockHeight,
  today,
  weekTimelines,
  currentMonth,
  showTodayMarker,
  columnBg,
  weekRowHeights,
}: MonthBlockProps) {
  const monthLabel = formatMonthLabel(currentMonth);

  return (
    <g transform={`translate(0, ${blockOffsetY})`}>
      <rect width={LAYOUT.WIDTH} height={blockHeight} rx={10} fill="#1F2433" fillOpacity={0.2} />
      <rect x={0.5} y={0.5} width={LAYOUT.WIDTH - 1} height={blockHeight - 1} rx={10} fill="none" stroke="#303A50" />
      <text
        x={LAYOUT.WIDTH / 2}
        y={LAYOUT.BLOCK_HEADER_HEIGHT / 2 + 7}
        textAnchor="middle"
        fill="#F3F5FA"
        fontFamily={FONT_FAMILY}
        fontSize={17}
        fontWeight={700}
      >
        {monthLabel}
      </text>
      <line x1={0} y1={LAYOUT.BLOCK_HEADER_HEIGHT} x2={LAYOUT.WIDTH} y2={LAYOUT.BLOCK_HEADER_HEIGHT} stroke="#303A50" />
      {weeks.map((days, localIndex) => {
        const rowHeight = weekRowHeights[localIndex];
        const offsetY = LAYOUT.BLOCK_HEADER_HEIGHT + weekRowHeights.slice(0, localIndex).reduce((a, b) => a + b, 0);
        const baseId = (currentMonth.year * 12 + currentMonth.month) * 1000 + localIndex * 100;
        return (
          <WeekGroup
            key={localIndex}
            days={days}
            weekTimeline={weekTimelines[localIndex]}
            today={today}
            weekIndex={localIndex}
            offsetY={offsetY}
            currentMonth={currentMonth}
            showTodayMarker={showTodayMarker}
            columnBg={columnBg}
            rowHeight={rowHeight}
            baseId={baseId}
          />
        );
      })}
    </g>
  );
}
