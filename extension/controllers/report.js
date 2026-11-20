(() => {
  'use strict';

  const attributes = ['class', 'role', 'data-a-target', 'data-test-selector', 'data-target'];
  const excluded = 'script, style, link, input, textarea, select, template, iframe, [contenteditable]';
  const voidElements = 'area, base, br, col, embed, hr, img, meta, param, source, track, wbr';
  const maxMarkup = 1500;
  let session;

  function canHide(element) {
    return element instanceof Element && 'style' in element && element.isConnected &&
      element !== document.body && element !== document.documentElement &&
      document.body?.contains(element) && !element.closest(excluded);
  }

  function openingTag(element) {
    const names = attributes.flatMap(name => {
      const value = element.getAttribute(name);
      return value && value.length <= 100 && /^[a-z0-9_ -]+$/i.test(value) ? [` ${name}="${value}"`] : [];
    });
    return `<${element.localName}${names.join('')}>`;
  }

  function capture(element) {
    let prefix = '';
    let suffix = '';
    for (let parent = element.parentElement, depth = 0; depth < 2 && canHide(parent); parent = parent.parentElement, depth++) {
      prefix = openingTag(parent) + '\n' + prefix;
      suffix += '\n</' + parent.localName + '>';
    }
    let left = maxMarkup - prefix.length - suffix.length;
    let truncated = false;
    function render(node, depth) {
      const start = openingTag(node);
      const end = node.matches(voidElements) ? '' : `</${node.localName}>`;
      if (depth > 5 || left < start.length + end.length + 2) {
        truncated = true;
        return '';
      }
      left -= start.length + end.length + 2;
      let html = start;
      for (const child of node.children) {
        if (child.matches(excluded)) continue;
        const markup = render(child, depth + 1);
        if (markup) html += '\n' + markup;
        if (truncated) break;
      }
      return html + end;
    }
    const html = render(element, 0);
    return prefix + html + suffix + (truncated ? '\n<!-- additional markup omitted -->' : '');
  }

  function restore(state) {
    const hidden = state.hidden;
    if (!hidden) return;
    state.hidden = null;
    // Synchronize the style attribute before removing it via the DOM.
    const currentStyle = hidden.element.getAttributeNode('style');
    const style = hidden.element.style;
    if (style.getPropertyValue('display') === 'none' && style.getPropertyPriority('display') === 'important') {
      if (!hidden.hadStyle && style.length === 1 && currentStyle) hidden.element.removeAttributeNode(currentStyle);
      else if (hidden.display) style.setProperty('display', hidden.display, hidden.priority);
      else style.removeProperty('display');
    }
  }

  function dispose() {
    const state = session;
    if (!state) return;
    session = null;
    state.events.abort();
    state.observer?.disconnect();
    restore(state);
    const restoreFocus = document.activeElement === state.host;
    state.host.remove();
    if (restoreFocus && state.previousFocus?.isConnected) state.previousFocus.focus?.({ preventScroll: true });
  }

  function start() {
    if (session) {
      session.panel.hidden = false;
      (session.hidden ? session.issue : session.close).focus();
      return true;
    }
    if (!document.body) return false;

    const host = document.createElement('div');
    host.setAttribute('data-tq-report-picker', '');
    const events = new AbortController();
    const state = session = { host, events, hidden: null, previousFocus: document.activeElement };
    const { signal } = events;
    try {
      const shadow = host.attachShadow({ mode: 'closed' });
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(globalThis.TwitchMinReportCSS);
      shadow.adoptedStyleSheets = [sheet];
      function make(tag, properties) {
        return Object.assign(document.createElement(tag), properties);
      }
      const outline = make('div', { className: 'outline', hidden: true });
      const panel = state.panel = make('section', { className: 'panel' });
      panel.setAttribute('aria-label', 'Hide and report');
      const status = make('p', { textContent: 'Click the part of Twitch you want to hide. Press Esc to cancel.' });
      status.setAttribute('role', 'status');
      const preview = make('textarea', { readOnly: true, hidden: true });
      preview.setAttribute('aria-label', 'HTML included in the GitHub issue');
      const parent = make('button', { type: 'button', className: 'parent', hidden: true, textContent: 'Hide larger section' });
      const undo = make('button', { type: 'button', className: 'undo', hidden: true, textContent: 'Undo' });
      const issue = state.issue = make('a', {
        hidden: true, target: '_blank', rel: 'noopener noreferrer', textContent: 'Open GitHub issue'
      });
      const close = state.close = make('button', { type: 'button', textContent: 'Cancel' });
      const actions = make('div', { className: 'actions' });
      actions.append(parent, undo, issue, close);
      panel.append(status, preview, actions);
      shadow.append(outline, panel);
      const pathname = location.pathname;
      close.addEventListener('click', () => {
        if (state.hidden) {
          panel.hidden = true;
          if (state.previousFocus?.isConnected) state.previousFocus.focus?.({ preventScroll: true });
        }
        else dispose();
      });
      undo.addEventListener('click', dispose);

      // Watch direct children along the owned paths to notice removal without
      // observing unrelated updates inside chat or other Twitch regions.
      state.observer = new MutationObserver(() => {
        if (!host.isConnected || (state.hidden && !state.hidden.element.isConnected)) dispose();
        else watchRemoval();
      });
      function watchRemoval() {
        state.observer.disconnect();
        const ancestors = new Set([document]);
        for (const node of [host, state.hidden?.element]) {
          for (let element = node?.parentElement; element; element = element.parentElement) ancestors.add(element);
        }
        for (const ancestor of ancestors) state.observer.observe(ancestor, { childList: true });
      }

      function hide(element) {
        if (!canHide(element)) return;
        restore(state);
        const markup = capture(element);
        const manifest = chrome.runtime.getManifest();
        const url = new URL(manifest.homepage_url.replace(/\/$/, '') + '/issues/new');
        url.searchParams.set('title', 'Twitch element to hide');
        url.searchParams.set('body', `What should twitch-min hide?\n\ntwitch-min ${manifest.version}\n\n\`\`\`html\n${markup}\n\`\`\``);
        const hadStyle = element.hasAttribute('style');
        const style = element.style;
        state.hidden = {
          element,
          hadStyle,
          display: style.getPropertyValue('display'),
          priority: style.getPropertyPriority('display')
        };
        style.setProperty('display', 'none', 'important');
        watchRemoval();
        outline.hidden = true;
        status.textContent = 'Hidden until reload or navigation. Review the HTML before opening a GitHub issue.';
        preview.value = markup;
        issue.href = url.href;
        preview.hidden = issue.hidden = undo.hidden = false;
        parent.hidden = !canHide(element.parentElement);
        close.textContent = 'Close';
        (parent.hidden ? issue : parent).focus();
      }

      parent.addEventListener('click', () => hide(state.hidden.element.parentElement));
      window.addEventListener('pointermove', event => {
        if (state.hidden) return;
        outline.hidden = !canHide(event.target);
        if (outline.hidden) return;
        const { left, top, width, height } = event.target.getBoundingClientRect();
        Object.assign(outline.style, { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
      }, { capture: true, passive: true, signal });
      window.addEventListener('scroll', () => { outline.hidden = true; }, { capture: true, passive: true, signal });
      window.addEventListener('click', event => {
        if (state.hidden || event.composedPath().includes(host) || !canHide(event.target)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        hide(event.target);
      }, { capture: true, signal });
      window.addEventListener('keydown', event => {
        if (event.key !== 'Escape' || panel.hidden) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        dispose();
      }, { capture: true, signal });
      window.navigation?.addEventListener('currententrychange', () => {
        if (location.pathname !== pathname) dispose();
      }, { signal });
      window.addEventListener('pagehide', dispose, { signal });
      document.documentElement.append(host);
      watchRemoval();
      close.focus();
      return true;
    } catch (error) {
      dispose();
      console.warn('[twitch-min] Could not open the report picker.', error);
      return false;
    }
  }

  const lifecycle = globalThis.TwitchMinRuntime.create({ attach() {}, dispose });
  globalThis.TwitchMinReport = Object.freeze({ ...lifecycle, start });
})();
