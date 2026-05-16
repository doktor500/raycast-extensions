import { Action, ActionPanel, Detail, showToast, Toast } from "@raycast/api";
import { useEffect, useState } from "react";
import { getOnCallCalendars, getCalendarEvents } from "./api";
import { getCurrentMonthWindow, getThreeMonthWindow, type OnCallEvent } from "./dates";
import { buildWeeklyScheduleSvgs, toSvgDataUri } from "./schedule-svg";

type TimeRange = "current-month" | "3-months";

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "current-month": "Current Month",
  "3-months": "3 Months",
};

export default function Command() {
  const [isLoading, setIsLoading] = useState(true);
  const [events, setEvents] = useState<OnCallEvent[]>([]);
  const [scheduleName, setScheduleName] = useState("");
  const [noSchedule, setNoSchedule] = useState(false);
  const [timeRange, setTimeRange] = useState<TimeRange>("current-month");

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

  const today = new Date();

  if (noSchedule) {
    return (
      <Detail
        markdown={
          "## No 'Primary' on-call schedule found\n\nNo on-call calendar with 'Primary' in its name was found in your BetterStack account."
        }
      />
    );
  }

  const nextTimeRange: TimeRange = timeRange === "current-month" ? "3-months" : "current-month";
  const window = timeRange === "current-month" ? getCurrentMonthWindow() : getThreeMonthWindow();
  const weeks = buildWeeklyScheduleSvgs(events, today, window);
  const markdown = isLoading ? "" : weeks.map((week) => `![${week.label}](${toSvgDataUri(week.svg)})`).join("\n\n");

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={scheduleName}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action title={`Show ${TIME_RANGE_LABELS[nextTimeRange]}`} onAction={() => setTimeRange(nextTimeRange)} />
        </ActionPanel>
      }
    />
  );
}
