import {
  type SummaryEntry,
  LAYOUT,
  SUMMARY,
  summaryBlockHeight,
  formatDaysHours,
  formatMonthLabel,
} from "../../layout";

interface SummaryBlockProps {
  year: number;
  month: number;
  summary: SummaryEntry[];
  offsetY: number;
}

interface HorizontalItemsProps {
  summary: SummaryEntry[];
  midY: number;
}

interface VerticalItemsProps {
  summary: SummaryEntry[];
}

function truncateName(name: string, availableWidth: number): string {
  const maxChars = Math.floor(availableWidth / 10);
  if (name.length <= maxChars) return name;

  return name.slice(0, Math.max(1, maxChars - 1)) + "…";
}

function HorizontalSummaryItems({ summary, midY }: HorizontalItemsProps) {
  const statsAreaWidth = LAYOUT.WIDTH - SUMMARY.MONTH_COL_WIDTH;
  const cellWidth = statsAreaWidth / summary.length;
  const dotRadius = 7;

  return (
    <>
      {summary.map(({ name, hours, color }, index) => {
        const cellX = SUMMARY.MONTH_COL_WIDTH + index * cellWidth;
        const dotCx = cellX + 20;
        const textX = dotCx + dotRadius + 10;
        const availableWidth = cellWidth - (textX - cellX) - 10;
        return (
          <g key={index}>
            <circle cx={dotCx} cy={midY - 10} r={dotRadius} fill={color} />
            <text x={textX} y={midY - 3} fill="#AEB8D3" fontFamily={SUMMARY.FONT} fontSize={19} fontWeight={600}>
              {truncateName(name, availableWidth)}
            </text>
            <text x={textX} y={midY + 20} fill="#707B96" fontFamily={SUMMARY.FONT} fontSize={16}>
              {formatDaysHours(hours)}
            </text>
          </g>
        );
      })}
    </>
  );
}

function VerticalSummaryItems({ summary }: VerticalItemsProps) {
  const dotRadius = 6;
  const rowHeight = SUMMARY.VERTICAL_ROW_HEIGHT;
  const paddingY = SUMMARY.VERTICAL_PADDING;
  const dotX = SUMMARY.MONTH_COL_WIDTH + 20;

  return (
    <>
      {summary.map(({ name, hours, color }, index) => {
        const cy = paddingY + index * rowHeight + rowHeight / 2;
        const textX = dotX + dotRadius + 10;
        return (
          <g key={index}>
            <circle cx={dotX} cy={cy} r={dotRadius} fill={color} />
            <text x={textX} y={cy + 5} fill="#AEB8D3" fontFamily={SUMMARY.FONT} fontSize={17} fontWeight={600}>
              {name}
            </text>
            <text
              x={LAYOUT.WIDTH - 24}
              y={cy + 5}
              textAnchor="end"
              fill="#707B96"
              fontFamily={SUMMARY.FONT}
              fontSize={15}
            >
              {formatDaysHours(hours)}
            </text>
          </g>
        );
      })}
    </>
  );
}

export function SummaryBlock({ year, month, summary, offsetY }: SummaryBlockProps) {
  if (summary.length === 0) return null;

  const monthLabel = formatMonthLabel({ year, month });
  const count = summary.length;
  const height = summaryBlockHeight(count);
  const midY = height / 2;

  return (
    <g transform={`translate(0, ${offsetY})`}>
      <rect width={LAYOUT.WIDTH} height={height} rx={10} fill="#1F2433" fillOpacity={0.2} />
      <rect x={0.5} y={0.5} width={LAYOUT.WIDTH - 1} height={height - 1} rx={10} fill="none" stroke="#303A50" />
      <text x={24} y={midY + 7} fill="#F3F5FA" fontFamily={SUMMARY.FONT} fontSize={18} fontWeight={700}>
        {monthLabel}
      </text>
      <line x1={SUMMARY.MONTH_COL_WIDTH} y1={16} x2={SUMMARY.MONTH_COL_WIDTH} y2={height - 16} stroke="#303A50" />
      {count <= SUMMARY.COLS_THRESHOLD ? (
        <HorizontalSummaryItems summary={summary} midY={midY} />
      ) : (
        <VerticalSummaryItems summary={summary} />
      )}
    </g>
  );
}
