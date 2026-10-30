import { qualifyInstalledUpdates } from './installed-updates.mjs';
import { createServer } from "node:http";
import { once } from "node:events";
import { mkdir, writeFile, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { _electron } = createRequire(new URL("../../apps/web/package.json", import.meta.url))("playwright");
if (!process.argv[2]) throw new Error("Pass the absolute path to the installed DSH-TuZi executable");
const root = await mkdtemp(join(process.env.DSH_COMMUNITY_EVIDENCE_DIR || tmpdir(), "dsh-tuzi-accept-"));
let n = 0;
let phase = "success";
const requests = [];
const timers = /* @__PURE__ */ new Set();
const server = createServer((req, res) => {
  let body = "";
  req.on("data", (b) => body += b);
  req.on("end", () => {
    const data = JSON.parse(body || "{}");
    requests.push({ model: data.model, tools: data.tools?.map((t) => t.function?.name), toolResults: data.messages?.filter((m) => m.role === "tool").length });
    if (data.tools) n++;
    const call = n;
    if (data.tools && phase === "error") {
      res.writeHead(403, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Invalid API key (qualification only)", type: "authentication_error", code: "invalid_api_key" } }));
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.flushHeaders();
    if (data.tools && phase === "cancel") return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      const useTodo = phase === "success" && call === 1 && data.tools?.some((t) => t.function?.name === "todo_write");
      const ask = phase === "waiting" && data.tools?.some((t) => t.function?.name === "ask_user_question");
      const delta = ask ? { role: "assistant", tool_calls: [{ index: 0, id: "tuzi_accept_wait", type: "function", function: { name: "ask_user_question", arguments: JSON.stringify({ questions: [{ id: "accept", question: "Continue the qualification?", options: [{ label: "Continue" }, { label: "Cancel" }] }] }) } }] } : useTodo ? { role: "assistant", tool_calls: [{ index: 0, id: "tuzi_accept_todo", type: "function", function: { name: "todo_write", arguments: JSON.stringify({ todos: [{ content: "验证真实桌宠状态", status: "completed" }] }) } }] } : { role: "assistant", content: data.messages?.some(m => m.role === 'system' && JSON.stringify(m.content).includes('只输出 JSON')) ? JSON.stringify({action:'wave',mood:'happy',text:'小林你好呀'}) : "Cloud bunny qualification passed." };
      res.write("data: " + JSON.stringify({ id: "qualification", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason: null }] }) + "\n\n");
      res.write("data: " + JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: useTodo || ask ? "tool_calls" : "stop" }], usage: { prompt_tokens: 10, completion_tokens: 8 } }) + "\n\ndata: [DONE]\n\n");
      res.end();
    }, data.tools ? 4e3 : 0);
    timers.add(timer);
    res.on("close", () => {
      clearTimeout(timer);
      timers.delete(timer);
    });
  });
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const home = join(root, "home");
const profile = join(home, "profiles/desktop");
await mkdir(profile, { recursive: true });
await mkdir(join(root, "workspace"));
await writeFile(join(profile, "cordis.patch.yml"), `- id: llm-pi-ai
  config:
    providers:
      community-test:
        api: openai-completions
        baseURL: http://127.0.0.1:${server.address().port}/v1
        apiKeyEnv: DSH_COMMUNITY_MOCK_KEY
        models:
          - id: community-test
            input: [text]
- id: agent-default-model
  config:
    provider: community-test
    model: community-test
`);
let app;
let log = "";
const errors = [];
const states = [];
try {
  app = await _electron.launch({ executablePath: process.argv[2], args: ["--user-data-dir=" + root + "/electron"], env: { ...process.env, DSH_TUZI_HOME: home, DSH_COMMUNITY_MOCK_KEY: "qualification-only", DSH_PET_SMOKE: "1", DSH_PET_SMOKE_OUT: root + "/pet.png", DSH_PET_SMOKE_AFTER_MS: "30000" }, timeout: 6e4 });
  app.process().stderr.on("data", (b) => log += b);
  app.process().stdout.on("data", (b) => log += b);
  const page = await app.firstWindow();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.waitForFunction(() => /新会话|New session/i.test(document.body.innerText), {}, { timeout: 6e4 });
  assert.match(await page.locator("body").innerText(), /DSH-TuZi/);
  const updates = await qualifyInstalledUpdates(app, page, root);
  await page.addInitScript(() => {
    Object.defineProperty(globalThis, "__ModuleLoader__", { configurable: true, set(target) {
      Object.defineProperty(globalThis, "__ModuleLoader__", { configurable: true, writable: true, value: target });
      const create = target.create.bind(target);
      target.create = function(options) {
        const c = options.staticModules["@deepseek-ai/cordis"];
        const p = c.RegistryService.prototype;
        const old = p.plugin;
        p.plugin = function(...args) {
          p.plugin = old;
          globalThis.__acceptCtx = this.ctx.root;
          return old.apply(this, args);
        };
        return create(options);
      };
    } });
  });
  await page.reload();
  await page.waitForFunction(() => globalThis.__acceptCtx?.get("sessions"), {}, { timeout: 6e4 });
  await page.evaluate(() => globalThis.__acceptCtx.loader.await());
  const session = await page.evaluate((cwd) => globalThis.__acceptCtx.sessions.create({ cwd }), join(root, "workspace"));
  console.log("session created");
  const host = log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=\S+)/)?.[1];
  if (!host) throw new Error("missing owned host URL");
  const login = await fetch(host, { redirect: "manual" });
  const cookie = login.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
  const origin = new URL(host).origin;
  const visibility = async () => {
    const response = await fetch(origin + '/dsh-pet-7340/config', { headers: { cookie } });
    assert(response.ok);
    const config = await response.json();
    return config.main.pets.find(pet => pet.id === 'cloud-bunny').display;
  };
  await page.getByRole('button', { name: /关闭桌面云朵兔|Hide desktop bunny/ }).click();
  await page.getByRole('button', { name: /开启桌面云朵兔|Show desktop bunny/ }).waitFor();
  assert.equal(await visibility(), 'none', 'sidebar switch must persist hidden state');
  await page.reload();
  await page.getByRole('button', { name: /开启桌面云朵兔|Show desktop bunny/ }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /开启桌面云朵兔|Show desktop bunny/ }).click();
  await page.getByRole('button', { name: /关闭桌面云朵兔|Hide desktop bunny/ }).waitFor();
  assert.equal(await visibility(), 'desktop', 'a hidden bunny must be recoverable from the main app');
  await page.waitForFunction(() => globalThis.__acceptCtx?.get('sessions'), {}, { timeout: 30000 });
  await page.getByRole('button', { name: '陪伴设置与聊天' }).click();
  await page.getByLabel('供应商', { exact:true }).selectOption('community-test');
  await page.getByLabel('陪伴模型', { exact:true }).selectOption('community-test');
  await page.getByLabel('开启 AI 陪伴').check();
  await page.getByLabel('希望兔兔怎样称呼你').fill('小林');
  await page.getByRole('button', { name:'保存设置', exact:true }).click();
  await page.getByRole('status').filter({ hasText:'已保存' }).waitFor();
  await page.getByLabel('和云朵兔说句话').fill('你好，挥挥手吧');
  await page.getByRole('button', { name:'发送', exact:true }).click();
  await page.getByLabel('陪伴聊天记录').getByText('小林你好呀', { exact:false }).waitFor({timeout:15000});
  await page.screenshot({path:join(root, 'companion-chat.png')});
  const readCompanion = async () => (await fetch(origin + '/dsh-pet-7340/companion', {headers:{cookie}})).json();
  assert.equal((await readCompanion()).usage.calls,1);
  await page.getByRole('button', {name:'立即关闭 AI',exact:true}).click();
  await page.waitForFunction(() => !document.querySelector('dialog input[type=checkbox]').checked);
  const disabled = await fetch(origin + '/dsh-pet-7340/companion/chat?pet=cloud-bunny&surface=desktop', {method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({text:'不要调用模型'})});
  assert.equal((await disabled.json()).reason,'disabled');
  assert.equal((await readCompanion()).usage.calls,1);
  await page.getByRole('button',{name:'清空记忆',exact:true}).click();
  await page.getByRole('status').filter({hasText:'已清空'}).waitFor();
  assert.equal((await readCompanion()).history.length,0);
  await page.getByRole('button',{name:'关闭陪伴设置'}).click();
  console.log('PASS installed companion settings, explicit provider, real adapter/mock response, memory, disabled desktop chat and budget');
  const getState = async () => {
    const response = await fetch(origin + "/dsh-pet-7340/state", { headers: { cookie } });
    if (!response.ok) throw new Error("pet state HTTP " + response.status);
    return response.json();
  };
  assert.equal((await getState()).sections.workStatus.data, null);
  const prompt = await page.evaluate((sessionId) => globalThis.__acceptCtx.remote.session.prompt({ sessionId, requestId: crypto.randomUUID(), mode: "queue", content: [{ type: "text", text: "Perform the desktop companion qualification." }] }), session);
  console.log("prompt", JSON.stringify(prompt));
  const readState = async () => (await getState()).sections.workStatus.data;
  async function waitState(expected) {
    const end = Date.now() + 3e4;
    while (Date.now() < end) {
      const state = await readState();
      states.push({ phase, ...state });
      if ((state?.state ?? null) === expected) return;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("Pet did not reach " + expected + " during " + phase);
  }
  assert.equal(prompt.ok, true);
  await waitState("success");
  assert(states.some((s) => s.state === "thinking"));
  assert(states.some((s) => s.state === "working"));
  assert(requests.some((r) => r.toolResults === 1));
  const send = () => page.evaluate((sessionId) => globalThis.__acceptCtx.remote.session.prompt({ sessionId, requestId: crypto.randomUUID(), mode: "queue", content: [{ type: "text", text: "Run the next qualification phase." }] }), session);
  const cancel = () => page.evaluate((sessionId) => globalThis.__acceptCtx.remote.session.cancel({ sessionId }), session);
  phase = "cancel";
  assert.equal((await send()).ok, true);
  await waitState("thinking");
  assert.equal((await cancel()).ok, true);
  await waitState(null);
  phase = "error";
  assert.equal((await send()).ok, true);
  await waitState("error");
  phase = "waiting";
  assert.equal((await send()).ok, true);
  await waitState("waiting");
  assert.equal((await cancel()).ok, true);
  await waitState(null);
  assert.deepEqual(errors, []);
  await page.screenshot({ path: root + "/app.png" });
  await writeFile(root + "/report.json", JSON.stringify({ requests, states, errors, updates }, null, 2));
  console.log("PASS installed app, community branding, real Harness tool execution, thinking/working/success/error/waiting/cancellation; no renderer errors.");
} finally {
  if (app) await app.close();
  for (const t of timers) clearTimeout(t);
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  await writeFile(root + "/launch.log", log);
  console.log("EVIDENCE", root);
}
