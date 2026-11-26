/**
 * Host half of the Favorites bundle.
 *
 * Favorites are plugin-owned data, so they live outside the Session log and
 * outside the model context: one JSON document under the profile directory,
 * served to the Client module over small routes on the running web server, and
 * to the Agent through one `favorites` tool.
 *
 *   GET  /plugin-favorites/list          -> { items }
 *   POST /plugin-favorites/save          -> { items }        body: { items }
 *   GET  /plugin-favorites/context       -> workspace facts for one Session
 *   GET  /plugin-favorites/workspaces    -> [{ id, title, path }]
 *   GET  /plugin-favorites/file          -> one collected file's text
 *
 * Every route answers only JSON to same-origin requests carrying the
 * `x-dsh-favorites` header, so a cross-origin page cannot read or write them
 * without a preflight this server never grants. The file route reads only a
 * path that a stored bookmark already names.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = '/plugin-favorites';
const MAX_ITEMS = 2000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024;
const FILE_NAME = 'favorites.json';
const KINDS = ['message', 'turn', 'excerpt', 'file'];

export const inject = ['webServer', 'tools'];

function profileDirectory() {
  const fromEnv = process.env.DSH_PROFILE_DIR;
  if (fromEnv && fromEnv.trim()) return fromEnv;
  const name = (process.env.DSH_PROFILE || 'desktop').trim() || 'desktop';
  return path.join(os.homedir(), '.dsh', 'profiles', name);
}

function text(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function optionalNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizeItem(input) {
  if (!input || typeof input !== 'object') return null;
  const id = text(input.id, 64);
  const sessionId = text(input.sessionId, 200);
  const kind = KINDS.indexOf(input.kind) >= 0 ? input.kind : '';
  if (!id || !kind) return null;
  if (kind !== 'file' && !sessionId) return null;
  const filePath = text(input.path, 1000);
  if (kind === 'file' && !filePath && !text(input.messageId, 200)) return null;
  const tags = Array.isArray(input.tags)
    ? input.tags.filter((tag) => typeof tag === 'string').slice(0, 12).map((tag) => tag.slice(0, 40))
    : [];
  const lineStart = optionalNumber(input.lineStart);
  const lineEnd = optionalNumber(input.lineEnd);
  return {
    id: id,
    kind: kind,
    sessionId: sessionId || null,
    messageId: text(input.messageId, 200) || null,
    seq: optionalNumber(input.seq),
    turn: optionalNumber(input.turn),
    title: text(input.title, 200),
    quote: text(input.quote, 2000),
    prompt: text(input.prompt, 200) || null,
    note: text(input.note, 4000),
    tags: tags,
    path: filePath || null,
    lineStart: lineStart && lineStart > 0 ? Math.floor(lineStart) : null,
    lineEnd: lineEnd && lineEnd > 0 ? Math.floor(lineEnd) : null,
    workspaceId: text(input.workspaceId, 100) || null,
    workspaceTitle: text(input.workspaceTitle, 200) || null,
    workspacePath: text(input.workspacePath, 1000) || null,
    cwd: text(input.cwd, 1000) || null,
    sessionTitle: text(input.sessionTitle, 200) || null,
    createdAt: optionalNumber(input.createdAt) || Date.now(),
    updatedAt: optionalNumber(input.updatedAt) || Date.now(),
  };
}

function sanitizeList(input) {
  if (!Array.isArray(input)) return [];
  const items = [];
  for (const entry of input.slice(0, MAX_ITEMS)) {
    const item = sanitizeItem(entry);
    if (item) items.push(item);
  }
  return items;
}

const corsFor = new WeakMap();

/* The Desktop shell serves the page from its own `dsh-app://` origin, so every
   fetch the Client makes to these routes is cross-origin and carries a
   preflight. Allow exactly that origin family (and loopback) instead of
   answering the preflight with 403. */
/* Requests must come from DSH's own page: the desktop webview uses the
   dsh-app:// origin, the Web GUI is same-origin with this server. A foreign
   page is rejected before it can read or change the profile data. */
