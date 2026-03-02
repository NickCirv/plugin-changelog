#!/usr/bin/env node
/**
 * plugin-changelog
 * Auto-generate WordPress.org readme.txt changelog from git log.
 * https://github.com/NickCirv/plugin-changelog
 */

import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';

// ─── Argument Parsing ──────────────────────────────────────────────────────

const args = process.argv.slice(2);

function getArg(flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  return args[idx + 1] ?? null;
}

function hasFlag(flag) {
  return args.includes(flag);
}

const config = {
  version: getArg('--version'),
  since: getArg('--since'),
  format: getArg('--format') ?? 'wporg',
  copy: hasFlag('--copy'),
  append: hasFlag('--append'),
  dir: getArg('--dir') ?? process.cwd(),
  help: hasFlag('--help') || hasFlag('-h'),
};

// ─── Help ──────────────────────────────────────────────────────────────────

if (config.help) {
  console.log(`
plugin-changelog — Auto-generate WP.org changelog from git log

USAGE
  plugin-changelog [options]

OPTIONS
  --version <ver>   Version string for the changelog entry (e.g. 1.1.0)
                    Falls back to: PHP plugin header, then package.json
  --since <ref>     Git ref/tag to log from (e.g. v1.0.0, HEAD~20)
                    Falls back to: last git tag, then last 50 commits
  --format <fmt>    Output format: wporg (default) | markdown | json
  --copy            Copy output to clipboard (pbcopy on Mac, xclip on Linux)
  --append          Prepend new entry into readme.txt == Changelog == section
  --dir <path>      Plugin directory (default: current directory)
  --help            Show this help

EXAMPLES
  plugin-changelog
  plugin-changelog --version 1.2.0 --since v1.1.0
  plugin-changelog --format markdown
  plugin-changelog --copy
  plugin-changelog --append
  plugin-changelog --version 1.2.0 --format wporg --append --copy

COMMIT PREFIXES → CATEGORIES
  feat / feature / add  →  Added
  fix / bug             →  Fixed
  change / update / improve / refactor / perf  →  Changed
  remove / delete / deprecate  →  Removed
  security / sec        →  Security
  (anything else)       →  Other
`);
  process.exit(0);
}

// ─── Utilities ─────────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: config.dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...opts,
    }).trim();
  } catch {
    return null;
  }
}

function findFile(filename, maxLevels = 3) {
  let dir = resolve(config.dir);
  for (let i = 0; i <= maxLevels; i++) {
    const candidate = join(dir, filename);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break; // filesystem root
    dir = parent;
  }
  return null;
}

// ─── Version Detection ─────────────────────────────────────────────────────

function detectVersion() {
  if (config.version) return config.version;

  // Try PHP plugin header: "* Version: 1.2.3" or "Version: 1.2.3"
  const phpFiles = run('find', ['.', '-maxdepth', '2', '-name', '*.php', '-not', '-path', '*/vendor/*', '-not', '-path', '*/node_modules/*']);
  if (phpFiles) {
    for (const file of phpFiles.split('\n').slice(0, 10)) {
      const content = (() => { try { return readFileSync(join(config.dir, file.trim()), 'utf8'); } catch { return ''; } })();
      const m = content.match(/^\s*\*\s*Version:\s*(.+)$/m) ?? content.match(/^Version:\s*(.+)$/m);
      if (m) return m[1].trim();
    }
  }

  // Try package.json
  const pkgPath = findFile('package.json');
  if (pkgPath) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
      if (pkg.version) return pkg.version;
    } catch { /* skip */ }
  }

  return '1.0.0';
}

// ─── Git Log Parsing ───────────────────────────────────────────────────────

function getLastTag() {
  return run('git', ['describe', '--tags', '--abbrev=0']);
}

function getCommits() {
  let range = [];

  if (config.since) {
    // Explicit --since ref
    range = [`${config.since}..HEAD`];
  } else {
    const lastTag = getLastTag();
    if (lastTag) {
      range = [`${lastTag}..HEAD`];
    } else {
      // No tags — grab last 50 commits
      range = ['-50'];
    }
  }

  const format = '--format=%H|%s|%ai|%an';
  const logArgs = ['log', '--no-merges', format, ...range];
  const output = run('git', logArgs);

  if (!output) return [];

  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, subject, date, author] = line.split('|');
      return { hash: hash?.trim(), subject: subject?.trim(), date: date?.trim(), author: author?.trim() };
    })
    .filter((c) => c.hash && c.subject);
}

// ─── Commit Categorisation ─────────────────────────────────────────────────

const CATEGORY_PATTERNS = [
  { pattern: /^(feat|feature|add|added|new)(\(.+?\))?[!:]?\s*/i, category: 'Added' },
  { pattern: /^(fix|bug|bugfix|hotfix|patch)(\(.+?\))?[!:]?\s*/i, category: 'Fixed' },
  { pattern: /^(change|update|improve|improvement|refactor|perf|performance|enhance|enhancement|style|chore|ci|build|docs|test)(\(.+?\))?[!:]?\s*/i, category: 'Changed' },
  { pattern: /^(remove|delete|drop|deprecate|deprecated)(\(.+?\))?[!:]?\s*/i, category: 'Removed' },
  { pattern: /^(security|sec|vuln|vulnerability|cve)(\(.+?\))?[!:]?\s*/i, category: 'Security' },
];

function categorise(subject) {
  for (const { pattern, category } of CATEGORY_PATTERNS) {
    if (pattern.test(subject)) {
      const cleaned = subject.replace(pattern, '').trim();
      return { category, message: cleanMessage(cleaned) };
    }
  }
  return { category: 'Other', message: cleanMessage(subject) };
}

