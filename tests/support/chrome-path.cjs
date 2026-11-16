const puppeteer = require('puppeteer');

// Explicit paths take precedence, including invalid paths needed for launch diagnostics.
module.exports = async function chromePath(configuredPath = process.env.CHROME_PATH) {
  return configuredPath || puppeteer.executablePath();
};
