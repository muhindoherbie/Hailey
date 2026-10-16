import { z } from 'zod';
import type { Db, Row } from '../db/index.ts';
import { parseJson } from '../db/index.ts';
import { indexEntity, unindexEntity } from './indexer.ts';
import { logActivity } from './activity.ts';
import { notFound } from '../context.ts';

// ---------- Notes ----------

export const noteInput = z.object({
  title: z.string().trim().min(1).max(300),
  body: z.string().max(200_000).default(''),
  kind: z.enum(['note', 'article', 'research']).default('note'),
  folder: z.string().max(120).default(''),
  tags: z.array(z.string().max(40)).max(30).default([]),
  source_url: z.string().url().max(2000).nullable().optional(),
  project_id: z.string().max(64).nullable().optional(),
  workspace_id: z.string().max(64).nullable().optional(),
  pinned: z.boolean().optional(),
});

export const presentNote = (n: Row): Row => ({ ...n, tags: parseJson<string[]>(n.tags, []), pinned: !!n.pinned });

function checkRefs(db: Db, userId: string, i: { project_id?: string | null; workspace_id?: string | null }) {
  if (i.project_id && !db.getOwned('projects', userId, i.project_id)) throw notFound('Project');
  if (i.workspace_id && !db.getOwned('workspaces', userId, i.workspace_id)) throw notFound('Workspace');
}

export function createNote(db: Db, userId: string, raw: unknown) {
  const i = noteInput.parse(raw);
  checkRefs(db, userId, i);
  return db.tx(() => {
    const n = db.insert('notes', {
      user_id: userId, title: i.title, body: i.body, kind: i.kind, folder: i.folder, tags: JSON.stringify(i.tags),
      source_url: i.source_url ?? null, project_id: i.project_id ?? null, workspace_id: i.workspace_id ?? null, pinned: i.pinned ? 1 : 0,
    });
    indexEntity(db, userId, 'note', n.id, n.title, `${n.body} ${i.tags.join(' ')}`);
    logActivity(db, userId, { entity: 'note', entityId: n.id, verb: 'created', summary: `Note created: ${n.title}`, projectId: n.project_id });
    return presentNote(n);
  });
}

export function updateNote(db: Db, userId: string, id: string, raw: unknown) {
  const i = noteInput.partial().parse(raw);
  checkRefs(db, userId, i);
  const n = db.updateOwned('notes', userId, id, {
    title: i.title, body: i.body, kind: i.kind, folder: i.folder, tags: i.tags ? JSON.stringify(i.tags) : undefined,
    source_url: i.source_url, project_id: i.project_id, workspace_id: i.workspace_id,
    pinned: i.pinned === undefined ? undefined : i.pinned ? 1 : 0,
  });
  if (!n) throw notFound('Note');
  indexEntity(db, userId, 'note', n.id, n.title, `${n.body} ${parseJson<string[]>(n.tags, []).join(' ')}`);
  return presentNote(n);
}

export function deleteNote(db: Db, userId: string, id: string) {
  const n = db.getOwned('notes', userId, id);
  if (!n) throw notFound('Note');
  db.deleteOwned('notes', userId, id);
  unindexEntity(db, userId, 'note', id);
  db.run("DELETE FROM links WHERE user_id = ? AND ((from_type = 'note' AND from_id = ?) OR (to_type = 'note' AND to_id = ?))", userId, id, id);
  return { deleted: true, title: n.title };
}

// ---------- Workspaces ----------

export const DEFAULT_WORKSPACES = [
  { name: 'Personal life & goals', icon: 'heart', color: 'rose' },
  { name: 'Pharmacy & business', icon: 'briefcase', color: 'emerald' },
  { name: 'Education, teaching & research', icon: 'book', color: 'amber' },
  { name: 'Software & technology', icon: 'code', color: 'indigo' },
  { name: 'General work & other projects', icon: 'folder', color: 'slate' },
];

export const workspaceInput = z.object({
  name: z.string().trim().min(1).max(80),
  icon: z.string().max(30).default('folder'),
  color: z.string().max(20).default('slate'),
  archived: z.boolean().optional(),
  sort: z.number().int().optional(),
});

// ---------- Projects ----------

