#!/usr/bin/env node

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const { URL } = require("url");
const { parseFrontmatter: parseStructuredFrontmatter, scanMarkdownDirectory } = require("./hepha-core");

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || process.cwd());
const hephaRoot = path.join(root, ".hepha");
const summaryRoot = path.join(hephaRoot, "summary");
const configuredWikiRoot = args["wiki-root"] || process.env.HEPHA_WIKI_ROOT || path.join(os.homedir(), ".hepha", "wiki");
const personalWikiRoot = path.resolve(configuredWikiRoot);
const requestedPort = args.port || process.env.HEPHA_PORT;
const port = Number(requestedPort || 3000);
const host = args.host || process.env.HEPHA_HOST || "127.0.0.1";
const explicitPort = Boolean(requestedPort);

const server = http.createServer((req, res) => {
  try {
    if (!new Set(["GET", "HEAD"]).has(req.method || "GET")) return sendMethodNotAllowed(res);
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

    if (url.pathname === "/asset") {
      const rel = url.searchParams.get("file") || "";
      const scope = url.searchParams.get("scope") === "personal" ? "personal" : "project";
      const file = safeWikiPath(rel, scope);
      if (!file) return sendNotFound(res, "未找到个人资产");
      return sendHtml(res, renderAsset(file, rel, loadDashboard()));
    }

    if (url.pathname === "/search") {
      return sendHtml(res, renderSearch(url.searchParams.get("q") || "", loadDashboard()));
    }

    if (url.pathname === "/health") {
      return sendJson(res, { ok: true, root, hephaRoot });
    }

    return sendNotFound(res, "未找到页面");
  } catch (error) {
    sendError(res, error);
  }
});

if (require.main === module) startServer(port);

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
  const wikiRoot = path.join(hephaRoot, "wiki");
  const projectAssets = [
    ...scanWiki(path.join(wikiRoot, "assets"), wikiRoot, "project"),
    ...scanWiki(path.join(wikiRoot, "candidates"), wikiRoot, "project"),
  ];
  const assets = [
    ...projectAssets,
    ...scanWiki(path.join(personalWikiRoot, "assets"), personalWikiRoot, "personal")
      .filter((asset) => !(asset.sourceProject && asset.sourceProject === path.basename(root) && projectAssets.some((item) => item.assetId === asset.assetId))),
  ];
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
    assets,
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

