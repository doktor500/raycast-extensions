export interface OnCallEvent {
  started_at: string;
  ended_at: string;
  user: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export function getCurrentMonthWindow(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start, end };
}

export function getThreeMonthWindow(): { start: Date; end: Date } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month + 2, 0);

  return { start, end };
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

export function getOnCallUsersForDay(date: Date, events: OnCallEvent[]): OnCallEvent["user"][] {
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
  const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0);
  const MIN_OVERLAP_MS = 4 * 3600 * 1000; // must cover at least 4 hours of the day
  const users: OnCallEvent["user"][] = [];
  const seen = new Set<string>();

  for (const event of events) {
    const start = new Date(event.started_at);
    const end = new Date(event.ended_at);
    const overlapMs = Math.min(end.getTime(), dayEnd.getTime()) - Math.max(start.getTime(), dayStart.getTime());
    if (overlapMs >= MIN_OVERLAP_MS) {
      const key = event.user.email;
      if (!seen.has(key)) {
        seen.add(key);
        users.push(event.user);
      }
    }
  }

  return users;
}