export const projectInput = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(10_000).default(''),
  goals: z.string().max(10_000).default(''),
  status: z.enum(['active', 'paused', 'done', 'archived']).default('active'),
  deadline: z.string().nullable().optional(),
  next_action: z.string().max(500).default(''),
  workspace_id: z.string().max(64).nullable().optional(),
});

export const projectItemInput = z.object({
  kind: z.enum(['milestone', 'decision', 'risk', 'blocker']),
  title: z.string().trim().min(1).max(300),
  detail: z.string().max(5000).default(''),
  due_at: z.string().nullable().optional(),
  done: z.boolean().optional(),
});

export function createProject(db: Db, userId: string, raw: unknown) {
  const i = projectInput.parse(raw);
  checkRefs(db, userId, i);
  return db.tx(() => {
    const p = db.insert('projects', {
      user_id: userId, name: i.name, description: i.description, goals: i.goals, status: i.status,
      deadline: i.deadline ?? null, next_action: i.next_action, workspace_id: i.workspace_id ?? null,
    });
    indexEntity(db, userId, 'project', p.id, p.name, `${p.description} ${p.goals}`);
    logActivity(db, userId, { entity: 'project', entityId: p.id, verb: 'created', summary: `Project created: ${p.name}`, projectId: p.id });
    return p;
  });
}

export function updateProject(db: Db, userId: string, id: string, raw: unknown) {
  const i = projectInput.partial().parse(raw);
  checkRefs(db, userId, i);
  const before = db.getOwned('projects', userId, id);
  if (!before) throw notFound('Project');
  const p = db.updateOwned('projects', userId, id, {
    name: i.name, description: i.description, goals: i.goals, status: i.status, deadline: i.deadline,
    next_action: i.next_action, workspace_id: i.workspace_id,
  })!;
  indexEntity(db, userId, 'project', p.id, p.name, `${p.description} ${p.goals}`);
  const changes = Object.keys(i);
  if (changes.length) logActivity(db, userId, { entity: 'project', entityId: id, verb: 'updated', summary: `Updated ${changes.join(', ')}`, projectId: id });
  return p;
}

export function addProjectItem(db: Db, userId: string, projectId: string, raw: unknown) {
  const i = projectItemInput.parse(raw);
  if (!db.getOwned('projects', userId, projectId)) throw notFound('Project');
  const item = db.insert('project_items', {
    user_id: userId, project_id: projectId, kind: i.kind, title: i.title, detail: i.detail, due_at: i.due_at ?? null, done: i.done ? 1 : 0,
  });
  logActivity(db, userId, { entity: 'project_item', entityId: item.id, verb: 'added', summary: `${cap(i.kind)} added: ${i.title}`, projectId });
  db.run('UPDATE projects SET updated_at = ? WHERE id = ?', new Date().toISOString(), projectId);
  return item;
}

export function deleteProject(db: Db, userId: string, id: string) {
  const p = db.getOwned('projects', userId, id);
  if (!p) throw notFound('Project');
  db.deleteOwned('projects', userId, id);
  unindexEntity(db, userId, 'project', id);
  return { deleted: true, name: p.name };
}

/** Everything about a project in one object, for the UI and for the model's context. */
export function projectDetail(db: Db, userId: string, id: string) {
  const p = db.getOwned('projects', userId, id);
  if (!p) throw notFound('Project');
  const items = db.all('SELECT * FROM project_items WHERE project_id = ? AND user_id = ? ORDER BY done, due_at IS NULL, due_at, created_at', id, userId);
  const tasks = db.all("SELECT id, title, status, due_at, priority FROM tasks WHERE project_id = ? AND user_id = ? AND parent_id IS NULL ORDER BY status, due_at IS NULL, due_at", id, userId);
  const notes = db.all('SELECT id, title, kind, updated_at FROM notes WHERE project_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT 50', id, userId);
  const documents = db.all('SELECT id, filename, kind, created_at FROM documents WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 50', id, userId);
  const activity = db.all('SELECT * FROM activity WHERE project_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 30', id, userId);
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  const milestones = items.filter((i) => i.kind === 'milestone');
  return {
    ...p,
    items: items.map((i) => ({ ...i, done: !!i.done })),
    tasks, notes, documents, activity,
    progress: {
      tasksTotal: total, tasksDone: done,
      milestonesTotal: milestones.length, milestonesDone: milestones.filter((m) => m.done).length,
      percent: total ? Math.round((done / total) * 100) : null,
    },
  };
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
