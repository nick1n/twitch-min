(() => {
  'use strict';

  globalThis.TwitchMinReportCSS = `
    :host {
      all: initial;
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      pointer-events: none;
      color-scheme: dark;
    }
    [hidden] { display: none !important; }
    .outline {
      position: fixed;
      box-sizing: border-box;
      border: 3px solid #bf94ff;
      background: #9147ff22;
    }
    .panel {
      position: absolute;
      right: 12px;
      bottom: 12px;
      box-sizing: border-box;
      width: min(370px, calc(100vw - 24px));
      max-height: calc(100vh - 24px);
      overflow: auto;
      padding: 14px;
      border: 1px solid #87759f;
      border-radius: 8px;
      background: #18151d;
      color: #f5f2fa;
      font: 14px/1.45 system-ui, sans-serif;
      pointer-events: auto;
    }
    p { margin: 0 0 10px; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    button, a {
      padding: 5px 9px;
      border: 1px solid #87759f;
      border-radius: 4px;
      background: #292332;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    a { background: #6933ac; text-decoration: none; }
    :focus-visible { outline: 2px solid #bf94ff; outline-offset: 2px; }
    textarea {
      display: block;
      box-sizing: border-box;
      width: 100%;
      height: 110px;
      margin: 0 0 10px;
      padding: 6px;
      border: 1px solid #87759f;
      border-radius: 4px;
      background: #100e14;
      color: inherit;
      font: 12px/1.4 monospace;
    }
  `;
})();
