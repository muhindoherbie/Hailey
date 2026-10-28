import type { Db } from '../db/index.ts';
import { localDate, addDays } from './time.ts';

/** ISO week label (e.g. 2026-W44) of a local date (YYYY-MM-DD). */
export function isoWeek(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week decides the year
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 86400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function recordVisit(db: Db, userId: string, now: Date, timeZone: string) {
  db.run('INSERT OR IGNORE INTO visits (user_id, week) VALUES (?, ?)', userId, isoWeek(localDate(now, timeZone)));
}

/** Consecutive weeks with a visit, counting back from this week (or last week, if not yet visited this week). */
export function weeklyStreak(db: Db, userId: string, now: Date, timeZone: string) {
  const weeks = new Set(db.all('SELECT week FROM visits WHERE user_id = ?', userId).map((r) => r.week as string));
  let day = localDate(now, timeZone);
  if (!weeks.has(isoWeek(day))) day = addDays(day, -7);
  let n = 0;
  while (weeks.has(isoWeek(day))) {
    n++;
    day = addDays(day, -7);
  }
  return { streak: n, weeksVisited: weeks.size };
}

export interface Persona {
  id: 'chef' | 'coach' | 'tutor';
  name: string;
  blurb: string;
  prompt: string;
  requirement: string;
  goal: number;
}

/** Specialist modes, each unlocked by using Hailey in a way that suits it. */
export const PERSONAS: Persona[] = [
  {
    id: 'chef', name: 'Chef mode', blurb: 'Recipes, meal plans and shopping lists built around what you like and what you have.',
    prompt: 'Specialist mode: Chef. Lean into food: suggest practical recipes with local ingredients, scale portions, plan meals around saved food preferences, and turn plans into shopping lists. Mention allergies or dietary needs you know about.',
    requirement: 'Open Hailey in 4 different weeks', goal: 4,
  },
  {
    id: 'coach', name: 'Coach mode', blurb: 'Goals, habits and gentle accountability — Hailey checks in and keeps you honest.',
    prompt: 'Specialist mode: Coach. Help the user set specific, measurable goals, break them into weekly steps (offer to create the tasks and a routine to check in), celebrate progress, and ask one focused question when they are stuck. Be encouraging, never preachy.',
    requirement: 'Complete 25 tasks', goal: 25,
  },
  {
    id: 'tutor', name: 'Tutor mode', blurb: 'Explains step by step, checks understanding and quizzes you from your own notes.',
    prompt: 'Specialist mode: Tutor. Teach step by step, check understanding with a short question before moving on, use the user\'s own notes and documents when relevant (search_knowledge), and offer a quick quiz at the end.',
    requirement: 'Save 10 notes', goal: 10,
  },
];

export function achievements(db: Db, userId: string, now: Date, timeZone: string) {
  const { streak, weeksVisited } = weeklyStreak(db, userId, now, timeZone);
  const tasksDone = Number(db.get("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done'", userId)!.n);
  const notes = Number(db.get('SELECT COUNT(*) AS n FROM notes WHERE user_id = ?', userId)!.n);
  const progress: Record<Persona['id'], number> = { chef: weeksVisited, coach: tasksDone, tutor: notes };
  return {
    streak, weeksVisited, tasksDone, notes,
    /** A 4-week streak earns the crown. */
    legendary: streak >= 4,
    personas: PERSONAS.map((p) => ({ id: p.id, name: p.name, blurb: p.blurb, requirement: p.requirement, goal: p.goal, progress: Math.min(progress[p.id], p.goal), unlocked: progress[p.id] >= p.goal })),
  };
}

export function personaUnlocked(db: Db, userId: string, id: string, now: Date, timeZone: string) {
  return achievements(db, userId, now, timeZone).personas.some((p) => p.id === id && p.unlocked);
}

/** Counts for the "your week" card: the last 7 days, from the user's own data. */
export function weekInNumbers(db: Db, userId: string, now: Date) {
  const since = new Date(now.getTime() - 7 * 86400_000).toISOString();
  const n = (sql: string) => Number(db.get(sql, userId, since)!.n);
  return {
    tasksCompleted: n("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done' AND completed_at >= ?"),
    tasksAdded: n('SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND created_at >= ?'),
    remindersSent: n("SELECT COUNT(*) AS n FROM reminders WHERE user_id = ? AND status = 'sent' AND sent_at >= ?"),
    notesSaved: n('SELECT COUNT(*) AS n FROM notes WHERE user_id = ? AND created_at >= ?'),
    routineRuns: n("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND kind = 'routine' AND created_at >= ?"),
    chats: n('SELECT COUNT(*) AS n FROM conversations WHERE user_id = ? AND updated_at >= ?'),
  };
}
