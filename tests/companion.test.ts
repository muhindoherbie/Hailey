import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setup, signup, text, toolCall, type TestCtx } from './helpers.ts';
import { isoWeek } from '../server/services/achievements.ts';

let ctx: TestCtx;
beforeEach(() => (ctx = setup()));
afterEach(() => ctx.cleanup());

async function chat(c: Awaited<ReturnType<typeof signup>>, message: string) {
  const conv = (await c.post('/api/conversations', {})).data;
  await c.post(`/api/conversations/${conv.id}/messages`, { text: message });
  return conv.id as string;
}

describe('personal assistant profile', () => {
  it('uses the assistant’s name, reply language and writing style in new conversations', async () => {
    const c = await signup(ctx);
    await c.patch('/api/settings', { profile: { assistantName: 'Nia', replyLanguage: 'Luganda', writingStyle: '- Short, warm, signs off "Cheers"' } });
    ctx.provider.steps.push(() => text('Gyebale ko!'));
    await chat(c, 'hello');
    const system = ctx.provider.calls[0].system;
    expect(system).toMatch(/^You are Nia \(the user renamed you; the app is called Hailey\)/);
    expect(system).toContain('Reply in Luganda');
    expect(system).toContain('signs off "Cheers"');
  });

  it('unlocks specialist modes through use and refuses locked ones', async () => {
    const c = await signup(ctx);
    expect((await c.patch('/api/settings', { profile: { persona: 'coach' } })).status).toBe(400);
    let a = (await c.get('/api/achievements')).data;
    expect(a.personas.find((p: any) => p.id === 'tutor')).toMatchObject({ unlocked: false, progress: 0, goal: 10 });
    for (let i = 0; i < 10; i++) await c.post('/api/notes', { title: `Note ${i}` });
    a = (await c.get('/api/achievements')).data;
    expect(a.personas.find((p: any) => p.id === 'tutor').unlocked).toBe(true);
    expect((await c.patch('/api/settings', { profile: { persona: 'tutor' } })).status).toBe(200);
    ctx.provider.steps.push(() => text('ok'));
    await chat(c, 'teach me fractions');
    expect(ctx.provider.calls[0].system).toContain('Specialist mode: Tutor');
  });

  it('counts a weekly streak from visits and shows the week in numbers', async () => {
    const c = await signup(ctx);
    for (const day of ['2026-10-02T08:00:00Z', '2026-10-09T08:00:00Z', '2026-10-16T08:00:00Z']) {
      ctx.clock.now = new Date(day);
      await c.get('/api/dashboard');
    }
    const t = (await c.post('/api/tasks', { title: 'Stock count' })).data;
    await c.post(`/api/tasks/${t.id}/complete`);
    const d = (await c.get('/api/dashboard')).data;
    expect(d.streak).toBe(3);
    expect(d.week).toMatchObject({ tasksCompleted: 1, tasksAdded: 1 });
    expect((await c.get('/api/achievements')).data.weeksVisited).toBe(3);
    expect(isoWeek('2026-01-01')).toBe('2026-W01');
    expect(isoWeek('2024-12-30')).toBe('2025-W01');
    expect(isoWeek('2027-01-03')).toBe('2026-W53');
  });

  it('puts Discover cards that match your interests first', async () => {
    const c = await signup(ctx);
    const all = (await c.get('/api/discover')).data.cards;
    expect(all.length).toBeGreaterThan(30);
    expect(all.every((x: any) => !x.forYou)).toBe(true);
    await c.patch('/api/settings', { profile: { interests: ['food'] } });
    const mine = (await c.get('/api/discover')).data.cards;
    expect(mine[0].forYou).toBe(true);
    expect(mine[0].interests).toContain('food');
    for (const card of all.filter((x: any) => x.action === 'chat')) expect(card.prompt.length).toBeGreaterThan(40);
  });

  it('learns a writing style from samples without storing them', async () => {
    const c = await signup(ctx);
    ctx.provider.steps.push(() => text('- Friendly and brief\n- Uses "Webale" to thank people'));
    const sample = 'Hi Grace, webale for sending the stock list so quickly. I will pick up the order on Friday. Cheers, Herbert. ';
    expect((await c.post('/api/profile/writing-style', { samples: 'too short' })).status).toBe(400);
    const r = await c.post('/api/profile/writing-style', { samples: sample.repeat(2) });
    expect(r.data.writingStyle).toContain('Webale');
    expect((await c.get('/api/settings')).data.profile.writingStyle).toContain('Friendly and brief');
    expect(JSON.stringify((await c.get('/api/settings')).data)).not.toContain('stock list');
    expect(JSON.stringify(ctx.provider.calls[0].messages)).toContain('untrusted');
  });
});

