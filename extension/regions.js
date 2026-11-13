/* One discovery observer; features own observers inside their mounted regions. */
(() => {
  "use strict";
  const subscriptions = new Set();
  const releasing = new WeakSet();

  function release(mounted, element) {
    const cleanups = mounted.get(element);
    if (!cleanups || releasing.has(cleanups)) return;
    const errors = [];
    releasing.add(cleanups);
    try {
      for (const cleanup of cleanups) {
        try { cleanup(); cleanups.delete(cleanup); }
        catch (error) { errors.push(error); }
      }
    } finally { releasing.delete(cleanups); }
    if (errors.length) throw new AggregateError(errors, 'Region cleanup failed');
    mounted.delete(element);
  }

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
    for (const element of mounted.keys()) {
      if (!roots.has(element)) release(mounted, element);
    }
    for (const element of roots) {
      if (!subscriptions.has(subscription)) break;
      if (!mounted.has(element)) {
        const cleanups = new Set();
        mounted.set(element, cleanups);
        // Register cleanup before allocating resources, not only after attach
        // returns. This also makes partial setup reachable when attach throws.
        try {
          const dispose = subscription.attach(element, cleanup => cleanups.add(cleanup));
          if (dispose) cleanups.add(dispose);
        } catch (error) {
          try { release(mounted, element); }
          catch (cleanupError) { throw new AggregateError([error, cleanupError], 'Region attachment and cleanup failed'); }
          throw error;
        }
      }
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

  function watch(selector, attach, own = () => {}) {
    const subscription = { selector, attach, candidates: new Set(document.querySelectorAll(selector)), mounted: new Map() };
    subscriptions.add(subscription);
    const unsubscribe = () => {
      subscriptions.delete(subscription);
      if (!subscriptions.size) observer.disconnect();
      const errors = [];
      for (const element of subscription.mounted.keys()) {
        try { release(subscription.mounted, element); }
        catch (error) { errors.push(error); }
      }
      subscription.candidates.clear();
      if (errors.length) throw new AggregateError(errors, 'Region subscription cleanup failed');
    };
    try {
      // Give the feature its teardown handle before synchronous discovery. If
      // rollback itself fails, feature.dispose can retry the retained cleanups.
      own(unsubscribe);
      if (subscriptions.size === 1) observer.observe(document, {
        childList: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'data-a-target', 'data-target']
      });
      reconcile(subscription);
    } catch (error) {
      try { unsubscribe(); } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], 'Region startup and cleanup failed');
      }
      throw error;
    }
    return unsubscribe;
  }
  globalThis.TwitchMinRegions = Object.freeze({ watch });
})();
