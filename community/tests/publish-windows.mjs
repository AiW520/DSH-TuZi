import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const publisher = fileURLToPath(new URL('../scripts/publish-windows.mjs', import.meta.url));
const fakeGh = `#!/usr/bin/env node
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const a=process.argv.slice(2), mode=process.env.TEST_PUBLISH_MODE;
fs.appendFileSync('calls.jsonl',JSON.stringify(a)+'\\n');
const artifact='dsh-tuzi-0.2.1-rc.3-win-x64-unsigned.exe', bytes=Buffer.from('MZqualification fixture');
const sha=crypto.createHash('sha256').update(bytes).digest('hex');
if(a[0]==='api' && a[1].includes('/actions/runs/')) console.log(JSON.stringify({conclusion:mode==='failed-run'?'failure':'success',path:'.github/workflows/community-build.yml',head_branch:'main',head_sha:'abc',head_repository:{full_name:'AiW520/DSH-TuZi'},html_url:'https://github.com/AiW520/DSH-TuZi/actions/runs/123'}));
else if(a[0]==='run') { const d=a[a.indexOf('--dir')+1];fs.mkdirSync(d,{recursive:true});fs.writeFileSync(path.join(d,artifact),bytes);fs.writeFileSync(path.join(d,'qualification.json'),JSON.stringify({schemaVersion:1,qualified:true,communityVersion:mode==='wrong-community-version'?'0.2.1-rc.3-community.2':'0.2.1-rc.3-community.3',sourceCommit:mode==='wrong-source'?'def':'abc',runId:'123',platform:'Windows',arch:'x64',signing:'unsigned-test',artifact,bytes:bytes.length,sha256:mode==='wrong-digest'?'0'.repeat(64):sha,tests:mode==='missing-tests'?[]:['NSIS silent installation','installed Harness sessions and task states','installed desktop pet interactions','uninstall preserves community home','installed update notifications']})); }
else if(a[0]==='api' && a[1].endsWith('/releases')) console.log(JSON.stringify([{tag_name:'v0.2.1-rc.3-community.3',draft:true,assets:[{name:artifact,state:'uploaded',size:bytes.length,digest:'sha256:'+(mode==='upload-mismatch'?'0'.repeat(64):sha)}]}]));
else if(a[0]!=='release') process.exit(7);
`;
for (const mode of ['success', 'failed-run', 'wrong-source', 'wrong-digest', 'missing-tests', 'wrong-release-version', 'wrong-community-version', 'upload-mismatch']) {
  test(`publish Windows: ${mode}`, { skip: process.platform === 'win32' ? 'Publisher runs on the Unix release runner' : false }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-publish-test-'));
    try {
      const bin = join(root, 'bin'); await mkdir(bin); await writeFile(join(bin, 'gh'), fakeGh, { mode: 0o755 });
      const child = spawnSync(process.execPath, [publisher], { cwd: root, env: { ...process.env, PATH: bin + delimiter + process.env.PATH, QUALIFICATION_RUN_ID: '123', COMMUNITY_RELEASE_TAG: mode === 'wrong-release-version' ? 'v0.2.1-rc.4-community.3' : 'v0.2.1-rc.3-community.3', TEST_PUBLISH_MODE: mode }, timeout: 20000, encoding: 'utf8' });
      assert.equal(child.error, undefined); assert.equal(child.signal, null);
      const calls = (await readFile(join(root, 'calls.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
      const published = calls.some(args => args[0] === 'release' && args[1] === 'edit');
      assert.equal(published, mode === 'success', child.stderr);
      assert.equal(child.status === 0, mode === 'success', child.stderr);
      if (!['success', 'upload-mismatch'].includes(mode)) assert(!calls.some(args => args[0] === 'release'), 'unqualified files must not create a draft');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
