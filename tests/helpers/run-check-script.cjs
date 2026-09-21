const { readFileSync } = require('node:fs');
const path = require('node:path');
const { runInNewContext } = require('node:vm');

// Run the actual CLI source without reading real env files or sending requests.
async function runCheckScript(script, { files = {}, env = {}, args = [], fetch, modules = {}, io = {} } = {}) {
  const filename = path.resolve(__dirname, '../../scripts', script);
  const root = path.dirname(path.dirname(filename));
  const contents = new Map(Object.entries(files).map(([name, value]) => [path.resolve(root, name), value]));
  const logs = [];
  const errors = [];
  const requests = [];
  const writes = [];
  let exitCode;
  const exitSignal = new Error('mock process.exit');
  const fakeFs = {
    existsSync: (file) => contents.has(file),
    readFileSync(file) {
      if (!contents.has(file)) throw new Error(`Unexpected file read: ${file}`);
      return contents.get(file);
    },
    appendFileSync(file, text) { writes.push({ file, text }); },
    readdirSync(dir) {
      return [...contents.keys()].filter((file) => path.dirname(file) === dir).map((file) => path.basename(file));
    },
    ...io,
  };
  const fakeProcess = {
    env: { ...env }, argv: ['node', filename, ...args], exitCode: 0,
    // Keep the first exit code even if a CLI's top-level catch catches our
    // sentinel. Real process.exit would already have terminated the process.
    exit(code) { if (exitCode === undefined) exitCode = code; throw exitSignal; },
  };
  const context = {
    __dirname: path.dirname(filename),
    require(name) {
      if (name === 'fs') return fakeFs;
      if (name === 'path') return path;
      if (Object.hasOwn(modules, name)) return modules[name];
      throw new Error(`Unexpected import: ${name}`);
    },
    process: fakeProcess,
    console: {
      log: (...values) => logs.push(values.join(' ')),
      error: (...values) => { if (!values.includes(exitSignal)) errors.push(values.join(' ')); },
    },
    URL,
    fetch: async (url, options) => {
      requests.push({ url: new URL(url), options });
      if (!fetch) throw new Error('Network is disabled in tests');
      return fetch(new URL(url), options);
    },
  };
  try {
    await runInNewContext(readFileSync(filename, 'utf8'), context, { filename, timeout: 1000 });
  } catch (error) {
    if (error !== exitSignal) throw error;
  }
  return { exitCode: exitCode ?? fakeProcess.exitCode, stdout: logs.join('\n'), stderr: errors.join('\n'), requests, writes };
}

module.exports = { runCheckScript };
