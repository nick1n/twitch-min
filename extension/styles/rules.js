/* Assemble feature rules in stable cascade order; expose the existing CSS API. */
(() => {
  "use strict";

  const RULES = Object.freeze([
    ...globalThis.TwitchMinSidebarRules,
    ...globalThis.TwitchMinNavigationRules,
    ...globalThis.TwitchMinPlayerRules,
    ...globalThis.TwitchMinChatRules
  ].sort(([a], [b]) => a - b).map(([, rule]) => rule));

  function buildCSS() {
    const { ATTRIBUTES } = globalThis.TwitchMinSettings;
    return RULES.map(({ key, selectors, declaration }) => {
      const scope = `html[${ATTRIBUTES.enabled}="true"]${key === 'enabled' ? '' : `[${ATTRIBUTES[key]}="true"]`}`;
      return `${selectors.map(selector => `${scope} ${selector}`).join(",\n")} {\n  ${declaration}\n}`;
    }).join("\n\n");
  }

  globalThis.TwitchMinRules = Object.freeze({ RULES, buildCSS });
})();
