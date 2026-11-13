/* Small lifecycle adapter for features with explicit attach/update/dispose methods. */
(() => {
  "use strict";
  globalThis.TwitchMinRuntime = Object.freeze({
    create(feature, isEnabled = settings => settings.enabled === true) {
      let attached = false;
      return Object.freeze({
        update(settings) {
          if (!isEnabled(settings)) {
            if (attached) { attached = false; feature.dispose(); }
          } else if (!attached) {
            attached = true;
            feature.attach(settings);
          } else feature.update?.(settings);
        },
        dispose() { if (attached) { attached = false; feature.dispose(); } }
      });
    }
  });
})();
