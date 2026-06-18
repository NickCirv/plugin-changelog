<div align="center">

# plugin-changelog

**Turn your git log into a paste-ready WordPress.org changelog entry — in one command.**

[![License: MIT](https://img.shields.io/badge/license-MIT-green?labelColor=0B0A09)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen?labelColor=0B0A09)](package.json)
[![Zero dependencies](https://img.shields.io/badge/dependencies-0-blue?labelColor=0B0A09)](package.json)

</div>

## Install

```bash
npx github:NickCirv/plugin-changelog --help
```

## Usage

```bash
# Auto-detect version and last tag — print WP.org-ready block
npx github:NickCirv/plugin-changelog

# Specific version; write directly into readme.txt
npx github:NickCirv/plugin-changelog --version 1.2.0 --append

# Markdown format for GitHub releases
npx github:NickCirv/plugin-changelog --format markdown
```

| Flag | Description |
|---|---|
| `--version <ver>` | Version string — auto-detected from PHP header or `package.json` if omitted |
| `--since <ref>` | Git ref to start from (e.g. `v1.0.0`) — auto-detects last tag if omitted |
| `--format <fmt>` | `wporg` (default) · `markdown` · `json` |
| `--copy` | Copy output to clipboard (`pbcopy` / `xclip`) |
| `--append` | Prepend entry into `readme.txt` under `== Changelog ==` |
| `--dir <path>` | Plugin directory (default: cwd) |

## What it does

Reads your git log, maps commit prefixes (`feat:`, `fix:`, `security:`, etc.) to WP.org categories (Added, Fixed, Security…), and emits a formatted changelog block. Supports three output formats: WP.org `readme.txt`, Keep a Changelog Markdown, and JSON for CI pipelines. Version is auto-detected from your PHP plugin header or `package.json`; tag range is auto-detected from your last git tag.

---

<sub>Zero dependencies · Node >=18 · MIT · by <a href="https://github.com/NickCirv">NickCirv</a></sub>
