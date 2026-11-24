// Claude plugin package: marketplace, manifest, MCP config and skill stay consistent.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const json = p => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

const market = json('.claude-plugin/marketplace.json');
assert.equal(market.name, 'spider-paint');
assert.ok(market.owner?.name, 'marketplace owner');
const entry = market.plugins.find(p => p.name === 'spider-paint');
assert.ok(entry, 'marketplace lists spider-paint');
const dir = entry.source.replace(/^\.\//, '').replace(/\/?$/, '/');

const manifest = json(dir + '.claude-plugin/plugin.json');
assert.equal(manifest.name, 'spider-paint');
assert.match(manifest.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
assert.equal(entry.version, manifest.version, 'marketplace and manifest versions match');
const pkg = json('package.json');
assert.equal(manifest.version, pkg.version, 'the plugin version is the package.json version (npm run bump writes it)');
assert.equal(json('plugin.json').version, pkg.version, 'plugin.json carries the package.json version');

const mcp = json(dir + '.mcp.json').mcpServers['spider-paint'];
assert.equal(mcp.type, 'http');
const legacy = json('mcp.json').mcpServers['spider-paint'];
assert.equal(mcp.url, legacy.url, 'Claude and OpenAI packages point to the same MCP endpoint');

const skillPath = new URL(dir + 'skills/spider-paint/SKILL.md', root);
assert.ok(existsSync(skillPath), 'skill exists');
const skill = readFileSync(skillPath, 'utf8');
const front = skill.match(/^---\n([\s\S]*?)\n---\n/);
assert.ok(front, 'skill frontmatter');
assert.match(front[1], /^name: spider-paint$/m);
assert.match(front[1], /^description: .{40,}/m);

// Every tool the skill tells Claude to call must exist on the server.
const sources = ['mcp/workshop-app.js', 'mcp/http.js'].map(p => readFileSync(new URL(p, root), 'utf8')).join('\n');
for (const tool of ['open_workshop', 'workshop_state', 'workshop_edit', 'build_model', 'build_story', 'sky_scene', 'sky_guide', 'find', 'examples', 'debug_trace'])
  assert.ok(sources.includes(`'${tool}'`), `server defines ${tool}`);

console.log('spider-paint Claude plugin package: OK');
