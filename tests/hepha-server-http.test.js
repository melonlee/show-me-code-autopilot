const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");

const { createWorkspace } = require("../skills/hepha/scripts/hepha-core");
const serverScript = path.resolve(__dirname, "../skills/hepha/scripts/hepha-server.js");

test("HTML server renders task timeline, personal assets, search and security headers", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hepha-http-"));
  createWorkspace({ root, requirement: "HTML 验收", person: "Browser Tester" });
  const summaryDir = path.join(root, ".hepha", "summary", "2026-09-09", "browser-tester");
  fs.mkdirSync(summaryDir, { recursive: true });
  fs.writeFileSync(path.join(summaryDir, "TASK-001.md"), `---\ntask_id: TASK-001\ntitle: \"实现搜索页面\"\ndate: 2026-09-09\nperson: \"Browser Tester\"\nstate: done\nrisk: low\ncommit: abc123\n---\n# 实现搜索页面\n\n完成个人知识检索。\n`);
  const assetDir = path.join(root, ".hepha", "wiki", "assets");
  fs.writeFileSync(path.join(assetDir, "PAT-SEARCH.md"), `---\nasset_id: PAT-SEARCH\ntype: pattern\ntitle: \"本地全文搜索模式\"\nstatus: published\ntags: [search, wiki]\nsource_tasks: [TASK-001]\nsource_specs: [SPEC-001]\nsource_tests: [tests/search.test.js]\nsource_commits: [abc123]\nconfidence: verified\nsensitivity: personal\n---\n# 本地全文搜索模式\n\n通过规范化文本建立轻量检索。\n`);
  fs.writeFileSync(path.join(root, ".hepha", "evidence", "TASK-001.json"), JSON.stringify({
    task_id: "TASK-001",
    checks: [
      { phase: "red", command: "node --test", exit_code: 1 },
      { phase: "green", command: "node --test", exit_code: 0 },
      { phase: "regression", command: "npm test", exit_code: 0 },
    ],
    reviews: {
      spec: { status: "passed", reviewer: "Spec Reviewer" },
      code: { status: "passed", reviewer: "Code Reviewer" },
      human: { status: "passed", reviewer: "Owner" },
    },
  }, null, 2));

  const port = await reservePort();
  const child = spawn(process.execPath, [serverScript, "--root", root, "--port", String(port)], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => child.kill("SIGTERM"));
  await waitForServer(port);

  const home = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-security-policy"), /default-src 'none'/);
  const homeHtml = await home.text();
  assert.match(homeHtml, /个人 Wiki/);
  assert.match(homeHtml, /本地全文搜索模式/);
  assert.match(homeHtml, /实现搜索页面/);

  const task = await fetch(`http://127.0.0.1:${port}/task?file=${encodeURIComponent("2026-09-09/browser-tester/TASK-001.md")}`);
  assert.equal(task.status, 200);
  const taskHtml = await task.text();
  assert.match(taskHtml, /交付证据/);
  assert.match(taskHtml, /Spec Reviewer/);
  assert.match(taskHtml, /PAT-SEARCH/);

  const search = await fetch(`http://127.0.0.1:${port}/search?q=${encodeURIComponent("全文搜索")}`);
  assert.equal(search.status, 200);
  assert.match(await search.text(), /PAT-SEARCH/);

  const asset = await fetch(`http://127.0.0.1:${port}/asset?scope=project&file=${encodeURIComponent("assets/PAT-SEARCH.md")}`);
  assert.equal(asset.status, 200);
  const assetHtml = await asset.text();
  assert.match(assetHtml, /来源谱系/);
  assert.match(assetHtml, /TASK-001/);

  const post = await fetch(`http://127.0.0.1:${port}/`, { method: "POST" });
  assert.equal(post.status, 405);
});

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(port) {
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw lastError || new Error("server did not start");
}
