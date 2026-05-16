import { getPreferenceValues } from "@raycast/api";

const BASE_URL = "https://uptime.betterstack.com/api/v2";

function getHeaders(): Record<string, string> {
  const { apiToken } = getPreferenceValues<Preferences>();
  return {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };
}

export interface Calendar {
  id: string;
  attributes: {
    name: string | null;
    default_calendar: boolean;
    team_name?: string;
  };
}

export interface CalendarEvent {
  id: string;
  attributes: {
    started_at: string;
    ended_at: string;
    user: {
      first_name: string;
      last_name: string;
      email: string;
    };
  };
}

interface IncludedUser {
  id: string;
  type: "user";
  attributes: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

interface ApiResponse<T> {
  data: T[];
  included?: IncludedUser[];
  pagination?: {
    next?: string | null;
  };
}

interface BetterStackEvent {
  id: number | string;
  users: string[];
  starts_at: string;
  ends_at: string;
  override: boolean;
}

interface EventsResponse {
  events: BetterStackEvent[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: getHeaders() });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid API token. Check your BetterStack API token in extension preferences.");
    }
    throw new Error(`BetterStack API error: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

async function fetchAllPages<T>(url: string): Promise<ApiResponse<T>> {
  const results: T[] = [];
  const included: IncludedUser[] = [];
  let nextUrl: string | undefined = url;

  while (nextUrl) {
    const json: ApiResponse<T> = await fetchJson<ApiResponse<T>>(nextUrl);
    results.push(...json.data);
    included.push(...(json.included ?? []));
    nextUrl = json.pagination?.next ?? undefined;
  }

  return { data: results, included };
}

export async function getOnCallCalendars(): Promise<Calendar[]> {
  const response = await fetchAllPages<Calendar>(`${BASE_URL}/on-calls`);
  return response.data;
}

export async function getCalendarEvents(calendarId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
  const response = await fetchJson<EventsResponse>(`${BASE_URL}/on-calls/${calendarId}/events?${params}`);

  return response.events.flatMap((event) => {
    const startsAt = new Date(event.starts_at);
    const endsAt = new Date(event.ends_at);

    if (endsAt < from || startsAt > to) {
      return [];
    }

    return event.users.map((email) => ({
      id: String(event.id),
      attributes: {
        started_at: event.starts_at,
        ended_at: event.ends_at,
        user: buildUserFromEmail(email),
      },
    }));
  });
}

function buildUserFromEmail(email: string): CalendarEvent["attributes"]["user"] {
  const name = email.split("@")[0] ?? email;
  const [firstName = name, ...lastNameParts] = name
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1));

  return {
    first_name: firstName,
    last_name: lastNameParts.join(" "),
    email,
  };
}
