const fs = require('node:fs');

// Explicit paths take precedence, including invalid paths needed for launch diagnostics.
module.exports = function chromePath(configuredPath = process.env.CHROME_PATH) {
  return configuredPath || [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].find(file => fs.existsSync(file));
};
