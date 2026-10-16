import type { Db } from '../db/index.ts';
import { localDate, startOfLocalDay, addDays, formatLocal } from './time.ts';
import { presentTask } from './tasks.ts';

/**
 * A factual snapshot of the user's stored data for a day. Everything here comes
 * from the database — nothing is invented to fill space.
 */
export function buildOverview(db: Db, userId: string, now: Date, timeZone: string, dayOffset = 0, locale = 'en-GB') {
  const today = localDate(now, timeZone);
  const day = addDays(today, dayOffset);
  const dayStart = startOfLocalDay(day, timeZone);
  const dayEnd = startOfLocalDay(addDays(day, 1), timeZone);
  const weekEnd = startOfLocalDay(addDays(day, 8), timeZone);
  const fmt = (iso: string, withTime = true) => formatLocal(iso, timeZone, locale, withTime);

  const due = db.all(
    `SELECT t.*, p.name AS project_name FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.user_id = ? AND t.status = 'open' AND t.due_at >= ? AND t.due_at < ? ORDER BY t.priority, t.due_at`,
    userId, dayStart.toISOString(), dayEnd.toISOString(),
  ).map(presentTask);
  const overdue = db.all(
    `SELECT t.*, p.name AS project_name FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.user_id = ? AND t.status = 'open' AND t.due_at < ? ORDER BY t.due_at`,
    userId, (dayOffset === 0 ? startOfLocalDay(today, timeZone) : dayStart).toISOString(),
  ).map(presentTask);
  const upcoming = db.all(
    `SELECT t.*, p.name AS project_name FROM tasks t LEFT JOIN projects p ON p.id = t.project_id
     WHERE t.user_id = ? AND t.status = 'open' AND t.due_at >= ? AND t.due_at < ? ORDER BY t.due_at LIMIT 20`,
    userId, dayEnd.toISOString(), weekEnd.toISOString(),
  ).map(presentTask);
  const reminders = db.all(
    `SELECT * FROM reminders WHERE user_id = ? AND status = 'scheduled' AND remind_at >= ? AND remind_at < ? ORDER BY remind_at`,
    userId, dayStart.toISOString(), dayEnd.toISOString(),
  );
  const completedYesterday = db.all(
    `SELECT id, title, completed_at FROM tasks WHERE user_id = ? AND status = 'done' AND completed_at >= ? AND completed_at < ? ORDER BY completed_at DESC LIMIT 30`,
    userId, startOfLocalDay(addDays(today, -1), timeZone).toISOString(), startOfLocalDay(today, timeZone).toISOString(),
  );
  const completedToday = db.all(
    `SELECT id, title, completed_at FROM tasks WHERE user_id = ? AND status = 'done' AND completed_at >= ? ORDER BY completed_at DESC LIMIT 30`,
    userId, startOfLocalDay(today, timeZone).toISOString(),
  );
  const projects = db.all(
    `SELECT p.id, p.name, p.deadline, p.next_action,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS tasks_total,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS tasks_done,
       (SELECT COUNT(*) FROM project_items i WHERE i.project_id = p.id AND i.kind = 'blocker' AND i.done = 0) AS open_blockers
     FROM projects p WHERE p.user_id = ? AND p.status = 'active' ORDER BY p.deadline IS NULL, p.deadline, p.updated_at DESC LIMIT 10`,
    userId,
  );
  const pendingActions = Number(db.get("SELECT COUNT(*) AS n FROM actions WHERE user_id = ? AND status = 'pending'", userId)!.n);
  const proposedMemories = Number(db.get("SELECT COUNT(*) AS n FROM memories WHERE user_id = ? AND status = 'proposed'", userId)!.n);
  const estimate = [...overdue, ...due].reduce((a, t) => a + (t.estimate_minutes ?? 0), 0);
  const unestimated = [...overdue, ...due].filter((t) => !t.estimate_minutes).length;

  const brief = (t: any) => ({
    id: t.id, title: t.title, priority: t.priority, project: t.project_name ?? null,
    due: t.due_at ? fmt(t.due_at, !t.all_day) : null, due_at: t.due_at, estimate_minutes: t.estimate_minutes ?? null,
  });
  return {
    date: day,
    dateLabel: formatLocal(dayStart.toISOString(), timeZone, locale, false),
    timeZone,
    due: due.map(brief),
    overdue: overdue.map(brief),
    upcoming: upcoming.map(brief),
    reminders: reminders.map((r) => ({ id: r.id, title: r.title, at: fmt(r.remind_at) })),
    completedToday,
    completedYesterday,
    projects,
    pendingActions,
    proposedMemories,
    workload: { estimatedMinutes: estimate, tasksWithoutEstimate: unestimated },
  };
}

