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
