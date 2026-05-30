#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const path = require("path");
const { URL } = require("url");

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || process.cwd());
const hephaRoot = path.join(root, ".hepha");
const summaryRoot = path.join(hephaRoot, "summary");
const requestedPort = args.port || process.env.HEPHA_PORT;
const port = Number(requestedPort || 3000);
const host = args.host || process.env.HEPHA_HOST || "127.0.0.1";
const explicitPort = Boolean(requestedPort);

const server = http.createServer((req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return sendHtml(res, renderIndex(loadDashboard()));
    }

    if (url.pathname === "/task") {
      const rel = url.searchParams.get("file") || "";
      const file = safeSummaryPath(rel);
      if (!file) return sendNotFound(res, "未找到任务");
      return sendHtml(res, renderTask(file, rel, loadDashboard()));
    }

    if (url.pathname === "/artifact") {
      const name = url.searchParams.get("name") || "";
      const file = safeArtifactPath(name);
      if (!file) return sendNotFound(res, "未找到运行产物");
      return sendHtml(res, renderArtifact(file, name, loadDashboard()));
    }

    if (url.pathname === "/health") {
      return sendJson(res, { ok: true, root, hephaRoot });
    }

    return sendNotFound(res, "未找到页面");
  } catch (error) {
    sendError(res, error);
  }
});

startServer(port);

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      i += 1;
    }
  }
  return parsed;
}

function startServer(nextPort) {
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && !explicitPort && nextPort < port + 10) {
      startServer(nextPort + 1);
      return;
    }
    console.error(`Hepha 本地服务启动失败：${error.message}`);
    process.exitCode = 1;
  });

  server.listen(nextPort, host, () => {
    console.log(`Hepha 本地 review 已启动：http://localhost:${nextPort}`);
    if (host !== "localhost") console.log(`绑定地址：http://${host}:${nextPort}`);
    console.log(`项目根目录：${root}`);
  });
}

function loadDashboard() {
  const tasks = scanTasks(summaryRoot);
  const byDate = groupTasks(tasks);
  const artifacts = ["backlog.md", "progress.md", "decision-log.md"]
    .map((name) => {
      const file = path.join(hephaRoot, name);
      return fs.existsSync(file) ? { name, file, stats: fs.statSync(file) } : null;
    })
    .filter(Boolean);

  return {
    root,
    hephaRoot,
    summaryRoot,
    tasks,
    byDate,
    artifacts,
    generatedAt: new Date().toISOString(),
  };
}

function scanTasks(base) {
  if (!fs.existsSync(base)) return [];

  const tasks = [];
  walk(base, (file) => {
    if (!file.endsWith(".md")) return;
    const rel = path.relative(base, file);
    const parts = rel.split(path.sep);
    const raw = fs.readFileSync(file, "utf8");
    const parsed = parseMarkdown(raw);
    const stats = fs.statSync(file);
    const date = realValue(parsed.frontmatter.date) || parts[0] || "unknown";
    const person = realValue(parsed.frontmatter.person) || parts[1] || "unknown";
    const taskId = realValue(parsed.frontmatter.task_id) || path.basename(file, ".md");
    const title = realValue(parsed.frontmatter.title) || firstHeading(parsed.body) || path.basename(file, ".md");

    tasks.push({
      file,
      rel,
      date,
      person,
      taskId,
      title,
      state: realValue(parsed.frontmatter.state) || "unknown",
      risk: realValue(parsed.frontmatter.risk) || "unknown",
      commit: realValue(parsed.frontmatter.commit) || "",
      updatedAt: stats.mtime.toISOString(),
      excerpt: makeExcerpt(parsed.body),
    });
  });

  return tasks.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    if (a.person !== b.person) return a.person.localeCompare(b.person);
    return a.taskId.localeCompare(b.taskId);
  });
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, visit);
    if (entry.isFile()) visit(file);
  }
}

function groupTasks(tasks) {
  const dates = new Map();
  for (const task of tasks) {
    if (!dates.has(task.date)) dates.set(task.date, new Map());
    const people = dates.get(task.date);
    if (!people.has(task.person)) people.set(task.person, []);
    people.get(task.person).push(task);
  }
  return Array.from(dates.entries()).map(([date, people]) => ({
    date,
    people: Array.from(people.entries()).map(([person, items]) => ({ person, tasks: items })),
  }));
}

