import { LAYOUT, formatWeekday } from "../../layout";

const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

interface DayColumnProps {
  day: Date;
  index: number;
  currentMonth: { year: number; month: number };
  columnBg: string;
  rowHeight: number;
}

export function DayColumn({ day, index, currentMonth, columnBg, rowHeight }: DayColumnProps) {
  const x = index * LAYOUT.DAY_WIDTH;
  const center = x + LAYOUT.DAY_WIDTH / 2;
  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
  const inMonth = day.getFullYear() === currentMonth.year && day.getMonth() === currentMonth.month;
  const bgRect =
    columnBg !== "none" ? <rect x={x} y={0} width={LAYOUT.DAY_WIDTH} height={rowHeight} fill={columnBg} /> : null;

  if (!inMonth) {
    return (
      <g>
        {bgRect}
        {isWeekend && <rect x={x} y={0} width={LAYOUT.DAY_WIDTH} height={rowHeight} fill="url(#hatch)" opacity={0.3} />}
      </g>
    );
  }

  return (
    <g>
      {bgRect}
      {isWeekend && <rect x={x} y={0} width={LAYOUT.DAY_WIDTH} height={rowHeight} fill="url(#hatch)" />}
      <line x1={x} y1={0} x2={x} y2={rowHeight} stroke="#2A3449" />
      <line
        x1={x}
        y1={LAYOUT.DAY_HEADER_HEIGHT}
        x2={x + LAYOUT.DAY_WIDTH}
        y2={LAYOUT.DAY_HEADER_HEIGHT}
        stroke="#2D374C"
      />
      <text
        x={center - 3}
        y={22}
        textAnchor="end"
        fill="#707B96"
        fontFamily={FONT_FAMILY}
        fontSize={13}
        fontWeight={600}
      >
        {formatWeekday(day)}
      </text>
      <text
        x={center + 3}
        y={22}
        textAnchor="start"
        fill="#AEB8D3"
        fontFamily={FONT_FAMILY}
        fontSize={16}
        fontWeight={600}
      >
        {day.getDate()}
      </text>
    </g>
  );
}
