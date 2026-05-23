import { Action, ActionPanel, Detail, environment, showToast, Toast } from "@raycast/api";
import { useState } from "react";
import { getCurrentMonthWindow, getThreeMonthWindow } from "./utils/dates";
import { buildCombinedScheduleSvg, exportSvgToClipboard, toSvgDataUri } from "./ui/schedule-svg";
import { useOnCallData } from "./hooks/use-on-call-data";
import { formatUserName, getCurrentOnCallUser } from "./domain/on-call-event";

type TimeRange = "current-month" | "3-months";

const TIME_RANGE_LABELS: Record<TimeRange, string> = {
  "current-month": "current month only",
  "3-months": "3 month view",
};

export default function Command() {
  const { events, scheduleName, isLoading, noSchedule } = useOnCallData();
  const [timeRange, setTimeRange] = useState<TimeRange>("current-month");
  const [selectedUser, setSelectedUser] = useState<string>("");

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

  const userNames = [...new Set(events.map((e) => formatUserName(e.user)))].sort();
  const filteredEvents = selectedUser ? events.filter((e) => formatUserName(e.user) === selectedUser) : events;

  async function copyAsPng() {
    const toast = await showToast({ style: Toast.Style.Animated, title: "Copying to clipboard…" });
    try {
      const svg = buildCombinedScheduleSvg(filteredEvents, today, scheduleWindow, "#1F2433", false, events);
      await exportSvgToClipboard(svg, environment.supportPath);
      toast.style = Toast.Style.Success;
      toast.title = "Schedule copied";
    } catch (error) {
      toast.style = Toast.Style.Failure;
      toast.title = "Failed to copy schedule";
      toast.message = error instanceof Error ? error.message : String(error);
    }
  }

  const nextTimeRange: TimeRange = timeRange === "current-month" ? "3-months" : "current-month";
  const scheduleWindow = timeRange === "current-month" ? getCurrentMonthWindow() : getThreeMonthWindow();

  const currentOnCall = isLoading ? null : getCurrentOnCallUser(today, events);
  const currentlyOnCallMessage =
    timeRange === "current-month" && currentOnCall
      ? ["", `**Currently on call:** ${formatUserName(currentOnCall)}`, `**${currentOnCall.email}**`].join("\n")
      : "";

  const markdown = isLoading
    ? ""
    : `![schedule](${toSvgDataUri(buildCombinedScheduleSvg(filteredEvents, today, scheduleWindow, undefined, true, events))})\n` +
      currentlyOnCallMessage;

  return (
    <Detail
      isLoading={isLoading}
      navigationTitle={selectedUser ? `${scheduleName} — ${selectedUser}` : scheduleName}
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action title={`Show ${TIME_RANGE_LABELS[nextTimeRange]}`} onAction={() => setTimeRange(nextTimeRange)} />
          <Action
            title="Copy Schedule to Clipboard"
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
            onAction={copyAsPng}
          />
          {userNames.length > 0 && (
            <ActionPanel.Submenu
              title={selectedUser ? `Filter: ${selectedUser}` : "Filter by User"}
              shortcut={{ modifiers: ["cmd"], key: "f" }}
            >
              <Action title="All Users" onAction={() => setSelectedUser("")} />
              {userNames.map((name) => (
                <Action key={name} title={name} onAction={() => setSelectedUser(name)} />
              ))}
            </ActionPanel.Submenu>
          )}
          {selectedUser && (
            <Action
              title="Clear User Filter"
              shortcut={{ modifiers: ["cmd", "shift"], key: "f" }}
              onAction={() => setSelectedUser("")}
            />
          )}
        </ActionPanel>
      }
    />
  );
}
