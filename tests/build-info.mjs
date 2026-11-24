// Validate build identity when Docker has stripped .git from the runtime.
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const temp=mkdtempSync(join(tmpdir(),'spider-paint-build-info-'));
const sourceSha='abcdef0123456789abcdef0123456789abcdef01';
const overrideSha='0123456789abcdef0123456789abcdef01234567';
try {
  mkdirSync(join(temp,'mcp'));
  copyFileSync(join(root,'package.json'),join(temp,'package.json'));
  copyFileSync(join(root,'mcp/build-info.js'),join(temp,'mcp/build-info.js'));
  writeFileSync(join(temp,'mcp/build-sha.txt'),sourceSha+'\n');
  const invoke=env=>{
    const r=spawnSync(process.execPath,['--input-type=module','-e',
      "import('./mcp/build-info.js').then(m=>console.log(JSON.stringify(m.buildInfo)))"
    ],{cwd:temp,env:{...process.env,SPIDER_PAINT_GIT_SHA:'',COMMIT_SHA:'',GITHUB_SHA:'',...env},encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
    return JSON.parse(r.stdout.trim());
  };
  const embedded=invoke({});
  assert.equal(embedded.gitHash,sourceSha,'Docker-embedded SHA must survive without .git');
  assert.equal(embedded.shortHash,sourceSha.slice(0,8));
  assert.ok(embedded.label.endsWith(sourceSha.slice(0,8)));
  const override=invoke({SPIDER_PAINT_GIT_SHA:overrideSha});
  assert.equal(override.gitHash,overrideSha,'explicit deploy SHA takes precedence');
  console.log('spider-paint embedded build commit and deployment override: OK');
} finally {
  rmSync(temp,{recursive:true,force:true});
}
