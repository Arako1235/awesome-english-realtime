import { addDays, differenceInMinutes, endOfWeek, format, isAfter, isBefore, parseISO, startOfWeek } from "date-fns";
import { toZonedTime } from "date-fns-tz";

export const SEOUL_TZ = "Asia/Seoul";

export function nowIso() {
  return new Date().toISOString();
}

export function todaySeoul(now = new Date()) {
  return format(toZonedTime(now, SEOUL_TZ), "yyyy-MM-dd");
}

export function weekStartSeoul(date = new Date()) {
  return format(startOfWeek(toZonedTime(date, SEOUL_TZ), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function weekEndSeoul(date = new Date()) {
  return format(endOfWeek(toZonedTime(date, SEOUL_TZ), { weekStartsOn: 1 }), "yyyy-MM-dd");
}

export function inWeek(date: string, weekStart: string) {
  const day = parseISO(date);
  const start = parseISO(weekStart);
  const end = addDays(start, 7);
  return !isBefore(day, start) && isBefore(day, end);
}

export function minutesBetweenIso(startedAt: string, endedAt: string | null, now = new Date()) {
  return Math.max(0, differenceInMinutes(endedAt ? parseISO(endedAt) : now, parseISO(startedAt)));
}

export function minutesBetweenClock(start: string | null, end: string | null) {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return Math.max(0, eh * 60 + em - (sh * 60 + sm));
}

export function isOverdue(date: string | null, status: string, today = todaySeoul()) {
  return Boolean(date && status !== "완료" && isAfter(parseISO(today), parseISO(date)));
}
