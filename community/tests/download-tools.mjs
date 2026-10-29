import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { downloadTools } from '../site/download-tools.js';
import { loadReleases } from '../site/release-manifest.js';

const run = promisify(execFile);
const bytes = Buffer.alloc(1024 * 1024, 42);
const entry = {
  platform: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
  url: 'https://github.com/AiW520/DSH-TuZi/releases/download/v1.0.0/dsh-tuzi-fixture.exe',
  sha256: createHash('sha256').update(bytes).digest('hex'),
};

test('recovery commands retain the versioned URL, checksum and bounded concurrency', () => {
  for (const platform of ['Windows', 'macOS', 'Linux']) {
    const tools = downloadTools({ ...entry, platform });
    assert.equal(tools.releaseUrl, 'https://github.com/AiW520/DSH-TuZi/releases/tag/v1.0.0');
    assert(tools.resume.includes(entry.url));
    assert(tools.resume.includes(entry.sha256));
    assert(tools.resume.includes('--continue-at -'));
    assert(tools.parallel.includes('--max-connection-per-server=4'));
    assert(tools.parallel.includes(`--checksum=sha-256=${entry.sha256}`));
  }
  for (const url of [entry.url + '?token=secret', entry.url.replace('github.com', 'other.example'), entry.url.replace('v1.0.0', '$(touch-pwned)'), entry.url.replace('github.com', 'user@github.com'), entry.url.replace('fixture.exe', 'fixture%27.exe')]) {
    assert.equal(downloadTools({ ...entry, url }), null);
  }
});

test('manifest recovers from a network error and 503 with a bounded retry budget', async () => {
  const retries = [], pauses = [];
  let calls = 0;
  const releases = await loadReleases({
    request: async () => {
      calls++;
      if (calls === 1) throw new TypeError('offline');
      if (calls === 2) return { ok: false, status: 503 };
      return { ok: true, json: async () => ({ schemaVersion: 1, releases: [] }) };
    },
    pause: async ms => { pauses.push(ms); }, onRetry: number => retries.push(number),
  });
  assert.deepEqual(releases, []);
  assert.deepEqual(retries, [2, 3]);
  assert.deepEqual(pauses, [1000, 2000]);
  assert.equal(calls, 3);
});

test('manifest stops on permanent errors, invalid data and exhausted retries', async () => {
  for (const [response, expected] of [
    [{ ok: false, status: 404 }, 1],
    [{ ok: false, status: 503 }, 3],
    [{ ok: true, json: async () => ({ schemaVersion: 99 }) }, 1],
    [null, 3],
  ]) {
    let calls = 0;
    await assert.rejects(loadReleases({ request: async () => { calls++; if (!response) throw new Error('offline'); return response; }, pause: async () => {} }));
    assert.equal(calls, expected);
  }
});

test('native curl resumes bytes, retries 503, rejects corruption and preserves existing installers', { timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-download-check-'));
  const ranges = [];
  let temporaryFailures = 0;
  let interruptNext = false;
  const server = createServer((req, res) => {
    if (temporaryFailures > 0) { temporaryFailures--; res.writeHead(503).end(); return; }
    ranges.push(req.headers.range || '');
    const start = req.headers.range ? Number(/^bytes=(\d+)-$/.exec(req.headers.range)?.[1]) : 0;
    if (!Number.isSafeInteger(start) || start >= bytes.length) { res.writeHead(416, { 'Content-Range': `bytes */${bytes.length}` }).end(); return; }
    const headers = { 'Content-Length': bytes.length - start, 'Accept-Ranges': 'bytes' };
    if (start) headers['Content-Range'] = `bytes ${start}-${bytes.length - 1}/${bytes.length}`;
    res.writeHead(start ? 206 : 200, headers);
    if (interruptNext) {
      interruptNext = false;
      const socket = res.socket;
      res.write(bytes.subarray(start, start + 65536), () => socket.end());
    } else res.end(bytes.subarray(start));
  });
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const tools = downloadTools(entry);
    const filename = join(root, tools.filename);
    const partial = filename + '.part';
    const script = join(root, process.platform === 'win32' ? 'download.ps1' : 'download.sh');
    // Exercise the exact published command against a local byte-range server, allowing HTTP only for this fixture.
    await writeFile(script, tools.resume.replaceAll("'=https'", "'=http'").replace(entry.url, `http://127.0.0.1:${server.address().port}/installer`));
    const execute = () => run(process.platform === 'win32' ? 'pwsh' : 'sh', process.platform === 'win32' ? ['-NoProfile', '-File', script] : [script], { cwd: root, timeout: 20000, env: { ...process.env, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' } });
    await writeFile(partial, bytes.subarray(0, 131072));
    temporaryFailures = 1;
    await execute();
    assert.deepEqual(await readFile(filename), bytes);
    assert(ranges.includes('bytes=131072-'), 'the partial file must resume at its existing size');
    await assert.rejects(access(partial));
    const calls = ranges.length;
    await assert.rejects(execute());
    assert.equal(ranges.length, calls, 'an existing installer must not cause another request');
    assert.deepEqual(await readFile(filename), bytes);
    await rm(filename);
    await writeFile(partial, Buffer.alloc(131072, 99));
    await assert.rejects(execute());
    await assert.rejects(access(filename), 'corrupted data must never acquire the installer filename');
    assert.equal((await readFile(partial)).length, bytes.length);
    await rm(partial);
    interruptNext = true;
    await assert.rejects(execute(), 'an incomplete response must not be reported as a completed installer');
    await assert.rejects(access(filename));
    const received = (await readFile(partial)).length;
    assert(received > 0 && received < bytes.length);
    await execute();
    assert(ranges.includes(`bytes=${received}-`));
    assert.deepEqual(await readFile(filename), bytes);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});
