import type { TrainingSession } from "../types";

export interface PracticeCalendarDay {
  dateKey: string;
  day: number;
  sessionCount: number;
  isToday: boolean;
  isFuture: boolean;
}

export interface PracticeStreaks {
  practiceDays: number;
  currentStreak: number;
  longestStreak: number;
}

export function localPracticeDateKey(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function buildPracticeCalendar(
  sessions: TrainingSession[],
  month: Date,
  now = new Date(),
): Array<PracticeCalendarDay | null> {
  const counts = new Map<string, number>();
  for (const session of sessions) {
    const key = localPracticeDateKey(session.startedAt);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const totalDays = new Date(year, monthIndex + 1, 0).getDate();
  const todayKey = dateKey(now);
  const cells: Array<PracticeCalendarDay | null> = Array(offset).fill(null);

  for (let day = 1; day <= totalDays; day += 1) {
    const date = new Date(year, monthIndex, day);
    const key = dateKey(date);
    cells.push({
      dateKey: key,
      day,
      sessionCount: counts.get(key) ?? 0,
      isToday: key === todayKey,
      isFuture: date.getTime() > new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
    });
  }

  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function calculatePracticeStreaks(
  sessions: TrainingSession[],
  now = new Date(),
): PracticeStreaks {
  const keys = [...new Set(
    sessions.map((session) => localPracticeDateKey(session.startedAt)).filter(Boolean),
  )].sort();

  if (keys.length === 0) {
    return { practiceDays: 0, currentStreak: 0, longestStreak: 0 };
  }

  let longestStreak = 0;
  let running = 0;
  let previous: Date | null = null;

  for (const key of keys) {
    const [year, month, day] = key.split("-").map(Number);
    const current = new Date(year, month - 1, day);
    const expected = previous ? new Date(previous) : null;
    if (expected) expected.setDate(expected.getDate() + 1);
    running = expected && dateKey(expected) === key ? running + 1 : 1;
    longestStreak = Math.max(longestStreak, running);
    previous = current;
  }

  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!keys.includes(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let currentStreak = 0;
  const keySet = new Set(keys);
  while (keySet.has(dateKey(cursor))) {
    currentStreak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { practiceDays: keys.length, currentStreak, longestStreak };
}
