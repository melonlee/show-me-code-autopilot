const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TASK_STATES = new Set(["todo", "doing", "review", "blocked", "done", "skipped"]);
const RISKS = new Set(["low", "medium", "high"]);
const ASSET_POLICIES = new Set(["none", "candidate", "required"]);
const ASSET_TYPES = new Set([
  "decision",
  "pattern",
  "recipe",
  "checklist",
  "troubleshooting",
  "glossary",
  "retrospective",
  "project-map",
]);
const TRANSITIONS = {
  todo: new Set(["doing", "blocked", "skipped"]),
  doing: new Set(["review", "blocked"]),
  review: new Set(["doing", "done", "blocked"]),
  blocked: new Set(["todo", "doing", "skipped"]),
  done: new Set([]),
  skipped: new Set([]),
};

function hephaPaths(root) {
  const projectRoot = path.resolve(root || process.cwd());
  const hephaRoot = path.join(projectRoot, ".hepha");
  return {
    projectRoot,
    hephaRoot,
    manifest: path.join(hephaRoot, "manifest.json"),
    backlog: path.join(hephaRoot, "backlog.json"),
    backlogMarkdown: path.join(hephaRoot, "backlog.md"),
    progress: path.join(hephaRoot, "progress.md"),
    decisions: path.join(hephaRoot, "decision-log.md"),
    specs: path.join(hephaRoot, "specs"),
    evidence: path.join(hephaRoot, "evidence"),
    summaries: path.join(hephaRoot, "summary"),
    wiki: path.join(hephaRoot, "wiki"),
    candidates: path.join(hephaRoot, "wiki", "candidates"),
    assets: path.join(hephaRoot, "wiki", "assets"),
    wikiIndex: path.join(hephaRoot, "wiki", "index.json"),
    index: path.join(hephaRoot, "index.json"),
  };
}

function slugifyPerson(value) {
  return String(value || "unknown")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/[^\p{Letter}\p{Number}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "") || "unknown";
}

