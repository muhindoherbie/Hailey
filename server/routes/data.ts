import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../context.ts';
import { notFound, badRequest } from '../context.ts';
import { parseJson } from '../db/index.ts';
import * as tasks from '../services/tasks.ts';
import * as memory from '../services/memory.ts';
import * as knowledge from '../services/knowledge.ts';
import * as routines from '../services/routines.ts';
import { extractRamble, applyRamble, MAX_RAMBLE_CHARS } from '../services/ramble.ts';
import * as connectors from '../services/connectors.ts';
import { getSettings, updateSettings } from '../services/settings.ts';
import { buildOverview, briefingText, suggestions } from '../services/briefing.ts';
import { searchIndex } from '../services/indexer.ts';
import { localDate, startOfLocalDay, addDays, safeTimeZone, localClock, parseWhen, formatLocal } from '../services/time.ts';
import { approveAction, rejectAction, TOOLS, executeTool, makeContext } from '../tools/registry.ts';

const page = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100), offset: z.coerce.number().int().min(0).default(0) });

export function dataRoutes() {
  const r = new Hono<AppEnv>();
  const uid = (c: any) => c.var.user.id as string;
  const db = (c: any) => c.var.services.db as AppEnv['Variables']['services']['db'];
  const tzOf = (c: any) => safeTimeZone(getSettings(db(c), uid(c)).regional.timeZone);
  const body = async (c: any) => c.req.json().catch(() => {
    throw badRequest('Request body must be JSON');
  });

  // ---------- Settings ----------
  r.get('/settings', (c) => c.json(getSettings(db(c), uid(c))));
  r.patch('/settings', async (c) => c.json(updateSettings(db(c), uid(c), await body(c))));

  // ---------- Dashboard ----------
  r.get('/dashboard', (c) => {
    const { now } = c.var.services;
    const s = getSettings(db(c), uid(c));
    const tz = safeTimeZone(s.regional.timeZone);
    const o = buildOverview(db(c), uid(c), now(), tz, 0, s.regional.locale);
    const hour = Number(localClock(now(), tz).hhmm.slice(0, 2));
    const recentConversations = db(c).all(
      'SELECT id, title, updated_at FROM conversations WHERE user_id = ? AND archived = 0 ORDER BY updated_at DESC LIMIT 6', uid(c),
    );
    const recentWork = db(c).all('SELECT * FROM activity WHERE user_id = ? ORDER BY created_at DESC LIMIT 10', uid(c));
    const notifications = db(c).all('SELECT * FROM notifications WHERE user_id = ? AND read = 0 ORDER BY created_at DESC LIMIT 10', uid(c));
    return c.json({
      overview: o,
      briefing: briefingText(o, s.profile.displayName || c.var.user.name, hour),
      suggestions: suggestions(o, db(c), uid(c), now()),
      recentConversations, recentWork, notifications,
      hour,
    });
  });

  // ---------- Global search ----------
  r.get('/search', (c) => {
    const q = (c.req.query('q') ?? '').slice(0, 300);
    const hits = searchIndex(db(c), uid(c), q, { limit: 40 });
    const out = hits.map((h) => {
      if (h.entity === 'doc_chunk') {
        const d = db(c).get('SELECT d.id, d.filename FROM doc_chunks k JOIN documents d ON d.id = k.document_id WHERE k.id = ?', h.id);
        return { ...h, entity: 'document', id: d?.id ?? h.id, title: d?.filename ?? h.title };
      }
      if (h.entity === 'message') {
        const m = db(c).get('SELECT conversation_id FROM messages WHERE id = ?', h.id);
        return { ...h, entity: 'conversation', id: m?.conversation_id ?? h.id };
      }
      return h;
    });
    return c.json({ results: out });
  });

  // ---------- Workspaces ----------
  r.get('/workspaces', (c) => c.json({
    workspaces: db(c).all(
      `SELECT w.*, (SELECT COUNT(*) FROM projects p WHERE p.workspace_id = w.id AND p.status = 'active') AS active_projects
       FROM workspaces w WHERE w.user_id = ? ORDER BY w.archived, w.sort, w.created_at`, uid(c),
    ).map((w) => ({ ...w, archived: !!w.archived })),
  }));
  r.post('/workspaces', async (c) => {
    const i = knowledge.workspaceInput.parse(await body(c));
    return c.json(db(c).insert('workspaces', { user_id: uid(c), name: i.name, icon: i.icon, color: i.color, sort: i.sort ?? 99 }), 201);
  });
  r.patch('/workspaces/:id', async (c) => {
    const i = knowledge.workspaceInput.partial().parse(await body(c));
    const w = db(c).updateOwned('workspaces', uid(c), c.req.param('id'), {
      name: i.name, icon: i.icon, color: i.color, sort: i.sort, archived: i.archived === undefined ? undefined : i.archived ? 1 : 0,
    });
    if (!w) throw notFound('Workspace');
    return c.json(w);
  });
  r.delete('/workspaces/:id', (c) => {
    if (!db(c).deleteOwned('workspaces', uid(c), c.req.param('id'))) throw notFound('Workspace');
    return c.json({ deleted: true });
  });

  // ---------- Projects ----------
  r.get('/projects', (c) => {
    const ws = c.req.query('workspace_id');
    const status = c.req.query('status');
    const rows = db(c).all(
      `SELECT p.*, w.name AS workspace_name,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS tasks_total,
         (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS tasks_done,
         (SELECT COUNT(*) FROM project_items i WHERE i.project_id = p.id AND i.kind = 'blocker' AND i.done = 0) AS open_blockers
       FROM projects p LEFT JOIN workspaces w ON w.id = p.workspace_id
       WHERE p.user_id = ? ${ws ? 'AND p.workspace_id = ?' : ''} ${status ? 'AND p.status = ?' : ''}
       ORDER BY p.status = 'active' DESC, p.updated_at DESC`,
      uid(c), ...(ws ? [ws] : []), ...(status ? [status] : []),
    );
    return c.json({ projects: rows });
  });
  r.post('/projects', async (c) => c.json(knowledge.createProject(db(c), uid(c), await body(c)), 201));
  r.get('/projects/:id', (c) => c.json(knowledge.projectDetail(db(c), uid(c), c.req.param('id'))));
  r.patch('/projects/:id', async (c) => c.json(knowledge.updateProject(db(c), uid(c), c.req.param('id'), await body(c))));
  r.delete('/projects/:id', (c) => c.json(knowledge.deleteProject(db(c), uid(c), c.req.param('id'))));
  r.post('/projects/:id/items', async (c) => c.json(knowledge.addProjectItem(db(c), uid(c), c.req.param('id'), await body(c)), 201));
  r.patch('/project-items/:id', async (c) => {
    const i = knowledge.projectItemInput.partial().parse(await body(c));
    const item = db(c).updateOwned('project_items', uid(c), c.req.param('id'), {
      kind: i.kind, title: i.title, detail: i.detail, due_at: i.due_at, done: i.done === undefined ? undefined : i.done ? 1 : 0,
    });
    if (!item) throw notFound('Item');
    return c.json({ ...item, done: !!item.done });
  });
  r.delete('/project-items/:id', (c) => {
    if (!db(c).deleteOwned('project_items', uid(c), c.req.param('id'))) throw notFound('Item');
    return c.json({ deleted: true });
  });

  // ---------- Tasks ----------
  r.get('/tasks', (c) => {
    const q = c.req.query();
    const tz = tzOf(c);
    const today = localDate(c.var.services.now(), tz);
    return c.json({
      tasks: tasks.listTasks(db(c), uid(c), {
        view: (q.view as tasks.TaskView) ?? 'all', q: q.q, project_id: q.project_id, tag: q.tag,
        priority: q.priority ? Number(q.priority) : undefined, sort: q.sort,
        dayStart: startOfLocalDay(today, tz), dayEnd: startOfLocalDay(addDays(today, 1), tz), now: c.var.services.now(),
      }),
    });
  });
  r.post('/tasks', async (c) => c.json(tasks.createTask(db(c), uid(c), await body(c)), 201));
  /** Parses a natural-language request into a task draft for the user to confirm. Nothing is saved. */
  r.post('/tasks/parse', async (c) => {
    const { text } = z.object({ text: z.string().min(1).max(500) }).parse(await body(c));
    const s = getSettings(db(c), uid(c));
    const tz = safeTimeZone(s.regional.timeZone);
    const p = parseWhen(text, c.var.services.now(), tz);
    const wantsReminder = /\bremind(er)?\b/i.test(text);
    const priority = /\b(urgent|asap|important|high priority)\b/i.test(text) ? 1 : 2;
    return c.json({
      draft: {
        title: (p?.remainder || text).replace(/\b(urgent|asap)\b/gi, '').trim().replace(/^./, (m) => m.toUpperCase()) || text,
        due_at: p?.iso ?? null,
        all_day: p?.allDay ?? false,
        remind_at: wantsReminder && p ? p.iso : null,
        priority,
      },
      interpreted: p ? { text: p.matchedText, local: formatLocal(p.iso, tz, s.regional.locale, !p.allDay) } : null,
      ambiguities: p ? p.ambiguities : wantsReminder ? ['No date or time was found — when should I remind you?'] : [],
      needsConfirmation: !p || p.ambiguities.length > 0 || wantsReminder,
    });
  });
  r.get('/tasks/workload', (c) => {
    const s = getSettings(db(c), uid(c));
    const tz = safeTimeZone(s.regional.timeZone);
    const q = z.object({ days: z.coerce.number().int().min(1).max(31).default(7), capacity: z.coerce.number().int().min(30).max(1440).default(480) })
      .parse({ days: c.req.query('days') ?? undefined, capacity: c.req.query('capacity') ?? undefined });
    const today = localDate(c.var.services.now(), tz);
    const bounds = Array.from({ length: q.days }, (_, i) => {
      const d = addDays(today, i);
      return { date: d, start: startOfLocalDay(d, tz).toISOString(), end: startOfLocalDay(addDays(d, 1), tz).toISOString() };
    });
    return c.json(tasks.workload(db(c), uid(c), bounds, q.capacity));
  });
  r.post('/tasks/:id/dependencies', async (c) => {
    const { depends_on_id } = z.object({ depends_on_id: z.string().max(64) }).parse(await body(c));
    return c.json(tasks.addDependency(db(c), uid(c), c.req.param('id'), depends_on_id));
  });
  r.delete('/tasks/:id/dependencies/:depId', (c) => c.json(tasks.removeDependency(db(c), uid(c), c.req.param('id'), c.req.param('depId'))));
  r.get('/tasks/:id', (c) => {
    const t = db(c).getOwned('tasks', uid(c), c.req.param('id'));
    if (!t) throw notFound('Task');
    return c.json({
      ...tasks.presentTask(t),
      subtasks: db(c).all('SELECT * FROM tasks WHERE parent_id = ? AND user_id = ? ORDER BY status, sort, created_at', t.id, uid(c)).map(tasks.presentTask),
      history: db(c).all('SELECT change, created_at FROM task_history WHERE task_id = ? ORDER BY created_at DESC LIMIT 50', t.id),
      reminders: db(c).all('SELECT * FROM reminders WHERE task_id = ? AND user_id = ? ORDER BY remind_at', t.id, uid(c)),
      ...tasks.listDependencies(db(c), uid(c), t.id),
    });
  });
  r.patch('/tasks/:id', async (c) => c.json(tasks.updateTask(db(c), uid(c), c.req.param('id'), await body(c))));
  r.post('/tasks/:id/complete', (c) => c.json(tasks.completeTask(db(c), uid(c), c.req.param('id'), c.var.services.now())));
  r.post('/tasks/:id/reopen', (c) => c.json(tasks.reopenTask(db(c), uid(c), c.req.param('id'))));
  r.delete('/tasks/:id', (c) => c.json(tasks.deleteTask(db(c), uid(c), c.req.param('id'))));
  r.post('/tasks/carry-forward', async (c) => {
    const { task_ids } = z.object({ task_ids: z.array(z.string().max(64)).min(1).max(100) }).parse(await body(c));
    const ctx = makeContext(c.var.services, uid(c), null);
    const out = await executeTool('carry_forward_tasks', { task_ids }, ctx, 'user', new Set(['carry_forward_tasks']));
    return c.json(out);
  });

  // ---------- Reminders ----------
  r.get('/reminders', (c) => c.json({
    reminders: db(c).all(
      "SELECT * FROM reminders WHERE user_id = ? AND (status IN ('scheduled','sending') OR remind_at > ?) ORDER BY remind_at", uid(c),
      new Date(c.var.services.now().getTime() - 7 * 86400_000).toISOString(),
    ),
  }));
  r.post('/reminders', async (c) => {
    const i = tasks.reminderInput.parse(await body(c));
    if (new Date(i.remind_at).getTime() < c.var.services.now().getTime() - 60_000) throw badRequest('That time is in the past.');
    return c.json(tasks.createReminder(db(c), uid(c), i), 201);
  });
  r.delete('/reminders/:id', (c) => {
    const res = db(c).run("UPDATE reminders SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'scheduled'", c.req.param('id'), uid(c));
    if (Number(res.changes) === 0) throw notFound('Scheduled reminder');
    return c.json({ cancelled: true });
  });

  // ---------- Notes ----------
  r.get('/notes', (c) => {
    const { q, folder, kind, project_id, tag } = c.req.query();
    const where = ['n.user_id = ?'];
    const params: any[] = [uid(c)];
    if (folder) { where.push('n.folder = ?'); params.push(folder); }
    if (kind) { where.push('n.kind = ?'); params.push(kind); }
    if (project_id) { where.push('n.project_id = ?'); params.push(project_id); }
    if (tag) { where.push('EXISTS (SELECT 1 FROM json_each(n.tags) WHERE value = ?)'); params.push(tag); }
    if (q) { where.push('(n.title LIKE ? OR n.body LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
    const rows = db(c).all(
      `SELECT n.id, n.title, n.kind, n.folder, n.tags, n.pinned, n.project_id, n.source_url, n.updated_at, n.created_at, substr(n.body, 1, 240) AS excerpt
       FROM notes n WHERE ${where.join(' AND ')} ORDER BY n.pinned DESC, n.updated_at DESC LIMIT 500`, ...params,
    );
    const folders = db(c).all("SELECT DISTINCT folder FROM notes WHERE user_id = ? AND folder != '' ORDER BY folder", uid(c)).map((f) => f.folder);
    return c.json({ notes: rows.map(knowledge.presentNote), folders });
  });
  r.post('/notes', async (c) => c.json(knowledge.createNote(db(c), uid(c), await body(c)), 201));
  r.get('/notes/:id', (c) => {
    const n = db(c).getOwned('notes', uid(c), c.req.param('id'));
    if (!n) throw notFound('Note');
    const links = db(c).all("SELECT * FROM links WHERE user_id = ? AND ((from_type = 'note' AND from_id = ?) OR (to_type = 'note' AND to_id = ?))", uid(c), n.id, n.id);
    return c.json({ ...knowledge.presentNote(n), links: resolveLinks(db(c), uid(c), links, 'note', n.id) });
  });
  r.patch('/notes/:id', async (c) => c.json(knowledge.updateNote(db(c), uid(c), c.req.param('id'), await body(c))));
  r.delete('/notes/:id', (c) => c.json(knowledge.deleteNote(db(c), uid(c), c.req.param('id'))));

  // ---------- Links between notes, documents, tasks and projects ----------
  const linkInput = z.object({
    from_type: z.enum(['note', 'document', 'task', 'project']), from_id: z.string().max(64),
    to_type: z.enum(['note', 'document', 'task', 'project']), to_id: z.string().max(64),
  });
  const TABLE: Record<string, string> = { note: 'notes', document: 'documents', task: 'tasks', project: 'projects' };
  r.post('/links', async (c) => {
    const i = linkInput.parse(await body(c));
    for (const [t, id] of [[i.from_type, i.from_id], [i.to_type, i.to_id]] as const) {
      if (!db(c).getOwned(TABLE[t], uid(c), id)) throw notFound(t);
    }
    db(c).run('INSERT OR IGNORE INTO links (id, user_id, from_type, from_id, to_type, to_id) VALUES (?, ?, ?, ?, ?, ?)', crypto.randomUUID(), uid(c), i.from_type, i.from_id, i.to_type, i.to_id);
    return c.json({ linked: true }, 201);
  });
  r.delete('/links/:id', (c) => {
    if (!db(c).deleteOwned('links', uid(c), c.req.param('id'))) throw notFound('Link');
    return c.json({ deleted: true });
  });

  // ---------- Memories ----------
  r.get('/memories', (c) => {
    const { status, category, q } = c.req.query();
    const where = ['user_id = ?'];
    const params: any[] = [uid(c)];
    if (status) { where.push('status = ?'); params.push(status); }
    if (category) { where.push('category = ?'); params.push(category); }
    if (q) { where.push('content LIKE ?'); params.push(`%${q}%`); }
    return c.json({
      memories: db(c).all(`SELECT * FROM memories WHERE ${where.join(' AND ')} ORDER BY status = 'proposed' DESC, updated_at DESC LIMIT 1000`, ...params)
        .map((m) => ({ ...m, sensitive: !!m.sensitive, sensitivity: memory.sensitivityOf(m.content) })),
      categories: memory.MEMORY_CATEGORIES,
    });
  });
  r.post('/memories', async (c) => {
    const s = getSettings(db(c), uid(c));
    const raw = await body(c);
    const expires = s.memory.retentionDays && !raw.expires_at ? new Date(c.var.services.now().getTime() + s.memory.retentionDays * 86400_000).toISOString() : raw.expires_at;
    // Saved by the user directly, so it is active even if sensitive (they chose to save it).
    return c.json(memory.saveMemory(db(c), uid(c), { ...raw, expires_at: expires }, { status: 'active', source: 'user' }), 201);
  });
  r.patch('/memories/:id', async (c) => c.json(memory.updateMemory(db(c), uid(c), c.req.param('id'), await body(c))));
  r.post('/memories/:id/approve', (c) => c.json(memory.updateMemory(db(c), uid(c), c.req.param('id'), { status: 'active' })));
  r.delete('/memories/:id', (c) => c.json(memory.deleteMemory(db(c), uid(c), c.req.param('id'))));
  r.post('/memories/clear', async (c) => {
    const i = z.object({ categories: z.array(z.string()).optional(), confirm: z.literal(true) }).parse(await body(c));
    return c.json(memory.clearMemories(db(c), uid(c), i.categories));
  });

  // ---------- Notifications ----------
  r.get('/notifications', (c) => c.json({
    notifications: db(c).all('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100', uid(c)),
    unread: Number(db(c).get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', uid(c))!.n),
  }));
  r.post('/notifications/read', async (c) => {
    const { ids } = z.object({ ids: z.array(z.string().max(64)).max(500).optional() }).parse(await body(c));
    if (ids?.length) for (const id of ids) db(c).run('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?', id, uid(c));
    else db(c).run('UPDATE notifications SET read = 1 WHERE user_id = ?', uid(c));
    return c.json({ ok: true });
  });

  // ---------- Actions (approval queue + history) ----------
  r.get('/actions', (c) => {
    const { status } = c.req.query();
    const { limit, offset } = page.parse(c.req.query());
    const rows = db(c).all(
      `SELECT a.*, c.title AS conversation_title FROM actions a LEFT JOIN conversations c ON c.id = a.conversation_id
       WHERE a.user_id = ? ${status ? 'AND a.status = ?' : ''} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
      uid(c), ...(status ? [status] : []), limit, offset,
    );
    return c.json({
      actions: rows.map((a) => ({ ...a, input: parseJson(a.input, {}), result: parseJson(a.result, null) })),
      pending: Number(db(c).get("SELECT COUNT(*) AS n FROM actions WHERE user_id = ? AND status = 'pending'", uid(c))!.n),
    });
  });
  r.post('/actions/:id/approve', async (c) => c.json(await approveAction(c.var.services, uid(c), c.req.param('id'))));
  r.post('/actions/:id/reject', (c) => c.json(rejectAction(c.var.services, uid(c), c.req.param('id'))));
  r.get('/tools', (c) => {
    const s = getSettings(db(c), uid(c));
    return c.json({
      tools: TOOLS.map((t) => ({
        name: t.name, description: t.description, risk: t.risk,
        mode: s.permissions.tools[t.name] ?? (t.risk === 'consequential' ? 'ask' : t.risk === 'reversible' && !s.permissions.autoReversible ? 'ask' : 'auto'),
      })),
    });
  });

  // ---------- Routines ----------
  r.get('/routines', (c) => c.json({ routines: routines.listRoutines(db(c), uid(c)) }));
  r.get('/routines/ideas', (c) => c.json({ ideas: routines.ROUTINE_IDEAS, webSearch: c.var.services.search.available().configured }));
  r.post('/routines', async (c) => c.json(routines.createRoutine(db(c), uid(c), await body(c)), 201));
  r.patch('/routines/:id', async (c) => c.json(routines.updateRoutine(db(c), uid(c), c.req.param('id'), await body(c))));
  r.delete('/routines/:id', (c) => c.json(routines.deleteRoutine(db(c), uid(c), c.req.param('id'))));
  r.post('/routines/:id/run', async (c) => {
    const row = db(c).getOwned('routines', uid(c), c.req.param('id'));
    if (!row) throw notFound('Routine');
    if (row.kind !== 'custom') throw badRequest('Built-in routines run at their scheduled time.');
    try {
      return c.json(await routines.runCustomRoutine(c.var.services, row));
    } catch (err: any) {
      db(c).run("UPDATE routines SET last_run_at = ?, last_status = 'failed', last_error = ? WHERE id = ?", c.var.services.now().toISOString(), String(err?.message ?? err).slice(0, 300), row.id);
      throw err;
    }
  });

  // ---------- Connected apps (MCP) ----------
  r.get('/connectors', (c) => c.json({ connectors: connectors.listConnectors(db(c), uid(c)), allowPrivate: c.var.services.config.MCP_ALLOW_PRIVATE_NETWORK === 'true' }));
  r.post('/connectors', async (c) => c.json(await connectors.addConnector(c.var.services, uid(c), await body(c)), 201));
  r.post('/connectors/:id/refresh', async (c) => c.json(await connectors.refreshConnector(c.var.services, uid(c), c.req.param('id'))));
  r.patch('/connectors/:id', async (c) => c.json(connectors.updateConnector(c.var.services, uid(c), c.req.param('id'), await body(c))));
  r.delete('/connectors/:id', (c) => c.json(connectors.deleteConnector(db(c), uid(c), c.req.param('id'))));

  // ---------- Ramble (brain-dump → tasks, reminders, notes) ----------
  r.post('/ramble/extract', async (c) => {
    const i = z.object({ text: z.string().max(MAX_RAMBLE_CHARS + 1000) }).parse(await body(c));
    return c.json(await extractRamble(c.var.services, uid(c), i.text));
  });
  r.post('/ramble/apply', async (c) => c.json(applyRamble(db(c), uid(c), await body(c), c.var.services.now()), 201));

  // ---------- Usage ----------
  r.get('/usage', (c) => {
    const since = new Date(c.var.services.now().getTime() - 30 * 86400_000).toISOString();
    const day = new Date(c.var.services.now().getTime() - 86400_000).toISOString();
    const s = getSettings(db(c), uid(c));
    return c.json({
      last24h: db(c).get('SELECT COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output, COALESCE(SUM(cost_usd),0) AS cost FROM usage WHERE user_id = ? AND created_at >= ?', uid(c), day),
      last30d: db(c).get('SELECT COALESCE(SUM(input_tokens),0) AS input, COALESCE(SUM(output_tokens),0) AS output, COALESCE(SUM(cost_usd),0) AS cost, COUNT(*) AS requests FROM usage WHERE user_id = ? AND created_at >= ?', uid(c), since),
      byDay: db(c).all("SELECT substr(created_at,1,10) AS day, SUM(input_tokens + output_tokens) AS tokens, SUM(cost_usd) AS cost FROM usage WHERE user_id = ? AND created_at >= ? GROUP BY day ORDER BY day", uid(c), since),
      byModel: db(c).all('SELECT provider, model, SUM(input_tokens) AS input, SUM(output_tokens) AS output, SUM(cost_usd) AS cost FROM usage WHERE user_id = ? AND created_at >= ? GROUP BY provider, model', uid(c), since),
      dailyLimit: s.ai.dailyTokenLimit ?? c.var.services.config.DAILY_TOKEN_LIMIT,
      monthlyLimit: s.ai.monthlyTokenLimit ?? 0,
      note: 'Costs are estimates from token counts and published list prices; your provider\'s billing dashboard is authoritative. Local models are counted at $0.',
    });
  });

  // ---------- Data export ----------
  r.get('/export', (c) => {
    const u = uid(c);
    const d = db(c);
    const tables = ['workspaces', 'projects', 'project_items', 'tasks', 'task_dependencies', 'reminders', 'notes', 'memories', 'conversations', 'routines', 'actions', 'activity', 'links'];
    const data: Record<string, unknown> = { exported_at: new Date().toISOString(), format: 'hailey-export-v1', user: c.var.user, settings: getSettings(d, u) };
    for (const t of tables) data[t] = d.all(`SELECT * FROM ${t} WHERE user_id = ?`, u);
    data.messages = d.all("SELECT id, conversation_id, role, content, created_at FROM messages WHERE user_id = ? AND role IN ('user','assistant')", u);
    data.documents = d.all('SELECT id, filename, kind, size, summary, key_points, tags, folder, created_at FROM documents WHERE user_id = ?', u);
    for (const conv of data.conversations as any[]) delete conv.system_prompt;
    c.header('Content-Disposition', `attachment; filename="hailey-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return c.json(data);
  });

  return r;
}

function resolveLinks(d: any, userId: string, links: any[], selfType: string, selfId: string) {
  const TABLE: Record<string, [string, string]> = { note: ['notes', 'title'], document: ['documents', 'filename'], task: ['tasks', 'title'], project: ['projects', 'name'] };
  return links.map((l) => {
    const [type, id] = l.from_type === selfType && l.from_id === selfId ? [l.to_type, l.to_id] : [l.from_type, l.from_id];
    const [table, col] = TABLE[type];
    const row = d.getOwned(table, userId, id);
    return { link_id: l.id, type, id, title: row?.[col] ?? '(deleted)' };
  });
}
