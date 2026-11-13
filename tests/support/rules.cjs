const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, content } = require('./production.cjs');

// Load the settings and cosmetic rules without DOM controllers, in manifest order.
function loadRules(context = vm.createContext({})) {
  for (const file of content.js.filter(file => file === 'shared/settings.js' || file === 'shared/selectors.js' || file.startsWith('styles/'))) {
    const source = fs.readFileSync(path.join(root, 'extension', file), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  return context;
}

module.exports = { loadRules };