function requestHost(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return String(host).toLowerCase();
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || !origin) return true;
  if (/^dsh-app:\/\//i.test(origin)) return true;
  try {
    return new URL(origin).host.toLowerCase() === requestHost(req);
  } catch (err) {
    return false;
  }
}

/* Answer the CORS preflight only for an accepted origin, and reject anything
   that a foreign page could have sent. */
function admit(req, res) {
  const origin = req.headers.origin;
  if (!sameOrigin(req)) return false;
  if (typeof origin === 'string' && origin) corsFor.set(res, origin);
  return true;
}

function send(res, status, body) {
  const payload = body == null ? '' : JSON.stringify(body);
  res.statusCode = status;
  const origin = corsFor.get(res);
  if (origin) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
    res.setHeader('access-control-allow-headers', 'x-dsh-favorites, content-type');
    res.setHeader('access-control-max-age', '600');
    res.setHeader('vary', 'origin');
  }
  if (body != null) res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body-too-large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function authorized(req) {
  return req.headers['x-dsh-favorites'] === '1';
}

function isJsonRequest(req) {
  const type = String(req.headers['content-type'] || '').toLowerCase();
  return type.indexOf('application/json') >= 0;
}

function queryValue(req, name) {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    return url.searchParams.get(name) || '';
  } catch (err) {
    return '';
  }
}

function describe(item) {
  const tags = Array.isArray(item.tags) && item.tags.length ? ' #' + item.tags.join(' #') : '';
  const scope =
    item.kind === 'file'
      ? '文件'
      : item.kind === 'turn'
        ? '提问+回复'
        : item.kind === 'excerpt'
          ? '摘录'
          : '仅回复';
  const where = item.kind === 'file' ? item.path : item.sessionId + (item.turn ? ' · 第 ' + item.turn + ' 轮' : '');
  const head = '[' + scope + '] ' + (item.title || '（无标题）') + ' — ' + where + tags;
  const body = item.note ? '\n   备注：' + item.note : '';
  const quote = item.quote ? '\n   摘录：' + item.quote.replace(/\s+/g, ' ').slice(0, 160) : '';
  return head + body + quote + '\n   id: ' + item.id;
}