function safeSummaryPath(rel) {
  if (!rel || rel.includes("\0")) return null;
  const resolved = path.resolve(summaryRoot, rel);
  if (!resolved.startsWith(path.resolve(summaryRoot) + path.sep)) return null;
  if (!fs.existsSync(resolved) || !resolved.endsWith(".md")) return null;
  return resolved;
}

function safeArtifactPath(name) {
  const allowed = new Set(["backlog.md", "progress.md", "decision-log.md"]);
  if (!allowed.has(name)) return null;
  const resolved = path.join(hephaRoot, name);
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

function renderIndex(model) {
  const taskCount = model.tasks.length;
  const peopleCount = new Set(model.tasks.map((task) => `${task.date}/${task.person}`)).size;
  const latest = model.tasks[0];

  return layout({
    title: "Hepha Summary",
    model,
    content: `
      <section class="hero">
        <div>
          <p class="eyebrow">Hepha Local Review</p>
          <h1>任务沉淀</h1>
          <p class="muted">${escapeHtml(model.root)}</p>
        </div>
        <div class="heroStats">
          ${stat("任务", taskCount)}
          ${stat("人物", peopleCount)}
          ${stat("最新日期", latest ? latest.date : "-")}
        </div>
      </section>

      ${renderArtifacts(model.artifacts)}

      <section class="timeline">
        ${model.byDate.length ? model.byDate.map(renderDateGroup).join("") : renderEmptyState(model)}
      </section>
    `,
  });
}

function renderDateGroup(group) {
  return `
    <article class="dateGroup">
      <header>
        <h2>${escapeHtml(group.date)}</h2>
        <span>${group.people.reduce((sum, person) => sum + person.tasks.length, 0)} 个任务</span>
      </header>
      ${group.people.map(renderPersonGroup).join("")}
    </article>
  `;
}

function renderPersonGroup(group) {
  return `
    <div class="personGroup">
      <h3>${escapeHtml(group.person)}</h3>
      <div class="taskGrid">
        ${group.tasks.map(renderTaskCard).join("")}
      </div>
    </div>
  `;
}

function renderTaskCard(task) {
  return `
    <a class="taskCard" href="/task?file=${encodeURIComponent(task.rel)}">
      <div class="cardTop">
        <span class="taskId">${escapeHtml(task.taskId)}</span>
        <span class="pill ${stateClass(task.state)}">${escapeHtml(task.state)}</span>
      </div>
      <h4>${escapeHtml(task.title)}</h4>
      <p>${escapeHtml(task.excerpt)}</p>
      <footer>
        <span>风险：${escapeHtml(task.risk)}</span>
        <span>${formatTime(task.updatedAt)}</span>
      </footer>
    </a>
  `;
}

function renderTask(file, rel, model) {
  const raw = fs.readFileSync(file, "utf8");
  const parsed = parseMarkdown(raw);
  const title = realValue(parsed.frontmatter.title) || firstHeading(parsed.body) || path.basename(file, ".md");

  return layout({
    title,
    model,
    content: `
      <nav class="crumb"><a href="/">Summary</a><span>/</span><span>${escapeHtml(rel)}</span></nav>
      <article class="doc">
        <header class="docHeader">
          <div>
            <p class="eyebrow">${escapeHtml(realValue(parsed.frontmatter.task_id) || path.basename(file, ".md"))}</p>
            <h1>${escapeHtml(title)}</h1>
          </div>
          <div class="metaPanel">
            ${meta("日期", realValue(parsed.frontmatter.date))}
            ${meta("人物", realValue(parsed.frontmatter.person))}
            ${meta("状态", realValue(parsed.frontmatter.state))}
            ${meta("风险", realValue(parsed.frontmatter.risk))}
            ${meta("提交", realValue(parsed.frontmatter.commit))}
          </div>
        </header>
        <div class="markdown">${markdownToHtml(parsed.body)}</div>
      </article>
    `,
  });
}

function renderArtifact(file, name, model) {
  const raw = fs.readFileSync(file, "utf8");
  return layout({
    title: name,
    model,
    content: `
      <nav class="crumb"><a href="/">Summary</a><span>/</span><span>${escapeHtml(name)}</span></nav>
      <article class="doc">
        <header class="docHeader">
          <div>
            <p class="eyebrow">Hepha 运行产物</p>
            <h1>${escapeHtml(name)}</h1>
          </div>
        </header>
        <div class="markdown">${markdownToHtml(raw)}</div>
      </article>
    `,
  });
}

function renderArtifacts(artifacts) {
  if (!artifacts.length) return "";
  return `
    <section class="artifacts">
      ${artifacts.map((artifact) => `
        <a href="/artifact?name=${encodeURIComponent(artifact.name)}">
          <span>${escapeHtml(artifact.name)}</span>
          <small>${formatTime(artifact.stats.mtime.toISOString())}</small>
        </a>
      `).join("")}
    </section>
  `;
}

function renderEmptyState(model) {
  return `
    <div class="empty">
      <h2>还没有 summary</h2>
      <p>按 Hepha 循环完成任务后，将 Markdown 写入 <code>${escapeHtml(path.relative(model.root, model.summaryRoot))}</code>。</p>
      <pre><code>.hepha/summary/YYYY-MM-DD/person/TASK-XXX.md</code></pre>
    </div>
  `;
}

function layout({ title, content, model }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · Hepha</title>
  <style>${css()}</style>
</head>
<body>
  <aside class="sidebar">
    <a class="brand" href="/">
      <span class="mark">H</span>
      <span>Hepha</span>
    </a>
    <div class="sideBlock">
      <p>项目</p>
      <strong>${escapeHtml(path.basename(model.root))}</strong>
    </div>
    <div class="sideBlock">
      <p>Summary 根目录</p>
      <code>${escapeHtml(path.relative(model.root, model.summaryRoot) || ".")}</code>
    </div>
    <div class="sideBlock">
      <p>生成时间</p>
      <code>${escapeHtml(formatTime(model.generatedAt))}</code>
    </div>
  </aside>
  <main class="main">${content}</main>
</body>
</html>`;
}

function parseMarkdown(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw };
  return { frontmatter: parseFrontmatter(match[1]), body: match[2] };
}

function parseFrontmatter(raw) {
  const data = {};
  for (const line of raw.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    data[key] = value;
  }
  return data;
}

function realValue(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  if (/^\[[^\]]+\]$/.test(text)) return "";
  if (/^YYYY-MM-DD$/i.test(text)) return "";
  if (/^(hash|none|\[hash.*\])$/i.test(text)) return "";
  return text;
}

function markdownToHtml(raw) {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let inCode = false;
  let inList = false;
  let inTable = false;
  let tableRows = [];

  const closeList = () => {
    if (inList) out.push("</ul>");
    inList = false;
  };
  const closeTable = () => {
    if (!inTable) return;
    out.push(renderTable(tableRows));
    tableRows = [];
    inTable = false;
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      closeList();
      closeTable();
      if (inCode) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        out.push("<pre><code>");
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      out.push(escapeHtml(line) + "\n");
      continue;
    }

    if (isTableLine(line)) {
      closeList();
      inTable = true;
      tableRows.push(line);
      continue;
    }
    closeTable();

    if (!line.trim()) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.+)$/);
    if (bullet) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();
  closeTable();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

function renderTable(rows) {
  const parsed = rows
    .filter((row) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(row))
    .map((row) => row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim()));
  if (!parsed.length) return "";
  const [head, ...body] = parsed;
  return `<table><thead><tr>${head.map((cell) => `<th>${inlineMarkdown(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inlineMarkdown(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function isTableLine(line) {
  return /^\s*\|.+\|\s*$/.test(line);
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function firstHeading(body) {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function makeExcerpt(body) {
  return body
    .replace(/^---[\s\S]*?---/, "")
    .replace(/^#+\s+.+$/gm, "")
    .replace(/[`*_>#|\[\]()]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 32)
    .join(" ") || "暂无 summary 内容。";
}

function stat(label, value) {
  return `<div class="stat"><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function meta(label, value) {
  if (!value) return "";
  return `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function stateClass(state) {
  if (state === "completed" || state === "done") return "ok";
  if (state === "blocked" || state === "failed") return "bad";
  if (state === "doing" || state === "in_progress") return "warn";
  return "";
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sendHtml(res, body) {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function sendJson(res, data) {
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(data, null, 2));
}

function sendNotFound(res, message) {
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end(message);
}

function sendError(res, error) {
  res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
  res.end(error.stack || String(error));
}

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function css() {
  return `
:root {
  color-scheme: dark;
  --bg: #171717;
  --panel: #20201f;
  --panel-2: #262624;
  --line: #3a3834;
  --text: #f4f0e8;
  --muted: #aaa39a;
  --soft: #d7c8b8;
  --accent: #d49a66;
  --accent-2: #b98f64;
  --green: #7bbf87;
  --red: #d87878;
  --yellow: #d5b56d;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: 14px/1.55 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
a { color: inherit; text-decoration: none; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
.sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  width: 260px;
  padding: 20px;
  background: #141413;
  border-right: 1px solid var(--line);
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 28px;
}
.mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 7px;
  background: var(--accent);
  color: #1b120b;
}
.sideBlock {
  padding: 14px 0;
  border-top: 1px solid var(--line);
}
.sideBlock p, .eyebrow {
  margin: 0 0 6px;
  color: var(--accent-2);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}
.sideBlock strong, .sideBlock code {
  display: block;
  color: var(--soft);
  word-break: break-word;
}
.main {
  min-height: 100vh;
  margin-left: 260px;
  padding: 28px;
}
.hero {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 8px 0 24px;
  border-bottom: 1px solid var(--line);
}
h1, h2, h3, h4, p { margin-top: 0; }
h1 { font-size: 36px; line-height: 1.1; margin-bottom: 10px; }
h2 { font-size: 22px; }
h3 { font-size: 15px; color: var(--soft); }
h4 { font-size: 16px; margin-bottom: 8px; }
.muted { color: var(--muted); }
.heroStats {
  display: grid;
  grid-template-columns: repeat(3, minmax(90px, 1fr));
  gap: 10px;
  min-width: 360px;
}
.stat, .artifacts a, .taskCard, .empty, .doc {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.stat { padding: 14px; }
.stat span, .taskCard footer, .metaPanel span {
  color: var(--muted);
  font-size: 12px;
}
.stat strong {
  display: block;
  margin-top: 4px;
  font-size: 20px;
}
.artifacts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 20px 0;
}
.artifacts a {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  color: var(--soft);
}
.timeline { display: grid; gap: 18px; }
.dateGroup {
  padding: 18px 0 0;
  border-top: 1px solid var(--line);
}
.dateGroup > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}
.dateGroup > header span { color: var(--muted); }
.personGroup { margin-bottom: 20px; }
.taskGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.taskCard {
  display: flex;
  flex-direction: column;
  min-height: 190px;
  padding: 16px;
  transition: border-color 0.15s ease, transform 0.15s ease;
}
.taskCard:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
}
.cardTop, .taskCard footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.taskId {
  color: var(--accent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 700;
}
.pill {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  color: var(--soft);
  font-size: 12px;
}
.pill.ok { color: var(--green); }
.pill.bad { color: var(--red); }
.pill.warn { color: var(--yellow); }
.taskCard p {
  flex: 1;
  color: var(--muted);
}
.crumb {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  color: var(--muted);
}
.crumb a { color: var(--accent); }
.doc { padding: 24px; }
.docHeader {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding-bottom: 18px;
  margin-bottom: 22px;
  border-bottom: 1px solid var(--line);
}
.metaPanel {
  display: grid;
  grid-template-columns: repeat(2, minmax(120px, 1fr));
  gap: 12px;
  min-width: 320px;
}
.metaPanel strong {
  display: block;
  margin-top: 2px;
  word-break: break-word;
}
.markdown {
  max-width: 980px;
  color: var(--soft);
}
.markdown h1, .markdown h2, .markdown h3 {
  color: var(--text);
  margin-top: 24px;
}
.markdown p, .markdown li { color: var(--soft); }
.markdown a { color: var(--accent); }
.markdown code {
  padding: 2px 5px;
  border-radius: 5px;
  background: #111;
  color: #f3dcc8;
}
.markdown pre {
  overflow: auto;
  padding: 14px;
  border-radius: 8px;
  background: #111;
  border: 1px solid var(--line);
}
.markdown pre code { padding: 0; background: transparent; }
table {
  width: 100%;
  border-collapse: collapse;
  margin: 14px 0;
}
th, td {
  padding: 9px 10px;
  border: 1px solid var(--line);
  text-align: left;
  vertical-align: top;
}
th { background: var(--panel-2); color: var(--text); }
.empty { padding: 24px; color: var(--muted); }
@media (max-width: 820px) {
  .sidebar { position: static; width: auto; }
  .main { margin-left: 0; padding: 18px; }
  .hero, .docHeader { flex-direction: column; }
  .heroStats, .artifacts, .metaPanel { grid-template-columns: 1fr; min-width: 0; }
  h1 { font-size: 30px; }
}`;
}
