import { isDateInInterval } from "../common/dates";

export interface OnCallEvent {
  started_at: string;
  ended_at: string;
  user: User;
}

interface User {
  first_name: string;
  last_name: string;
  email: string;
}

export function formatUserName(user: User): string {
  return `${user.first_name} ${user.last_name}`.trim() || user.email;
}

export function getCurrentOnCallUser(date: Date, events: OnCallEvent[]): User | null {
  for (const event of events) {
    if (isDateInInterval(date, new Date(event.started_at), new Date(event.ended_at))) {
      return event.user;
    }
  }

  return null;
}
