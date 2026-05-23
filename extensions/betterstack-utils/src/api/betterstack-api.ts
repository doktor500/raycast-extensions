import { getPreferenceValues } from "@raycast/api";

const BASE_URL = "https://uptime.betterstack.com/api/v2";

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
  pagination?: {
    next?: string | null;
  };
}

export async function getOnCallCalendars(): Promise<Calendar[]> {
  const { data } = await fetchAllPages<Calendar>(`${BASE_URL}/on-calls`);

  return data;
}

export async function getCalendarEvents(calendarId: string, from: Date, to: Date): Promise<CalendarEvent[]> {
  const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });

  let url: string | null | undefined = `${BASE_URL}/on-calls/${calendarId}/events?${params}`;
  const allEvents: BetterStackEvent[] = [];

  while (url) {
    const page: EventsResponse = await fetchJson<EventsResponse>(url);
    allEvents.push(...page.events);
    url = page.pagination?.next;
  }

  return allEvents.flatMap((event) => {
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

async function fetchAllPages<T>(url: string): Promise<ApiResponse<T>> {
  let currentUrl: string | null | undefined = url;
  const result: ApiResponse<T> = { data: [], included: [] };

  while (currentUrl) {
    const json: ApiResponse<T> = await fetchJson<ApiResponse<T>>(currentUrl);
    result.data.push(...json.data);
    result.included = [...(result.included ?? []), ...(json.included ?? [])];
    currentUrl = json.pagination?.next;
  }

  return result;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response: Response = await fetch(url, { headers: getHeaders() });
  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Invalid API token. Check your BetterStack API token in extension preferences.");
    }
    throw new Error(`BetterStack API error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
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

function getHeaders(): Record<string, string> {
  const { apiToken } = getPreferenceValues<Preferences>();
  return {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };
}
