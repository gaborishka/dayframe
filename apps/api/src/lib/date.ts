import { DateTime } from "luxon";

export function isoWeekFromDate(date: string, timezone: string) {
  const value = DateTime.fromISO(date, { zone: timezone });
  return `${value.weekYear}-W${String(value.weekNumber).padStart(2, "0")}`;
}

export function dayIndexInWeek(date: string, timezone: string) {
  return DateTime.fromISO(date, { zone: timezone }).weekday;
}

export function nowIso() {
  return DateTime.utc().toISO();
}
