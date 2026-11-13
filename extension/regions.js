/* One discovery observer; features own observers inside their mounted regions. */
(() => {
  "use strict";
  const subscriptions = new Set();

  function collect(subscription, node) {
    if (!(node instanceof Element)) return;
    if (node.matches(subscription.selector)) subscription.candidates.add(node);
    for (const element of node.querySelectorAll(subscription.selector)) subscription.candidates.add(element);
  }

  function reconcile(subscription) {
    const { candidates, mounted, selector } = subscription;
    for (const element of candidates) {
      if (!element.isConnected || !element.matches(selector)) candidates.delete(element);
    }
    // Nested chat selectors describe the same pane. Attach once at its outer
    // root, while retaining independent sibling panes and later inner remounts.
    const roots = new Set([...candidates].filter(element => !element.parentElement?.closest(selector)));
    for (const [element, dispose] of mounted) {
      if (!roots.has(element)) { mounted.delete(element); dispose?.(); }
    }
    for (const element of roots) {
      if (!subscriptions.has(subscription)) break;
      if (!mounted.has(element)) mounted.set(element, subscription.attach(element));
    }
  }

  const observer = new MutationObserver(records => {
    for (const subscription of [...subscriptions]) {
      for (const record of records) {
        if (record.type === 'attributes') {
          // Only the target can acquire a simple region selector via attributes.
          if (record.target.matches(subscription.selector)) subscription.candidates.add(record.target);
        } else {
          for (const node of record.addedNodes) collect(subscription, node);
        }
      }
      reconcile(subscription);
    }
  });

  function watch(selector, attach) {
    const subscription = { selector, attach, candidates: new Set(document.querySelectorAll(selector)), mounted: new Map() };
    subscriptions.add(subscription);
    if (subscriptions.size === 1) observer.observe(document, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'data-a-target', 'data-target']
    });
    reconcile(subscription);
    return () => {
      if (!subscriptions.delete(subscription)) return;
      if (!subscriptions.size) observer.disconnect();
      for (const dispose of subscription.mounted.values()) dispose?.();
      subscription.mounted.clear();
      subscription.candidates.clear();
    };
  }
  globalThis.TwitchMinRegions = Object.freeze({ watch });
})();
