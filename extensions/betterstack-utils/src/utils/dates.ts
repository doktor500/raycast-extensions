import { DateTime } from "luxon";

export function startOfWeek(date: Date): Date {
  return DateTime.fromJSDate(date).startOf("week").toJSDate();
}

export function addDays(date: Date, days: number): Date {
  return DateTime.fromJSDate(date).plus({ days }).toJSDate();
}

export function isSameDay(a: Date, b: Date): boolean {
  return DateTime.fromJSDate(a).hasSame(DateTime.fromJSDate(b), "day");
}

export function getCurrentMonthWindow(): { start: Date; end: Date } {
  const now = DateTime.now();
  return {
    start: now.startOf("month").toJSDate(),
    end: now.endOf("month").toJSDate(),
  };
}

export function getThreeMonthWindow(): { start: Date; end: Date } {
  const now = DateTime.now();
  return {
    start: now.minus({ months: 1 }).startOf("month").toJSDate(),
    end: now.plus({ months: 1 }).endOf("month").toJSDate(),
  };
}
