export interface OnCallEvent {
  started_at: string;
  ended_at: string;
  user: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export function getThreeMonthWindow(): { start: Date; end: Date; months: Date[] } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const prev = new Date(year, month - 1, 1);
  const curr = new Date(year, month, 1);
  const next = new Date(year, month + 1, 1);

  const start = prev;
  const end = new Date(year, month + 2, 0);

  return { start, end, months: [prev, curr, next] };
}

export function getOnCallForDay(date: Date, events: OnCallEvent[]): OnCallEvent["user"] | null {
  const noon = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);

  for (const event of events) {
    const start = new Date(event.started_at);
    const end = new Date(event.ended_at);
    if (noon >= start && noon < end) {
      return event.user;
    }
  }

  return null;
}
