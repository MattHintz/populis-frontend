#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const outputRoot = resolve(process.argv[2] || 'dist/solslot-portal/browser');
const outputFile = resolve(outputRoot, 'recovery-page-manifest.json');
const excluded = new Set([
  '.htaccess',
  'release.json',
  'recovery-page-manifest.json',
]);

const files = {};
for (const path of await walk(outputRoot)) {
  const name = relative(outputRoot, path).split(sep).join('/');
  if (excluded.has(name) || name.startsWith('.')) continue;
  const bytes = await readFile(path);
  files[name] = {
    byteSize: bytes.byteLength,
    sha256: hash(bytes),
  };
}

if (!files['index.html'] || !Object.keys(files).some((name) => name.endsWith('.js'))) {
  throw new Error('Recovery manifest requires the built index and JavaScript bundles.');
}

const body = {
  schemaVersion: 1,
  purpose: 'Solslot standalone administrator recovery page',
  route: '/genesis-admin/recover-admin-access',
  files,
};
const manifest = {
  ...body,
  aggregateSha256: hash(Buffer.from(stableJson(body), 'utf8')),
};
await writeFile(outputFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${manifest.aggregateSha256}\n`);

async function walk(directory) {
  const entries = await readdir(directory);
  const paths = [];
  for (const entry of entries.sort()) {
    const path = resolve(directory, entry);
    const info = await stat(path);
    if (info.isDirectory()) paths.push(...(await walk(path)));
    else if (info.isFile()) paths.push(path);
  }
  return paths;
}

function hash(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function stableJson(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
    .join(',')}}`;
}