describe('places, calls and chat extras', () => {
  it('finds places with OpenStreetMap and cites them', async () => {
    const c = await signup(ctx);
    let asked = '';
    ctx.services.netFetch = (async (url: any, init: any) => {
      asked = String(url);
      expect(init.headers['user-agent']).toMatch(/^Hailey/);
      return new Response(JSON.stringify([{ name: 'Ntinda Pharmacy', display_name: 'Ntinda Pharmacy, Ntinda Road, Kampala', lat: '0.354', lon: '32.612', category: 'amenity', type: 'pharmacy' }]), { headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    ctx.provider.steps.push(() => toolCall('find_places', { query: 'pharmacy', lat: 0.35, lon: 32.61 }));
    ctx.provider.steps.push(() => text('Ntinda Pharmacy is closest.'));
    const id = await chat(c, 'pharmacy near me [My location: 0.35, 32.61]');
    expect(asked).toContain('nominatim.openstreetmap.org/search');
    expect(asked).toContain('bounded=1');
    const result = JSON.stringify(ctx.provider.calls[1].messages.at(-1));
    expect(result).toContain('Ntinda Pharmacy');
    expect(result).toContain('google.com/maps/search');
    const conv = (await c.get(`/api/conversations/${id}`)).data;
    expect(JSON.stringify(conv.messages.at(-1).meta.sources)).toContain('openstreetmap.org');
  });

  it('prepares a phone call as a note with a tap-to-dial link', async () => {
    const c = await signup(ctx);
    ctx.provider.steps.push(() => toolCall('prepare_call', { who: 'Supplier Ltd', phone: '+256 700 123 456', purpose: 'Late delivery', script: '1. Say who you are\n2. Ask for a new date' }));
    ctx.provider.steps.push(() => text('Your call plan is saved.'));
    await chat(c, 'help me call the supplier');
    const notes = (await c.get('/api/notes')).data.notes;
    expect(notes[0].title).toBe('Call: Supplier Ltd');
    expect((await c.get(`/api/notes/${notes[0].id}`)).data.body).toContain('tel:+256700123456');
  });

  it('rates replies and clears all notifications', async () => {
    const c = await signup(ctx);
    ctx.provider.steps.push(() => text('Here you go.'));
    const id = await chat(c, 'hi');
    const reply = (await c.get(`/api/conversations/${id}`)).data.messages.find((m: any) => m.role === 'assistant');
    expect((await c.patch(`/api/messages/${reply.id}/rating`, { rating: 1 })).status).toBe(200);
    expect((await c.get(`/api/conversations/${id}`)).data.messages.find((m: any) => m.id === reply.id).meta.rating).toBe(1);
    const other = await signup(ctx, 'Other');
    expect((await other.patch(`/api/messages/${reply.id}/rating`, { rating: -1 })).status).toBe(404);
    await c.post('/api/push/test').catch(() => undefined);
    ctx.services.db.insert('notifications', { user_id: c.user.id, kind: 'info', title: 'x' });
    expect((await c.del('/api/notifications')).data.deleted).toBeGreaterThan(0);
    expect((await c.get('/api/notifications')).data.notifications).toHaveLength(0);
  });
});

describe('Your stuff and the mascot', () => {
  it('sums up everything Hailey is holding in one call', async () => {
    const c = await signup(ctx);
    await c.post('/api/tasks', { title: 'Overdue', due_at: '2026-10-14T09:00:00Z' });
    await c.post('/api/tasks', { title: 'Today', due_at: '2026-10-16T15:00:00Z' });
    await c.post('/api/tasks', { title: 'Someday' });
    await c.post('/api/notes', { title: 'Idea' });
    await c.post('/api/reminders', { title: 'Call', remind_at: '2026-10-17T09:00:00Z' }).catch(() => undefined);
    const s = (await c.get('/api/stuff')).data;
    expect(s.tasks).toEqual({ open: 3, dueToday: 1, overdue: 1 });
    expect(s.notes).toBe(1);
    expect(s.routines.active).toBe(0);
    expect(s).toHaveProperty('approvals', 0);
    const other = await signup(ctx, 'Other');
    expect((await other.get('/api/stuff')).data.tasks.open).toBe(0);
  });

  it('earns the crown with a 4-week streak and refuses accessories not yet earned', async () => {
    const c = await signup(ctx);
    expect((await c.patch('/api/settings', { profile: { mascotAccessory: 'party' } })).status).toBe(200);
    expect((await c.patch('/api/settings', { profile: { mascotAccessory: 'crown' } })).status).toBe(400);
    expect((await c.patch('/api/settings', { profile: { mascotAccessory: 'chef' } })).status).toBe(400);
    for (const day of ['2026-09-25', '2026-10-02', '2026-10-09', '2026-10-16']) {
      ctx.clock.now = new Date(`${day}T08:00:00Z`);
      await c.get('/api/dashboard');
    }
    expect((await c.get('/api/achievements')).data.legendary).toBe(true);
    expect((await c.patch('/api/settings', { profile: { mascotAccessory: 'crown' } })).data.profile.mascotAccessory).toBe('crown');
    // Four different weeks also unlock Chef mode, so its hat is allowed too.
    expect((await c.patch('/api/settings', { profile: { mascotAccessory: 'chef' } })).status).toBe(200);
  });
});