export type Overview = ReturnType<typeof buildOverview>;

/** A plain-language briefing written from the overview by code (no AI needed, never fabricated). */
export function briefingText(o: Overview, name: string, hourLocal: number): string {
  const greet = hourLocal < 12 ? 'Good morning' : hourLocal < 17 ? 'Good afternoon' : 'Good evening';
  const lines: string[] = [`${greet}${name ? `, ${name}` : ''}. Here is ${o.dateLabel}.`];
  const n = o.due.length;
  if (!n && !o.overdue.length) lines.push('Nothing is due today.');
  else {
    if (n) lines.push(`${n} task${n === 1 ? '' : 's'} due today${o.due[0] ? `, starting with "${o.due[0].title}"` : ''}.`);
    if (o.overdue.length) lines.push(`${o.overdue.length} overdue task${o.overdue.length === 1 ? '' : 's'} need a decision — finish, reschedule or drop.`);
  }
  const high = [...o.overdue, ...o.due].filter((t) => t.priority === 1);
  if (high.length) lines.push(`High priority: ${high.slice(0, 3).map((t) => t.title).join('; ')}.`);
  if (o.workload.estimatedMinutes) {
    const h = Math.round((o.workload.estimatedMinutes / 60) * 10) / 10;
    lines.push(`Estimated workload: about ${h} h${o.workload.tasksWithoutEstimate ? ` (plus ${o.workload.tasksWithoutEstimate} task(s) without an estimate)` : ''}.`);
  }
  if (o.reminders.length) lines.push(`${o.reminders.length} reminder${o.reminders.length === 1 ? '' : 's'} scheduled today.`);
  const soon = o.projects.filter((p: any) => p.deadline);
  if (soon.length) lines.push(`Nearest project deadline: ${soon[0].name}.`);
  const blocked = o.projects.filter((p: any) => p.open_blockers > 0);
  if (blocked.length) lines.push(`${blocked.length} project${blocked.length === 1 ? ' has' : 's have'} open blockers.`);
  if (o.completedYesterday.length) lines.push(`Yesterday you completed ${o.completedYesterday.length} task${o.completedYesterday.length === 1 ? '' : 's'}.`);
  if (o.pendingActions) lines.push(`${o.pendingActions} action${o.pendingActions === 1 ? ' is' : 's are'} waiting for your approval.`);
  if (o.proposedMemories) lines.push(`${o.proposedMemories} suggested memor${o.proposedMemories === 1 ? 'y is' : 'ies are'} waiting for review.`);
  return lines.join(' ');
}

/** Suggestions derived from real data patterns — each one names the data it is based on. */
export function suggestions(o: Overview, db: Db, userId: string) {
  const out: { text: string; basis: string; action?: string }[] = [];
  if (o.overdue.length) out.push({ text: `Carry ${o.overdue.length} overdue task(s) forward or close them`, basis: 'Overdue tasks', action: 'carry_forward' });
  const noEstimate = o.workload.tasksWithoutEstimate;
  if (noEstimate >= 3) out.push({ text: 'Add time estimates to today’s tasks to plan your workload', basis: `${noEstimate} tasks without estimates` });
  for (const p of o.projects as any[]) {
    if (!p.next_action) out.push({ text: `Decide the next action for “${p.name}”`, basis: 'Active project with no next action' });
    if (out.length > 5) break;
  }
  const stale = db.all(
    "SELECT name FROM projects WHERE user_id = ? AND status = 'active' AND updated_at < datetime('now','-14 days') LIMIT 2", userId,
  );
  for (const p of stale) out.push({ text: `Review “${p.name}” — no activity for two weeks`, basis: 'Project last updated over 14 days ago' });
  if (o.proposedMemories) out.push({ text: 'Review suggested memories', basis: `${o.proposedMemories} awaiting approval`, action: 'memories' });
  return out.slice(0, 6);
}
