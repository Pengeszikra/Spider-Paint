// The files besides package.json that carry the project's version: the plugin manifests. package.json is the source;
// `npm run bump` writes its version into these, and `npm run transfer` writes the target's version into them.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Paths of the version-bearing files of a project called `name`. */
export const versionFiles = (name) => ['plugin.json', '.claude-plugin/marketplace.json', `plugins/${name}/.claude-plugin/plugin.json`];

/** The text with every `"version": "x.y.z"` set to `version` (the formatting stays). */
export const withVersion = (text, version) => text.replace(/("version"\s*:\s*")\d+\.\d+\.\d+[^"]*(")/g, (_, a, b) => a + version + b);

/** Writes `version` into the version-bearing files under `root`; returns the paths that changed. */
export const syncVersion = (root, name, version) => versionFiles(name).filter((p) => {
  const file = join(root, p);
  if (!existsSync(file)) return false;
  const text = readFileSync(file, 'utf8');
  const next = withVersion(text, version);
  if (next !== text) writeFileSync(file, next);
  return next !== text;
});
