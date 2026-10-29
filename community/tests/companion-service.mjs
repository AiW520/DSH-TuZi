import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CompanionService, DEFAULT_SETTINGS, settingsFrom, parseDecision } from '../pet/src/companion-service.mjs';
const valid = JSON.stringify({ action: 'wave', mood: 'happy', text: '你好呀' });
async function fixture(t, generate = async () => valid) {
  const root = await mkdtemp(join(tmpdir(), 'bunny-ai-')); t.after(() => rm(root, { recursive: true, force: true }));
  let time = new Date(2026, 9, 29, 12).getTime();
  const env = { visible: true, busy: false };
  const options = { file: join(root, 'companion.json'), generate, environment: () => env, now: () => time };
  const s = new CompanionService(options); t.after(() => s.dispose()); await s.get();
  return { s, options, env, advance: ms => time += ms };
}
test('complete defaults, strict settings and closed action vocabulary', () => {
  assert.deepEqual(settingsFrom({}), DEFAULT_SETTINGS);
  for (const input of [{ enabled: true }, { dailyLimit: 0 }, { dailyLimit: 1.5 }, { activity: 'wild' }, { unexpected: true }, { nickname: 'x'.repeat(41) }]) assert.throws(() => settingsFrom(input));
  assert.equal(parseDecision(valid).action, 'wave');
  assert.throws(() => parseDecision('{"action":"exec","mood":"happy","text":"x"}'));
  assert.throws(() => parseDecision('not json'));
});
test('no AI by default; explicit model, durable budget, cooldown and daily rollover', async t => {
  const calls=[]; const {s, options, advance}=await fixture(t, async input => {calls.push(input);return valid;});
  assert.equal((await s.think({trigger:'idle'})).reason,'disabled'); assert.equal(calls.length,0);
  await s.update({enabled:true,provider:'tuzi',model:'custom',dailyLimit:2});
  assert((await s.think({trigger:'idle'})).ok);
  advance(6000); assert.equal((await s.think({trigger:'touch'})).reason,'cooldown');
  assert((await s.think({trigger:'chat',text:'你好'})).ok);
  assert.equal(calls[1].settings.model,'custom'); assert.equal((await s.get()).history.length,2);
  s.dispose(); const reopened=new CompanionService(options);t.after(()=>reopened.dispose());
  assert.equal((await reopened.think({trigger:'chat',text:'再聊'})).reason,'daily-limit');
  advance(86400000); assert((await reopened.think({trigger:'idle'})).ok);
  assert.equal((await reopened.get()).usage.calls,1);
});
test('single flight; disable aborts generation and rejects a late reply without memory write', async t => {
  let release, started; const began=new Promise(r=>started=r); let signal;
  const {s}=await fixture(t, input=>{signal=input.signal;started();return new Promise(r=>release=r);});
  await s.update({enabled:true,provider:'tuzi',model:'custom'});
  const pending=s.think({trigger:'chat',text:'测试'});await began;
  assert.equal((await s.think({trigger:'idle'})).reason,'busy');
  await s.update({enabled:false});assert(signal.aborted);release(valid);
  assert.equal((await pending).ok,false);assert.equal((await s.get()).history.length,0);assert.equal((await s.get()).decision,null);
});
test('hidden/busy/quiet gate; manual chat history is capped and clear keeps budget',async t=>{
  const {s,env,advance}=await fixture(t);
  await s.update({enabled:true,provider:'tuzi',model:'custom',dailyLimit:20,nickname:'小林',preferences:'喜欢安静'});
  env.visible=false;assert.equal((await s.think({trigger:'idle'})).reason,'disabled');
  env.visible=true;env.busy=true;assert.equal((await s.think({trigger:'idle'})).reason,'quiet');
  env.busy=false;await s.update({activity:'quiet'});assert.equal((await s.think({trigger:'idle'})).reason,'quiet');
  for(let i=0;i<7;i++){advance(6000);assert((await s.think({trigger:'chat',text:'hello '+i})).ok);}
  assert.equal((await s.get()).history.length,10);
  await s.clearMemory();const result=await s.get();assert.equal(result.history.length,0);assert.equal(result.settings.nickname,'');assert.equal(result.settings.preferences,'');assert.equal(result.usage.calls,7);
});
test('invalid model response consumes one attempt and does not produce a fake reply',async t=>{
  const {s}=await fixture(t,async()=>'{"action":"delete_files"}');await s.update({enabled:true,provider:'tuzi',model:'custom'});
  assert.equal((await s.think({trigger:'idle'})).reason,'model-error');assert.equal((await s.get()).usage.calls,1);assert.equal((await s.get()).decision,null);
});
test('task change / explicit cancellation and external abort settle without waiting for provider',async t=>{
  let started;const began=new Promise(r=>started=r);const {s}=await fixture(t,()=>{started();return new Promise(()=>{});});
  await s.update({enabled:true,provider:'tuzi',model:'custom'});const controller=new AbortController();
  const pending=s.think({trigger:'chat',text:'hi'},controller.signal);await began;controller.abort();
  assert.equal((await pending).reason,'cancelled');assert.equal((await s.get()).pending,false);
});
test('old partial settings backfill, corrupt files fail closed, disk failure preserves state',async t=>{
  const {s,options}=await fixture(t);await s.update({nickname:'old'});s.dispose();
  const raw=JSON.parse(await readFile(options.file));raw.settings={nickname:'old'};await writeFile(options.file,JSON.stringify(raw));
  const reopened=new CompanionService(options);t.after(()=>reopened.dispose());assert.deepEqual((await reopened.get()).settings,{...DEFAULT_SETTINGS,nickname:'old'});
  reopened.persist=async()=>{throw new Error('disk full');};await assert.rejects(reopened.update({nickname:'new'}));assert.equal((await reopened.get()).settings.nickname,'old');
  await writeFile(options.file,'broken');const corrupt=new CompanionService(options);t.after(()=>corrupt.dispose());await assert.rejects(corrupt.get());await assert.rejects(corrupt.think({trigger:'idle'}));
});

test('cancellation during durable reservation prevents the network call', async t => {
  let started, release, calls = 0;
  const began = new Promise(resolve => started = resolve);
  const {s} = await fixture(t, async () => { calls++; return valid; });
  await s.update({enabled:true,provider:'tuzi',model:'custom'});
  const persist = s.persist.bind(s);
  s.persist = async next => { started(); await new Promise(resolve => release = resolve); await persist(next); };
  const pending = s.think({trigger:'idle'});
  await began; s.cancel(); release();
  assert.equal((await pending).reason, 'cancelled');
  assert.equal(calls, 0); assert.equal((await s.get()).decision, null);
});
test('deadline releases single flight even when a provider ignores abort', async t => {
  const {s} = await fixture(t, () => new Promise(() => {}));
  await s.update({enabled:true,provider:'tuzi',model:'custom'});
  s.timeoutMs = 20;
  const keepAlive = setInterval(() => {}, 1000);
  try { assert.equal((await s.think({trigger:'idle'})).reason,'cancelled'); }
  finally { clearInterval(keepAlive); }
  assert.equal((await s.get()).pending, false); assert.equal((await s.get()).usage.calls, 1);
});
