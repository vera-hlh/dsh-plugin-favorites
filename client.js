/**
 * Client half of the Favorites bundle.
 *
 * Surfaces:
 *  - `conversation.chat.assistant-actions`  a bookmark toggle on every assistant
 *    message (three states: plain, saved as part of a turn, saved);
 *  - `shell.overlay`                        the selection pill, the editor dialog,
 *    the jump highlight, and toasts;
 *  - `sidebar.panellist` + `main`           the cross-Session favorites panel.
 *
 * Bookmarks are this browser's own data: they never enter the Session log, the
 * model context, or the provider cache. Quoting uses the public Session binding
 * (`ctx.sessions.binding(...).eventSource`), so nothing here reads another
 * plugin's DOM.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-favorites',
  factory(require) {
    'use strict';

    const React = require('react');
    const h = React.createElement;
    const useState = React.useState;
    const useEffect = React.useEffect;
    const useMemo = React.useMemo;
    const useRef = React.useRef;
    const Fragment = React.Fragment;

    const STORE_KEY = 'dsh-plugin-favorites/v1';
    const PANEL_KEY = 'favorites';
    const MAX_QUOTE = 2000;
    const MAX_NOTE = 2000;
    const MAX_TITLE = 80;
    const MAX_TAGS = 8;
    const MAX_TAG_LEN = 24;
    const REVEAL_MS = 60000;
    const TOAST_MS = 4200;

    /* ------------------------------------------------------------------ i18n */

    const DICTS = {
      zh: {
        'panel.title': '收藏夹',
        'panel.subtitle': '共 {n} 条收藏 · {t} 个标签',
        'panel.search': '搜索标题、摘录、备注、标签',
        'panel.filter.all': '全部',
        'panel.kind.message': '消息',
        'panel.kind.turn': '回合',
        'panel.kind.excerpt': '摘录',
        'panel.empty.title': '还没有收藏',
        'panel.empty.body': '在回复下方的操作条里点书签收藏这条回复或整个回合；在正文里选中一段文字，也可以只把选中的片段存下来。',
        'panel.empty.filtered': '没有符合条件的收藏。',
        'panel.action.open': '打开',
        'panel.action.edit': '编辑',
        'panel.action.delete': '删除',
        'panel.action.confirm': '确认删除',
        'panel.tag.clear': '清除标签筛选',
        'panel.footer': '收藏保存在这台机器的 DSH 配置目录，不会进入会话日志或模型上下文。',
        'panel.footer.local': '收藏暂时只保存在本机浏览器；应用重启后会自动迁到主机存储。',
        'meta.turn': '第 {n} 轮',
        'meta.turnUnknown': '回合',
        'meta.message': '消息',
        'meta.justNow': '刚刚',
        'meta.minutesAgo': '{n} 分钟前',
        'meta.hoursAgo': '{n} 小时前',
        'meta.daysAgo': '{n} 天前',
        'editor.addTitle': '加入收藏',
        'editor.editTitle': '编辑收藏',
        'editor.field.title': '标题',
        'editor.field.titlePlaceholder': '给这条收藏起个名字',
        'editor.field.tags': '标签',
        'editor.field.tagsPlaceholder': '用逗号分隔，例如：架构, 待办',
        'editor.field.note': '备注',
        'editor.field.notePlaceholder': '记录为什么要留着它',
        'editor.scope': '范围',
        'editor.scope.message': '仅回复',
        'editor.scope.turn': '提问+回复',
        'editor.scope.excerpt': '选中文字',
        'editor.scope.file': '文件',
        'editor.save': '保存',
        'editor.cancel': '取消',
        'editor.delete': '删除收藏',
        'editor.quote': '摘录',
        'editor.hint': '收藏保存在本机的 DSH 配置目录，不会进入模型上下文。',
        'action.add': '收藏',
        'action.edit': '已收藏，点击编辑',
        'action.turn': '本轮已有收藏',
        'pill.label': '加入收藏',
        'pill.title': '把选中的这段文字加入收藏夹',
        'turn.save': '收藏本回合',
        'turn.saved': '本回合已收藏，点击编辑',
        'toast.opened': '已打开会话；若没有跳转，该内容可能还没有加载到当前窗口。',
        'toast.saved': '已保存收藏。',
        'toast.removed': '已删除收藏。',
        'toast.copyFailed': '复制失败。',
        'panel.kind.file': '文件',
        'panel.addFile': '收藏文件',
      'panel.groupCount': '{n} 条',
      'panel.export': '导出',
      'panel.import': '导入',
      'toast.exported': '已导出收藏文件。',
      'toast.exportFailed': '导出失败：宿主接口不可用。',
      'toast.imported': '导入完成：新增 {added} 条，更新 {updated} 条。',
      'toast.importFailed': '导入失败：文件格式不对或宿主接口不可用。',
        'panel.group.none': '未标注工作区',
        'panel.filter.session': '只看本会话',
        'panel.filter.cancel': '取消筛选',
        'panel.file.lines': '第 {a}-{b} 行',
        'panel.file.line': '第 {a} 行',
        'panel.action.preview': '预览',
        'panel.action.copyPath': '复制路径',
        'panel.action.copied': '已复制',
        'meta.session': '会话',
        'list.titleTurn': '本轮收藏（{n}）',
        'list.titleMessage': '这条消息的收藏（{n}）',
        'list.add': '再收藏一条',
        'list.empty': '这里还没有收藏。',
        'file.titleNew': '收藏一个文件',
        'file.titleEdit': '编辑文件收藏',
        'file.field.path': '文件路径',
        'file.field.pathPlaceholder': '绝对路径，或相对工作区的路径',
        'file.field.lines': '行范围（可选）',
        'file.field.from': '从',
        'file.field.to': '到',
        'file.save': '收藏',
        'preview.loading': '读取中…',
        'preview.failed': '读不到这个文件，可能已被移动或删除。',
        'preview.truncated': '文件较大，只显示前 256 KB。',
        'preview.close': '关闭',
        'preview.copyAll': '复制内容',
        'header.chipTitle': '本会话有 {n} 条收藏，点击查看',
        'menu.saveFile': '收藏文件',
      },
      en: {
        'panel.title': 'Favorites',
        'panel.subtitle': '{n} items · {t} tags',
        'panel.search': 'Search titles, excerpts, notes, tags',
        'panel.filter.all': 'All',
        'panel.kind.message': 'Message',
        'panel.kind.turn': 'Turn',
        'panel.kind.excerpt': 'Excerpt',
        'panel.empty.title': 'Nothing saved yet',
        'panel.empty.body': 'Use the bookmark in a reply action row to keep that reply or the whole turn, or select text in the transcript to keep just that passage.',
        'panel.empty.filtered': 'No favorites match these filters.',
        'panel.action.open': 'Open',
        'panel.action.edit': 'Edit',
        'panel.action.delete': 'Delete',
        'panel.action.confirm': 'Confirm',
        'panel.tag.clear': 'Clear tag filter',
        'panel.footer': 'Favorites live in this machine’s DSH profile and never enter the session log or the model context.',
        'panel.footer.local': 'Favorites are only in this browser for now; they move to host storage after the app restarts.',
        'meta.turn': 'Turn {n}',
        'meta.turnUnknown': 'Turn',
        'meta.message': 'Message',
        'meta.justNow': 'just now',
        'meta.minutesAgo': '{n} min ago',
        'meta.hoursAgo': '{n} h ago',
        'meta.daysAgo': '{n} d ago',
        'editor.addTitle': 'Add to favorites',
        'editor.editTitle': 'Edit favorite',
        'editor.field.title': 'Title',
        'editor.field.titlePlaceholder': 'Name this favorite',
        'editor.field.tags': 'Tags',
        'editor.field.tagsPlaceholder': 'Comma separated, e.g. architecture, todo',
        'editor.field.note': 'Note',
        'editor.field.notePlaceholder': 'Why keep this one?',
        'editor.scope': 'Scope',
        'editor.scope.message': 'Reply only',
        'editor.scope.turn': 'Prompt + reply',
        'editor.scope.excerpt': 'Selected text',
        'editor.scope.file': 'File',
        'editor.save': 'Save',
        'editor.cancel': 'Cancel',
        'editor.delete': 'Delete',
        'editor.quote': 'Excerpt',
        'editor.hint': 'Favorites live in this machine’s DSH profile and never enter the model context.',
        'action.add': 'Save to favorites',
        'action.edit': 'Saved to favorites, click to edit',
        'action.turn': 'This turn has saved items',
        'pill.label': 'Add to favorites',
        'pill.title': 'Add the selected text to favorites',
        'turn.save': 'Save this turn',
        'turn.saved': 'Turn saved, click to edit',
        'toast.opened': 'Session opened. If nothing jumped, that item may not be loaded in the current window yet.',
        'toast.saved': 'Favorite saved.',
        'toast.removed': 'Favorite deleted.',
        'toast.copyFailed': 'Could not copy.',
        'panel.kind.file': 'File',
        'panel.addFile': 'Save a file',
      'panel.groupCount': '{n}',
      'panel.export': 'Export',
      'panel.import': 'Import',
      'toast.exported': 'Favorites exported.',
      'toast.exportFailed': 'Export failed: the host route is unavailable.',
      'toast.imported': 'Imported: {added} added, {updated} updated.',
      'toast.importFailed': 'Import failed: unexpected file or the host route is unavailable.',
        'panel.group.none': 'No workspace recorded',
        'panel.filter.session': 'This session only',
        'panel.filter.cancel': 'Clear filter',
        'panel.file.lines': 'lines {a}-{b}',
        'panel.file.line': 'line {a}',
        'panel.action.preview': 'Preview',
        'panel.action.copyPath': 'Copy path',
        'panel.action.copied': 'Copied',
        'meta.session': 'Session',
        'list.titleTurn': 'Favorites in this turn ({n})',
        'list.titleMessage': 'Favorites on this message ({n})',
        'list.add': 'Save another',
        'list.empty': 'Nothing saved here yet.',
        'file.titleNew': 'Save a file',
        'file.titleEdit': 'Edit file favorite',
        'file.field.path': 'File path',
        'file.field.pathPlaceholder': 'Absolute, or relative to the workspace',
        'file.field.lines': 'Line range (optional)',
        'file.field.from': 'From',
        'file.field.to': 'To',
        'file.save': 'Save',
        'preview.loading': 'Reading…',
        'preview.failed': 'Could not read this file; it may have moved or been deleted.',
        'preview.truncated': 'Large file: only the first 256 KB is shown.',
        'preview.close': 'Close',
        'preview.copyAll': 'Copy content',
        'header.chipTitle': 'This session has {n} favorites, click to view',
        'menu.saveFile': 'Save to favorites',
      },
    };

    let dict = DICTS.en;

    function t(key, vars) {
      const table = dict[key] != null ? dict : DICTS.en;
      const text = table[key] != null ? table[key] : key;
      if (!vars) return text;
      return text.replace(/\{(\w+)\}/g, function (match, name) {
        return vars[name] == null ? match : String(vars[name]);
      });
    }

    function pickDict(localeId) {
      const id = String(localeId || '').toLowerCase();
      if (id.indexOf('zh') === 0) return DICTS.zh;
      return DICTS.en;
    }

    /* ----------------------------------------------------------------- utils */

    function cx() {
      const out = [];
      for (let i = 0; i < arguments.length; i += 1) {
        if (arguments[i]) out.push(arguments[i]);
      }
      return out.join(' ');
    }

    function nowMs() {
      return Date.now();
    }

    function uid() {
      return 'f_' + nowMs().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    function clampText(value, max) {
      const text = typeof value === 'string' ? value.trim() : '';
      if (!text) return '';
      return text.length > max ? text.slice(0, max) + '…' : text;
    }

    function firstLine(text) {
      const lines = String(text || '').split('\n');
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (line) return line;
      }
      return '';
    }

    function normalizeTags(input) {
      const list = Array.isArray(input) ? input : String(input == null ? '' : input).split(/[,，;；\s]+/);
      const out = [];
      for (let i = 0; i < list.length; i += 1) {
        const tag = String(list[i] == null ? '' : list[i]).trim().replace(/^#/, '');
        if (!tag || tag.length > MAX_TAG_LEN) continue;
        if (out.indexOf(tag) >= 0) continue;
        out.push(tag);
        if (out.length >= MAX_TAGS) break;
      }
      return out;
    }

    function turnLabel(item) {
      return typeof item.turn === 'number' && item.turn > 0 ? t('meta.turn', { n: item.turn }) : t('meta.turnUnknown');
    }

    function kindLabel(item) {
      if (item.kind === 'turn') return t('panel.kind.turn');
      if (item.kind === 'excerpt') return t('panel.kind.excerpt');
      if (item.kind === 'file') return t('panel.kind.file');
      return t('panel.kind.message');
    }

    function defaultTitle(kind, turn, quote) {
      if (kind === 'turn' && typeof turn === 'number' && turn > 0) return t('meta.turn', { n: turn });
      const line = clampText(firstLine(quote), 40);
      if (line) return line;
      if (typeof turn === 'number' && turn > 0) return t('meta.turn', { n: turn });
      if (kind === 'turn') return t('meta.turnUnknown');
      if (kind === 'excerpt') return t('panel.kind.excerpt');
      return t('meta.message');
    }

    function relativeTime(ts) {
      if (!ts) return '';
      const diff = nowMs() - ts;
      if (diff < 0) return t('meta.justNow');
      if (diff < 60 * 1000) return t('meta.justNow');
      if (diff < 60 * 60 * 1000) return t('meta.minutesAgo', { n: Math.floor(diff / (60 * 1000)) });
      if (diff < 24 * 60 * 60 * 1000) return t('meta.hoursAgo', { n: Math.floor(diff / (60 * 60 * 1000)) });
      if (diff < 7 * 24 * 60 * 60 * 1000) return t('meta.daysAgo', { n: Math.floor(diff / (24 * 60 * 60 * 1000)) });
      try {
        return new Date(ts).toLocaleDateString();
      } catch (err) {
        return '';
      }
    }

    function shortSession(id) {
      const text = String(id || '');
      if (text.length <= 24) return text;
      return text.slice(0, 21) + '…';
    }

    function isValidItem(item) {
      if (!item || typeof item !== 'object') return false;
      if (typeof item.id !== 'string' || !item.id) return false;
      if (item.kind !== 'message' && item.kind !== 'turn' && item.kind !== 'excerpt' && item.kind !== 'file') return false;
      if (item.kind !== 'file' && (typeof item.sessionId !== 'string' || !item.sessionId)) return false;
      if (item.kind === 'file' && (typeof item.path !== 'string' || !item.path) && (typeof item.messageId !== 'string' || !item.messageId)) {
        return false;
      }
      return true;
    }

    function itemsForAnchor(items, sessionId, messageId, turn) {
      const out = [];
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.sessionId !== sessionId) continue;
        if (item.kind === 'turn') {
          if (typeof turn === 'number' && item.turn === turn) out.push(item);
          else if (item.messageId && item.messageId === messageId) out.push(item);
          continue;
        }
        if (item.messageId && item.messageId === messageId) out.push(item);
      }
      return out;
    }

    function lineSpan(item) {
      if (typeof item.lineStart !== 'number') return '';
      if (typeof item.lineEnd === 'number' && item.lineEnd !== item.lineStart) {
        return t('panel.file.lines', { a: item.lineStart, b: item.lineEnd });
      }
      return t('panel.file.line', { a: item.lineStart });
    }

    function clip(text, max) {
      const value = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
      return value.length > max ? value.slice(0, max) + '…' : value;
    }

    /* ----------------------------------------------------------------- store */

    let clientCtx = null;

    const HOST_BASE = '/plugin-favorites';

    /* The Host keeps the durable copy; this browser keeps a mirror so the
       feature still works while that route is unavailable. */
    async function hostJson(pathName, body) {
      const headers = { 'x-dsh-favorites': '1' };
      const init = { method: body ? 'POST' : 'GET', headers: headers, credentials: 'same-origin' };
      if (body) {
        headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      const response = await fetch(HOST_BASE + pathName, init);
      const type = response.headers.get('content-type') || '';
      if (!response.ok || type.indexOf('application/json') < 0) {
        throw new Error('favorites-host-unavailable');
      }
      return await response.json();
    }

    async function hostCall(pathName, body) {
      const data = await hostJson(pathName, body);
      if (!data || !Array.isArray(data.items)) {
        throw new Error('favorites-host-invalid');
      }
      return data;
    }

    function createStore() {
      let state = {
        items: [],
        editor: null,
        panelModal: null,
        pill: null,
        reveal: null,
        toast: null,
        focus: null,
        sessionFilter: null,
        workspaceFilter: null,
        workspaces: [],
        ready: false,
        source: 'local',
      };
      const listeners = new Set();
      const turnIndex = new Map();
      const sessionContexts = new Map();
      let revealTimer = 0;
      let revealToastTimer = 0;
      let revealHandled = false;
      let toastTimer = 0;

      function setState(patch) {
        const next = Object.assign({}, state, patch);
        state = next;
        const snapshot = Array.from(listeners);
        for (let i = 0; i < snapshot.length; i += 1) {
          try {
            snapshot[i]();
          } catch (err) {
            /* a listener must never break the store */
          }
        }
      }

      function subscribe(listener) {
        listeners.add(listener);
        return function () {
          listeners.delete(listener);
        };
      }

      function writeMirror() {
        try {
          window.localStorage.setItem(STORE_KEY, JSON.stringify({ version: 1, items: state.items }));
        } catch (err) {
          /* private mode or a full quota: the in-memory list still works */
        }
      }

      function load() {
        let items = [];
        try {
          const raw = window.localStorage.getItem(STORE_KEY);
          const parsed = raw ? JSON.parse(raw) : null;
          if (parsed && Array.isArray(parsed.items)) items = parsed.items.filter(isValidItem);
        } catch (err) {
          items = [];
        }
        state = Object.assign({}, state, {
          items: items,
          editor: null,
          panelModal: null,
          reveal: null,
          toast: null,
          pill: null,
          ready: true,
          source: 'local',
        });
        void refreshFromHost();
        void refreshWorkspaces();
      }

      async function factsFor(sessionId) {
        if (!sessionId) return null;
        if (sessionContexts.has(sessionId)) return sessionContexts.get(sessionId);
        let facts = null;
        try {
          const data = await hostJson('/context?sessionId=' + encodeURIComponent(sessionId));
          if (data && typeof data === 'object') facts = data;
        } catch (err) {
          facts = null;
        }
        const value = facts || { cwd: null, workspaceId: null, workspaceTitle: null, workspacePath: null };
        sessionContexts.set(sessionId, value);
        return value;
      }

      async function refreshWorkspaces() {
        try {
          const data = await hostJson('/workspaces');
          if (data && Array.isArray(data.items)) setState({ workspaces: data.items });
        } catch (err) {
          /* keep whatever we already have */
        }
      }

      async function factsForPath(filePath) {
        if (!filePath) return null;
        try {
          const data = await hostJson('/context?path=' + encodeURIComponent(filePath));
          return data && typeof data === 'object' ? data : null;
        } catch (err) {
          return null;
        }
      }

      function patchWorkspace(id, facts) {
        if (!facts) return;
        const items = state.items.map(function (item) {
          if (item.id !== id) return item;
          return Object.assign({}, item, {
            workspaceId: facts.workspaceId || item.workspaceId || null,
            workspaceTitle: facts.workspaceTitle || item.workspaceTitle || null,
            workspacePath: facts.workspacePath || item.workspacePath || null,
            cwd: facts.cwd || item.cwd || null,
          });
        });
        commit(items);
      }

      async function refreshFromHost() {
        let payload;
        try {
          payload = await hostCall('/list');
        } catch (err) {
          return;
        }
        const hostItems = payload.items.filter(isValidItem);
        const merged = mergeLists(hostItems, state.items);
        setState({ items: merged, source: 'host' });
        writeMirror();
        if (merged.length !== hostItems.length) void pushToHost(merged);
      }

      async function pushToHost(items) {
        let payload;
        try {
          payload = await hostCall('/save', { items: items });
        } catch (err) {
          return;
        }
        setState({ items: payload.items.filter(isValidItem), source: 'host' });
        writeMirror();
      }

      function commit(items) {
        setState({ items: items, editor: null, panelModal: null });
        writeMirror();
        void pushToHost(items);
      }

      function mergeLists(primary, secondary) {
        const byId = new Map();
        for (let i = 0; i < primary.length; i += 1) byId.set(primary[i].id, primary[i]);
        for (let i = 0; i < secondary.length; i += 1) {
          const item = secondary[i];
          const existing = byId.get(item.id);
          if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) byId.set(item.id, item);
        }
        return Array.from(byId.values()).sort(function (a, b) {
          return (b.updatedAt || 0) - (a.updatedAt || 0);
        });
      }

      function getSnapshot() {
        return state;
      }

      function upsert(item) {
        const items = state.items.slice();
        let replaced = false;
        for (let i = 0; i < items.length; i += 1) {
          if (items[i].id === item.id) {
            items[i] = item;
            replaced = true;
            break;
          }
        }
        if (!replaced) items.unshift(item);
        commit(items);
      }

      function remove(id) {
        const items = state.items.filter(function (item) {
          return item.id !== id;
        });
        commit(items);
        showToast(t('toast.removed'));
      }

      function openEditor(draft) {
        setState({ editor: draft, panelModal: null });
      }

      function closeEditor() {
        setState({ editor: null });
      }

      function openPanelModal(modal) {
        setState({ panelModal: modal, editor: null });
      }

      function closePanelModal() {
        setState({ panelModal: null });
      }

      function openList(payload) {
        openPanelModal({
          kind: 'list',
          sessionId: payload.sessionId,
          messageId: payload.messageId || null,
          turn: typeof payload.turn === 'number' ? payload.turn : null,
        });
      }

      function openFileForm(options) {
        const value = options || null;
        const isItem = !!(value && typeof value.id === 'string');
        openPanelModal({ kind: 'fileForm', item: isItem ? value : null, seed: isItem ? null : value });
      }

      function openPreview(item) {
        openPanelModal({ kind: 'preview', item: item });
      }

      function focusItem(id) {
        setState({ focus: { id: id, nonce: uid() }, editor: null, panelModal: null });
      }

      function setSessionFilter(sessionId) {
        setState({ sessionFilter: sessionId || null, workspaceFilter: null });
      }

      function setWorkspaceFilter(workspaceId) {
        setState({ workspaceFilter: workspaceId || null });
      }

      function clearFilters() {
        setState({ sessionFilter: null, workspaceFilter: null });
      }


      function hideToast() {
        if (toastTimer) {
          clearTimeout(toastTimer);
          toastTimer = 0;
        }
        if (state.toast) setState({ toast: null });
      }

      /* sticky: keep it until hideToast() (used while history is paging). */
      function showToast(message, sticky) {
        if (toastTimer) {
          clearTimeout(toastTimer);
          toastTimer = 0;
        }
        setState({ toast: message });
        if (sticky) return;
        toastTimer = setTimeout(function () {
          toastTimer = 0;
          setState({ toast: null });
        }, TOAST_MS);
      }

      function requestReveal(target) {
        if (revealTimer) {
          clearTimeout(revealTimer);
          revealTimer = 0;
        }
        if (revealToastTimer) {
          clearTimeout(revealToastTimer);
          revealToastTimer = 0;
        }
        const reveal = {
          nonce: uid(),
          sessionId: target.sessionId,
          messageId: target.messageId || null,
          seq: typeof target.seq === 'number' ? target.seq : null,
          turn: typeof target.turn === 'number' ? target.turn : null,
          kind: typeof target.kind === 'string' ? target.kind : '',
          prompt: typeof target.prompt === 'string' ? target.prompt : '',
          quote: typeof target.quote === 'string' ? target.quote : '',
        };
        revealHandled = false;
        setState({ reveal: reveal });
        /* Keep the request alive so a re-mounted anchor can re-align after a
           re-render; warn early when nothing matched at all. */
        revealToastTimer = setTimeout(function () {
          revealToastTimer = 0;
          if (pagingBusy) return;
          if (!revealHandled && state.reveal && state.reveal.nonce === reveal.nonce) showToast(t('toast.opened'));
        }, 2500);
        revealTimer = setTimeout(function () {
          revealTimer = 0;
          if (state.reveal && state.reveal.nonce === reveal.nonce) setState({ reveal: null });
        }, REVEAL_MS);
      }

      function markRevealHandled(nonce) {
        if (state.reveal && state.reveal.nonce === nonce) revealHandled = true;
      }

      function consumeReveal(nonce) {
        if (!state.reveal || state.reveal.nonce !== nonce) return;
        if (revealTimer) {
          clearTimeout(revealTimer);
          revealTimer = 0;
        }
        setState({ reveal: null });
      }

      /* ---- reading the transcript through the public Session binding ---- */

      function windowSnapshotFor(sessionId) {
        if (!clientCtx || typeof clientCtx.get !== 'function') return null;
        const sessions = clientCtx.get('sessions');
        if (!sessions || typeof sessions.binding !== 'function') return null;
        let binding;
        try {
          binding = sessions.binding(sessionId);
        } catch (err) {
          return null;
        }
        if (!binding || !binding.eventSource || typeof binding.eventSource.getSnapshot !== 'function') return null;
        try {
          return binding.eventSource.getSnapshot() || null;
        } catch (err) {
          return null;
        }
      }

      function windowEntries(sessionId) {
        const snapshot = windowSnapshotFor(sessionId);
        return snapshot && Array.isArray(snapshot.entries) ? snapshot.entries : [];
      }

      function eventOf(entry) {
        return entry && entry.type === 'event' && entry.event ? entry.event : null;
      }

      function messageOf(event) {
        const data = event && event.data;
        if (!data || typeof data !== 'object') return null;
        if (data.message && typeof data.message === 'object') return data.message;
        if (typeof data.id === 'string' && Array.isArray(data.content)) return data;
        return null;
      }

      function textOf(message) {
        if (!message || !Array.isArray(message.content)) return '';
        const parts = [];
        for (let i = 0; i < message.content.length; i += 1) {
          const block = message.content[i];
          if (block && block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
            parts.push(block.text.trim());
          }
        }
        return parts.join('\n');
      }

      function captureMessage(sessionId, messageId) {
        const entries = windowEntries(sessionId);
        for (let i = 0; i < entries.length; i += 1) {
          const event = eventOf(entries[i]);
          const message = messageOf(event);
          if (!message || message.id !== messageId) continue;
          const turn = event && event.data && typeof event.data.turn === 'number' ? event.data.turn : undefined;
          const seq = event && typeof event.seq === 'number' ? event.seq : undefined;
          return { turn: turn, seq: seq, quote: clampText(textOf(message), MAX_QUOTE) };
        }
        return { turn: undefined, seq: undefined, quote: '' };
      }

      function turnForMessage(sessionId, messageId) {
        if (!messageId) return null;
        const snapshot = windowSnapshotFor(sessionId);
        if (!snapshot) return null;
        const revision = typeof snapshot.revision === 'number' ? snapshot.revision : null;
        let cache = turnIndex.get(sessionId);
        if (!cache || revision === null || cache.revision !== revision) {
          const byMessage = new Map();
          const entries = Array.isArray(snapshot.entries) ? snapshot.entries : [];
          for (let i = 0; i < entries.length; i += 1) {
            const event = eventOf(entries[i]);
            const message = messageOf(event);
            if (!message || typeof message.id !== 'string') continue;
            const turn = event.data && typeof event.data.turn === 'number' ? event.data.turn : null;
            if (turn !== null) byMessage.set(message.id, turn);
          }
          cache = { revision: revision, byMessage: byMessage };
          if (revision !== null) turnIndex.set(sessionId, cache);
        }
        const found = cache.byMessage.get(messageId);
        return typeof found === 'number' ? found : null;
      }

      function turnRecord(sessionId, turn) {
        const entries = windowEntries(sessionId);
        let startSeq = null;
        let endSeq = null;
        for (let i = 0; i < entries.length; i += 1) {
          const event = eventOf(entries[i]);
          if (!event || !event.data || typeof event.seq !== 'number') continue;
          if (event.type === 'turn/start' && event.data.turn === turn) startSeq = event.seq;
          if (event.type === 'turn/end' && event.data.turn === turn) endSeq = event.seq;
        }
        const parts = [];
        const replies = [];
        let promptText = '';
        /* user/message events carry no `turn` field, so a turn is the sequence
           window between its turn/start and turn/end. */
        for (let i = 0; i < entries.length; i += 1) {
          const event = eventOf(entries[i]);
          if (!event || typeof event.seq !== 'number') continue;
          if (startSeq === null && endSeq === null) continue;
          if (startSeq !== null && event.seq < startSeq) continue;
          if (endSeq !== null && event.seq > endSeq) continue;
          if (event.type !== 'user/message' && event.type !== 'assistant/message') continue;
          const message = messageOf(event);
          if (!message) continue;
          const text = textOf(message);
          if (text) {
            parts.push(text);
            if (event.type === 'assistant/message') replies.push(text);
          }
          if (!promptText && event.type === 'user/message' && text) promptText = clampText(text, 160);
        }
        return {
          seq: endSeq,
          quote: clampText(parts.join('\n'), MAX_QUOTE),
          replyQuote: clampText(replies.join('\n'), MAX_QUOTE),
          promptText: promptText,
        };
      }

      function buildVariants(sessionId, messageId) {
        const captured = captureMessage(sessionId, messageId);
        const turn = typeof captured.turn === 'number' ? captured.turn : turnForMessage(sessionId, messageId);
        const whole = typeof turn === 'number' ? turnRecord(sessionId, turn) : { seq: null, quote: '', promptText: '' };
        const anchorSeq = typeof captured.seq === 'number' ? captured.seq : whole.seq;
        return {
          turn: typeof turn === 'number' ? turn : null,
          seq: anchorSeq,
          promptText: whole.promptText || '',
          variants: {
            message: {
              quote: whole.replyQuote || captured.quote,
              title: defaultTitle('message', turn, whole.replyQuote || captured.quote),
            },
            turn: { quote: whole.quote, title: defaultTitle('turn', turn, whole.quote) },
          },
        };
      }

      function newItem(kind, sessionId, messageId, built, quote, title, facts) {
        const now = nowMs();
        return {
          id: uid(),
          kind: kind,
          sessionId: sessionId,
          messageId: messageId || null,
          seq: typeof built.seq === 'number' ? built.seq : null,
          turn: built.turn,
          quote: quote,
          prompt: built.promptText || null,
          title: title,
          note: '',
          tags: [],
          workspaceId: facts ? facts.workspaceId : null,
          workspaceTitle: facts ? facts.workspaceTitle : null,
          workspacePath: facts ? facts.workspacePath : null,
          cwd: facts ? facts.cwd : null,
          createdAt: now,
          updatedAt: now,
        };
      }

      function openMessageEditor(sessionId, messageId, options) {
        const existing = findMessageItem(state.items, sessionId, messageId);
        if (existing && !(options && options.forceNew)) {
          const variants = {};
          variants[existing.kind] = { quote: existing.quote, title: existing.title };
          openEditor({
            mode: 'edit',
            scope: existing.kind,
            item: existing,
            variants: variants,
            turn: existing.turn,
            seq: existing.seq,
          });
          return;
        }
        const built = buildVariants(sessionId, messageId);
        const variant = built.variants.message;
        const item = newItem('message', sessionId, messageId, built, variant.quote, variant.title, null);
        openEditor({ mode: 'create', scope: 'message', item: item, variants: built.variants, turn: built.turn, seq: built.seq, promptText: built.promptText });
        void factsFor(sessionId).then(function (facts) {
          if (facts) setState({ editor: state.editor && state.editor.item && state.editor.item.id === item.id ? withFacts(state.editor, facts) : state.editor });
        });
      }

      function withFacts(draft, facts) {
        const item = Object.assign({}, draft.item, {
          workspaceId: facts.workspaceId,
          workspaceTitle: facts.workspaceTitle,
          workspacePath: facts.workspacePath,
          cwd: facts.cwd,
        });
        return Object.assign({}, draft, { item: item });
      }

      function openExcerptDraft(payload) {
        if (!payload || !payload.sessionId || !payload.messageId) return;
        const text = clampText(payload.text, MAX_QUOTE);
        if (!text) return;
        const built = buildVariants(payload.sessionId, payload.messageId);
        built.variants.excerpt = { quote: text, title: defaultTitle('excerpt', built.turn, text) };
        built.variants.file = { quote: text, title: defaultTitle('file', built.turn, text) };
        const item = newItem('excerpt', payload.sessionId, payload.messageId, built, text, built.variants.excerpt.title, null);
        openEditor({ mode: 'create', scope: 'excerpt', item: item, variants: built.variants, turn: built.turn, seq: built.seq, promptText: built.promptText });
        void factsFor(payload.sessionId).then(function (facts) {
          if (facts) {
            setState({ editor: state.editor && state.editor.item && state.editor.item.id === item.id ? withFacts(state.editor, facts) : state.editor });
          }
        });
      }

      function setPill(pill) {
        const current = state.pill;
        if (
          current &&
          pill &&
          current.text === pill.text &&
          current.messageId === pill.messageId &&
          current.left === pill.left &&
          current.top === pill.top
        ) {
          return;
        }
        setState({ pill: pill });
      }

      function clearPill() {
        if (state.pill) setState({ pill: null });
      }

      async function exportFavorites() {
        try {
          const data = await hostJson('/export');
          if (!data || !Array.isArray(data.items)) throw new Error('export-empty');
          const payload = JSON.stringify({ version: 1, exportedAt: data.exportedAt || new Date().toISOString(), items: data.items }, null, 2);
          const blob = new Blob([payload], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'dsh-favorites-' + new Date().toISOString().slice(0, 10) + '.json';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(function () {
            URL.revokeObjectURL(url);
          }, 2000);
          showToast(t('toast.exported'));
          return true;
        } catch (err) {
          showToast(t('toast.exportFailed'));
          return false;
        }
      }

      async function importFavorites(file) {
        try {
          const text = await file.text();
          const parsed = JSON.parse(text);
          const incoming = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.items) ? parsed.items : [];
          if (!incoming.length) throw new Error('empty');
          const data = await hostCall('/import', { items: incoming });
          setState({ items: data.items });
          showToast(t('toast.imported', { added: data.added || 0, updated: data.updated || 0 }));
          return true;
        } catch (err) {
          showToast(t('toast.importFailed'));
          return false;
        }
      }

      function setHighlightRects(rects) {
        const next = Array.isArray(rects) ? rects : [];
        const current = state.highlight && state.highlight.rects ? state.highlight.rects : [];
        if (current.length === next.length && JSON.stringify(current) === JSON.stringify(next)) return;
        setState({ highlight: { rects: next, nonce: (state.highlight ? state.highlight.nonce : 0) + 1 } });
      }

      function clearHighlightRects() {
        if (state.highlight && state.highlight.rects && state.highlight.rects.length) {
          setState({ highlight: { rects: [], nonce: (state.highlight.nonce || 0) + 1 } });
        }
      }

      function attach(ctx) {
        clientCtx = ctx;
      }

      return {
        attach: attach,
        load: load,
        getSnapshot: getSnapshot,
        subscribe: subscribe,
        upsert: upsert,
        remove: remove,
        openEditor: openEditor,
        closeEditor: closeEditor,
        openPanelModal: openPanelModal,
        closePanelModal: closePanelModal,
        openList: openList,
        openFileForm: openFileForm,
        openPreview: openPreview,
        focusItem: focusItem,
        setSessionFilter: setSessionFilter,
        setWorkspaceFilter: setWorkspaceFilter,
        clearFilters: clearFilters,
        refreshWorkspaces: refreshWorkspaces,
        factsFor: factsFor,
        factsForPath: factsForPath,
        patchWorkspace: patchWorkspace,
        requestReveal: requestReveal,
        consumeReveal: consumeReveal,
        markRevealHandled: markRevealHandled,
        captureMessage: captureMessage,
        openMessageEditor: openMessageEditor,
        openExcerptDraft: openExcerptDraft,
        exportFavorites: exportFavorites,
        importFavorites: importFavorites,
        showToast: showToast,
        hideToast: hideToast,
        setPill: setPill,
        clearPill: clearPill,
        setHighlightRects: setHighlightRects,
        clearHighlightRects: clearHighlightRects,
        turnForMessage: turnForMessage,
      };
    }

    const store = createStore();

    function findMessageItem(items, sessionId, messageId) {
      if (!messageId) return null;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.kind === 'message' && item.sessionId === sessionId && item.messageId === messageId) return item;
      }
      return null;
    }

    function turnHasFavorites(items, sessionId, turn) {
      if (typeof turn !== 'number') return false;
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        if (item.sessionId === sessionId && item.turn === turn) return true;
      }
      return false;
    }

    function useStore() {
      const [snapshot, setSnapshot] = useState(function () {
        return store.getSnapshot();
      });
      useEffect(function () {
        const sync = function () {
          setSnapshot(store.getSnapshot());
        };
        sync();
        return store.subscribe(sync);
      }, []);
      return snapshot;
    }

    /* --------------------------------------------------------------- visuals */

    const CSS = [
      '.dshfav-action{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;padding:0;border:0;outline:0;border-radius:5px;background:none;box-shadow:none;color:var(--dsw-alias-label-secondary);cursor:pointer;transition:color .12s ease,opacity .12s ease}',
      '.dshfav-action:hover,.dshfav-action:active{color:var(--dsw-alias-label-primary);background:none;border:0;box-shadow:none}',
      '.dshfav-action:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshfav-action.is-on{color:var(--dsw-alias-brand-primary);opacity:1}',
      '.dshfav-action.is-turn{color:var(--dsw-alias-brand-primary);opacity:.45}',
      '.dshfav-action.is-turn:hover{opacity:1;color:var(--dsw-alias-brand-primary)}',
      '.dshfav-hchip{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border:1px solid var(--dsw-alias-brand-primary);border-radius:999px;background:transparent;color:var(--dsw-alias-brand-primary);font-size:11px;font-family:inherit;line-height:1;cursor:pointer}',
      '.dshfav-hchip:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dshfav-group{display:block;margin:18px 0 8px}',
      '.dshfav-group-btn{display:flex;align-items:center;gap:8px;width:100%;padding:4px 0;border:0;background:transparent;font-family:inherit;text-align:left;color:inherit;cursor:pointer}',
      '.dshfav-group-btn:hover .dshfav-group-title{color:var(--dsw-alias-brand-primary)}',
      '.dshfav-group-caret{flex:none;display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;color:var(--dsw-alias-label-secondary);transition:transform .12s ease,color .12s ease}',
      '.dshfav-group-caret.is-open{transform:rotate(90deg);color:var(--dsw-alias-label-primary)}',
      '.dshfav-group-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap}',
      '.dshfav-group-path{min-width:0;font-size:10.5px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshfav-group-count{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dshfav-card.is-focus{border-color:var(--dsw-alias-brand-primary);box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-2)}',
      '.dshfav-path{display:block;margin:6px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.dshfav-rows{display:flex;flex-direction:column;gap:2px;margin:0 0 12px;max-height:46vh;overflow:auto}',
      '.dshfav-row{display:block;width:100%;box-sizing:border-box;text-align:left;padding:8px 10px;border:1px solid transparent;border-radius:8px;background:transparent;color:inherit;font-family:inherit;cursor:pointer}',
      '.dshfav-row:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l1)}',
      '.dshfav-row-head{display:flex;align-items:center;gap:6px}',
      '.dshfav-row-title{min-width:0;font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshfav-row-quote{margin-top:3px;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshfav-preview{max-height:56vh;overflow:auto;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);padding:6px 0}',
      '.dshfav-line{display:flex;gap:10px;padding:0 12px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11.5px;line-height:18px}',
      '.dshfav-line.is-hit{background:var(--dsw-alias-bg-layer-2)}',
      '.dshfav-line-no{flex:none;width:46px;text-align:right;color:var(--dsw-alias-label-secondary);user-select:none}',
      '.dshfav-line-text{flex:1 1 auto;white-space:pre-wrap;word-break:break-word;color:var(--dsw-alias-label-primary)}',
      '.dshfav-modal-actions{display:flex;align-items:center;gap:8px;margin-top:14px;justify-content:flex-end}',
      '.dshfav-inline-note{margin:0 0 12px;font-size:11.5px;line-height:17px;color:var(--dsw-alias-label-secondary)}',
      '.dshfav-hl{position:fixed;pointer-events:none;background-color:var(--dsw-alias-state-warn-primary);opacity:.32;border-radius:3px;z-index:940}',
      '.dshfav-pill{position:fixed;z-index:1250;display:inline-flex;align-items:center;gap:5px;height:26px;padding:0 9px;border:1px solid var(--dsw-alias-brand-primary);border-radius:6px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-brand-primary);font-size:11.5px;font-family:inherit;line-height:1;cursor:pointer;pointer-events:auto;box-shadow:0 4px 14px var(--dsw-alias-border-l2)}',
      '.dshfav-pill:hover{background:var(--dsw-alias-bg-layer-2)}',
      '.dshfav-scope{display:flex;align-items:center;gap:10px;margin:0 0 16px;flex-wrap:wrap}',
      '.dshfav-scope-label{font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary);flex:none}',
      '.dshfav-seg-track{display:inline-flex;align-items:center;gap:2px;padding:3px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
      '.dshfav-scope-btn{height:28px;padding:0 12px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1;font-family:inherit;cursor:pointer;transition:background-color .12s ease,color .12s ease,box-shadow .12s ease}',
      '.dshfav-scope-btn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dshfav-scope-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshfav-pulse{animation:dshfav-pulse 1.5s ease-out 1}',
      '@keyframes dshfav-pulse{0%{box-shadow:0 0 0 0 var(--dsw-alias-brand-primary);border-radius:5px}60%{box-shadow:0 0 0 5px transparent}100%{box-shadow:0 0 0 0 transparent}}',
      '.dshfav-panel{height:100%;min-height:100%;overflow:auto;background:var(--dsw-alias-bg-base)}',
      '.dshfav-inner{max-width:800px;margin:0 auto;padding:28px 24px 56px;box-sizing:border-box}',
      '.dshfav-head{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-brand-primary)}',
      '.dshfav-head-title{font-size:19px;font-weight:600;line-height:26px;color:var(--dsw-alias-label-primary);margin:0}',
      '.dshfav-sub{margin:4px 0 0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dshfav-toolbar{display:flex;align-items:center;gap:8px;margin:20px 0 10px;flex-wrap:wrap}',
      '.dshfav-search{flex:1 1 220px;min-width:160px;height:32px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;font-family:inherit;box-sizing:border-box}',
      '.dshfav-search:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
      '.dshfav-seg{display:inline-flex;padding:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}',
      '.dshfav-seg button{height:26px;padding:0 10px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:12px;font-family:inherit;cursor:pointer}',
      '.dshfav-chiprow{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 14px}',
      '.dshfav-tagpicker{margin:6px 0 0;gap:4px}',
      '.dshfav-tagpicker .dshfav-chip{height:20px;font-size:10.5px;line-height:18px;padding:0 8px}',
      '.dshfav-chip{height:22px;padding:0 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;font-family:inherit;line-height:20px;cursor:pointer}',
      '.dshfav-chip:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}',
      '.dshfav-card{position:relative;margin:0 0 10px;padding:12px 14px 12px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}',
      '.dshfav-card::before{content:"";position:absolute;left:0;top:10px;bottom:10px;width:2px;border-radius:2px;background:var(--dsw-alias-brand-primary);opacity:.45}',
      '.dshfav-card:hover::before{opacity:.9}',
      '.dshfav-card-head{display:flex;align-items:center;gap:8px;min-width:0}',
      '.dshfav-badge{flex:none;height:17px;padding:0 6px;border:1px solid var(--dsw-alias-border-l1);border-radius:4px;color:var(--dsw-alias-label-secondary);font-size:10.5px;line-height:15px}',
      '.dshfav-card-title{flex:1 1 auto;min-width:0;font-size:13.5px;font-weight:600;line-height:20px;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.dshfav-card-time{flex:none;font-size:11px;color:var(--dsw-alias-label-secondary)}',
      '.dshfav-quote{margin:6px 0 0;font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-secondary);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;white-space:pre-wrap;word-break:break-word}',
      '.dshfav-note{margin:8px 0 0;padding:6px 10px;border-left:2px solid var(--dsw-alias-brand-primary);border-radius:0 6px 6px 0;background:var(--dsw-alias-bg-layer-2);font-size:12.5px;line-height:19px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}',
      '.dshfav-meta{display:flex;align-items:center;gap:8px;margin:10px 0 0;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap}',
      '.dshfav-dot{opacity:.5}',
      '.dshfav-tags{display:inline-flex;gap:6px;flex-wrap:wrap}',
      '.dshfav-tag{padding:0;border:0;background:transparent;color:var(--dsw-alias-brand-primary);font-size:11px;font-family:inherit;cursor:pointer}',
      '.dshfav-tag:hover{text-decoration:underline}',
      '.dshfav-row-actions{margin-left:auto;display:flex;gap:2px;opacity:0;transition:opacity .12s ease}',
      '.dshfav-card:hover .dshfav-row-actions,.dshfav-card:focus-within .dshfav-row-actions{opacity:1}',
      '@media (hover:none){.dshfav-row-actions{opacity:1}}',
      '.dshfav-mini{height:22px;padding:0 7px;border:0;border-radius:5px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:11px;font-family:inherit;cursor:pointer}',
      '.dshfav-mini:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.dshfav-mini.is-danger:hover{color:var(--dsw-alias-state-error-primary)}',
      '.dshfav-empty{margin:36px 0 0;padding:28px 20px;border:1px dashed var(--dsw-alias-border-l1);border-radius:10px;text-align:center;color:var(--dsw-alias-label-secondary)}',
      '.dshfav-empty strong{display:block;margin-bottom:6px;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}',
      '.dshfav-empty p{margin:0;font-size:12px;line-height:19px}',
      '.dshfav-footer{margin:24px 0 0;font-size:11px;line-height:17px;color:var(--dsw-alias-label-secondary)}',
      '.dshfav-backdrop{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:auto;background:var(--dsw-alias-bg-base);background:color-mix(in srgb,var(--dsw-alias-bg-base) 62%,transparent)}',
      '.dshfav-dialog{width:min(540px,100%);max-height:min(78vh,720px);overflow:auto;box-sizing:border-box;padding:20px;border:1px solid var(--dsw-alias-border-l1);border-radius:14px;background:var(--dsw-alias-bg-overlay);box-shadow:0 18px 48px var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.dshfav-dialog-title{display:flex;align-items:center;gap:8px;margin:0 0 14px;font-size:15px;font-weight:600;line-height:22px;color:var(--dsw-alias-label-primary)}',
      '.dshfav-field{display:block;margin:0 0 14px}',
      '.dshfav-field-label{display:block;margin:0 0 6px;font-size:11.5px;line-height:16px;color:var(--dsw-alias-label-secondary)}',
      '.dshfav-input,.dshfav-textarea{width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;font-family:inherit}',
      '.dshfav-input:focus,.dshfav-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
      '.dshfav-textarea{resize:vertical;min-height:64px}',
      '.dshfav-readonly{margin:0 0 14px;padding:9px 11px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1)}',
      '.dshfav-readonly-label{margin:0 0 4px;font-size:10.5px;line-height:15px;color:var(--dsw-alias-label-secondary)}',
      '.dshfav-readonly-text{margin:0;max-height:96px;overflow:auto;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word}',
      '.dshfav-dialog-foot{display:flex;align-items:center;gap:8px;margin:4px 0 0}',
      '.dshfav-hint{margin-right:auto;font-size:10.5px;line-height:15px;color:var(--dsw-alias-label-secondary);max-width:240px}',
      '.dshfav-actions{display:flex;align-items:center;gap:6px;margin-left:auto}',
      '.dshfav-btn{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px;border:1px solid transparent;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-size:12.5px;font-family:inherit;cursor:pointer;transition:background-color .12s ease,color .12s ease}',
      '.dshfav-btn:hover{background:var(--dsw-alias-bg-overlay)}',
      '.dshfav-btn.is-primary{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,var(--dsw-alias-bg-base));color:var(--dsw-alias-brand-primary);font-weight:600}',
      '.dshfav-btn.is-primary:hover{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 24%,var(--dsw-alias-bg-base))}',
      '.dshfav-btn.is-quiet{background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.dshfav-btn.is-quiet:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-state-error-primary)}',
      '.dshfav-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}',
      '.dshfav-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);z-index:1300;max-width:min(520px,calc(100vw - 48px));padding:9px 14px;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;box-shadow:0 10px 30px var(--dsw-alias-border-l2)}',
      '.dshfav-panel-icon{display:inline-flex;align-items:center;justify-content:center;color:currentColor}',
      '@media (prefers-reduced-motion:reduce){.dshfav-pulse{animation:none}}',
      '.dshfav-chip.is-on,.dshfav-scope-btn.is-on,.dshfav-seg button.is-on{background:var(--dsw-alias-bg-layer-2);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,var(--dsw-alias-bg-base));border-color:transparent;color:var(--dsw-alias-label-primary);font-weight:600;box-shadow:none}',
    ].join('\n');

    function StyleTag() {
      return h('style', null, CSS);
    }

    function BookmarkIcon(props) {
      const size = props.size || 16;
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          'aria-hidden': 'true',
          focusable: 'false',
          style: { display: 'block' },
          fill: props.filled ? 'currentColor' : 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinejoin: 'round',
        },
        h('path', {
          d: 'M6.4 3.6h11.2c.99 0 1.8.81 1.8 1.8v14.9c0 .74-.85 1.15-1.43.7L12 16.6l-5.97 4.4c-.58.45-1.43.04-1.43-.7V5.4c0-.99.81-1.8 1.8-1.8Z',
        }),
      );
    }

    /* Small line icons for the toolbar actions: they make those controls read
       as buttons rather than as the filter chips beside them. */
    function ToolbarIcon(props) {
      const size = props.size || 14;
      const common = {
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        focusable: 'false',
        style: { display: 'block', flex: 'none' },
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      };
      if (props.name === 'plus') return h('svg', common, h('path', { d: 'M8 3.2v9.6M3.2 8h9.6' }));
      if (props.name === 'download') return h('svg', common, h('path', { d: 'M8 2.4v7.6m0 0L4.9 6.9M8 10l3.1-3.1M2.6 13.2h10.8' }));
      if (props.name === 'upload') return h('svg', common, h('path', { d: 'M8 12.8V5.2m0 0L4.9 8.3M8 5.2l3.1 3.1M2.6 2.8h10.8' }));
      return null;
    }

    function pulse(node) {
      if (!node || !node.classList) return;
      node.classList.remove('dshfav-pulse');
      /* restart the animation on a re-used node */
      void node.offsetWidth;
      node.classList.add('dshfav-pulse');
    }

    function scrollTo(node) {
      if (!node || typeof node.scrollIntoView !== 'function') return;
      try {
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (err) {
        try {
          node.scrollIntoView();
        } catch (inner) {
          /* nothing to do */
        }
      }
    }

    /* Keep the *message* — not its action row — at the top of the transcript
       while it settles: history pages and images are inserted above it, and the
       Chat shell may restore its own position, so one scroll can land far away
       or drift. Returns a stop function. */
    function messageBlockFor(button) {
      let element = button && button.parentElement;
      let fallback = null;
      for (let depth = 0; element && depth < 24; depth += 1) {
        if (!element.querySelectorAll) break;
        const anchors = element.querySelectorAll('[data-dshfav-anchor]');
        if (anchors.length !== 1) break;
        fallback = element;
        if (element.getBoundingClientRect().height > 120) return element;
        element = element.parentElement;
      }
      return fallback;
    }

    function scrollportOf(element) {
      let node = element && element.parentElement;
      while (node) {
        const style = window.getComputedStyle(node);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 4) return node;
        node = node.parentElement;
      }
      return null;
    }

    let highlightToken = 0;
    let revealWatcher = null;
    let pagingBusy = false;

    function clearRevealWatcher() {
      if (revealWatcher) {
        window.removeEventListener('resize', revealWatcher);
        revealWatcher = null;
      }
    }

    /* Paint the matched text through the plugin's own overlay layer: fixed
       rectangles taken from the Range, so no host DOM is modified and no
       CSS Custom Highlight support is required. */
    function paintRangeRects(range) {
      if (!range) return 0;
      /* Per text node, so the overlay hugs the glyphs instead of spreading over
         block boxes (which produced full-width bands) and never double-paints. */
      let rects = [];
      try {
        const root =
          range.commonAncestorContainer && range.commonAncestorContainer.nodeType === 3
            ? range.commonAncestorContainer.parentElement
            : range.commonAncestorContainer;
        const walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, null);
        const seen = {};
        let node = walker.nextNode();
        let guard = 0;
        while (node && guard < 4000) {
          guard += 1;
          if (range.intersectsNode(node)) {
            const value = node.nodeValue || '';
            const start = node === range.startContainer ? range.startOffset : 0;
            const end = node === range.endContainer ? range.endOffset : value.length;
            if (end > start) {
              const sub = document.createRange();
              try {
                sub.setStart(node, start);
                sub.setEnd(node, end);
                const list = sub.getClientRects();
                for (let i = 0; i < list.length; i += 1) {
                  const rect = list[i];
                  if (!(rect.width > 0 && rect.height > 0)) continue;
                  const key = [Math.round(rect.left), Math.round(rect.top), Math.round(rect.width), Math.round(rect.height)].join(':');
                  if (seen[key]) continue;
                  seen[key] = 1;
                  rects.push({ left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) });
                  if (rects.length >= 120) break;
                }
              } catch (err) {
                /* skip this node */
              }
            }
          }
          if (rects.length >= 120) break;
          node = walker.nextNode();
        }
      } catch (err) {
        rects = [];
      }
      /* One rect per visual line: the inline fragments of a line would otherwise
         stack their opacity and show steps.
         Line membership is decided by VERTICAL OVERLAP, not by a quantized top.
         An inline code span renders a shorter box whose top sits a pixel or two
         above the surrounding prose; bucketing by `Math.round(top / 2) * 2` (the
         previous rule) dropped it into its own bucket, so every English/code
         fragment got a second band with a different top and height — the amber
         overlay looked uneven and stepped on exactly those tokens. Overlap
         clustering keeps such a fragment on the line it belongs to, and the band
         then spans that line's full ascent→descent, so consecutive lines match. */
      const lines = [];
      for (let i = 0; i < rects.length; i += 1) {
        const rect = rects[i];
        if (!(rect.width > 0 && rect.height > 0)) continue;
        if (rect.height < 4) continue; /* line-break / zero-width slivers */
        if (rect.width > 1200) continue;
        const top = rect.top;
        const bottom = rect.top + rect.height;
        let line = null;
        for (let j = 0; j < lines.length; j += 1) {
          const candidate = lines[j];
          const overlap = Math.min(candidate.bottom, bottom) - Math.max(candidate.top, top);
          const smaller = Math.min(candidate.bottom - candidate.top, bottom - top);
          /* Half the smaller box is enough: a prose box and a code box on one
             line overlap by most of the shorter one, while neighbouring lines
             only touch at their edges. */
          if (smaller > 0 && overlap >= smaller * 0.5) {
            line = candidate;
            break;
          }
        }
        if (!line) {
          lines.push({ left: rect.left, right: rect.left + rect.width, top: top, bottom: bottom });
          continue;
        }
        if (rect.left < line.left) line.left = rect.left;
        if (rect.left + rect.width > line.right) line.right = rect.left + rect.width;
        if (top < line.top) line.top = top;
        if (bottom > line.bottom) line.bottom = bottom;
      }
      const visible = [];
      for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        visible.push({
          left: line.left,
          top: line.top,
          width: Math.max(1, line.right - line.left),
          height: Math.max(1, line.bottom - line.top),
        });
      }
      store.setHighlightRects(visible);
      /* Verify the painted overlay against the range: if these disagree the
         overlay coordinate system is off (e.g. a transformed ancestor). */
      if (visible.length) {
        setTimeout(function () {
          try {
            const painted = document.querySelector('.dshfav-hl');
            const live = visible[0] || { top: 0, left: 0 };
          } catch (err) {
            /* ignore */
          }
        }, 80);
      }
      return visible.length;
    }

    /* Fallback reveal without the action row: a very old message may never
       mount its row, so align by turn instead. */
    function revealByTurn(turn, kind) {
      if (typeof turn !== 'number') return false;
      let range = null;
      if (kind === 'turn') {
        const prompts = chatFlowItems('user', turn);
        range = blockTextRange(prompts[prompts.length - 1]);
      }
      if (!range) {
        const rows = chatFlowItems('assistant-step', turn);
        for (let i = 0; i < rows.length && !range; i += 1) {
          const host = rows[i].querySelector ? rows[i].querySelector('p,li,h1,h2,h3,h4,h5,h6,blockquote') : null;
          range = blockTextRange(host || rows[i]);
        }
      }
      if (!range) return false;
      const startEl = range.startContainer.parentElement || document.body;
      const port = scrollportOf(startEl);
      const rect = range.getBoundingClientRect();
      const portTop = port ? port.getBoundingClientRect().top : 0;
      const delta = rect.top - (portTop + 120);
      if (port) port.scrollTop += delta;
      else window.scrollBy(0, delta);
      paintRangeRects(range);
      setTimeout(function () {
        store.clearHighlightRects();
      }, 2500);
      return true;
    }

    /* Cross-node text matcher: join every text node into one searchable stream
       (recording where each character came from), so a probe that the renderer
       split across <strong>/<code> still matches the whole line. */
    function findStreamRange(anchor, probeRaw, minTop, maxTop) {
      const probe = String(probeRaw || '').replace(/[\s*_#>]+/g, '');
      if (probe.length < 4) return null;
      const root = scrollportOf(anchor) || document.body;
      let walker;
      try {
        walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
      } catch (err) {
        return null;
      }
      let clean = '';
      const map = [];
      let node = walker.nextNode();
      let guard = 0;
      while (node && guard < 20000) {
        guard += 1;
        const parent = node.parentElement;
        const blocked = parent && parent.closest ? parent.closest('[data-clock],[data-actions-reveal],[data-disclosure-row],[data-disclosure-header],[data-disclosure-panel],time,[aria-hidden="true"]') : null;
        const value = String(node.nodeValue || '');
        if (!blocked && value) {
          for (let i = 0; i < value.length; i += 1) {
            const ch = value[i];
            if (/[\s*_`#>]/.test(ch)) continue; /* same normalization as the probe */
            clean += ch;
            map.push({ node: node, offset: i });
          }
        }
        node = walker.nextNode();
      }
      if (!clean) return null;
      let from = 0;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const at = clean.indexOf(probe, from);
        if (at < 0) return null;
        from = at + 1;
        const start = map[at];
        const end = map[Math.min(map.length - 1, at + probe.length - 1)];
        if (!start || !end) continue;
        const range = document.createRange();
        try {
          range.setStart(start.node, start.offset);
          range.setEnd(end.node, end.offset + 1);
        } catch (err) {
          continue;
        }
        const rect = range.getBoundingClientRect();
        if (!rect || (rect.width === 0 && rect.height === 0)) continue;
        const insideRegion =
          !(typeof minTop === 'number' && rect.top < minTop - 8) &&
          !(typeof maxTop === 'number' && rect.top > maxTop + 8);
        if (insideRegion) return range;
      }
      return null;
    }

    /* Locate the stored excerpt inside the rendered transcript. The quote is the
       user's selection, so the match is the precise anchor we otherwise have to
       guess from message geometry. Rendered text keeps its own line breaks, so
       probe with single lines / single tokens instead of a normalized prefix. */
    function findQuoteRange(anchor, quote, preferTopmost, minTop, maxTop) {
      const raw = String(quote || '');
      if (raw.trim().length < 2) return null;
      const plain = function (value) {
        return String(value || '').replace(/[*_`#>]/g, '').trim();
      };
      const lines = raw.split('\n');
      const candidates = [];
      for (let i = 0; i < lines.length; i += 1) {
        const line = plain(lines[i]);
        if (!line) continue;
        if (line.length >= 6) {
          if (candidates.length < 5) candidates.push({ text: line, short: false });
        } else if (line.length >= 2 && !candidates.length) {
          /* A short opening line (a heading such as 归档执行) still starts the
             passage, so keep it — it must be unique inside the region. */
          candidates.push({ text: line, short: true });
        }
      }
      const tokens = plain(raw).split(/\s+/);
      for (let i = 0; i < tokens.length && candidates.length < 7; i += 1) {
        if (tokens[i].length >= 8) candidates.push({ text: tokens[i], short: false });
      }
      if (!candidates.length) return null;
      const root = scrollportOf(anchor) || document.body;
      const anchorRect = anchor.getBoundingClientRect();
      const lengths = [40, 32, 24, 16, 12, 8];
      for (let c = 0; c < candidates.length; c += 1) {
        const candidate = candidates[c].text;
        const isShort = candidates[c].short;
        const steps = isShort ? [candidate.length] : lengths;
        for (let l = 0; l < steps.length; l += 1) {
          const probe = candidate.slice(0, steps[l]);
          if (probe.length < (isShort ? 2 : 6)) continue;
          let walker;
          try {
            walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
          } catch (err) {
            return null;
          }
          let best = null;
          let bestDistance = Infinity;
          let matches = 0;
          let node = walker.nextNode();
          while (node) {
            const text = node.nodeValue || '';
            const at = text.indexOf(probe);
            if (at >= 0) {
              const range = document.createRange();
              range.setStart(node, at);
              range.setEnd(node, Math.min(text.length, at + probe.length));
              const rect = range.getBoundingClientRect();
              const insideRegion =
                !(typeof minTop === 'number' && rect && rect.top < minTop - 8) &&
                !(typeof maxTop === 'number' && rect && rect.top > maxTop + 8);
              if (rect && (rect.width > 0 || rect.height > 0) && insideRegion) {
                matches += 1;
                const distance = preferTopmost ? rect.top : Math.abs(rect.top - anchorRect.top);
                if (distance < bestDistance) {
                  bestDistance = distance;
                  best = range;
                }
              }
            }
            node = walker.nextNode();
          }
          /* A short probe is only trustworthy when it matches exactly once. */
          if (best && (!isShort || matches === 1)) return best;
          if (isShort) break;
        }
      }
      return null;
    }

    /* The message block that owns this action row: the largest ancestor whose
       top has not climbed past the previous message's row. */

    /* The first rendered line inside a block: grow a range across text nodes
       while the bounding box stays on the same visual line. */
    function firstLineRange(block, startNode) {
      if (!block) return null;
      let walker;
      try {
        walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, null);
      } catch (err) {
        return null;
      }
      let node;
      const usable = function (candidate) {
        if (!candidate) return false;
        if (!String(candidate.nodeValue || '').trim()) return false;
        const parent = candidate.parentElement;
        if (!parent || !parent.closest) return true;
        const blocked = parent.closest('[data-clock],[data-actions-reveal],[data-disclosure-row],[data-disclosure-header],[data-disclosure-panel],time,[aria-hidden="true"],[data-slot*="reasoning"]');
        if (blocked) return false;
        /* Collapsed reasoning toggle labels ("思考", "Thinking") are not content. */
        const label = String(candidate.nodeValue || '').trim();
        if (label === '思考' || label === 'Thinking' || label === 'Reasoning') return false;
        return true;
      };
      if (startNode && startNode.nodeType === 3 && usable(startNode)) {
        walker.currentNode = startNode;
        node = startNode;
      } else {
        node = walker.nextNode();
        while (node && !usable(node)) node = walker.nextNode();
      }
      if (!node) return null;
      const range = document.createRange();
      try {
        range.setStart(node, 0);
        range.setEnd(node, String(node.nodeValue || '').length);
      } catch (err) {
        return null;
      }
      const firstBox = range.getBoundingClientRect();
      const baseTop = firstBox.top;
      const baseHeight = firstBox.height;
      const firstLeft = firstBox.left;
      let last = node;
      let next = walker.nextNode();
      let guard = 0;
      while (next && guard < 200) {
        guard += 1;
        try {
          range.setEnd(next, String(next.nodeValue || '').length);
        } catch (err) {
          break;
        }
        /* A multi-line range keeps the bounding-box top of its first line, so
           the wrap test must look at the LAST rect, not the union box. */
        const spans = range.getClientRects();
        const lastRect = spans.length ? spans[spans.length - 1] : null;
        /* Same visual line = the new box overlaps the first line's band. */
        /* Same line = still on the first line's band, OR continuing to the right
           of where the line started (an inline code box may ride lower). A wrap
           always returns to the left edge. */
        const sameLine =
          lastRect &&
          (lastRect.top <= baseTop + baseHeight + 4
            ? lastRect.top + lastRect.height >= baseTop - 4
            : lastRect.left > firstLeft + 10);
        if (!sameLine) {
          try {
            range.setEnd(last, String(last.nodeValue || '').length);
          } catch (err) {
            /* keep what we have */
          }
          break;
        }
        last = next;
        next = walker.nextNode();
      }
      return range;
    }

    /* For a message bookmark: the first line of the message content. The action
       row shares the content column, so only text nodes whose left edge matches
       it are considered (this excludes right-aligned user bubbles). */
    function firstContentLine(anchor, regionTop) {
      const port = scrollportOf(anchor) || document.body;
      const anchorRect = anchor.getBoundingClientRect();
      let walker;
      try {
        walker = document.createTreeWalker(port, NodeFilter.SHOW_TEXT, null);
      } catch (err) {
        return null;
      }
      let node = walker.nextNode();
      let best = null;
      let guard = 0;
      while (node && guard < 4000) {
        guard += 1;
        const text = node.nodeValue || '';
        if (text.trim()) {
          const probe = document.createRange();
          try {
            probe.selectNodeContents(node);
          } catch (err) {
            node = walker.nextNode();
            continue;
          }
          const rect = probe.getBoundingClientRect();
          const insideTop = typeof regionTop !== 'number' || rect.top >= regionTop - 2;
          const aboveAnchor = rect.top <= anchorRect.top - 10;
          const sameColumn = Math.abs(rect.left - anchorRect.left) < 80;
          if (insideTop && aboveAnchor && sameColumn && rect.height > 0) {
            /* Keep the leftmost node of the topmost line: the first line is often
               split by inline code, and only its first fragment starts the line. */
            if (
              !best ||
              rect.top < best.top - 4 ||
              (Math.abs(rect.top - best.top) <= 4 && rect.left < best.left)
            ) {
              best = { node: node, top: rect.top, left: rect.left };
            }
            continue;
          }
          if (best && rect.top > anchorRect.top) break;
        }
        node = walker.nextNode();
      }
      return best ? firstLineRange(scrollportOf(anchor) || document.body, best.node) : null;
    }

    /* Chat marks every flow row: data-chat-flow-kind (user / assistant-step /
       turn-tail / tool-call …) and data-chat-turn. Use those instead of layout. */
    function chatFlowItems(kind, turn) {
      const all = document.querySelectorAll('[data-chat-flow-kind="' + kind + '"]');
      const out = [];
      for (let i = 0; i < all.length; i += 1) {
        if (typeof turn === 'number') {
          const value = Number(all[i].getAttribute('data-chat-turn'));
          if (value !== turn) continue;
        }
        out.push(all[i]);
      }
      return out;
    }

    function blockTextRange(element) {
      if (!element) return null;
      let walker;
      try {
        walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
      } catch (err) {
        return null;
      }
      let first = null;
      let last = null;
      let node = walker.nextNode();
      while (node) {
        if (String(node.nodeValue || '').trim()) {
          const parent = node.parentElement;
          const meta = parent && parent.closest ? parent.closest('[data-clock],[data-actions-reveal],[data-disclosure-row],[data-disclosure-header],[data-disclosure-panel],time,[aria-hidden="true"]') : null;
          if (!(meta && element.contains(meta))) {
            if (!first) first = node;
            last = node;
          }
        }
        node = walker.nextNode();
      }
      if (!first || !last) return null;
      /* Probe: what does the picked node sit inside? (reasoning vs reply body) */
      const range = document.createRange();
      try {
        range.setStart(first, 0);
        range.setEnd(last, String(last.nodeValue || '').length);
      } catch (err) {
        return null;
      }
      return range;
    }

    /* A turn highlights that turn's PROMPT. The prompt is the first block of the
       turn region and renders as a right-aligned bubble, while the reply body is
       left-aligned — so extend while the next text keeps the same left column. */
    function firstPromptRange(anchor, regionTop) {
      const port = scrollportOf(anchor) || document.body;
      const anchorRect = anchor.getBoundingClientRect();
      let walker;
      try {
        walker = document.createTreeWalker(port, NodeFilter.SHOW_TEXT, null);
      } catch (err) {
        return null;
      }
      const rectOf = function (node) {
        try {
          const probe = document.createRange();
          probe.selectNodeContents(node);
          return probe.getBoundingClientRect();
        } catch (err) {
          return null;
        }
      };
      let node = walker.nextNode();
      let start = null;
      let guard = 0;
      while (node && guard < 6000) {
        guard += 1;
        if (String(node.nodeValue || '').trim()) {
          const rect = rectOf(node);
          const insideTop = typeof regionTop !== 'number' || (rect && rect.top >= regionTop - 2);
          if (rect && insideTop && rect.top <= anchorRect.top - 2 && rect.height > 0) {
            start = { node: node, rect: rect };
            break;
          }
        }
        node = walker.nextNode();
      }
      if (!start) return null;
      const range = document.createRange();
      const startLen = String(start.node.nodeValue || '').length;
      try {
        range.setStart(start.node, 0);
        range.setEnd(start.node, startLen);
      } catch (err) {
        return null;
      }
      const baseLeft = start.rect.left;
      const baseTop = start.rect.top;
      let next = walker.nextNode();
      let steps = 0;
      while (next && steps < 120) {
        steps += 1;
        const text = String(next.nodeValue || '');
        if (!text.trim()) {
          next = walker.nextNode();
          continue;
        }
        const nextRect = rectOf(next);
        const keepNode = range.endContainer;
        const keepOffset = range.endOffset;
        try {
          range.setEnd(next, text.length);
        } catch (err) {
          break;
        }
        const rects = range.getClientRects();
        const tail = rects.length ? rects[rects.length - 1] : null;
        const sameColumn = nextRect ? Math.abs(nextRect.left - baseLeft) <= 40 : false;
        const stillInside = nextRect ? nextRect.top >= baseTop - 6 && nextRect.top <= anchorRect.top : false;
        if (!tail || !sameColumn || !stillInside) {
          try {
            range.setEnd(keepNode, keepOffset);
          } catch (err) {
            /* ignore */
          }
          break;
        }
        next = walker.nextNode();
      }
      return range;
    }

    /* The text node that starts the reply body (same script as the stored
       opening), so the caller can expand its paragraph. */
    function findScriptNode(scope, probe) {
      if (!scope) return null;
      const sample = String(probe || '').replace(/[\s*_#>]/g, '').slice(0, 1);
      const wantCjk = /[\u3400-\u9fff]/.test(sample);
      let walker;
      try {
        walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, null);
      } catch (err) {
        return null;
      }
      let node = walker.nextNode();
      let guard = 0;
      while (node && guard < 4000) {
        guard += 1;
        const text = String(node.nodeValue || '').trim();
        if (text) {
          const isCjk = /[\u3400-\u9fff]/.test(text[0]);
          const parent = node.parentElement;
          const blocked = parent && parent.closest ? parent.closest('[data-clock],[data-actions-reveal],[data-disclosure-row],[data-disclosure-header],[data-disclosure-panel],time,[aria-hidden="true"]') : null;
          if (!blocked && isCjk === wantCjk) return node;
        }
        node = walker.nextNode();
      }
      return null;
    }

    /* Prefer the first line written in the same script as the stored opening:
       English reasoning precedes a Chinese reply, and vice versa. */

    /* Pick the first line that actually STARTS the stored text: the reply body
       matches the excerpt's opening, whereas a reasoning block does not. */

    /* Extend a matched range to the end of its visual line, so a short probe
       does not leave only a few characters highlighted. */
    function extendToLineEnd(range, root) {
      if (!range) return range;
      const first = range.getClientRects()[0];
      if (!first) return range;
      const baseTop = first.top;
      const baseHeight = first.height;
      const firstLeft = first.left;
      let walker;
      try {
        walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, null);
      } catch (err) {
        return range;
      }
      const endNode = range.endContainer;
      if (endNode && endNode.nodeType === 3) {
        try {
          range.setEnd(endNode, String(endNode.nodeValue || '').length);
        } catch (err) {
          /* keep as is */
        }
      }
      walker.currentNode = endNode;
      let next = walker.nextNode();
      let guard = 0;
      while (next && guard < 200) {
        guard += 1;
        const keepNode = range.endContainer;
        const keepOffset = range.endOffset;
        try {
          range.setEnd(next, String(next.nodeValue || '').length);
        } catch (err) {
          break;
        }
        const rects = range.getClientRects();
        const last = rects.length ? rects[rects.length - 1] : null;
        const sameLine =
          last &&
          (last.top <= baseTop + baseHeight + 4 ? last.top + last.height >= baseTop - 4 : last.left > firstLeft + 10);
        if (!sameLine) {
          try {
            range.setEnd(keepNode, keepOffset);
          } catch (err) {
            /* ignore */
          }
          break;
        }
        next = walker.nextNode();
      }
      return range;
    }

    /* Grow the probe range to cover the whole stored excerpt: its last line
       marks the end, so a multi-line selection paints several rects. */
    function extendRangeToQuote(range, quote, root) {
      if (!range) return range;
      const lines = String(quote || '')
        .split('\n')
        .map(function (line) {
          return String(line).replace(/[*_#>]/g, '').trim();
        })
        .filter(function (line) {
          return line.length >= 6;
        });
      if (lines.length < 2) return range;
      /* The quote's last line is often clamped mid-sentence and split across
         inline elements, so try several tail candidates from long to short. */
      const candidates = [];
      const tailLines = lines.slice(-2).reverse();
      for (let i = 0; i < tailLines.length; i += 1) {
        const line = tailLines[i];
        const lengths = [24, 16, 12, 8];
        for (let l = 0; l < lengths.length; l += 1) {
          const tail = line.slice(-lengths[l]);
          if (tail.length >= 8 && candidates.indexOf(tail) < 0) candidates.push(tail);
        }
      }
      if (!candidates.length) return range;
      /* Collect the text nodes that follow the start once, then test candidates. */
      const nodes = [];
      let walker;
      try {
        walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, null);
        walker.currentNode = range.startContainer;
      } catch (err) {
        return range;
      }
      let guard = 0;
      let node = walker.nextNode();
      while (node && guard < 600) {
        guard += 1;
        nodes.push(node);
        node = walker.nextNode();
      }
      for (let c = 0; c < candidates.length; c += 1) {
        const tail = candidates[c];
        for (let n = 0; n < nodes.length; n += 1) {
          const text = nodes[n].nodeValue || '';
          const at = text.indexOf(tail);
          if (at >= 0) {
            try {
              range.setEnd(nodes[n], Math.min(text.length, at + tail.length));
            } catch (err) {
            }
            return range;
          }
        }
      }
      return range;
    }

    function revealIntoView(node, options) {
      let anchor = node;
      const messageId = options && options.messageId ? String(options.messageId) : '';
      function current() {
        if (anchor && anchor.isConnected) return anchor;
        if (messageId) {
          const found = document.querySelector('[data-dshfav-anchor="' + messageId + '"]');
          if (found) anchor = found;
        }
        return anchor;
      }
      const kind = options && options.kind ? options.kind : '';
      const quote = options && typeof options.quote === 'string' ? options.quote : '';
      const prompt = options && typeof options.prompt === 'string' ? options.prompt : '';
      const searchText = (kind === 'turn' && prompt.length > 0 ? prompt : quote).trim();
      const useQuote = searchText.replace(/\s+/g, ' ').length >= 6;
      const messageRegion = (function () {
        const me = current();
        const all = document.querySelectorAll('[data-dshfav-anchor]');
        let previous = null;
        for (let i = 0; i < all.length; i += 1) {
          if (all[i] === me) break;
          previous = all[i];
        }
        return {
          top: previous ? previous.getBoundingClientRect().bottom : undefined,
          bottom: me.getBoundingClientRect().top,
        };
      })();
      const turnRegionTop = (function () {
        if (kind !== 'turn') return undefined;
        const all = document.querySelectorAll('[data-dshfav-anchor]');
        let previous = null;
        for (let i = 0; i < all.length; i += 1) {
          if (all[i] === anchor) break;
          previous = all[i];
        }
        return previous ? previous.getBoundingClientRect().bottom : undefined;
      })();
      store.hideToast();
      const turnNumber = (function () {
        if (options && typeof options.turn === 'number') return options.turn;
        const attr = current().getAttribute('data-dshfav-turn');
        if (attr) return Number(attr);
        /* The action row lives inside a flow row that already carries the turn. */
        const row = current().closest ? current().closest('[data-chat-turn]') : null;
        if (row) {
          const value = Number(row.getAttribute('data-chat-turn'));
          if (!isNaN(value)) return value;
        }
        return undefined;
      })();

      /* Deterministic first: Chat marks every flow row with data-chat-flow-kind and
         data-chat-turn, so a turn takes its `user` row's text and a message takes
         the turn's first `assistant-step` line. Layout heuristics and text
         matching are fallbacks only. */
      function pickRange() {
        const hasTurn = typeof turnNumber === 'number' && !isNaN(turnNumber);
        if (hasTurn && kind === 'turn') {
          const prompts = chatFlowItems('user', turnNumber);
          const direct = blockTextRange(prompts[prompts.length - 1]);
          if (direct) return direct;
        }
        const firstProbe = String(searchText || '')
          .split('\n')
          .map(function (line) {
            return line.trim();
          })
          .find(function (line) {
            return line.length >= 4;
          });
        /* A message bookmark is "this turn's reply, first line": take it from the
           turn's first assistant row — no text matching, which proved unreliable
           whenever the stored text is markdown or spans inline elements. */
        if (hasTurn && kind === 'message') {
          const steps = chatFlowItems('assistant-step', turnNumber);
          for (let s = 0; s < steps.length; s += 1) {
            const start = findScriptNode(steps[s], searchText);
            if (!start) continue;
            /* Highlight the reply's first paragraph as a whole: it may wrap. */
            const host = start.parentElement ? start.parentElement.closest('p,li,h1,h2,h3,h4,h5,h6,blockquote') : null;
            const whole = blockTextRange(host || (start.parentElement || steps[s]));
            if (whole) return whole;
          }
          const direct = firstLineRange(steps[0] || current());
          if (direct) return direct;
        }
        if (useQuote && firstProbe && (kind === 'excerpt' || kind === 'file')) {
          const byStream = findStreamRange(current(), firstProbe.slice(0, 40), messageRegion.top, messageRegion.bottom);
          if (byStream) return extendRangeToQuote(byStream, searchText, port());
        }
        if (kind === 'turn') {
          const byLayout = firstPromptRange(current(), messageRegion.top);
          if (byLayout) return byLayout;
        }
        if (kind === 'message') {
          const byLayout = firstContentLine(current(), messageRegion.top);
          if (byLayout) return byLayout;
        }
        if (!useQuote) return null;
        let matched =
          findQuoteRange(current(), searchText, kind === 'message' || kind === 'turn', messageRegion.top, messageRegion.bottom) ||
          findQuoteRange(current(), searchText, kind === 'turn', turnRegionTop);
        if (!matched) return null;
        if (kind === 'excerpt' || kind === 'file') return extendRangeToQuote(matched, searchText, port());
        if (kind === 'turn') {
          matched = extendRangeToQuote(matched, searchText, port());
          return extendToLineEnd(matched, port());
        }
        return extendToLineEnd(matched, port());
      }

      let range = pickRange();
      if (range) paintRangeRects(range);
      const token = (highlightToken += 1);
      let finished = false;
      let timer = 0;
      const started = Date.now();
      const BOTTOM_GAP = 140;
      const TOP_INSET = 24;
      const QUOTE_INSET = 120;
      const WINDOW_MS = 20000;

      function port() {
        return scrollportOf(current());
      }

      function previousAnchor() {
        const me = current();
        const all = document.querySelectorAll('[data-dshfav-anchor]');
        let previous = null;
        for (let i = 0; i < all.length; i += 1) {
          if (all[i] === me) return previous;
          previous = all[i];
        }
        return null;
      }

      function delta() {
        const found = port();
        const portTop = found ? found.getBoundingClientRect().top : 0;
        const portBottom = found ? found.getBoundingClientRect().bottom : window.innerHeight || 800;
        if (range) {
          const rect = range.getBoundingClientRect();
          if (rect && (rect.width > 0 || rect.height > 0)) return rect.top - (portTop + QUOTE_INSET);
        }
        const rect = current().getBoundingClientRect();
        const previous = previousAnchor();
        if (previous) return previous.getBoundingClientRect().bottom + 8 - (portTop + TOP_INSET);
        return rect.bottom - (portBottom - BOTTOM_GAP);
      }

      function align() {
        if (!current().isConnected) return;
        const found = port();
        const value = delta();
        if (found) {
          if (Math.abs(value) > 2) found.scrollTop += value;
          return;
        }
        try {
          current().scrollIntoView({ block: range ? 'start' : previousAnchor() ? 'start' : 'end', behavior: 'auto' });
        } catch (err) {
          try {
            current().scrollIntoView();
          } catch (inner) {
            /* nothing to do */
          }
        }
      }

      function stop(byUser) {
        if (finished) return;
        finished = true;
        if (timer) clearTimeout(timer);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('wheel', onUser, true);
        window.removeEventListener('touchstart', onUser, true);
        window.removeEventListener('keydown', onUser, true);
        window.removeEventListener('pointerdown', onUser, true);
        if (!byUser) {
          /* After the fast window keep a light watcher: switching window sizes
             reflows the transcript, so realign on the next resize. */
          clearRevealWatcher();
          revealWatcher = function () {
            if (!current().isConnected) {
              clearRevealWatcher();
              return;
            }
            if (!range) range = pickRange();
            align();
            if (range) paintRangeRects(range);
            const watchToken = highlightToken;
            setTimeout(function () {
              if (highlightToken === watchToken) store.clearHighlightRects();
            }, 2000);
          };
          window.addEventListener('resize', revealWatcher);
        } else {
          clearRevealWatcher();
        }
        /* Keep the highlight visible for a moment, then drop it. */
        setTimeout(function () {
          if (highlightToken === token) store.clearHighlightRects();
        }, 2500);
      }

      function onResize() {
        if (!finished) align();
      }

      function onUser() {
        /* Ignore the click that opened the session: only a gesture made after
           the jump has settled counts as deliberate. */
        if (Date.now() - started < 800) return;
        store.clearHighlightRects();
        stop(true);
      }

      function tick() {
        if (finished) return;
        if (!current().isConnected) {
          stop();
          return;
        }
        if (!range) range = pickRange();
        /* Align first, then paint, so the overlay never lags the scroll. */
        if (Math.abs(delta()) > 40) align();
        if (range) paintRangeRects(range);
        const elapsed = Date.now() - started;
        if (elapsed < 3000 || elapsed % 1000 < 130) {
        }
        if (elapsed > WINDOW_MS) {
          stop();
          return;
        }
        timer = setTimeout(tick, 120);
      }

      clearRevealWatcher();
      window.addEventListener('resize', onResize);
      window.addEventListener('wheel', onUser, true);
      window.addEventListener('touchstart', onUser, true);
      window.addEventListener('keydown', onUser, true);
      window.addEventListener('pointerdown', onUser, true);
      align();
      tick();
      return stop;
    }

    /* Older messages live outside the loaded window: page history through the
       anchor's sequence until its action row exists in the DOM. */
    function ensureAnchorLoaded(sessionId, messageId, seq, turn) {
      if (!messageId) return Promise.resolve(false);
      const started = Date.now();
      let pages = 0;
      const maxPages = 120;
      const maxMs = 25000;
      /* One loading indicator from the start; it clears when this resolves. */
      if (!document.querySelector('[data-dshfav-anchor="' + messageId + '"]')) {
        pagingBusy = true;
        store.showToast('正在向上加载历史…', true);
      }

      function sleep(ms) {
        return new Promise(function (resolve) {
          setTimeout(resolve, ms);
        });
      }

      async function step() {
        if (Date.now() - started > maxMs) {
          pagingBusy = false;
          return false;
        }
        if (document.querySelector('[data-dshfav-anchor="' + messageId + '"]')) {
          pagingBusy = false;
          return true;
        }
        if (typeof turn === 'number' && chatFlowItems('assistant-step', turn).length) {
          pagingBusy = false;
          return false;
        }
        if (pages < maxPages) {
          pages += 1;
          if (pages % 5 === 0) store.showToast('正在向上加载历史…（第 ' + pages + ' 页）', true);
          try {
            const sessions = clientCtx && typeof clientCtx.get === 'function' ? clientCtx.get('sessions') : undefined;
            const binding = sessions && typeof sessions.binding === 'function' ? sessions.binding(sessionId) : undefined;
            const session = binding && binding.session;
            if (session && typeof session.loadThrough === 'function' && typeof seq === 'number') {
              await session.loadThrough(seq);
            } else if (session && typeof session.loadOlder === 'function') {
              await session.loadOlder();
            }
          } catch (err) {
            /* a failed page just leaves the message unmounted */
          }
        }
        await sleep(150);
        return step();
      }

      return step();
    }

    /* ------------------------------------------------- per-message bookmark */

    let pendingExcerpt = null;

    function selectionText() {
      try {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
        const text = String(selection.toString() || '').replace(/\u00a0/g, ' ').trim();
        if (text.length < 2) return null;
        return { text: text, range: selection.getRangeAt(0) };
      } catch (err) {
        return null;
      }
    }

    function anchorElementFor(node, rect) {
      let element = node && node.nodeType === 3 ? node.parentElement : node;
      if (!element || element.nodeType !== 1) return null;
      for (let depth = 0; element && depth < 14; depth += 1) {
        if (typeof element.closest === 'function' && element.closest('[contenteditable="true"],input,textarea,select')) return null;
        const all = typeof element.querySelectorAll === 'function' ? element.querySelectorAll('[data-dshfav-anchor]') : null;
        if (all && all.length === 1) return all[0];
        if (all && all.length > 1) {
          if (!rect) return all[0];
          /* A selection near the top of a message is geometrically closer to
             the PREVIOUS message's action row. Prefer the first anchor at or
             below the selection, which is the row of the message that contains
             the text. */
          let below = null;
          let belowGap = Infinity;
          for (let i = 0; i < all.length; i += 1) {
            const box = all[i].getBoundingClientRect();
            if (box.top >= rect.top - 4) {
              const gap = box.top - rect.top;
              if (gap < belowGap) {
                belowGap = gap;
                below = all[i];
              }
            }
          }
          if (below) return below;
          let best = all[0];
          let bestDistance = Infinity;
          for (let i = 0; i < all.length; i += 1) {
            const box = all[i].getBoundingClientRect();
            const distance = Math.abs(box.top + box.height / 2 - (rect.top + rect.height / 2));
            if (distance < bestDistance) {
              bestDistance = distance;
              best = all[i];
            }
          }
          return best;
        }
        element = element.parentElement;
      }
      return null;
    }

    function readSelectionFor(messageId) {
      const found = selectionText();
      if (!found) return null;
      const rect = found.range.getBoundingClientRect();
      const anchor = anchorElementFor(found.range.commonAncestorContainer, rect);
      if (!anchor) return null;
      if (anchor.getAttribute('data-dshfav-anchor') !== messageId) return null;
      return { text: clampText(found.text, MAX_QUOTE), at: nowMs() };
    }

    function pillCandidate() {
      const found = selectionText();
      if (!found) return null;
      const rect = found.range.getBoundingClientRect();
      const anchor = anchorElementFor(found.range.commonAncestorContainer, rect);
      if (!anchor) return null;
      const messageId = anchor.getAttribute('data-dshfav-anchor') || '';
      const sessionId = anchor.getAttribute('data-dshfav-session') || '';
      if (!messageId || !sessionId) return null;
      const turnAttr = anchor.getAttribute('data-dshfav-turn');
      return {
        text: clampText(found.text, MAX_QUOTE),
        messageId: messageId,
        sessionId: sessionId,
        turn: turnAttr ? Number(turnAttr) : null,
        range: found.range,
      };
    }

    function pillPosition(range) {
      let rects;
      try {
        rects = range.getClientRects();
      } catch (err) {
        return null;
      }
      if (!rects || !rects.length) return null;
      const rect = rects[rects.length - 1];
      if (!rect || rect.width + rect.height === 0) return null;
      const width = 118;
      const height = 28;
      const viewWidth = window.innerWidth || 0;
      const viewHeight = window.innerHeight || 0;
      let left = Math.round(rect.right - width);
      left = Math.max(8, Math.min(left, viewWidth - width - 8));
      let top = Math.round(rect.bottom + 6);
      if (top + height > viewHeight - 8) top = Math.max(8, Math.round(rect.top - height - 6));
      return { left: left, top: top };
    }

    function MessageFavoriteButton(props) {
      const snapshot = useStore();
      const ref = useRef(null);
      const sessionId = props.sessionId;
      const messageId = props.messageId;
      const item = findMessageItem(snapshot.items, sessionId, messageId);
      const turn = messageId ? store.turnForMessage(sessionId, messageId) : null;
      const related = messageId ? itemsForAnchor(snapshot.items, sessionId, messageId, turn) : [];
      const marked = related.length > 0;
      const reveal = snapshot.reveal;

      useEffect(
        function () {
          if (!reveal || !ref.current) return undefined;
          if (reveal.sessionId !== sessionId) return undefined;
          if (!reveal.messageId || reveal.messageId !== messageId) return undefined;

          pulse(ref.current);
          /* The reveal stays active for its whole window: a re-render (window
             resize, fullscreen switch, history paging) replaces this anchor
             node, and the replacement instance must be able to re-align. */
          store.markRevealHandled(reveal.nonce);
          return revealIntoView(ref.current, { kind: reveal.kind, quote: reveal.quote, prompt: reveal.prompt, messageId: reveal.messageId, turn: reveal.turn });
        },
        [reveal, sessionId, messageId],
      );

      if (!messageId) return null;

      const label = item ? t('action.edit') : marked ? t('action.turn') : t('action.add');

      return h(
        'button',
        {
          ref: ref,
          type: 'button',
          className: cx('dshfav-action', marked && !item && 'is-turn', item && 'is-on'),
          title: label,
          'aria-label': label,
          'aria-pressed': item ? 'true' : 'false',
          'data-dshfav-anchor': messageId,
          'data-dshfav-session': sessionId,
          'data-dshfav-turn': typeof turn === 'number' ? String(turn) : '',
          onMouseDown: function () {
            pendingExcerpt = readSelectionFor(messageId);
          },
          onClick: function (event) {
            if (event) {
              event.preventDefault();
              event.stopPropagation();
            }
            const excerpt = pendingExcerpt;
            pendingExcerpt = null;
            if (excerpt && excerpt.text && nowMs() - excerpt.at < 6000) {
              store.openExcerptDraft({ sessionId: sessionId, messageId: messageId, text: excerpt.text });
              return;
            }
            if (related.length) {
              store.openList({ sessionId: sessionId, messageId: messageId, turn: turn });
              return;
            }
            store.openMessageEditor(sessionId, messageId);
          },
        },
        h(BookmarkIcon, { size: 15, filled: !!item || marked }),
      );
    }

    /* ------------------------------------------------------ sidebar + panel */

    function PanelIcon(props) {
      const active = !!props.active;
      return h(
        'span',
        { className: 'dshfav-panel-icon' },
        h(BookmarkIcon, { size: props.size || 18, filled: active }),
      );
    }

    function openFavorite(item) {
      if (!item || !item.sessionId) return;
      let navigated = false;
      if (clientCtx && typeof clientCtx.get === 'function') {
        const ui = clientCtx.get('uiWorkspace');
        if (ui && typeof ui.openSession === 'function') {
          try {
            ui.openSession(item.sessionId);
            navigated = true;
          } catch (err) {
            navigated = false;
          }
        }
        if (!navigated) {
          const layout = clientCtx.get('layout');
          if (layout && typeof layout.selectPanel === 'function') {
            try {
              layout.selectPanel('conversation');
            } catch (err) {
              /* ignore */
            }
          }
        }
      }
      store.requestReveal({
        sessionId: item.sessionId,
        messageId: item.messageId || null,
        seq: typeof item.seq === 'number' ? item.seq : null,
        turn: typeof item.turn === 'number' ? item.turn : null,
        kind: item.kind,
        prompt: item.prompt || '',
        quote: item.quote || '',
      });
      const itemTurn = typeof item.turn === 'number' ? item.turn : null;
      void ensureAnchorLoaded(item.sessionId, item.messageId || null, typeof item.seq === 'number' ? item.seq : null, itemTurn).then(
        function (mounted) {
          store.hideToast();
          if (mounted) return;
          /* The action row never mounts for a very old message: align by turn. */
          revealByTurn(itemTurn, item.kind);
        },
      );
    }

    function DeleteButton(props) {
      const [armed, setArmed] = useState(false);
      useEffect(
        function () {
          if (!armed) return undefined;
          const timer = setTimeout(function () {
            setArmed(false);
          }, 3200);
          return function () {
            clearTimeout(timer);
          };
        },
        [armed],
      );
      return h(
        'button',
        {
          type: 'button',
          className: 'dshfav-mini is-danger',
          onClick: function (event) {
            if (event) event.stopPropagation();
            if (armed) store.remove(props.id);
            else setArmed(true);
          },
        },
        armed ? t('panel.action.confirm') : t('panel.action.delete'),
      );
    }

    function findWorkspace(workspaces, id) {
      if (!Array.isArray(workspaces) || !id) return null;
      for (let i = 0; i < workspaces.length; i += 1) {
        if (workspaces[i] && workspaces[i].id === id) return workspaces[i];
      }
      return null;
    }

    function pathTail(value) {
      const text = String(value || '');
      const parts = text.split(/[\\/]+/).filter(Boolean);
      return parts.length ? parts[parts.length - 1] : '';
    }

    function byUpdatedDesc(a, b) {
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    }

    async function copyText(value) {
      try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          await navigator.clipboard.writeText(value);
          return true;
        }
      } catch (err) {
        /* fall through */
      }
      return false;
    }

    const EMPTY_MAP = {};

    function FavoriteCard(props) {
      const item = props.item;
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const isFile = item.kind === 'file';
      const hasPath = isFile && typeof item.path === 'string' && !!item.path;
      const span = lineSpan(item);
      const sessionLabel = props.sessionTitle || (item.sessionId ? shortSession(item.sessionId) : '');
      return h(
        'article',
        { className: cx('dshfav-card', props.focused && 'is-focus'), ref: props.registerRef },
        h(
          'div',
          { className: 'dshfav-card-head' },
          h('span', { className: 'dshfav-badge' }, kindLabel(item)),
          h(
            'span',
            { className: 'dshfav-card-title', title: item.title || '' },
            item.title || defaultTitle(item.kind, item.turn, item.quote || item.path),
          ),
          h('span', { className: 'dshfav-card-time' }, relativeTime(item.updatedAt)),
        ),
        hasPath
          ? h('code', { className: 'dshfav-path', title: item.path || '' }, (item.path || '') + (span ? '  ·  ' + span : ''))
          : item.quote
            ? h('p', { className: 'dshfav-quote' }, item.quote)
            : null,
        item.note ? h('p', { className: 'dshfav-note' }, item.note) : null,
        h(
          'div',
          { className: 'dshfav-meta' },
          hasPath && span ? h('span', null, span) : h('span', null, turnLabel(item)),
          sessionLabel
            ? h('span', { className: 'dshfav-dot' }, '·')
            : null,
          sessionLabel
            ? h('span', { className: 'dshfav-session', title: sessionLabel }, clip(sessionLabel, 36))
            : null,
          tags.length
            ? h(
                'span',
                { className: 'dshfav-tags' },
                tags.map(function (tag) {
                  return h(
                    'button',
                    {
                      type: 'button',
                      key: tag,
                      className: 'dshfav-tag',
                      title: t('panel.tag.clear'),
                      onClick: function () {
                        props.onTag(tag);
                      },
                    },
                    '#' + tag,
                  );
                }),
              )
            : null,
          h(
            'span',
            { className: 'dshfav-row-actions' },
            item.messageId
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshfav-mini',
                    onClick: function () {
                      openFavorite(item);
                    },
                  },
                  t('panel.action.open'),
                )
              : null,
            hasPath
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshfav-mini',
                    onClick: function () {
                      store.openPreview(item);
                    },
                  },
                  t('panel.action.preview'),
                )
              : null,
            hasPath
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'dshfav-mini',
                    onClick: function () {
                      void copyText(item.path || '').then(function (ok) {
                        store.showToast(ok ? t('panel.action.copied') : t('toast.copyFailed'));
                      });
                    },
                  },
                  t('panel.action.copyPath'),
                )
              : null,
            h(
              'button',
              {
                type: 'button',
                className: 'dshfav-mini',
                onClick: function () {
                  if (hasPath) store.openFileForm(item);
                  else store.openEditor({ mode: 'edit', item: item });
                },
              },
              t('panel.action.edit'),
            ),
            h(DeleteButton, { id: item.id }),
          ),
        ),
      );
    }

    function FavoritesPanel(props) {
      const snapshot = useStore();
      const importRef = useRef(null);
      const [query, setQuery] = useState('');
      const [tag, setTag] = useState(null);
      const [kind, setKind] = useState('all');
      const items = snapshot.items;
      const workspaces = snapshot.workspaces;
      const sessionFilter = snapshot.sessionFilter;
      const workspaceFilter = snapshot.workspaceFilter;
      const useSessions = props.useSessions;
      const byId = useSessions(function (state) {
        return (state && state.byId) || EMPTY_MAP;
      });
      const cardRefs = useRef(new Map());
      /* Workspace groups start collapsed; a filter opens them automatically. */
      const [expandedGroups, setExpandedGroups] = useState({});

      function sessionTitleOf(sessionId) {
        if (!sessionId) return '';
        const summary = byId[sessionId];
        if (!summary || typeof summary !== 'object') return '';
        const title = summary.title || summary.name || '';
        return typeof title === 'string' ? title : '';
      }

      useEffect(
        function () {
          const focus = snapshot.focus;
          if (!focus) return undefined;
          let attempt = 0;
          let timer = 0;
          function reveal() {
            const node = cardRefs.current.get(focus.id);
            if (!node) {
              attempt += 1;
              if (attempt < 4) timer = setTimeout(reveal, 180);
              return;
            }
            scrollTo(node);
            pulse(node);
          }
          reveal();
          return function () {
            if (timer) clearTimeout(timer);
          };
        },
        [snapshot.focus],
      );

      const tagCounts = useMemo(
        function () {
          const counts = new Map();
          for (let i = 0; i < items.length; i += 1) {
            const tags = Array.isArray(items[i].tags) ? items[i].tags : [];
            for (let j = 0; j < tags.length; j += 1) {
              counts.set(tags[j], (counts.get(tags[j]) || 0) + 1);
            }
          }
          return Array.from(counts.entries()).sort(function (a, b) {
            return b[1] - a[1] || a[0].localeCompare(b[0]);
          });
        },
        [items],
      );

      const visible = useMemo(
        function () {
          const q = query.trim().toLowerCase();
          const filtered = items.filter(function (item) {
            if (kind !== 'all' && item.kind !== kind) return false;
            if (tag) {
              const tags = Array.isArray(item.tags) ? item.tags : [];
              if (tags.indexOf(tag) < 0) return false;
            }
            if (sessionFilter && item.sessionId !== sessionFilter) return false;
            if (workspaceFilter && (item.workspaceId || '__none') !== workspaceFilter) return false;
            if (!q) return true;
            const hay = [item.title || '', item.quote || '', item.note || '', item.sessionId || '', item.path || '']
              .concat(Array.isArray(item.tags) ? item.tags : [])
              .join('\n')
              .toLowerCase();
            return hay.indexOf(q) >= 0;
          });
          return filtered.sort(byUpdatedDesc);
        },
        [items, query, tag, kind, sessionFilter, workspaceFilter],
      );

      const groups = useMemo(
        function () {
          const byKey = new Map();
          for (let i = 0; i < visible.length; i += 1) {
            const item = visible[i];
            const key = item.workspaceId || '__none';
            if (!byKey.has(key)) byKey.set(key, { key: key, items: [] });
            byKey.get(key).items.push(item);
          }
          const list = Array.from(byKey.values()).sort(function (a, b) {
            if (a.key === '__none') return 1;
            if (b.key === '__none') return -1;
            return 0;
          });
          for (let i = 0; i < list.length; i += 1) {
            const group = list[i];
            const sample = group.items[0] || {};
            const live = group.key === '__none' ? null : findWorkspace(workspaces, group.key);
            const livePath = (live && live.path) || sample.workspacePath || '';
            group.title =
              group.key === '__none'
                ? t('panel.group.none')
                : (live && live.title) || sample.workspaceTitle || pathTail(livePath) || t('panel.group.none');
            group.path = group.key === '__none' ? '' : livePath;
          }
          return list;
        },
        [visible, workspaces],
      );

      const segment = [
        { key: 'all', label: t('panel.filter.all') },
        { key: 'message', label: t('panel.kind.message') },
        { key: 'turn', label: t('panel.kind.turn') },
        { key: 'excerpt', label: t('panel.kind.excerpt') },
        { key: 'file', label: t('panel.kind.file') },
      ];

      return h(
        'div',
        { className: 'dshfav-panel' },
        h(StyleTag, null),
        h(
          'div',
          { className: 'dshfav-inner' },
          h(
            'div',
            { className: 'dshfav-head' },
            h(BookmarkIcon, { size: 18, filled: true }),
            h('h1', { className: 'dshfav-head-title' }, t('panel.title')),
          ),
          h('p', { className: 'dshfav-sub' }, t('panel.subtitle', { n: items.length, t: tagCounts.length })),
          h(
            'div',
            { className: 'dshfav-toolbar' },
            h('input', {
              className: 'dshfav-search',
              type: 'search',
              value: query,
              placeholder: t('panel.search'),
              'aria-label': t('panel.search'),
              onChange: function (event) {
                setQuery(event.target.value);
              },
            }),
            h(
              'div',
              { className: 'dshfav-seg', role: 'group' },
              segment.map(function (entry) {
                return h(
                  'button',
                  {
                    key: entry.key,
                    type: 'button',
                    className: cx(kind === entry.key && 'is-on'),
                    onClick: function () {
                      setKind(entry.key);
                    },
                  },
                  entry.label,
                );
              }),
            ),
            h(
              'div',
              { className: 'dshfav-actions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshfav-btn is-primary',
                  onClick: function () {
                    store.openFileForm(null);
                  },
                },
                h(ToolbarIcon, { name: 'plus' }),
                t('panel.addFile'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshfav-btn',
                  onClick: function () {
                    void store.exportFavorites();
                  },
                },
                h(ToolbarIcon, { name: 'download' }),
                t('panel.export'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'dshfav-btn',
                  onClick: function () {
                    if (importRef.current) importRef.current.click();
                  },
                },
                h(ToolbarIcon, { name: 'upload' }),
                t('panel.import'),
              ),
              h('input', {
                ref: importRef,
                type: 'file',
                accept: 'application/json,.json',
                style: { display: 'none' },
                onChange: function (event) {
                  const file = event.target.files && event.target.files[0];
                  event.target.value = '';
                  if (file) void store.importFavorites(file);
                },
              }),
            ),
          ),
          sessionFilter || workspaceFilter
            ? h(
                'div',
                { className: 'dshfav-chiprow' },
                sessionFilter
                  ? h(
                      'button',
                      {
                        key: 'session',
                        type: 'button',
                        className: 'dshfav-chip is-on',
                        onClick: function () {
                          store.setSessionFilter(null);
                        },
                      },
                      t('panel.filter.session') + ' ✕',
                    )
                  : null,
                workspaceFilter
                  ? h(
                      'button',
                      {
                        key: 'workspace',
                        type: 'button',
                        className: 'dshfav-chip is-on',
                        onClick: function () {
                          store.setWorkspaceFilter(null);
                        },
                      },
                      ((findWorkspace(workspaces, workspaceFilter) || {}).title || pathTail(workspaceFilter) || t('panel.group.none')) + ' ✕',
                    )
                  : null,
              )
            : null,
          tagCounts.length
            ? h(
                'div',
                { className: 'dshfav-chiprow' },
                tagCounts.map(function (entry) {
                  const name = entry[0];
                  return h(
                    'button',
                    {
                      key: name,
                      type: 'button',
                      className: cx('dshfav-chip', tag === name && 'is-on'),
                      onClick: function () {
                        setTag(tag === name ? null : name);
                      },
                    },
                    '#' + name + ' ' + entry[1],
                  );
                }),
              )
            : null,
          visible.length
            ? groups.map(function (group) {
                const forceOpen = Boolean(query.trim() || tag || kind !== 'all' || sessionFilter || workspaceFilter);
                const isCollapsed = !forceOpen && !expandedGroups[group.key];
                return h(
                  'section',
                  { key: group.key },
                  groups.length > 1 || group.key !== '__none'
                    ? h(
                        'div',
                        { className: 'dshfav-group' },
                        h(
                          'button',
                          {
                            type: 'button',
                            className: 'dshfav-group-btn',
                            'aria-expanded': isCollapsed ? 'false' : 'true',
                            onClick: function () {
                              setExpandedGroups(function (prev) {
                                const next = Object.assign({}, prev);
                                next[group.key] = !next[group.key];
                                return next;
                              });
                            },
                          },
                          h(
                            'span',
                            { className: cx('dshfav-group-caret', !isCollapsed && 'is-open') },
                            h(
                              'svg',
                              { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': 'true', focusable: 'false', fill: 'currentColor' },
                              h('path', { d: 'M4 2.4 8.6 6 4 9.6z' }),
                            ),
                          ),
                          h('span', { className: 'dshfav-group-title' }, group.title),
                          group.path ? h('span', { className: 'dshfav-group-path' }, group.path) : null,
                          h('span', { className: 'dshfav-group-count' }, t('panel.groupCount', { n: group.items.length })),
                        ),
                      )
                    : null,
                  isCollapsed
                    ? null
                    : group.items.map(function (item) {
                    return h(FavoriteCard, {
                      key: item.id,
                      item: item,
                      sessionTitle: sessionTitleOf(item.sessionId),
                      focused: !!(snapshot.focus && snapshot.focus.id === item.id),
                      registerRef: function (node) {
                        if (node) cardRefs.current.set(item.id, node);
                        else cardRefs.current.delete(item.id);
                      },
                      onTag: function (name) {
                        setTag(tag === name ? null : name);
                      },
                    });
                  }),
                );
              })
            : h(
                'div',
                { className: 'dshfav-empty' },
                h('strong', null, items.length ? t('panel.empty.filtered') : t('panel.empty.title')),
                items.length ? null : h('p', null, t('panel.empty.body')),
              ),
          h('p', { className: 'dshfav-footer' }, snapshot.source === 'host' ? t('panel.footer') : t('panel.footer.local')),
        ),
      );
    }

    /* -------------------------------------------------------------- editor */

    function TagPicker(props) {
      const snapshot = useStore();
      const items = Array.isArray(snapshot.items) ? snapshot.items : [];
      const counts = new Map();
      for (let i = 0; i < items.length; i += 1) {
        const tags = Array.isArray(items[i].tags) ? items[i].tags : [];
        for (let j = 0; j < tags.length; j += 1) counts.set(tags[j], (counts.get(tags[j]) || 0) + 1);
      }
      if (!counts.size) return null;
      const known = Array.from(counts.entries())
        .sort(function (a, b) {
          return b[1] - a[1] || String(a[0]).localeCompare(String(b[0]));
        })
        .map(function (entry) {
          return entry[0];
        })
        .slice(0, 40);
      const current = normalizeTags(props.value);
      return h(
        'div',
        { className: 'dshfav-chiprow dshfav-tagpicker' },
        known.map(function (tag) {
          const on = current.indexOf(tag) >= 0;
          return h(
            'button',
            {
              key: tag,
              type: 'button',
              className: cx('dshfav-chip', on && 'is-on'),
              onClick: function (event) {
                if (event) {
                  event.preventDefault();
                  event.stopPropagation();
                }
                const next = on
                  ? current.filter(function (other) {
                      return other !== tag;
                    })
                  : current.concat([tag]);
                props.onChange(next.join(', '));
              },
            },
            '#' + tag,
          );
        }),
      );
    }

    function EditorDialog(props) {
      const draft = props.draft;
      const item = draft.item;
      const editing = draft.mode === 'edit';
      const variants = draft.variants || {};
      const initialScope = draft.scope || item.kind || 'message';
      const [scope, setScope] = useState(initialScope);
      const [title, setTitle] = useState(item.title || '');
      const [titleTouched, setTitleTouched] = useState(false);
      const [tagsText, setTagsText] = useState((Array.isArray(item.tags) ? item.tags : []).join(', '));
      const [note, setNote] = useState(item.note || '');
      const titleRef = useRef(null);

      useEffect(
        function () {
          if (titleRef.current && typeof titleRef.current.focus === 'function') {
            titleRef.current.focus();
            if (typeof titleRef.current.select === 'function') titleRef.current.select();
          }
        },
        [],
      );

      const scopeTurn = typeof draft.turn === 'number' ? draft.turn : typeof item.turn === 'number' ? item.turn : null;
      const scopeOptions = ['message', 'turn'].concat(variants.excerpt ? ['excerpt', 'file'] : []);
      const activeVariant = variants[scope];
      const quoteText = (activeVariant && activeVariant.quote) || (editing ? item.quote || '' : '');

      function chooseScope(next) {
        if (editing || next === scope) return;
        setScope(next);
        if (!titleTouched) {
          const variant = variants[next];
          setTitle(variant ? variant.title : '');
        }
      }

      function save() {
        const variant = variants[scope];
        const quote = (variant && variant.quote) || item.quote || '';
        const next = Object.assign({}, item, {
          kind: scope,
          quote: quote,
          prompt: (draft && draft.promptText) || item.prompt || null,
          seq: typeof draft.seq === 'number' ? draft.seq : null,
          turn: typeof scopeTurn === 'number' ? scopeTurn : null,
          title: clampText(title, MAX_TITLE) || defaultTitle(scope, scopeTurn, quote),
          tags: normalizeTags(tagsText),
          note: clampText(note, MAX_NOTE),
          updatedAt: nowMs(),
        });
        store.upsert(next);
        store.showToast(t('toast.saved'));
      }

      return h(
        'div',
        {
          className: 'dshfav-backdrop',
          onMouseDown: function (event) {
            if (event && event.target === event.currentTarget) store.closeEditor();
          },
        },
        h(
          'div',
          { className: 'dshfav-dialog', role: 'dialog', 'aria-modal': 'true' },
          h(
            'h2',
            { className: 'dshfav-dialog-title' },
            h(BookmarkIcon, { size: 15, filled: true }),
            editing ? t('editor.editTitle') : t('editor.addTitle'),
          ),
          !editing && scopeOptions.length > 1
            ? h(
                'div',
                { className: 'dshfav-scope' },
                h('span', { className: 'dshfav-scope-label' }, t('editor.scope')),
                h(
                  'div',
                  { className: 'dshfav-seg-track', role: 'group', 'aria-label': t('editor.scope') },
                  scopeOptions.map(function (key) {
                    return h(
                      'button',
                      {
                        key: key,
                        type: 'button',
                        className: cx('dshfav-scope-btn', scope === key && 'is-on'),
                        'aria-pressed': scope === key ? 'true' : 'false',
                        onClick: function () {
                          chooseScope(key);
                        },
                      },
                      t('editor.scope.' + key),
                    );
                  }),
                ),
              )
            : null,
          h(
            'label',
            { className: 'dshfav-field' },
            h('span', { className: 'dshfav-field-label' }, t('editor.field.title')),
            h('input', {
              ref: titleRef,
              className: 'dshfav-input',
              type: 'text',
              value: title,
              placeholder: t('editor.field.titlePlaceholder'),
              onChange: function (event) {
                setTitleTouched(true);
                setTitle(event.target.value);
              },
            }),
          ),
          h(
            'label',
            { className: 'dshfav-field' },
            h('span', { className: 'dshfav-field-label' }, t('editor.field.tags')),
            h('input', {
              className: 'dshfav-input',
              type: 'text',
              value: tagsText,
              placeholder: t('editor.field.tagsPlaceholder'),
              onChange: function (event) {
                setTagsText(event.target.value);
              },
            }),
            h(TagPicker, { value: tagsText, onChange: setTagsText }),
          ),
          h(
            'label',
            { className: 'dshfav-field' },
            h('span', { className: 'dshfav-field-label' }, t('editor.field.note')),
            h('textarea', {
              className: 'dshfav-textarea',
              rows: 3,
              value: note,
              placeholder: t('editor.field.notePlaceholder'),
              onChange: function (event) {
                setNote(event.target.value);
              },
            }),
          ),
          quoteText
            ? h(
                'div',
                { className: 'dshfav-readonly' },
                h(
                  'p',
                  { className: 'dshfav-readonly-label' },
                  t('editor.quote') +
                    ' · ' +
                    t('editor.scope.' + scope) +
                    (typeof scopeTurn === 'number' ? ' · ' + t('meta.turn', { n: scopeTurn }) : ''),
                ),
                h('p', { className: 'dshfav-readonly-text' }, quoteText),
              )
            : null,
          h(
            'div',
            { className: 'dshfav-dialog-foot' },
            h('span', { className: 'dshfav-hint' }, t('editor.hint')),
            h(
              'button',
              {
                type: 'button',
                className: 'dshfav-btn',
                onClick: function () {
                  store.closeEditor();
                },
              },
              t('editor.cancel'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dshfav-btn is-primary',
                onClick: save,
              },
              t('editor.save'),
            ),
          ),
        ),
      );
    }

    function EditorOverlay(props) {
      const snapshot = useStore();

      const editor = snapshot.editor;
      const panelModal = snapshot.panelModal;
      const toast = snapshot.toast;
      const pill = snapshot.pill;
      const highlight = snapshot.highlight;
      const rangeRef = useRef(null);

      /* Selection → floating excerpt pill. The transcript is not ours, so the
         pill only appears when the selection sits inside a subtree that owns
         one of our own anchor buttons. */
      useEffect(function () {
        let timer = 0;
        let frame = 0;

        function update() {
          const current = store.getSnapshot();
          if (current.editor || current.panelModal) {
            rangeRef.current = null;
            store.clearPill();
            return;
          }
          const found = pillCandidate();
          if (!found) {
            rangeRef.current = null;
            store.clearPill();
            return;
          }
          const position = pillPosition(found.range);
          if (!position) {
            rangeRef.current = null;
            store.clearPill();
            return;
          }
          rangeRef.current = found.range;
          store.setPill({
            text: found.text,
            messageId: found.messageId,
            sessionId: found.sessionId,
            turn: found.turn,
            left: position.left,
            top: position.top,
          });
        }

        function schedule(delay) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(function () {
            timer = 0;
            update();
          }, delay);
        }

        function onSelectionChange() {
          schedule(90);
        }

        function onScroll() {
          const range = rangeRef.current;
          if (!range || frame) return;
          frame = window.requestAnimationFrame(function () {
            frame = 0;
            const position = pillPosition(range);
            const current = store.getSnapshot().pill;
            if (!position || !current) {
              rangeRef.current = null;
              store.clearPill();
              return;
            }
            store.setPill({
              text: current.text,
              messageId: current.messageId,
              sessionId: current.sessionId,
              turn: current.turn,
              left: position.left,
              top: position.top,
            });
          });
        }

        function onPointerDown(event) {
          const target = event && event.target;
          if (target && typeof target.closest === 'function' && target.closest('[data-dshfav-pill]')) return;
          rangeRef.current = null;
          store.clearPill();
        }

        function onKeyDown(event) {
          if (!event || event.key !== 'Escape') return;
          rangeRef.current = null;
          store.clearPill();
        }

        document.addEventListener('selectionchange', onSelectionChange);
        document.addEventListener('pointerdown', onPointerDown, true);
        window.addEventListener('scroll', onScroll, true);
        window.addEventListener('resize', onScroll);
        window.addEventListener('keydown', onKeyDown);

        return function () {
          if (timer) clearTimeout(timer);
          if (frame) window.cancelAnimationFrame(frame);
          document.removeEventListener('selectionchange', onSelectionChange);
          document.removeEventListener('pointerdown', onPointerDown, true);
          window.removeEventListener('scroll', onScroll, true);
          window.removeEventListener('resize', onScroll);
          window.removeEventListener('keydown', onKeyDown);
        };
      }, []);

      useEffect(
        function () {
          if (!editor && !panelModal) return undefined;
          function onKey(event) {
            if (!event) return;
            if (event.key === 'Escape') {
              if (typeof event.stopPropagation === 'function') event.stopPropagation();
              if (editor) store.closeEditor();
              if (panelModal) store.closePanelModal();
            }
          }
          window.addEventListener('keydown', onKey, true);
          return function () {
            window.removeEventListener('keydown', onKey, true);
          };
        },
        [editor, panelModal],
      );

      return h(
        Fragment,
        null,
        h(StyleTag, { key: 'style' }),
        highlight && highlight.rects && highlight.rects.length
          ? highlight.rects.map(function (rect, index) {
              return h('div', {
                key: 'hl-' + index,
                className: 'dshfav-hl',
                style: { left: rect.left + 'px', top: rect.top + 'px', width: rect.width + 'px', height: rect.height + 'px' },
              });
            })
          : null,
        pill
          ? h(
              'button',
              {
                key: 'pill',
                type: 'button',
                className: 'dshfav-pill',
                'data-dshfav-pill': '1',
                style: { left: pill.left + 'px', top: pill.top + 'px' },
                title: t('pill.title'),
                onMouseDown: function (event) {
                  if (event) event.preventDefault();
                },
                onClick: function (event) {
                  if (event) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                  rangeRef.current = null;
                  store.clearPill();
                  try {
                    const selection = window.getSelection();
                    if (selection) selection.removeAllRanges();
                  } catch (err) {
                    /* ignore */
                  }
                  store.openExcerptDraft({
                    sessionId: pill.sessionId,
                    messageId: pill.messageId,
                    text: pill.text,
                  });
                },
              },
              h(BookmarkIcon, { size: 12 }),
              h('span', null, t('pill.label')),
            )
          : null,
        editor ? h(EditorDialog, { key: editor.item.id, draft: editor }) : null,
        panelModal && panelModal.kind === 'list'
          ? h(FavoriteListDialog, { key: 'list', modal: panelModal, useSessions: props.useSessions })
          : null,
        panelModal && panelModal.kind === 'fileForm' ? h(FileFormDialog, { key: 'file-form', modal: panelModal }) : null,
        panelModal && panelModal.kind === 'preview' ? h(FilePreviewDialog, { key: 'preview', item: panelModal.item }) : null,
        toast ? h('div', { key: 'toast', className: 'dshfav-toast', role: 'status' }, toast) : null,
      );
    }

    /* ------------------------------------------------------------ modals */

    function closeOnBackdrop(event) {
      if (event && event.target === event.currentTarget) store.closePanelModal();
    }

    function sessionTitleOfMap(map, sessionId) {
      if (!sessionId || !map) return '';
      const summary = map[sessionId];
      if (!summary || typeof summary !== 'object') return '';
      const title = summary.title || summary.name || '';
      return typeof title === 'string' ? title : '';
    }

    function FavoriteListDialog(props) {
      const modal = props.modal;
      const snapshot = useStore();
      const useSessions = props.useSessions;
      const byId = useSessions(function (state) {
        return (state && state.byId) || EMPTY_MAP;
      });
      const related = itemsForAnchor(snapshot.items, modal.sessionId, modal.messageId, modal.turn).sort(byUpdatedDesc);

      function jump(item) {
        store.focusItem(item.id);
        try {
          if (clientCtx && typeof clientCtx.get === 'function') {
            const layout = clientCtx.get('layout');
            if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(PANEL_KEY);
          }
        } catch (err) {
          /* the panel may already be the active one */
        }
      }

      return h(
        'div',
        { className: 'dshfav-backdrop', onMouseDown: closeOnBackdrop },
        h(
          'div',
          { className: 'dshfav-dialog', role: 'dialog', 'aria-modal': 'true' },
          h(
            'h2',
            { className: 'dshfav-dialog-title' },
            h(BookmarkIcon, { size: 15, filled: true }),
            modal.turn !== null
              ? t('list.titleTurn', { n: related.length })
              : t('list.titleMessage', { n: related.length }),
          ),
          related.length
            ? h(
                'div',
                { className: 'dshfav-rows' },
                related.map(function (item) {
                  const sessionTitle = sessionTitleOfMap(byId, item.sessionId);
                  return h(
                    'button',
                    {
                      key: item.id,
                      type: 'button',
                      className: 'dshfav-row',
                      title: t('panel.action.open'),
                      onClick: function () {
                        jump(item);
                      },
                    },
                    h(
                      'span',
                      { className: 'dshfav-row-head' },
                      h('span', { className: 'dshfav-badge' }, kindLabel(item)),
                      h(
                        'span',
                        { className: 'dshfav-row-title' },
                        item.title || defaultTitle(item.kind, item.turn, item.quote),
                      ),
                      h('span', { className: 'dshfav-card-time' }, relativeTime(item.updatedAt)),
                    ),
                    item.quote ? h('span', { className: 'dshfav-row-quote' }, clip(item.quote, 140)) : null,
                    sessionTitle ? h('span', { className: 'dshfav-row-quote' }, sessionTitle) : null,
                  );
                }),
              )
            : h('p', { className: 'dshfav-inline-note' }, t('list.empty')),
          h(
            'div',
            { className: 'dshfav-modal-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dshfav-btn',
                onClick: function () {
                  store.closePanelModal();
                },
              },
              t('editor.cancel'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dshfav-btn is-primary',
                onClick: function () {
                  const sessionId = modal.sessionId;
                  const messageId = modal.messageId;
                  store.closePanelModal();
                  store.openMessageEditor(sessionId, messageId, { forceNew: true });
                },
              },
              t('list.add'),
            ),
          ),
        ),
      );
    }

    function FileFormDialog(props) {
      const modal = props.modal;
      const item = modal.item;
      const seed = modal.seed || null;
      const editing = !!item;
      const seedPath = seed && typeof seed.path === 'string' ? seed.path : '';
      const seedLine = seed && typeof seed.line === 'number' && seed.line > 0 ? seed.line : null;
      const seedSession = seed && typeof seed.sessionId === 'string' ? seed.sessionId : null;
      const [pathValue, setPathValue] = useState(item && item.path ? item.path : seedPath);
      const [title, setTitle] = useState(item ? item.title || '' : '');
      const [tagsText, setTagsText] = useState(item && Array.isArray(item.tags) ? item.tags.join(', ') : '');
      const [note, setNote] = useState(item ? item.note || '' : '');
      const [from, setFrom] = useState(item && item.lineStart ? String(item.lineStart) : seedLine ? String(seedLine) : '');
      const [to, setTo] = useState(item && item.lineEnd ? String(item.lineEnd) : '');
      const pathRef = useRef(null);

      useEffect(
        function () {
          if (pathRef.current && typeof pathRef.current.focus === 'function') pathRef.current.focus();
        },
        [],
      );

      function save() {
        const filePath = pathValue.trim();
        if (!filePath) {
          store.showToast(t('file.field.path'));
          return;
        }
        const parsedStart = parseInt(from, 10);
        const parsedEnd = parseInt(to, 10);
        const start = Number.isFinite(parsedStart) ? parsedStart : Number.isFinite(parsedEnd) ? parsedEnd : null;
        const end = Number.isFinite(parsedEnd) ? parsedEnd : null;
        const base = item || { id: uid(), createdAt: nowMs() };
        const next = Object.assign({}, base, {
          kind: 'file',
          path: filePath,
          sessionId: item ? item.sessionId || null : seedSession,
          messageId: null,
          seq: null,
          turn: null,
          lineStart: start,
          lineEnd: end,
          title: clampText(title, MAX_TITLE) || pathTail(filePath) || filePath,
          quote: item ? item.quote || '' : '',
          note: clampText(note, MAX_NOTE),
          tags: normalizeTags(tagsText),
          updatedAt: nowMs(),
        });
        store.closePanelModal();
        store.upsert(next);
        store.showToast(t('toast.saved'));
        const settle = function (facts) {
          if (!facts || (!facts.workspaceId && !facts.workspacePath && !facts.cwd)) return false;
          store.patchWorkspace(next.id, facts);
          return true;
        };
        const bySession = next.sessionId ? store.factsFor(next.sessionId) : Promise.resolve(null);
        void bySession.then(function (facts) {
          if (settle(facts)) return;
          void store.factsForPath(filePath).then(settle);
        });
      }

      return h(
        'div',
        { className: 'dshfav-backdrop', onMouseDown: closeOnBackdrop },
        h(
          'div',
          { className: 'dshfav-dialog', role: 'dialog', 'aria-modal': 'true' },
          h(
            'h2',
            { className: 'dshfav-dialog-title' },
            h(BookmarkIcon, { size: 15, filled: true }),
            editing ? t('file.titleEdit') : t('file.titleNew'),
          ),
          h(
            'label',
            { className: 'dshfav-field' },
            h('span', { className: 'dshfav-field-label' }, t('file.field.path')),
            h('input', {
              ref: pathRef,
              className: 'dshfav-input',
              type: 'text',
              value: pathValue,
              placeholder: t('file.field.pathPlaceholder'),
              onChange: function (event) {
                setPathValue(event.target.value);
              },
            }),
          ),
          h(
            'div',
            { className: 'dshfav-scope' },
            h('span', { className: 'dshfav-scope-label' }, t('file.field.lines')),
            h('input', {
              className: 'dshfav-input',
              style: { width: '88px', flex: '0 0 88px' },
              type: 'number',
              min: 1,
              value: from,
              placeholder: t('file.field.from'),
              onChange: function (event) {
                setFrom(event.target.value);
              },
            }),
            h('input', {
              className: 'dshfav-input',
              style: { width: '88px', flex: '0 0 88px' },
              type: 'number',
              min: 1,
              value: to,
              placeholder: t('file.field.to'),
              onChange: function (event) {
                setTo(event.target.value);
              },
            }),
          ),
          h(
            'label',
            { className: 'dshfav-field' },
            h('span', { className: 'dshfav-field-label' }, t('editor.field.title')),
            h('input', {
              className: 'dshfav-input',
              type: 'text',
              value: title,
              placeholder: t('editor.field.titlePlaceholder'),
              onChange: function (event) {
                setTitle(event.target.value);
              },
            }),
          ),
          h(
            'label',
            { className: 'dshfav-field' },
            h('span', { className: 'dshfav-field-label' }, t('editor.field.tags')),
            h('input', {
              className: 'dshfav-input',
              type: 'text',
              value: tagsText,
              placeholder: t('editor.field.tagsPlaceholder'),
              onChange: function (event) {
                setTagsText(event.target.value);
              },
            }),
            h(TagPicker, { value: tagsText, onChange: setTagsText }),
          ),
          h(
            'label',
            { className: 'dshfav-field' },
            h('span', { className: 'dshfav-field-label' }, t('editor.field.note')),
            h('textarea', {
              className: 'dshfav-textarea',
              rows: 3,
              value: note,
              placeholder: t('editor.field.notePlaceholder'),
              onChange: function (event) {
                setNote(event.target.value);
              },
            }),
          ),
          h(
            'div',
            { className: 'dshfav-modal-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dshfav-btn',
                onClick: function () {
                  store.closePanelModal();
                },
              },
              t('editor.cancel'),
            ),
            h('button', { type: 'button', className: 'dshfav-btn is-primary', onClick: save }, t('file.save')),
          ),
        ),
      );
    }

    function FilePreviewDialog(props) {
      const item = props.item;
      const [state, setState] = useState({ status: 'loading', text: '', truncated: false, error: '' });

      useEffect(
        function () {
          let alive = true;
          setState({ status: 'loading', text: '', truncated: false, error: '' });
          hostJson('/file?id=' + encodeURIComponent(item.id))
            .then(function (data) {
              if (!alive) return;
              setState({
                status: 'ready',
                text: String((data && data.text) || ''),
                truncated: !!(data && data.truncated),
                error: '',
              });
            })
            .catch(function () {
              if (alive) setState({ status: 'error', text: '', truncated: false, error: t('preview.failed') });
            });
          return function () {
            alive = false;
          };
        },
        [item.id],
      );

      const lines = useMemo(
        function () {
          return state.text ? state.text.split('\n') : [];
        },
        [state.text],
      );

      const start = typeof item.lineStart === 'number' ? item.lineStart : null;
      const end = typeof item.lineEnd === 'number' ? item.lineEnd : start;

      const shown = useMemo(
        function () {
          const out = [];
          if (!lines.length) return out;
          const limit = 1200;
          let from = 0;
          if (start && lines.length > limit) from = Math.max(0, start - 1 - Math.floor(limit / 3));
          const to = Math.min(lines.length, from + limit);
          for (let index = from; index < to; index += 1) out.push(index);
          return out;
        },
        [lines, start],
      );

      return h(
        'div',
        { className: 'dshfav-backdrop', onMouseDown: closeOnBackdrop },
        h(
          'div',
          { className: 'dshfav-dialog', role: 'dialog', 'aria-modal': 'true' },
          h(
            'h2',
            { className: 'dshfav-dialog-title' },
            h(BookmarkIcon, { size: 15, filled: true }),
            clip(item.title || pathTail(item.path), 64),
          ),
          h('code', { className: 'dshfav-path' }, (item.path || '') + (lineSpan(item) ? '  ·  ' + lineSpan(item) : '')),
          state.status === 'loading' ? h('p', { className: 'dshfav-inline-note' }, t('preview.loading')) : null,
          state.status === 'error' ? h('p', { className: 'dshfav-inline-note' }, state.error) : null,
          state.status === 'ready' && shown.length
            ? h(
                'div',
                { className: 'dshfav-preview' },
                shown.map(function (index) {
                  const number = index + 1;
                  const hit = start !== null && number >= start && number <= (end || start);
                  return h(
                    'div',
                    { key: number, className: cx('dshfav-line', hit && 'is-hit') },
                    h('span', { className: 'dshfav-line-no' }, String(number)),
                    h('span', { className: 'dshfav-line-text' }, lines[index] === '' ? ' ' : lines[index]),
                  );
                }),
              )
            : null,
          state.truncated ? h('p', { className: 'dshfav-inline-note' }, t('preview.truncated')) : null,
          h(
            'div',
            { className: 'dshfav-modal-actions' },
            h(
              'button',
              {
                type: 'button',
                className: 'dshfav-btn',
                onClick: function () {
                  void copyText(item.path || '').then(function (ok) {
                    store.showToast(ok ? t('panel.action.copied') : t('toast.copyFailed'));
                  });
                },
              },
              t('panel.action.copyPath'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dshfav-btn is-primary',
                onClick: function () {
                  store.closePanelModal();
                },
              },
              t('preview.close'),
            ),
          ),
        ),
      );
    }

    /* -------------------------------------------------- session header chip */

    function SessionFavoritesChip(props) {
      const snapshot = useStore();
      const sessionId = props.sessionId;
      let count = 0;
      for (let i = 0; i < snapshot.items.length; i += 1) {
        const item = snapshot.items[i];
        if (item.sessionId === sessionId && item.kind !== 'file') count += 1;
      }
      if (!count) return null;
      return h(
        'button',
        {
          type: 'button',
          className: 'dshfav-hchip',
          title: t('header.chipTitle', { n: count }),
          'aria-label': t('header.chipTitle', { n: count }),
          onClick: function () {
            store.setSessionFilter(sessionId);
            try {
              if (clientCtx && typeof clientCtx.get === 'function') {
                const layout = clientCtx.get('layout');
                if (layout && typeof layout.selectPanel === 'function') layout.selectPanel(PANEL_KEY);
              }
            } catch (err) {
              /* ignore */
            }
          },
        },
        h(BookmarkIcon, { size: 11, filled: true }),
        h('span', null, String(count)),
      );
    }

    /* ------------------------------------------------------------- lifecycle */

    function readLocale(ctx) {
      try {
        const locale = ctx && typeof ctx.get === 'function' ? ctx.get('locale') : undefined;
        if (locale && typeof locale.getLocale === 'function') {
          const snapshot = locale.getLocale();
          if (snapshot && typeof snapshot.active === 'string') return snapshot.active;
        }
      } catch (err) {
        /* fall through to the browser */
      }
      try {
        if (window.navigator && window.navigator.language) return window.navigator.language;
      } catch (err) {
        /* ignore */
      }
      return 'en';
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        store.attach(ctx);
        store.load();
        dict = pickDict(readLocale(ctx));

        function contribute(slotName, options, component) {
          const merged = Object.assign({ name: slotName }, options);
          try {
            ctx.slots.inject(slotName, function () {
              return ctx.slots.register(merged, component);
            });
          } catch (err) {
            /* one unavailable seat must not take the other surfaces down */
            console.warn('[favorites] could not contribute to ' + slotName, err);
          }
        }

        contribute('conversation.chat.assistant-actions', { id: 'favorite', order: 25 }, MessageFavoriteButton);
        contribute('conversation.session.header.actions', { id: 'favorite-chip', order: 30 }, SessionFavoritesChip);
        contribute('shell.overlay', { id: 'favorites-editor', order: 50 }, EditorOverlay);
        contribute(
          'sidebar.panellist',
          {
            id: PANEL_KEY,
            order: 20,
            label: function () {
              return t('panel.title');
            },
          },
          PanelIcon,
        );
        contribute('main', { key: PANEL_KEY }, FavoritesPanel);
      },
    };
  },
});