function resolvePerson(explicit) {
  if (explicit) return explicit;
  if (process.env.HEPHA_PERSON) return process.env.HEPHA_PERSON;
  try {
    const { execFileSync } = require("node:child_process");
    const gitName = execFileSync("git", ["config", "user.name"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (gitName) return gitName;
  } catch (_) {
    // Fall through to the operating-system account.
  }
  return os.userInfo().username || "unknown";
}

function createWorkspace({ root, requirement, person }) {
  const paths = hephaPaths(root);
  const owner = resolvePerson(person);
  const now = new Date().toISOString();
  for (const dir of [paths.hephaRoot, paths.specs, paths.evidence, paths.summaries, paths.candidates, paths.assets]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  writeIfMissing(paths.manifest, `${JSON.stringify({
    schema_version: "2.0",
    requirement: requirement || "待补充需求",
    person: owner,
    person_slug: slugifyPerson(owner),
    created_at: now,
    updated_at: now,
    commit_policy: "manual",
    approval_required: true,
  }, null, 2)}\n`);

  writeIfMissing(paths.backlog, `${JSON.stringify({
    schema_version: "2.0",
    requirement: requirement || "待补充需求",
    tasks: [],
  }, null, 2)}\n`);
  writeIfMissing(paths.backlogMarkdown, `# Hepha 任务 Backlog\n\n机器事实源：\`.hepha/backlog.json\`。\n`);
  writeIfMissing(paths.progress, `# Hepha 进度日志\n\n**需求**：${requirement || "待补充需求"}\n**负责人**：${owner}\n\n## 循环历史\n`);
  writeIfMissing(paths.decisions, "# Hepha 决策日志\n\n## 决策记录\n");
  writeIfMissing(path.join(paths.specs, "SPEC-001.md"), `---\nspec_id: SPEC-001\ntitle: \"${escapeYaml(requirement || "待补充需求")}\"\nstatus: draft\n---\n\n# SPEC-001：${requirement || "待补充需求"}\n\n## 目标\n\n- 待补充\n\n## 非目标\n\n- 待补充\n\n## 行为场景\n\n### SC-001\n\n- Given：待补充\n- When：待补充\n- Then：待补充\n`);
  buildIndexesWithPaths(paths);
  return paths;
}

function validateBacklog(backlog, options = {}) {
  const errors = [];
  const warnings = [];
  if (!backlog || typeof backlog !== "object") return { ok: false, errors: ["backlog 必须是对象"], warnings };
  if (backlog.schema_version !== "2.0") errors.push("schema_version 必须为 2.0");
  if (!Array.isArray(backlog.tasks)) errors.push("tasks 必须是数组");
  if (errors.length) return { ok: false, errors, warnings };
  if (!backlog.tasks.length && !options.allowEmpty) errors.push("tasks 不能为空");

  const ids = new Set();
  for (const task of backlog.tasks) {
    const prefix = task && task.id ? task.id : "未知任务";
    if (!task || typeof task !== "object") {
      errors.push("任务必须是对象");
      continue;
    }
    if (!/^TASK-[A-Z0-9][A-Z0-9-]*$/.test(task.id || "")) errors.push(`${prefix}: id 格式非法`);
    if (ids.has(task.id)) errors.push(`${prefix}: id 重复`);
    ids.add(task.id);
    if (!String(task.title || "").trim()) errors.push(`${prefix}: title 不能为空`);
    if (!TASK_STATES.has(task.state)) errors.push(`${prefix}: state 非法`);
    if (!RISKS.has(task.risk)) errors.push(`${prefix}: risk 非法`);
    if (!Array.isArray(task.depends_on)) errors.push(`${prefix}: depends_on 必须是数组`);
    if (!Array.isArray(task.files_hint)) errors.push(`${prefix}: files_hint 必须是数组`);
    if (!Array.isArray(task.spec_refs) || task.spec_refs.length === 0) errors.push(`${prefix}: spec_refs 不能为空`);
    validateAcceptance(task, errors);
    if (task.behavior_change) {
      const commands = task.test_plan && task.test_plan.commands;
      if (!Array.isArray(commands) || commands.length === 0) errors.push(`${prefix}: 行为变更必须声明 test_plan.commands`);
    }
    const policy = task.knowledge && task.knowledge.asset_policy;
    if (!ASSET_POLICIES.has(policy)) errors.push(`${prefix}: knowledge.asset_policy 非法`);
  }

  for (const task of backlog.tasks) {
    for (const dependency of task.depends_on || []) {
      if (!ids.has(dependency)) errors.push(`${task.id}: 依赖不存在 ${dependency}`);
      if (dependency === task.id) errors.push(`${task.id}: 不允许依赖自身`);
    }
  }
  const cycle = findCycle(backlog.tasks);
  if (cycle.length) errors.push(`任务图存在循环依赖：${cycle.join(" -> ")}`);

  if (options.root) {
    const paths = hephaPaths(options.root);
    for (const task of backlog.tasks) {
      for (const spec of task.spec_refs || []) {
        if (!fs.existsSync(path.join(paths.specs, `${spec}.md`))) errors.push(`${task.id}: Spec 不存在 ${spec}`);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

function validateAcceptance(task, errors) {
  if (!Array.isArray(task.acceptance) || task.acceptance.length === 0) {
    errors.push(`${task.id}: acceptance 不能为空`);
    return;
  }
  const ids = new Set();
  for (const criterion of task.acceptance) {
    if (!criterion || typeof criterion !== "object") {
      errors.push(`${task.id}: acceptance 必须使用 Given/When/Then 对象`);
      continue;
    }
    if (!/^AC-[A-Z0-9-]+$/.test(criterion.id || "")) errors.push(`${task.id}: acceptance.id 格式非法`);
    if (ids.has(criterion.id)) errors.push(`${task.id}: acceptance.id 重复 ${criterion.id}`);
    ids.add(criterion.id);
    for (const key of ["given", "when", "then"]) {
      if (!String(criterion[key] || "").trim()) errors.push(`${task.id}/${criterion.id || "unknown"}: ${key} 不能为空`);
    }
  }
}

function findCycle(tasks) {
  const graph = new Map(tasks.map((task) => [task.id, task.depends_on || []]));
  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  let found = [];
  function visit(id) {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      found = [...stack.slice(start), id];
      return true;
    }
    if (visited.has(id) || !graph.has(id)) return false;
    visiting.add(id);
    stack.push(id);
    for (const next of graph.get(id)) if (visit(next)) return true;
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return false;
  }
  for (const id of graph.keys()) if (visit(id)) break;
  return found;
}

function evidencePath(root, taskId) {
  return path.join(hephaPaths(root).evidence, `${taskId}.json`);
}

function loadEvidence(root, taskId) {
  const file = evidencePath(root, taskId);
  if (!fs.existsSync(file)) return {
    schema_version: "1.0",
    task_id: taskId,
    checks: [],
    reviews: {},
    browser: [],
    updated_at: new Date().toISOString(),
  };
  return readJson(file);
}

function recordCheck({ root, taskId, phase, command, exitCode, output = "" }) {
  if (!new Set(["red", "green", "regression", "lint", "build", "browser"]).has(phase)) {
    throw new Error(`未知检查阶段：${phase}`);
  }
  const evidence = loadEvidence(root, taskId);
  evidence.checks.push({
    phase,
    command,
    exit_code: Number(exitCode),
    output: truncate(output, 4000),
    recorded_at: new Date().toISOString(),
  });
  evidence.updated_at = new Date().toISOString();
  writeJsonAtomic(evidencePath(root, taskId), evidence);
  return evidence;
}

function recordReview({ root, taskId, type, status, reviewer, notes = "" }) {
  if (!new Set(["spec", "code", "human"]).has(type)) throw new Error(`未知审查类型：${type}`);
  if (!new Set(["passed", "failed", "changes-requested"]).has(status)) throw new Error(`未知审查状态：${status}`);
  const evidence = loadEvidence(root, taskId);
  evidence.reviews[type] = {
    status,
    reviewer: reviewer || "unknown",
    notes,
    recorded_at: new Date().toISOString(),
  };
  evidence.updated_at = new Date().toISOString();
  writeJsonAtomic(evidencePath(root, taskId), evidence);
  return evidence;
}

function evaluateTransition({ root, task, to }) {
  const errors = [];
  if (!TASK_STATES.has(to)) errors.push(`目标状态非法：${to}`);
  if (!TRANSITIONS[task.state] || !TRANSITIONS[task.state].has(to)) errors.push(`不允许状态转换：${task.state} -> ${to}`);
  if (to === "doing") {
    // A task can start only after all dependencies are completed; checked by transitionTask.
  }
  if (to === "review" || to === "done") {
    const evidence = loadEvidence(root, task.id);
    if (evidence.task_contract_hash && evidence.task_contract_hash !== taskContractHash(task)) {
      errors.push("任务契约已变更；请将任务标记 blocked、记录原因并重新规划，不得静默降低门禁");
    }
    if (task.behavior_change) {
      if (!evidence.checks.some((item) => item.phase === "red" && item.exit_code !== 0)) errors.push("缺少 RED 失败测试证据");
      if (!lastPassing(evidence.checks, "green")) errors.push("缺少 GREEN 通过测试证据");
      if (!lastPassing(evidence.checks, "regression")) errors.push("缺少 regression 通过证据");
    }
    if (to === "done") {
      if (evidence.reviews.spec?.status !== "passed") errors.push("Spec review 未通过");
      if (evidence.reviews.code?.status !== "passed") errors.push("Code review 未通过");
      const manifestFile = hephaPaths(root).manifest;
      const manifest = fs.existsSync(manifestFile) ? readJson(manifestFile) : { approval_required: true };
      if (manifest.approval_required !== false && evidence.reviews.human?.status !== "passed") errors.push("缺少人工批准");
      if (!findSummary(root, task.id)) errors.push("缺少任务 summary");
      const policy = task.knowledge?.asset_policy;
      if ((policy === "candidate" || policy === "required") && !findAssetForTask(root, task.id, policy === "required")) {
        errors.push(policy === "required" ? "缺少已发布个人资产" : "缺少资产候选");
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

function transitionTask({ root, taskId, to }) {
  const paths = hephaPaths(root);
  const backlog = readJson(paths.backlog);
  const validation = validateBacklog(backlog, { root });
  if (!validation.ok) throw new Error(`backlog 校验失败：\n${validation.errors.join("\n")}`);
  const task = backlog.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`任务不存在：${taskId}`);
  if (to === "doing") {
    const incomplete = (task.depends_on || []).filter((id) => backlog.tasks.find((item) => item.id === id)?.state !== "done");
    if (incomplete.length) throw new Error(`依赖未完成：${incomplete.join(", ")}`);
  }
  const gate = evaluateTransition({ root, task, to });
  if (!gate.ok) throw new Error(`状态门禁未通过：\n${gate.errors.join("\n")}`);
  if (to === "doing") {
    const evidence = loadEvidence(root, task.id);
    evidence.task_contract_hash = taskContractHash(task);
    evidence.contract_recorded_at = new Date().toISOString();
    writeJsonAtomic(evidencePath(root, task.id), evidence);
  }
  task.state = to;
  task.updated_at = new Date().toISOString();
  writeJsonAtomic(paths.backlog, backlog);
  renderBacklogMarkdown(paths, backlog);
  buildIndexes({ root });
  return { task, backlog };
}

function publishAsset({ root, file, reviewer }) {
  const paths = hephaPaths(root);
  const source = path.resolve(file);
  const parsed = parseFrontmatter(readTextLimited(source));
  const asset = { ...parsed.frontmatter };
  const errors = validateAsset(asset, parsed.body);
  if (errors.length) throw new Error(`资产校验失败：\n${errors.join("\n")}`);
  if (arrayValue(asset.source_commits).some((item) => String(item).toLowerCase() === "pending")) {
    throw new Error("source_commits 不允许 pending；使用 self 表示包含该资产的任务提交");
  }
  if (!new Set(["candidate", "reviewed"]).has(asset.status)) throw new Error("只有 candidate 或 reviewed 资产可以发布");
  if (containsSensitiveText(`${JSON.stringify(asset)}\n${parsed.body}`)) throw new Error("资产可能包含敏感信息，拒绝发布");

  asset.status = "published";
  asset.reviewed_by = reviewer || asset.reviewed_by || "unknown";
  asset.updated_at = new Date().toISOString();
  asset.published_at = asset.published_at || asset.updated_at;
  const target = path.join(paths.assets, `${asset.asset_id}.md`);
  const raw = `${stringifyFrontmatter(asset)}${parsed.body.trim()}\n`;
  writeTextAtomic(target, raw);
  if (source !== target && isWithin(paths.candidates, source)) fs.unlinkSync(source);
  buildIndexes({ root });
  return { asset, target };
}

function validateAsset(asset, body) {
  const errors = [];
  if (!/^[A-Z]+-[A-Z0-9-]+$/.test(asset.asset_id || "")) errors.push("asset_id 格式非法");
  if (!ASSET_TYPES.has(asset.type)) errors.push("type 非法");
  if (!String(asset.title || "").trim()) errors.push("title 不能为空");
  if (!Array.isArray(asset.tags)) errors.push("tags 必须是数组");
  if (!Array.isArray(asset.source_tasks) || !asset.source_tasks.length) errors.push("source_tasks 不能为空");
  if (!Array.isArray(asset.source_specs) || !asset.source_specs.length) errors.push("source_specs 不能为空");
  if (!Array.isArray(asset.source_tests) || !asset.source_tests.length) errors.push("source_tests 不能为空");
  if (!Array.isArray(asset.source_commits) || !asset.source_commits.length) errors.push("source_commits 不能为空");
  if (!String(body || "").trim()) errors.push("资产正文不能为空");
  return errors;
}

function buildIndexes({ root }) {
  return buildIndexesWithPaths(hephaPaths(root));
}

function syncPersonalWiki({ root, wikiRoot }) {
  const sourcePaths = hephaPaths(root);
  const targetRoot = path.resolve(wikiRoot || process.env.HEPHA_WIKI_ROOT || path.join(os.homedir(), ".hepha", "wiki"));
  const projectName = path.basename(sourcePaths.projectRoot);
  const projectKey = `${slugifyPerson(projectName)}-${crypto.createHash("sha256").update(sourcePaths.projectRoot).digest("hex").slice(0, 8)}`;
  const targetAssets = path.join(targetRoot, "assets", projectKey);
  fs.mkdirSync(targetAssets, { recursive: true });
  const synced = [];
  const skipped = [];

  for (const item of scanMarkdownDirectory(sourcePaths.assets)) {
    const meta = { ...item.frontmatter };
    if (meta.status !== "published") {
      skipped.push({ asset_id: meta.asset_id || path.basename(item.file, ".md"), reason: "not-published" });
      continue;
    }
    if (meta.sensitivity === "project-confidential") {
      skipped.push({ asset_id: meta.asset_id || path.basename(item.file, ".md"), reason: "project-confidential" });
      continue;
    }
    if (containsSensitiveText(`${JSON.stringify(meta)}\n${item.body}`)) {
      skipped.push({ asset_id: meta.asset_id || path.basename(item.file, ".md"), reason: "sensitive-content" });
      continue;
    }
    const resolvedCommits = resolveCommitReferences(sourcePaths.projectRoot, item.file, arrayValue(meta.source_commits));
    if (!resolvedCommits.ok) {
      skipped.push({ asset_id: meta.asset_id || path.basename(item.file, ".md"), reason: resolvedCommits.error });
      continue;
    }
    meta.source_commits = resolvedCommits.commits;
    meta.source_project = projectName;
    meta.source_project_key = projectKey;
    meta.synced_at = new Date().toISOString();
    const target = path.join(targetAssets, `${meta.asset_id}.md`);
    writeTextAtomic(target, `${stringifyFrontmatter(meta)}${item.body.trim()}\n`);
    synced.push({ asset_id: meta.asset_id, file: path.relative(targetRoot, target) });
  }

  const assets = scanMarkdownDirectory(path.join(targetRoot, "assets")).map((item) => ({
    asset_id: item.frontmatter.asset_id || path.basename(item.file, ".md"),
    type: item.frontmatter.type || "unknown",
    title: item.frontmatter.title || firstHeading(item.body),
    status: item.frontmatter.status || "published",
    tags: arrayValue(item.frontmatter.tags),
    source_tasks: arrayValue(item.frontmatter.source_tasks),
    source_specs: arrayValue(item.frontmatter.source_specs),
    source_tests: arrayValue(item.frontmatter.source_tests),
    source_commits: arrayValue(item.frontmatter.source_commits),
    source_project: item.frontmatter.source_project || "unknown",
    source_project_key: item.frontmatter.source_project_key || "unknown",
    sensitivity: item.frontmatter.sensitivity || "personal",
    file: path.relative(targetRoot, item.file),
    search_text: normalizeSearch(`${item.frontmatter.title || ""} ${arrayValue(item.frontmatter.tags).join(" ")} ${item.body}`),
  }));
  writeJsonAtomic(path.join(targetRoot, "index.json"), {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    metrics: summarizeAssets(assets),
    assets,
  });
  return { wiki_root: targetRoot, project_key: projectKey, synced, skipped, assets, metrics: summarizeAssets(assets) };
}

function buildIndexesWithPaths(paths) {
  const assets = [...scanMarkdownDirectory(paths.assets), ...scanMarkdownDirectory(paths.candidates)].map((item) => ({
    asset_id: item.frontmatter.asset_id || path.basename(item.file, ".md"),
    type: item.frontmatter.type || "unknown",
    title: item.frontmatter.title || firstHeading(item.body) || path.basename(item.file, ".md"),
    status: item.frontmatter.status || "candidate",
    tags: arrayValue(item.frontmatter.tags),
    source_tasks: arrayValue(item.frontmatter.source_tasks),
    source_specs: arrayValue(item.frontmatter.source_specs),
    source_tests: arrayValue(item.frontmatter.source_tests),
    source_commits: arrayValue(item.frontmatter.source_commits),
    confidence: item.frontmatter.confidence || "unverified",
    sensitivity: item.frontmatter.sensitivity || "personal",
    updated_at: item.frontmatter.updated_at || fs.statSync(item.file).mtime.toISOString(),
    file: path.relative(paths.wiki, item.file),
    search_text: normalizeSearch([item.frontmatter.title, item.frontmatter.type, ...arrayValue(item.frontmatter.tags), item.body].join(" ")),
  }));
  assets.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  const summaries = scanMarkdownDirectory(paths.summaries).map((item) => ({
    task_id: item.frontmatter.task_id || path.basename(item.file, ".md"),
    title: item.frontmatter.title || firstHeading(item.body) || path.basename(item.file, ".md"),
    state: item.frontmatter.state || "unknown",
    date: item.frontmatter.date || path.relative(paths.summaries, item.file).split(path.sep)[0] || "unknown",
    person: item.frontmatter.person || path.relative(paths.summaries, item.file).split(path.sep)[1] || "unknown",
    commit: item.frontmatter.commit || "",
    file: path.relative(paths.summaries, item.file),
    search_text: normalizeSearch(`${item.frontmatter.title || ""} ${item.body}`),
  }));

  const generated = {
    schema_version: "1.0",
    generated_at: new Date().toISOString(),
    metrics: summarizeAssets(assets),
    assets,
  };
  writeJsonAtomic(paths.wikiIndex, generated);
  writeJsonAtomic(paths.index, { schema_version: "1.0", generated_at: generated.generated_at, summaries, assets });
  return { summaries, assets };
}

function summarizeAssets(assets) {
  const byStatus = {};
  const byType = {};
  const byProject = {};
  const tags = {};
  let completeProvenance = 0;
  for (const asset of assets) {
    const status = asset.status || "unknown";
    const type = asset.type || "unknown";
    const project = asset.source_project || "current-project";
    byStatus[status] = (byStatus[status] || 0) + 1;
    byType[type] = (byType[type] || 0) + 1;
    byProject[project] = (byProject[project] || 0) + 1;
    for (const tag of arrayValue(asset.tags)) tags[tag] = (tags[tag] || 0) + 1;
    if (arrayValue(asset.source_specs).length && arrayValue(asset.source_tasks).length && arrayValue(asset.source_tests).length && arrayValue(asset.source_commits).length) completeProvenance += 1;
  }
  return {
    total: assets.length,
    by_status: byStatus,
    by_type: byType,
    by_project: byProject,
    top_tags: Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count })),
    provenance_complete: completeProvenance,
    provenance_completeness: assets.length ? Number((completeProvenance / assets.length).toFixed(4)) : 1,
  };
}

function parseFrontmatter(raw) {
  const match = String(raw).replace(/\r\n/g, "\n").match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: String(raw) };
  const data = {};
  for (const line of match[1].split("\n")) {
    const index = line.indexOf(":");
    if (index === -1) continue;
    const key = line.slice(0, index).trim();
    const rawValue = line.slice(index + 1).trim();
    data[key] = parseYamlValue(rawValue);
  }
  return { frontmatter: data, body: match[2] };
}

function parseYamlValue(raw) {
  if (/^\[.*\]$/.test(raw)) {
    const inner = raw.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((item) => unquote(item.trim()));
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  return unquote(raw);
}

function stringifyFrontmatter(data) {
  const lines = ["---"];
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) lines.push(`${key}: [${value.map((item) => quoteYaml(item)).join(", ")}]`);
    else if (typeof value === "boolean" || typeof value === "number") lines.push(`${key}: ${value}`);
    else lines.push(`${key}: ${quoteYaml(value)}`);
  }
  lines.push("---", "");
  return `${lines.join("\n")}\n`;
}

function containsSensitiveText(text) {
  return [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[A-Za-z0-9_\-/.+=]{12,}/i,
    /\bsk-[A-Za-z0-9_-]{16,}\b/,
  ].some((pattern) => pattern.test(text));
}

function renderBacklogMarkdown(paths, backlog) {
  const lines = ["# Hepha 任务 Backlog", "", `**需求**：${backlog.requirement || "-"}`, "", "机器事实源：`.hepha/backlog.json`。", "", "## 任务", ""];
  if (!backlog.tasks.length) lines.push("- 暂无任务");
  for (const task of backlog.tasks) {
    lines.push(`### ${task.id}：${task.title}`, "", `- 状态：\`${task.state}\``, `- 风险：\`${task.risk}\``, `- Spec：${(task.spec_refs || []).join(", ") || "-"}`, `- 依赖：${(task.depends_on || []).join(", ") || "无"}`, "", "验收条件：", "");
    for (const item of task.acceptance || []) lines.push(`- ${item.id}：Given ${item.given}；When ${item.when}；Then ${item.then}`);
    lines.push("");
  }
  writeTextAtomic(paths.backlogMarkdown, `${lines.join("\n")}\n`);
}

function findSummary(root, taskId) {
  return scanMarkdownDirectory(hephaPaths(root).summaries).find((item) => item.frontmatter.task_id === taskId || path.basename(item.file, ".md") === taskId);
}

function findAssetForTask(root, taskId, publishedOnly) {
  const paths = hephaPaths(root);
  const dirs = publishedOnly ? [paths.assets] : [paths.assets, paths.candidates];
  return dirs.flatMap(scanMarkdownDirectory).find((item) => arrayValue(item.frontmatter.source_tasks).includes(taskId));
}

function scanMarkdownDirectory(base) {
  if (!fs.existsSync(base)) return [];
  const results = [];
  walk(base, (file) => {
    if (!file.toLowerCase().endsWith(".md")) return;
    const parsed = parseFrontmatter(readTextLimited(file));
    results.push({ file, ...parsed });
  });
  return results;
}

function walk(dir, visit) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, visit);
    else if (entry.isFile()) visit(file);
  }
}

function isWithin(base, target) {
  const relative = path.relative(path.resolve(base), path.resolve(target));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function readTextLimited(file, maxBytes = 1024 * 1024) {
  const stats = fs.statSync(file);
  if (stats.size > maxBytes) throw new Error(`文件过大：${file}`);
  return fs.readFileSync(file, "utf8");
}

function readJson(file) {
  return JSON.parse(readTextLimited(file));
}

function writeIfMissing(file, content) {
  if (!fs.existsSync(file)) writeTextAtomic(file, content);
}

function writeJsonAtomic(file, value) {
  writeTextAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTextAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temp, content, { mode: 0o600 });
  fs.renameSync(temp, file);
}

function lastPassing(checks, phase) {
  const matches = checks.filter((item) => item.phase === phase);
  return matches.length > 0 && matches[matches.length - 1].exit_code === 0;
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [String(value)];
}

function firstHeading(body) {
  const match = String(body || "").match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : "";
}

function normalizeSearch(text) {
  return String(text || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length)}…` : text;
}

function taskContractHash(task) {
  const contract = { ...task };
  delete contract.state;
  delete contract.updated_at;
  return crypto.createHash("sha256").update(canonicalJson(contract)).digest("hex");
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function resolveCommitReferences(projectRoot, assetFile, commits) {
  if (!commits.includes("self")) return { ok: true, commits };
  try {
    const { execFileSync } = require("node:child_process");
    const relative = path.relative(projectRoot, assetFile);
    const commit = execFileSync("git", ["log", "-1", "--format=%H", "--", relative], {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (!commit) return { ok: false, error: "self-commit-not-found" };
    return { ok: true, commits: commits.map((item) => item === "self" ? commit : item) };
  } catch (_) {
    return { ok: false, error: "self-commit-not-found" };
  }
}

function unquote(value) {
  return String(value || "").replace(/^(["'])([\s\S]*)\1$/, "$2");
}

function quoteYaml(value) {
  return `"${String(value == null ? "" : value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeYaml(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

module.exports = {
  ASSET_POLICIES,
  ASSET_TYPES,
  TASK_STATES,
  buildIndexes,
  containsSensitiveText,
  createWorkspace,
  evaluateTransition,
  hephaPaths,
  loadEvidence,
  parseFrontmatter,
  publishAsset,
  readJson,
  readTextLimited,
  recordCheck,
  recordReview,
  renderBacklogMarkdown,
  resolvePerson,
  scanMarkdownDirectory,
  slugifyPerson,
  stringifyFrontmatter,
  summarizeAssets,
  syncPersonalWiki,
  taskContractHash,
  transitionTask,
  validateAsset,
  validateBacklog,
  writeJsonAtomic,
  writeTextAtomic,
};
