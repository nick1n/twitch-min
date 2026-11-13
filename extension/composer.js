/* A separate Chat toggle leaves Twitch's send handlers and draft untouched. */
(() => {
  "use strict";
  const OWNER = globalThis.TwitchMinSelectors.composer;
  const SOURCE = 'button[data-a-target="chat-send-button"]';
  const BOX = '.chat-input__textarea, .chat-wysiwyg-input-box, [data-a-target="chat-input"]';
  const OPEN = 'data-tq-composer-open';
  const ID = 'data-tq-composer-id';
  const states = new Map();
  const controls = new WeakMap();
  let enabled = false;
  let sequence = 0;

  function releaseTarget(state) {
    if (state.generatedId && state.box?.id === state.generatedId) state.box.removeAttribute('id');
    state.box?.removeAttribute(ID);
    state.box = null;
    state.generatedId = null;
  }

  function remove(state) {
    state.control.remove();
    state.owner.removeAttribute(OPEN);
    releaseTarget(state);
    controls.delete(state.control);
    states.delete(state.owner);
  }

  function render(state) {
    state.owner.toggleAttribute(OPEN, state.open);
    state.control.setAttribute('aria-expanded', String(state.open));
    state.control.setAttribute('aria-controls', state.box.id);
    const label = `${state.open ? 'Hide' : 'Show'} chat message box`;
    state.control.setAttribute('aria-label', label);
    state.control.title = label;
  }

  function sync(owner) {
    const source = owner.querySelector(SOURCE);
    const box = owner.querySelector(BOX);
    let state = states.get(owner);
    if (!source || !box) {
      if (state) remove(state);
      return;
    }
    if (!state) {
      // React may clone or replace a subtree containing an earlier toggle.
      owner.querySelectorAll('[data-tq-chat-toggle]').forEach(control => control.remove());
      const control = document.createElement('button');
      control.type = 'button';
      control.setAttribute('data-tq-chat-toggle', '');
      control.textContent = 'Chat';
      state = { owner, control, box: null, generatedId: null, open: false };
      states.set(owner, state);
      controls.set(control, state);
    }
    if (state.box !== box) {
      releaseTarget(state);
      state.box = box;
      // An editor cloned by React may carry our generated ID and ownership tag.
      state.generatedId = box.getAttribute(ID) === box.id ? box.id : null;
    }
    if (!box.id) {
      do { state.generatedId = `twitch-min-composer-${++sequence}`; }
      while (document.getElementById(state.generatedId));
      box.id = state.generatedId;
      box.setAttribute(ID, state.generatedId);
    } else if (state.generatedId !== box.id) {
      state.generatedId = null;
      box.removeAttribute(ID);
    }
    if (source.nextElementSibling !== state.control) source.after(state.control);
    render(state);
  }

  function attachOwner(owner) {
    sync(owner);
    const observer = new MutationObserver(() => { if (owner.isConnected) sync(owner); });
    observer.observe(owner, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'id', 'data-a-target'] });
    return () => {
      observer.disconnect();
      const state = states.get(owner);
      if (state) remove(state);
    };
  }

  function onClick(event) {
    if (!enabled || !(event.target instanceof Element)) return;
    const control = event.target.closest('[data-tq-chat-toggle]');
    const state = controls.get(control);
    if (!state || !state.owner.isConnected) return;
    // Stop React's delegated handlers as well as any enclosing form submission.
    event.preventDefault();
    event.stopImmediatePropagation();
    state.open = !state.open;
    render(state);
    const editable = 'textarea, [contenteditable="true"], [contenteditable="plaintext-only"]';
    const editor = state.box.matches(editable) ? state.box : state.box.querySelector(editable);
    (state.open ? editor : control)?.focus({ preventScroll: true });
  }

  let stopRegions = null;
  globalThis.TwitchMinComposer = globalThis.TwitchMinRuntime.create({
    attach() {
      enabled = true;
      document.addEventListener('click', onClick, true);
      stopRegions = globalThis.TwitchMinRegions.watch(OWNER, attachOwner);
    },
    dispose() {
      enabled = false;
      document.removeEventListener('click', onClick, true);
      stopRegions?.();
      stopRegions = null;
    }
  }, settings => settings.enabled === true && settings.chatComposer === true);
})();
