import { showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { getOnCallCalendars, getCalendarEvents } from "../api/betterstak-api";
import { getThreeMonthWindow } from "../utils/dates";
import { OnCallEvent } from "../domain/on-call-event";

export interface OnCallData {
  events: OnCallEvent[];
  scheduleName: string;
  isLoading: boolean;
  noSchedule: boolean;
}

export function useOnCallData(): OnCallData {
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<OnCallEvent[]>([]);
  const [scheduleName, setScheduleName] = useState("");
  const [noSchedule, setNoSchedule] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const calendars = await getOnCallCalendars();
        const primary =
          calendars.find((c) => c.attributes.name?.toLowerCase().includes("primary")) ??
          calendars.find((c) => c.attributes.default_calendar);

        if (!primary) {
          setNoSchedule(true);
          setIsLoading(false);
          return;
        }

        setScheduleName(primary.attributes.name ?? "Primary");

        const { start, end } = getThreeMonthWindow();
        const calEvents = await getCalendarEvents(primary.id, start, end);

        setEvents(
          calEvents.map((e) => ({
            started_at: e.attributes.started_at,
            ended_at: e.attributes.ended_at,
            user: e.attributes.user,
          })),
        );
      } catch (error) {
        void showToast({
          style: Toast.Style.Failure,
          title: "Failed to load on-call schedule",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  return { events, scheduleName, isLoading, noSchedule };
}