export function apply(ctx) {
  const directory = path.join(profileDirectory(), 'data');
  const file = path.join(directory, FILE_NAME);
  const backupFile = path.join(directory, 'favorites.backup.json');

  let items = null;
  let queue = Promise.resolve();

  async function loadItems() {
    if (items) return items;
    try {
      const raw = await fs.readFile(file, 'utf8');
      const parsed = JSON.parse(raw);
      items = sanitizeList(parsed && parsed.items);
    } catch (err) {
      items = [];
    }
    return items;
  }

  async function storeItems(next) {
    items = sanitizeList(next);
    const snapshot = items;
    await fs.mkdir(directory, { recursive: true });
    try {
      await fs.copyFile(file, backupFile);
    } catch (err) {
      /* no previous document yet */
    }
    const temporary = file + '.' + process.pid + '.tmp';
    await fs.writeFile(temporary, JSON.stringify({ version: 1, items: snapshot }, null, 2), 'utf8');
    await fs.rename(temporary, file);
    return snapshot;
  }

  let cwdCache = null;

  async function sessionCwdMap() {
    if (cwdCache) return cwdCache;
    const map = new Map();
    const query = ctx.get('sessionQuery');
    if (query && typeof query.listSessions === 'function') {
      try {
        const records = await query.listSessions();
        for (const record of records || []) {
          const header = record && record.header;
          if (header && header.id && header.cwd) map.set(header.id, header.cwd);
        }
      } catch (err) {
        /* leave the map empty; every item simply stays unlabelled */
      }
    }
    cwdCache = map;
    return map;
  }

  /* Older bookmarks were written before workspace capture existed. Fill them
     in from each Session's recorded cwd, once, and persist the result. */
  async function backfillWorkspaces(current) {
    const registry = ctx.get('workspaceRegistry');
    if (!registry || typeof registry.resolveByPath !== 'function') return false;
    const pending = current.filter(function (item) {
      return !item.workspaceId && item.sessionId;
    });
    if (!pending.length) return false;
    const map = await sessionCwdMap();
    let changed = false;
    for (const item of pending) {
      const cwd = map.get(item.sessionId);
      if (!cwd) continue;
      let workspace;
      try {
        workspace = await registry.resolveByPath(cwd);
      } catch (err) {
        workspace = undefined;
      }
      if (!workspace) continue;
      item.cwd = cwd;
      item.workspaceId = workspace.id || null;
      item.workspaceTitle = workspace.title || null;
      item.workspacePath = workspace.path || null;
      changed = true;
    }
    return changed;
  }

  function serialize(operation) {
    const next = queue.then(operation, operation);
    queue = next.catch(() => undefined);
    return next;
  }

  async function workspaceFacts(sessionId) {
    const result = { cwd: null, workspaceId: null, workspaceTitle: null, workspacePath: null };
    const sessions = ctx.get('sessions');
    let session;
    try {
      session = sessions && typeof sessions.get === 'function' ? sessions.get(sessionId) : undefined;
    } catch (err) {
      session = undefined;
    }
    const cwd = session && session.header ? session.header.cwd : undefined;
    if (!cwd) return result;
    result.cwd = cwd;
    const registry = ctx.get('workspaceRegistry');
    if (!registry || typeof registry.resolveByPath !== 'function') return result;
    let workspace;
    try {
      workspace = await registry.resolveByPath(cwd);
    } catch (err) {
      workspace = undefined;
    }
    if (workspace) {
      result.workspaceId = workspace.id || null;
      result.workspaceTitle = workspace.title || null;
      result.workspacePath = workspace.path || null;
    }
    return result;
  }

  async function workspaceFactsFromPath(filePath) {
    const result = { cwd: null, workspaceId: null, workspaceTitle: null, workspacePath: null };
    const absolute = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath);
    const directory = path.dirname(absolute);
    result.cwd = directory;
    const registry = ctx.get('workspaceRegistry');
    if (!registry || typeof registry.resolveByPath !== 'function') return result;
    let workspace;
    let candidate = directory;
    for (let depth = 0; depth < 16 && candidate; depth += 1) {
      try {
        workspace = await registry.resolveByPath(candidate);
      } catch (err) {
        workspace = undefined;
      }
      if (workspace) break;
      const parent = path.dirname(candidate);
      if (!parent || parent === candidate) break;
      candidate = parent;
    }
    if (workspace) {
      result.workspaceId = workspace.id || null;
      result.workspaceTitle = workspace.title || null;
      result.workspacePath = workspace.path || null;
    }
    return result;
  }

  const disposeList = ctx.webServer.register({
    kind: 'exact',
    path: BASE + '/list',
    handler: async (req, res) => {
      if (!admit(req, res)) return send(res, 403, { error: 'origin' });
      if (req.method === 'OPTIONS') return send(res, 204, null);
      if (!authorized(req)) return send(res, 403, { error: 'forbidden' });
      if (req.method !== 'GET') return send(res, 405, { error: 'method-not-allowed' });
      try {
        const current = await serialize(loadItems);
        if (await backfillWorkspaces(current)) {
          await serialize(() => storeItems(current));
        }
        return send(res, 200, { items: await serialize(loadItems), source: 'host' });
      } catch (err) {
        return send(res, 500, { error: 'read-failed', message: String(err && err.message ? err.message : err) });
      }
    },
  });

  const disposeRemove = ctx.webServer.register({
    kind: 'exact',
    path: BASE + '/remove',
    handler: async (req, res) => {
      if (!admit(req, res)) return send(res, 403, { error: 'origin' });
      if (req.method === 'OPTIONS') return send(res, 204, null);
      if (!authorized(req)) return send(res, 403, { error: 'forbidden' });
      if (req.method !== 'POST') return send(res, 405, { error: 'method-not-allowed' });
      if (!isJsonRequest(req)) return send(res, 415, { error: 'json-required' });
      try {
        const parsed = JSON.parse((await readBody(req)) || '{}');
        const id = typeof parsed.id === 'string' ? parsed.id : '';
        if (!id) return send(res, 400, { error: 'missing-id' });
        const current = await serialize(loadItems);
        const next = current.filter((item) => item.id !== id);
        const stored = next.length === current.length ? current : await serialize(() => storeItems(next));
        return send(res, 200, { items: stored, source: 'host' });
      } catch (err) {
        return send(res, 400, { error: 'remove-failed', message: String(err && err.message ? err.message : err) });
      }
    },
  });

  const disposeSave = ctx.webServer.register({
    kind: 'exact',
    path: BASE + '/save',
    handler: async (req, res) => {
      if (!admit(req, res)) return send(res, 403, { error: 'origin' });
      if (req.method === 'OPTIONS') return send(res, 204, null);
      if (!authorized(req)) return send(res, 403, { error: 'forbidden' });
      if (req.method !== 'POST') return send(res, 405, { error: 'method-not-allowed' });
      if (!isJsonRequest(req)) return send(res, 415, { error: 'json-required' });
      try {
        const parsed = JSON.parse((await readBody(req)) || '{}');
        const stored = await serialize(() => storeItems(parsed.items));
        return send(res, 200, { items: stored, source: 'host' });
      } catch (err) {
        return send(res, 400, { error: 'save-failed', message: String(err && err.message ? err.message : err) });
      }
    },
  });

  const disposeContext = ctx.webServer.register({
    kind: 'exact',
    path: BASE + '/context',
    handler: async (req, res) => {
      if (!admit(req, res)) return send(res, 403, { error: 'origin' });
      if (req.method === 'OPTIONS') return send(res, 204, null);
      if (!authorized(req)) return send(res, 403, { error: 'forbidden' });
      if (req.method !== 'GET') return send(res, 405, { error: 'method-not-allowed' });
      const sessionId = queryValue(req, 'sessionId');
      const filePath = queryValue(req, 'path');
      if (!sessionId && !filePath) return send(res, 400, { error: 'missing-target' });
      try {
        if (sessionId) return send(res, 200, await workspaceFacts(sessionId));
        const facts = await workspaceFactsFromPath(filePath);
        return send(res, 200, facts);
      } catch (err) {
        return send(res, 200, { cwd: null, workspaceId: null, workspaceTitle: null, workspacePath: null });
      }
    },
  });

  const disposeWorkspaces = ctx.webServer.register({
    kind: 'exact',
    path: BASE + '/workspaces',
    handler: (req, res) => {
      if (!admit(req, res)) return send(res, 403, { error: 'origin' });
      if (req.method === 'OPTIONS') return send(res, 204, null);
      if (!authorized(req)) return send(res, 403, { error: 'forbidden' });
      if (req.method !== 'GET') return send(res, 405, { error: 'method-not-allowed' });
      const registry = ctx.get('workspaceRegistry');
      let workspaces = [];
      try {
        workspaces = registry && typeof registry.list === 'function' ? registry.list() : [];
      } catch (err) {
        workspaces = [];
      }
      return send(res, 200, {
        items: workspaces.map((workspace) => ({
          id: workspace.id,
          title: workspace.title || '',
          path: workspace.path || '',
        })),
      });
    },
  });

  const disposeFile = ctx.webServer.register({
    kind: 'exact',
    path: BASE + '/file',
    handler: async (req, res) => {
      if (!admit(req, res)) return send(res, 403, { error: 'origin' });
      if (req.method === 'OPTIONS') return send(res, 204, null);
      if (!authorized(req)) return send(res, 403, { error: 'forbidden' });
      if (req.method !== 'GET') return send(res, 405, { error: 'method-not-allowed' });
      const id = queryValue(req, 'id');
      const current = await serialize(loadItems);
      const item = current.find((entry) => entry.id === id && entry.kind === 'file');
      if (!item || !item.path) return send(res, 404, { error: 'not-found' });
      try {
        const stat = await fs.stat(item.path);
        if (!stat.isFile()) return send(res, 400, { error: 'not-a-file' });
        if (stat.size > MAX_FILE_BYTES) {
          const handle = await fs.open(item.path, 'r');
          try {
            const buffer = Buffer.alloc(MAX_FILE_BYTES);
            const read = await handle.read(buffer, 0, MAX_FILE_BYTES, 0);
            return send(res, 200, { path: item.path, text: buffer.subarray(0, read.bytesRead).toString('utf8'), truncated: true, bytes: stat.size });
          } finally {
            await handle.close();
          }
        }
        const content = await fs.readFile(item.path, 'utf8');
        return send(res, 200, { path: item.path, text: content, truncated: false, bytes: stat.size });
      } catch (err) {
        return send(res, 400, { error: 'read-failed', message: String(err && err.message ? err.message : err) });
      }
    },
  });

  const disposeExport = ctx.webServer.register({
    kind: 'exact',
    path: BASE + '/export',
    handler: async (req, res) => {
      if (!admit(req, res)) return send(res, 403, { error: 'origin' });
      if (req.method === 'OPTIONS') return send(res, 204, null);
      if (!authorized(req)) return send(res, 403, { error: 'forbidden' });
      if (req.method !== 'GET') return send(res, 405, { error: 'method-not-allowed' });
      try {
        const current = await serialize(() => loadItems());
        return send(res, 200, { version: 1, exportedAt: new Date().toISOString(), items: current });
      } catch (err) {
        return send(res, 500, { error: 'export-failed' });
      }
    },
  });

  const disposeImport = ctx.webServer.register({
    kind: 'exact',
    path: BASE + '/import',
    handler: async (req, res) => {
      if (!admit(req, res)) return send(res, 403, { error: 'origin' });
      if (req.method === 'OPTIONS') return send(res, 204, null);
      if (!authorized(req)) return send(res, 403, { error: 'forbidden' });
      if (req.method !== 'POST') return send(res, 405, { error: 'method-not-allowed' });
      if (!isJsonRequest(req)) return send(res, 415, { error: 'json-required' });
      try {
        const parsed = JSON.parse((await readBody(req)) || '{}');
        const incoming = sanitizeList(parsed.items);
        if (!incoming.length) return send(res, 400, { error: 'empty-import' });
        const current = await serialize(() => loadItems());
        const byId = new Map(current.map((item) => [item.id, item]));
        let added = 0;
        let updated = 0;
        let skipped = 0;
        for (const item of incoming) {
          const existing = byId.get(item.id);
          if (!existing) {
            byId.set(item.id, item);
            added += 1;
            continue;
          }
          const previous = Number(existing.updatedAt) || 0;
          const next = Number(item.updatedAt) || 0;
          if (next > previous) {
            byId.set(item.id, item);
            updated += 1;
          } else {
            skipped += 1;
          }
        }
        if (added || updated) await serialize(() => storeItems(Array.from(byId.values())));
        const stored = await serialize(() => loadItems());
        return send(res, 200, { items: stored, added, updated, skipped });
      } catch (err) {
        return send(res, 400, { error: 'import-failed', message: String(err && err.message ? err.message : err) });
      }
    },
  });
  ctx.effect(() => () => {
    for (const dispose of [disposeList, disposeSave, disposeRemove, disposeContext, disposeWorkspaces, disposeFile, disposeExport, disposeImport]) {
      try {
        dispose();
      } catch (err) {
        /* already removed */
      }
    }
  });

  /* ------------------------------------------------------------- agent tool */

  function summarize(item) {
    return describe(item);
  }

  function findById(current, id) {
    for (const item of current) {
      if (item.id === id) return item;
    }
    return undefined;
  }

  const disposeTool = ctx.tools.register({
    name: 'favorites',
    description:
      'Read and maintain the user\'s favorites: bookmarkable session content (a reply, a whole turn, an excerpt) and files, each with a title, tags and a note. Use it when the user asks to save something for later, to list or search what is already saved, or to remove an entry. Bookmarks never enter the model context of any session.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'add', 'remove'],
          description: 'list existing favorites, add one, or remove one by id.',
        },
        id: { type: 'string', description: 'remove: the bookmark id.' },
        kind: {
          type: 'string',
          enum: ['message', 'turn', 'excerpt', 'file'],
          description: 'add: message = one reply, turn = prompt + reply, excerpt = a passage, file = a file on disk.',
        },
        sessionId: { type: 'string', description: 'add: owning session; defaults to this session.' },
        messageId: { type: 'string', description: 'add (message/turn/excerpt): the anchor message id.' },
        turn: { type: 'number', description: 'add: the turn number, when known.' },
        path: { type: 'string', description: 'add (file): absolute or workspace-relative path.' },
        lineStart: { type: 'number', description: 'add (file): first interesting line.' },
        lineEnd: { type: 'number', description: 'add (file): last interesting line.' },
        title: { type: 'string', description: 'A short label the user will recognize later.' },
        quote: { type: 'string', description: 'The exact text being kept, when it is short.' },
        note: { type: 'string', description: 'Why it is being kept.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Up to 8 short tags.' },
        query: { type: 'string', description: 'list: filter by text in title, quote, note, tags or path.' },
        tag: { type: 'string', description: 'list: filter by one tag.' },
      },
      required: ['action'],
    },
    output: {
      schema: {
        type: 'object',
        properties: { ok: { type: 'boolean' }, text: { type: 'string' } },
        required: ['ok', 'text'],
      },
      render(args, value) {
        const body = value && typeof value.text === 'string' ? value.text : '';
        return [{ type: 'text', text: body || '(no result)' }];
      },
    },
    async execute(args, exec) {
      const input = args && typeof args === 'object' ? args : {};
      const current = await serialize(loadItems);
      const action = input.action;

      if (action === 'list') {
        const query = text(input.query, 200).trim().toLowerCase();
        const tag = text(input.tag, 40).trim();
        const sessionId = text(input.sessionId, 200).trim();
        const matched = current.filter((item) => {
          if (tag && (!item.tags || item.tags.indexOf(tag) < 0)) return false;
          if (sessionId && item.sessionId !== sessionId) return false;
          if (!query) return true;
          const hay = [item.title, item.quote, item.note, item.path, item.sessionId]
            .concat(item.tags || [])
            .join('\n')
            .toLowerCase();
          return hay.indexOf(query) >= 0;
        });
        if (!matched.length) return { ok: true, text: 'No favorites match.' };
        const textOut = matched.map((item, index) => index + 1 + '. ' + summarize(item)).join('\n\n');
        return { ok: true, text: textOut + '\n\nTotal: ' + matched.length };
      }

      if (action === 'remove') {
        const id = text(input.id, 64);
        if (!id) return { ok: false, text: 'remove needs id.' };
        if (!findById(current, id)) return { ok: false, text: 'No favorite with id ' + id + '.' };
        await serialize(() => storeItems(current.filter((item) => item.id !== id)));
        return { ok: true, text: 'Removed ' + id + '.' };
      }

      if (action === 'add') {
        const kind = KINDS.indexOf(input.kind) >= 0 ? input.kind : 'message';
        const agentSession = exec && exec.agent ? exec.agent.id : '';
        const sessionId = text(input.sessionId, 200) || agentSession;
        const owner = sessionId || '';
        if (kind !== 'file' && !owner) return { ok: false, text: 'add needs sessionId (no agent session is available here).' };
        const facts = kind === 'file' ? null : await workspaceFacts(owner);
        const now = Date.now();
        const candidate = sanitizeItem({
          id: 'f_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
          kind: kind,
          sessionId: owner,
          messageId: input.messageId,
          turn: input.turn,
          path: input.path,
          lineStart: input.lineStart,
          lineEnd: input.lineEnd,
          title: text(input.title, 200) || text(input.quote, 80) || (kind === 'file' ? path.basename(text(input.path, 1000)) : ''),
          quote: input.quote,
          note: input.note,
          tags: input.tags,
          workspaceId: facts ? facts.workspaceId : null,
          workspaceTitle: facts ? facts.workspaceTitle : null,
          workspacePath: facts ? facts.workspacePath : null,
          cwd: facts ? facts.cwd : null,
          createdAt: now,
          updatedAt: now,
        });
        if (!candidate) return { ok: false, text: 'The bookmark is missing required fields (kind, session, path).' };
        await serialize(() => storeItems([candidate].concat(current)));
        return { ok: true, text: 'Saved.\n' + summarize(candidate) };
      }

      return { ok: false, text: 'Unknown action ' + String(action) + '.' };
    },
  });

  ctx.effect(() => () => {
    try {
      disposeTool();
    } catch (err) {
      /* already removed */
    }
  });
}