function scanWiki(base, wikiRoot, scope) {
  return scanMarkdownDirectory(base).map((item) => {
    const meta = item.frontmatter;
    const tags = Array.isArray(meta.tags) ? meta.tags : meta.tags ? [meta.tags] : [];
    const sourceTasks = Array.isArray(meta.source_tasks) ? meta.source_tasks : meta.source_tasks ? [meta.source_tasks] : [];
    return {
      file: item.file,
      rel: path.relative(wikiRoot, item.file),
      scope,
      assetId: meta.asset_id || path.basename(item.file, ".md"),
      type: meta.type || "unknown",
      title: meta.title || firstHeading(item.body) || path.basename(item.file, ".md"),
      status: meta.status || "candidate",
      tags,
      sourceTasks,
      sourceSpecs: Array.isArray(meta.source_specs) ? meta.source_specs : meta.source_specs ? [meta.source_specs] : [],
      sourceTests: Array.isArray(meta.source_tests) ? meta.source_tests : meta.source_tests ? [meta.source_tests] : [],
      sourceCommits: Array.isArray(meta.source_commits) ? meta.source_commits : meta.source_commits ? [meta.source_commits] : [],
      confidence: meta.confidence || "unverified",
      sensitivity: meta.sensitivity || "personal",
      sourceProject: meta.source_project || "",
      updatedAt: meta.updated_at || fs.statSync(item.file).mtime.toISOString(),
      excerpt: makeExcerpt(item.body),
      searchText: normalizeSearch(`${meta.asset_id || ""} ${meta.title || ""} ${meta.type || ""} ${tags.join(" ")} ${sourceTasks.join(" ")} ${item.body}`),
    };
  }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function safeSummaryPath(rel) {
  if (!rel || rel.includes("\0")) return null;
  const resolved = path.resolve(summaryRoot, rel);
  if (!resolved.startsWith(path.resolve(summaryRoot) + path.sep)) return null;
  if (!fs.existsSync(resolved) || !resolved.endsWith(".md")) return null;
  const realRoot = fs.realpathSync(summaryRoot);
  const realFile = fs.realpathSync(resolved);
  if (!realFile.startsWith(realRoot + path.sep)) return null;
  return realFile;
}

function safeWikiPath(rel, scope = "project") {
  const wikiRoot = scope === "personal" ? personalWikiRoot : path.join(hephaRoot, "wiki");
  if (!rel || rel.includes("\0") || !fs.existsSync(wikiRoot)) return null;
  const resolved = path.resolve(wikiRoot, rel);
  if (!resolved.startsWith(path.resolve(wikiRoot) + path.sep)) return null;
  if (!fs.existsSync(resolved) || !resolved.endsWith(".md")) return null;
  const realRoot = fs.realpathSync(wikiRoot);
  const realFile = fs.realpathSync(resolved);
  if (!realFile.startsWith(realRoot + path.sep)) return null;
  return realFile;
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
  const publishedCount = model.assets.filter((asset) => asset.status === "published").length;
  const candidateCount = model.assets.filter((asset) => asset.status !== "published").length;

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
          ${stat("已发布资产", publishedCount)}
          ${stat("待审核", candidateCount)}
          ${stat("贡献者", peopleCount)}
        </div>
      </section>

      ${renderSearchForm("")}
      ${renderArtifacts(model.artifacts)}
      ${renderWikiAssets(model.assets)}

      <section class="timeline">
        <div class="sectionHeading"><h2>任务时间线</h2><span>${latest ? `最近更新 ${escapeHtml(latest.date)}` : ""}</span></div>
        ${model.byDate.length ? model.byDate.map(renderDateGroup).join("") : renderEmptyState(model)}
      </section>
    `,
  });
}

function renderSearchForm(query) {
  return `
    <form class="searchBar" action="/search" method="get">
      <label for="search-q">搜索任务、资产、标签和来源</label>
      <div><input id="search-q" name="q" value="${escapeHtml(query)}" placeholder="例如：TDD、TASK-001、排障"><button type="submit">搜索</button></div>
    </form>
  `;
}

function renderWikiAssets(assets, title = "个人 Wiki") {
  return `
    <section class="wikiSection">
      <div class="sectionHeading"><h2>${escapeHtml(title)}</h2><span>${assets.length} 项资产</span></div>
      ${assets.length ? `<div class="assetGrid">${assets.map(renderAssetCard).join("")}</div>` : `<div class="empty compact"><p>任务完成后，将经过验证的知识提炼到 <code>.hepha/wiki</code>。</p></div>`}
    </section>
  `;
}

function renderAssetCard(asset) {
  return `
    <a class="assetCard" href="/asset?scope=${encodeURIComponent(asset.scope)}&file=${encodeURIComponent(asset.rel)}">
      <div class="cardTop"><span class="assetType">${escapeHtml(asset.type)}</span><span class="pill ${stateClass(asset.status)}">${escapeHtml(asset.status)}</span></div>
      <h3>${escapeHtml(asset.title)}</h3>
      <p>${escapeHtml(asset.excerpt)}</p>
      <div class="tags">${asset.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
      <footer><span>${escapeHtml(asset.scope === "personal" ? `个人 · ${asset.assetId}` : asset.assetId)}</span><span>${formatTime(asset.updatedAt)}</span></footer>
    </a>
  `;
}

function renderAsset(file, rel, model) {
  const raw = readMarkdownFile(file);
  const parsed = parseStructuredFrontmatter(raw);
  const metaData = parsed.frontmatter;
  const title = metaData.title || firstHeading(parsed.body) || path.basename(file, ".md");
  const list = (value) => Array.isArray(value) ? value : value ? [value] : [];
  return layout({
    title,
    model,
    content: `
      <nav class="crumb"><a href="/">Hepha</a><span>/</span><span>个人 Wiki</span><span>/</span><span>${escapeHtml(rel)}</span></nav>
      <article class="doc assetDoc">
        <header class="docHeader">
          <div><p class="eyebrow">${escapeHtml(metaData.type || "asset")} · ${escapeHtml(metaData.asset_id || path.basename(file, ".md"))}</p><h1>${escapeHtml(title)}</h1><div class="tags">${list(metaData.tags).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div></div>
          <div class="metaPanel">
            ${meta("状态", metaData.status)}
            ${meta("置信度", metaData.confidence)}
            ${meta("敏感级别", metaData.sensitivity)}
            ${meta("审核人", metaData.reviewed_by)}
          </div>
        </header>
        <section class="lineage">
          <h2>来源谱系</h2>
          ${lineageRow("Spec", list(metaData.source_specs))}
          ${lineageRow("Task", list(metaData.source_tasks))}
          ${lineageRow("Test", list(metaData.source_tests))}
          ${lineageRow("Commit", list(metaData.source_commits))}
        </section>
        <div class="markdown">${markdownToHtml(parsed.body)}</div>
      </article>
    `,
  });
}

function lineageRow(label, items) {
  return `<div><strong>${escapeHtml(label)}</strong><span>${items.length ? items.map((item) => `<code>${escapeHtml(item)}</code>`).join(" ") : "-"}</span></div>`;
}

function renderSearch(query, model) {
  const needle = normalizeSearch(query);
  const assets = needle ? model.assets.filter((asset) => asset.searchText.includes(needle)) : model.assets;
  const tasks = needle ? model.tasks.filter((task) => normalizeSearch(`${task.taskId} ${task.title} ${task.person} ${task.excerpt}`).includes(needle)) : model.tasks;
  return layout({
    title: query ? `搜索：${query}` : "搜索",
    model,
    content: `
      <nav class="crumb"><a href="/">Hepha</a><span>/</span><span>搜索</span></nav>
      <h1>知识检索</h1>
      ${renderSearchForm(query)}
      ${renderWikiAssets(assets, `资产结果 · ${assets.length}`)}
      <section class="timeline"><div class="sectionHeading"><h2>任务结果</h2><span>${tasks.length} 项</span></div><div class="taskGrid">${tasks.map(renderTaskCard).join("")}</div></section>
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
  const taskId = realValue(parsed.frontmatter.task_id) || path.basename(file, ".md");
  const evidenceFile = path.join(hephaRoot, "evidence", `${taskId}.json`);
  const evidence = /^TASK-[A-Z0-9-]+$/.test(taskId) && fs.existsSync(evidenceFile) ? safeReadJson(evidenceFile) : null;
  const relatedAssets = model.assets.filter((asset) => asset.sourceTasks.includes(taskId));

  return layout({
    title,
    model,
    content: `
      <nav class="crumb"><a href="/">Summary</a><span>/</span><span>${escapeHtml(rel)}</span></nav>
      <article class="doc">
        <header class="docHeader">
          <div>
            <p class="eyebrow">${escapeHtml(taskId)}</p>
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
        ${renderEvidence(evidence, relatedAssets)}
        <div class="markdown">${markdownToHtml(parsed.body)}</div>
      </article>
    `,
  });
}

function safeReadJson(file) {
  try {
    const stats = fs.statSync(file);
    if (stats.size > 1024 * 1024) return null;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return null;
  }
}

function renderEvidence(evidence, relatedAssets) {
  if (!evidence && !relatedAssets.length) return "";
  const checks = evidence?.checks || [];
  const reviews = evidence?.reviews || {};
  const checkRows = checks.length ? checks.map((item) => `
    <tr><td>${escapeHtml(item.phase || "-")}</td><td><code>${escapeHtml(item.command || "-")}</code></td><td><span class="pill ${item.exit_code === 0 ? "ok" : "bad"}">${escapeHtml(String(item.exit_code ?? "-"))}</span></td></tr>
  `).join("") : `<tr><td colspan="3">暂无检查证据</td></tr>`;
  const reviewRows = ["spec", "code", "human"].map((type) => {
    const review = reviews[type];
    return `<tr><td>${escapeHtml(type)}</td><td>${escapeHtml(review?.reviewer || "-")}</td><td><span class="pill ${stateClass(review?.status || "")}">${escapeHtml(review?.status || "pending")}</span></td></tr>`;
  }).join("");
  const assetLinks = relatedAssets.length ? relatedAssets.map((asset) => `<a class="lineageAsset" href="/asset?scope=${encodeURIComponent(asset.scope)}&file=${encodeURIComponent(asset.rel)}"><span>${escapeHtml(asset.assetId)}</span><strong>${escapeHtml(asset.title)}</strong></a>`).join("") : `<span class="muted">本任务未关联 Wiki 资产</span>`;
  return `<section class="evidencePanel">
    <div class="sectionHeading"><h2>交付证据</h2><span>${evidence ? "机器记录" : "来源关联"}</span></div>
    ${evidence ? `<h3>TDD / 检查</h3><table><thead><tr><th>阶段</th><th>命令</th><th>退出码</th></tr></thead><tbody>${checkRows}</tbody></table>
    <h3>审查</h3><table><thead><tr><th>类型</th><th>审核人</th><th>状态</th></tr></thead><tbody>${reviewRows}</tbody></table>` : ""}
    <h3>关联个人资产</h3><div class="lineageAssets">${assetLinks}</div>
  </section>`;
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
    const rawValue = line.slice(index + 1).trim();
    if (/^\[.*\]$/.test(rawValue)) {
      const inner = rawValue.slice(1, -1).trim();
      data[key] = inner ? inner.split(",").map((item) => item.trim().replace(/^["']|["']$/g, "")) : [];
    } else if (rawValue === "true" || rawValue === "false") {
      data[key] = rawValue === "true";
    } else {
      data[key] = rawValue.replace(/^["']|["']$/g, "");
    }
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
  let listType = "";
  let inTable = false;
  let tableRows = [];

  const closeList = () => {
    if (listType) out.push(`</${listType}>`);
    listType = "";
  };
  const openList = (type) => {
    if (listType === type) return;
    closeList();
    out.push(`<${type}>`);
    listType = type;
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
      openList("ul");
      out.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      openList("ol");
      out.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    const quote = line.match(/^>\s?(.+)$/);
    if (quote) {
      closeList();
      out.push(`<blockquote>${inlineMarkdown(quote[1])}</blockquote>`);
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
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => `<a href="${escapeHtml(normalizeLink(href))}" target="_blank" rel="noreferrer">${label}</a>`);
}

function normalizeLink(value) {
  const href = String(value || "").trim();
  if (/^(?:https?:|mailto:)/i.test(href)) return href;
  if (/^(?:\.\.?\/|\/|#)/.test(href)) return href;
  return "#blocked-link";
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
  if (state === "completed" || state === "done" || state === "published") return "ok";
  if (state === "blocked" || state === "failed") return "bad";
  if (state === "doing" || state === "in_progress" || state === "review" || state === "candidate") return "warn";
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
  res.writeHead(200, securityHeaders({ "content-type": "text/html; charset=utf-8" }));
  res.end(body);
}

function sendJson(res, data) {
  res.writeHead(200, securityHeaders({ "content-type": "application/json; charset=utf-8" }));
  res.end(JSON.stringify(data, null, 2));
}

function sendNotFound(res, message) {
  res.writeHead(404, securityHeaders({ "content-type": "text/plain; charset=utf-8" }));
  res.end(message);
}

function sendMethodNotAllowed(res) {
  res.writeHead(405, securityHeaders({ "content-type": "text/plain; charset=utf-8", allow: "GET, HEAD" }));
  res.end("仅支持只读请求");
}

function sendError(res, error) {
  console.error(error);
  res.writeHead(500, securityHeaders({ "content-type": "text/plain; charset=utf-8" }));
  res.end("Hepha 本地服务发生错误");
}

function securityHeaders(extra) {
  return {
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    ...extra,
  };
}

function readMarkdownFile(file) {
  const stats = fs.statSync(file);
  if (stats.size > 1024 * 1024) throw new Error("Markdown 文件超过 1 MiB 限制");
  return fs.readFileSync(file, "utf8");
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
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
  grid-template-columns: repeat(4, minmax(90px, 1fr));
  gap: 10px;
  min-width: 360px;
}
.stat, .artifacts a, .taskCard, .assetCard, .empty, .doc, .searchBar {
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
.wikiSection { margin: 24px 0 30px; }
.sectionHeading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.sectionHeading h2 { margin-bottom: 0; }
.sectionHeading span { color: var(--muted); }
.assetGrid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.assetCard {
  display: flex;
  flex-direction: column;
  min-height: 210px;
  padding: 16px;
}
.assetCard h3 { margin: 12px 0 8px; color: var(--text); }
.assetCard p { flex: 1; color: var(--muted); }
.assetCard footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 12px;
  color: var(--muted);
  font-size: 12px;
}
.assetType { color: var(--accent); font-weight: 700; text-transform: uppercase; font-size: 12px; }
.tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tags span { padding: 2px 7px; border-radius: 999px; background: #111; color: var(--muted); font-size: 12px; }
.searchBar { margin: 20px 0; padding: 14px; }
.searchBar label { display: block; margin-bottom: 8px; color: var(--muted); font-size: 12px; }
.searchBar div { display: flex; gap: 8px; }
.searchBar input { flex: 1; min-width: 0; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; background: #111; color: var(--text); }
.searchBar button { padding: 10px 16px; border: 0; border-radius: 6px; background: var(--accent); color: #1b120b; font-weight: 700; cursor: pointer; }
.lineage { margin-bottom: 24px; padding: 16px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel-2); }
.lineage h2 { margin-bottom: 12px; font-size: 16px; }
.lineage > div { display: grid; grid-template-columns: 80px 1fr; gap: 12px; margin-top: 8px; }
.lineage code { display: inline-block; margin: 0 4px 4px 0; }
.compact { padding: 16px; }
.compact p { margin: 0; }
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
.evidencePanel {
  margin: 0 0 24px;
  padding: 18px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel-2);
}
.evidencePanel h3 { margin: 18px 0 8px; }
.evidencePanel table { margin: 0; }
.lineageAssets { display: flex; flex-wrap: wrap; gap: 10px; }
.lineageAsset {
  display: grid;
  gap: 2px;
  min-width: 220px;
  padding: 9px 11px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--panel);
}
.lineageAsset span { color: var(--accent); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; }
.lineageAsset strong { color: var(--soft); }
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
.markdown blockquote { margin: 14px 0; padding: 10px 14px; border-left: 3px solid var(--accent); background: var(--panel-2); color: var(--soft); }
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
  .searchBar div { flex-direction: column; }
  h1 { font-size: 30px; }
}`;
}

module.exports = {
  inlineMarkdown,
  loadDashboard,
  markdownToHtml,
  normalizeLink,
  renderIndex,
  renderSearch,
  safeSummaryPath,
  safeWikiPath,
};
