import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

function loadWhitelist() {
  const file = path.join(root, 'open-core-whitelist.json');
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  if (!files.length) throw new Error('open-core-whitelist.json has no files');
  return {
    file,
    files: files.map((entry) => {
      if (typeof entry === 'string') return { source: entry, target: entry };
      return {
        source: String(entry?.source || '').replace(/\\/g, '/'),
        target: String(entry?.target || '').replace(/\\/g, '/')
      };
    })
  };
}

function usage() {
  console.error('Usage: node scripts/export-open-core.mjs <destination-folder> [--clean]');
  process.exit(1);
}

const args = process.argv.slice(2);
const clean = args.includes('--clean');
const destinationArg = args.find((arg) => arg !== '--clean');
if (!destinationArg) usage();

const destination = path.resolve(process.cwd(), destinationArg);
if (destination === root) {
  throw new Error('Destination must not be the current operating repo.');
}
if (destination.length < 5) {
  throw new Error('Destination path is unexpectedly short.');
}

const { files } = loadWhitelist();
mkdirSync(destination, { recursive: true });

function destinationTrackedFiles() {
  try {
    const output = execFileSync('git', ['-C', destination, 'ls-files'], { encoding: 'utf8' }).trim();
    return output ? output.split(/\r?\n/).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function safeDestinationFile(relativePath) {
  const normalized = String(relativePath || '').replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || normalized.includes('..') || normalized.startsWith('.git/')) return null;
  const absolute = path.resolve(destination, normalized);
  if (!absolute.startsWith(`${destination}${path.sep}`)) return null;
  return absolute;
}

if (clean) {
  const keep = new Set(files.map((entry) => entry.target));
  const keepDirectories = files
    .filter((entry) => existsSync(path.join(root, entry.source)) && statSync(path.join(root, entry.source)).isDirectory())
    .map((entry) => entry.target.endsWith('/') ? entry.target : `${entry.target}/`);
  keep.add('OPEN_CORE_EXPORT.txt');
  for (const tracked of destinationTrackedFiles()) {
    const normalized = tracked.replace(/\\/g, '/');
    if (keep.has(normalized)) continue;
    if (keepDirectories.some((directory) => normalized.startsWith(directory))) continue;
    const target = safeDestinationFile(normalized);
    if (target && existsSync(target)) rmSync(target, { force: true });
  }
}

const exported = [];

for (const entry of files) {
  const sourceRelative = entry.source;
  const targetRelative = entry.target;
  const source = path.join(root, sourceRelative);
  if (!existsSync(source)) {
    throw new Error(`Whitelist entry does not exist: ${sourceRelative}`);
  }
  const target = path.join(destination, targetRelative);
  mkdirSync(path.dirname(target), { recursive: true });
  cpSync(source, target, { force: true, recursive: true });
  exported.push(`${sourceRelative} -> ${targetRelative}`);
}

const notice = [
  '# Export metadata',
  '',
  `Exported at: ${new Date().toISOString()}`,
  '',
  'This mirror was created from open-core-whitelist.json.',
  'The public mirror intentionally excludes private runtime, billing, storage, and secret-handling code.',
  ''
].join('\n');

writeFileSync(path.join(destination, 'OPEN_CORE_EXPORT.txt'), notice, 'utf8');

console.log(`Exported ${exported.length} files to ${destination}`);
