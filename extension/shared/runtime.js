/* Small lifecycle adapter for features with explicit attach/update/dispose methods. */
(() => {
  "use strict";
  globalThis.TwitchMinRuntime = Object.freeze({
    create(feature, isEnabled = settings => settings.enabled === true) {
      let state = 'idle'; // dirty means cleanup must succeed before another attach.
      function cleanup() {
        if (state === 'idle') return;
        state = 'dirty';
        feature.dispose();
        state = 'idle';
      }
      return Object.freeze({
        update(settings) {
          if (state === 'dirty' || !isEnabled(settings)) cleanup();
          if (!isEnabled(settings)) return;
          try {
            if (state === 'idle') {
              state = 'dirty';
              feature.attach(settings);
              state = 'attached';
            } else feature.update?.(settings);
          } catch (error) {
            try { cleanup(); } catch (cleanupError) {
              throw new AggregateError([error, cleanupError], 'Feature failed and cleanup failed');
            }
            throw error;
          }
        },
        dispose: cleanup
      });
    }
  });
})();