function cleanMessage(msg) {
  // Remove leading ticket refs like #123 at the start (keep mid-message WP refs)
  msg = msg.replace(/^#\d+\s+/, '');
  // Remove trailing PR/issue refs like (#123) or [#123]
  msg = msg.replace(/\s*[\[\(]#\d+[\]\)]\s*$/, '');
  // Capitalize first letter
  msg = msg.charAt(0).toUpperCase() + msg.slice(1);
  // Trim
  msg = msg.trim();
  // Remove trailing period for WP.org style (optional — WP.org doesn't use them)
  // (leave as-is, user can decide)
  // Truncate if absurdly long
  if (msg.length > 120) msg = msg.slice(0, 117) + '...';
  return msg;
}

// ─── Output Formatters ─────────────────────────────────────────────────────

const CATEGORY_ORDER = ['Added', 'Fixed', 'Changed', 'Removed', 'Security', 'Other'];

function groupByCategory(commits) {
  const groups = {};
  for (const commit of commits) {
    const { category, message } = categorise(commit.subject);
    if (!groups[category]) groups[category] = [];
    groups[category].push(message);
  }
  return groups;
}

function formatWporg(version, commits) {
  const groups = groupByCategory(commits);
  const lines = [];
  lines.push(`= ${version} =`);

  for (const cat of CATEGORY_ORDER) {
    if (!groups[cat]?.length) continue;
    for (const msg of groups[cat]) {
      lines.push(`* ${cat}: ${msg}`);
    }
  }

  if (lines.length === 1) {
    lines.push('* Minor improvements and bug fixes');
  }

  return lines.join('\n');
}

function formatMarkdown(version, commits, date) {
  const groups = groupByCategory(commits);
  const lines = [];
  lines.push(`## [${version}] - ${date}`);
  lines.push('');

  for (const cat of CATEGORY_ORDER) {
    if (!groups[cat]?.length) continue;
    lines.push(`### ${cat}`);
    for (const msg of groups[cat]) {
      lines.push(`- ${msg}`);
    }
    lines.push('');
  }

  if (Object.keys(groups).length === 0) {
    lines.push('- Minor improvements and bug fixes');
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function formatJson(version, commits, date) {
  const groups = groupByCategory(commits);
  const structured = {};
  for (const cat of CATEGORY_ORDER) {
    if (groups[cat]?.length) structured[cat] = groups[cat];
  }
  return JSON.stringify({ version, date, entries: structured }, null, 2);
}

// ─── Append to readme.txt ──────────────────────────────────────────────────

function appendToReadme(newEntry) {
  const readmePath = findFile('readme.txt');
  if (!readmePath) {
    console.error('Error: Could not find readme.txt in current or parent directories (up to 3 levels).');
    console.error('Generate output without --append and paste manually.');
    process.exit(1);
  }

  let content = readFileSync(readmePath, 'utf8');
  const sectionHeader = '== Changelog ==';
  const sectionIdx = content.indexOf(sectionHeader);

  if (sectionIdx === -1) {
    // No changelog section — append one at the end
    content = content.trimEnd() + '\n\n== Changelog ==\n\n' + newEntry + '\n';
    console.error(`Note: No "== Changelog ==" section found in ${readmePath}. Appended new section at end.`);
  } else {
    // Insert after the section header line
    const afterHeader = sectionIdx + sectionHeader.length;
    // Skip blank lines immediately after the header
    let insertPos = afterHeader;
    while (insertPos < content.length && content[insertPos] === '\n') insertPos++;

    const before = content.slice(0, afterHeader);
    const after = content.slice(insertPos);
    content = before + '\n\n' + newEntry + '\n\n' + after.trimStart();
  }

  writeFileSync(readmePath, content, 'utf8');
  console.error(`Changelog prepended to: ${readmePath}`);
}

// ─── Clipboard ─────────────────────────────────────────────────────────────

function copyToClipboard(text) {
  const isMac = process.platform === 'darwin';
  const cmd = isMac ? 'pbcopy' : 'xclip';
  const cmdArgs = isMac ? [] : ['-selection', 'clipboard'];
  try {
    execFileSync(cmd, cmdArgs, { input: text, encoding: 'utf8' });
    console.error(`Copied to clipboard via ${cmd}.`);
  } catch {
    console.error(`Could not copy to clipboard. Is ${cmd} installed?`);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

function main() {
  // Validate format
  const validFormats = ['wporg', 'markdown', 'json'];
  if (!validFormats.includes(config.format)) {
    console.error(`Error: Unknown format "${config.format}". Valid options: ${validFormats.join(', ')}`);
    process.exit(1);
  }

  const version = detectVersion();
  const commits = getCommits();
  const today = new Date().toISOString().slice(0, 10);

  if (commits.length === 0) {
    console.error('Warning: No commits found. Check your --since ref or ensure you have commits in this repo.');
  }

  let output;
  if (config.format === 'wporg') {
    output = formatWporg(version, commits);
  } else if (config.format === 'markdown') {
    output = formatMarkdown(version, commits, today);
  } else {
    output = formatJson(version, commits, today);
  }

  // Always print to stdout
  console.log(output);

  // Optional: copy
  if (config.copy) {
    copyToClipboard(output);
  }

  // Optional: append to readme.txt (wporg format only)
  if (config.append) {
    if (config.format !== 'wporg') {
      console.error('Warning: --append only works with --format wporg. Ignoring --append.');
    } else {
      appendToReadme(output);
    }
  }
}

main();
