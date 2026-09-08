const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildIndexes,
  createWorkspace,
  evaluateTransition,
  parseFrontmatter,
  publishAsset,
  recordCheck,
  recordReview,
  slugifyPerson,
  syncPersonalWiki,
  transitionTask,
  validateBacklog,
} = require("../skills/hepha/scripts/hepha-core");

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "hepha-core-"));
}

function validTask(overrides = {}) {
  return {
    id: "TASK-001",
    title: "实现加法函数",
    state: "doing",
    depends_on: [],
    acceptance: [
      {
        id: "AC-001",
        given: "两个整数",
        when: "调用 add",
        then: "返回两数之和",
      },
    ],
    risk: "low",
    files_hint: ["src/add.js", "test/add.test.js"],
    spec_refs: ["SPEC-001"],
    behavior_change: true,
    test_plan: {
      commands: ["node --test test/add.test.js"],
    },
    knowledge: {
      asset_policy: "candidate",
      candidate_types: ["pattern"],
    },
    ...overrides,
  };
}

test("slugifyPerson creates a stable path-safe identifier", () => {
  assert.equal(slugifyPerson("Melon 李 / Reviewer"), "melon-李-reviewer");
});

test("validateBacklog rejects cycles and missing executable acceptance", () => {
  const backlog = {
    schema_version: "2.0",
    requirement: "测试循环",
    tasks: [
      validTask({ id: "TASK-001", depends_on: ["TASK-002"] }),
      validTask({ id: "TASK-002", depends_on: ["TASK-001"], acceptance: [] }),
    ],
  };
  const result = validateBacklog(backlog);
  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /循环依赖/);
  assert.match(result.errors.join("\n"), /acceptance/);
});

test("TDD completion gate requires RED, GREEN, regression and two reviews", () => {
  const root = makeRoot();
  createWorkspace({ root, requirement: "实现加法", person: "Tester" });
  const task = validTask();

  let gate = evaluateTransition({ root, task, to: "done" });
  assert.equal(gate.ok, false);
  assert.match(gate.errors.join("\n"), /RED/);

  recordCheck({ root, taskId: task.id, phase: "red", command: "node --test", exitCode: 1 });
  recordCheck({ root, taskId: task.id, phase: "green", command: "node --test", exitCode: 0 });
  recordCheck({ root, taskId: task.id, phase: "regression", command: "node --test", exitCode: 0 });
  recordReview({ root, taskId: task.id, type: "spec", status: "passed", reviewer: "spec-reviewer" });
  recordReview({ root, taskId: task.id, type: "code", status: "passed", reviewer: "code-reviewer" });

  gate = evaluateTransition({ root, task, to: "done" });
  assert.equal(gate.ok, false);
  assert.match(gate.errors.join("\n"), /summary/);
  assert.match(gate.errors.join("\n"), /资产候选/);
  assert.match(gate.errors.join("\n"), /人工批准/);
});

test("transitionTask completes a fully evidenced task", () => {
  const root = makeRoot();
  createWorkspace({ root, requirement: "实现加法", person: "Tester" });
  const backlogPath = path.join(root, ".hepha", "backlog.json");
  const backlog = JSON.parse(fs.readFileSync(backlogPath, "utf8"));
  backlog.tasks = [validTask()];
  fs.writeFileSync(backlogPath, `${JSON.stringify(backlog, null, 2)}\n`);

  recordCheck({ root, taskId: "TASK-001", phase: "red", command: "node --test", exitCode: 1 });
  recordCheck({ root, taskId: "TASK-001", phase: "green", command: "node --test", exitCode: 0 });
  recordCheck({ root, taskId: "TASK-001", phase: "regression", command: "node --test", exitCode: 0 });
  recordReview({ root, taskId: "TASK-001", type: "spec", status: "passed", reviewer: "A" });
  recordReview({ root, taskId: "TASK-001", type: "code", status: "passed", reviewer: "B" });
  recordReview({ root, taskId: "TASK-001", type: "human", status: "passed", reviewer: "Owner" });

  const summaryDir = path.join(root, ".hepha", "summary", "2026-09-09", "tester");
  fs.mkdirSync(summaryDir, { recursive: true });
  fs.writeFileSync(path.join(summaryDir, "TASK-001.md"), "---\ntask_id: TASK-001\nstate: review\n---\n# Summary\n");
  const candidateDir = path.join(root, ".hepha", "wiki", "candidates");
  fs.writeFileSync(path.join(candidateDir, "PAT-001.md"), "---\nasset_id: PAT-001\nstatus: candidate\nsource_tasks: [TASK-001]\n---\n# Pattern\n");

  transitionTask({ root, taskId: "TASK-001", to: "review" });
  const result = transitionTask({ root, taskId: "TASK-001", to: "done" });
  assert.equal(result.task.state, "done");
});

test("publishAsset creates a searchable asset index with provenance", () => {
  const root = makeRoot();
  createWorkspace({ root, requirement: "资产测试", person: "Tester" });
  const candidate = path.join(root, ".hepha", "wiki", "candidates", "PAT-001.md");
  fs.writeFileSync(candidate, `---\nasset_id: PAT-001\ntype: pattern\ntitle: \"加法实现模式\"\nstatus: reviewed\ntags: [javascript, tdd]\nsource_tasks: [TASK-001]\nsource_specs: [SPEC-001]\nsource_tests: [test/add.test.js]\nsource_commits: [abc123]\nconfidence: verified\nsensitivity: personal\n---\n# 加法实现模式\n\n通过测试验证的实现模式。\n`);

  const published = publishAsset({ root, file: candidate, reviewer: "Tester" });
  assert.equal(published.asset.asset_id, "PAT-001");
  assert.equal(published.asset.status, "published");
  assert.ok(fs.existsSync(path.join(root, ".hepha", "wiki", "assets", "PAT-001.md")));

  const index = buildIndexes({ root });
  assert.equal(index.assets.length, 1);
  assert.deepEqual(index.assets[0].source_tasks, ["TASK-001"]);
  assert.match(index.assets[0].search_text, /javascript/);
});

test("publishAsset rejects unresolved pending commit provenance", () => {
  const root = makeRoot();
  createWorkspace({ root, requirement: "资产测试", person: "Tester" });
  const candidate = path.join(root, ".hepha", "wiki", "candidates", "PAT-PENDING.md");
  fs.writeFileSync(candidate, `---\nasset_id: PAT-PENDING\ntype: pattern\ntitle: \"未解析资产\"\nstatus: reviewed\ntags: [tdd]\nsource_tasks: [TASK-001]\nsource_specs: [SPEC-001]\nsource_tests: [test/add.test.js]\nsource_commits: [pending]\nconfidence: verified\nsensitivity: personal\n---\n# 未解析资产\n`);
  assert.throws(() => publishAsset({ root, file: candidate, reviewer: "Tester" }), /pending/);

  const content = fs.readFileSync(candidate, "utf8").replace("[pending]", "[self]");
  fs.writeFileSync(candidate, content);
  assert.equal(publishAsset({ root, file: candidate, reviewer: "Tester" }).asset.status, "published");
});

test("task contract fingerprint prevents changing gates after execution starts", () => {
  const root = makeRoot();
  createWorkspace({ root, requirement: "契约测试", person: "Tester" });
  const backlogFile = path.join(root, ".hepha", "backlog.json");
  const backlog = JSON.parse(fs.readFileSync(backlogFile, "utf8"));
  backlog.tasks = [validTask({ state: "todo", knowledge: { asset_policy: "required", candidate_types: ["pattern"] } })];
  fs.writeFileSync(backlogFile, `${JSON.stringify(backlog, null, 2)}\n`);
  transitionTask({ root, taskId: "TASK-001", to: "doing" });

  const changed = JSON.parse(fs.readFileSync(backlogFile, "utf8"));
  changed.tasks[0].knowledge.asset_policy = "none";
  fs.writeFileSync(backlogFile, `${JSON.stringify(changed, null, 2)}\n`);
  recordCheck({ root, taskId: "TASK-001", phase: "red", command: "node --test", exitCode: 1 });
  recordCheck({ root, taskId: "TASK-001", phase: "green", command: "node --test", exitCode: 0 });
  recordCheck({ root, taskId: "TASK-001", phase: "regression", command: "node --test", exitCode: 0 });
  assert.throws(() => transitionTask({ root, taskId: "TASK-001", to: "review" }), /任务契约已变更/);
});

test("syncPersonalWiki aggregates published non-confidential assets across projects", () => {
  const root = makeRoot();
  const personalRoot = makeRoot();
  createWorkspace({ root, requirement: "资产同步", person: "Tester" });
  const assetDir = path.join(root, ".hepha", "wiki", "assets");
  fs.writeFileSync(path.join(assetDir, "PAT-001.md"), `---\nasset_id: PAT-001\ntype: pattern\ntitle: \"可复用模式\"\nstatus: published\ntags: [tdd]\nsource_tasks: [TASK-001]\nsource_specs: [SPEC-001]\nsource_tests: [test/a.test.js]\nsource_commits: [abc123]\nconfidence: verified\nsensitivity: personal\n---\n# 可复用模式\n`);
  fs.writeFileSync(path.join(assetDir, "DEC-PRIVATE.md"), `---\nasset_id: DEC-PRIVATE\ntype: decision\ntitle: \"机密决定\"\nstatus: published\ntags: [private]\nsource_tasks: [TASK-002]\nsource_specs: [SPEC-001]\nsource_tests: [test/b.test.js]\nsource_commits: [def456]\nconfidence: verified\nsensitivity: project-confidential\n---\n# 机密决定\n`);

  const result = syncPersonalWiki({ root, wikiRoot: personalRoot });
  assert.equal(result.synced.length, 1);
  assert.equal(result.skipped.length, 1);
  const index = JSON.parse(fs.readFileSync(path.join(personalRoot, "index.json"), "utf8"));
  assert.equal(index.assets.length, 1);
  assert.equal(index.assets[0].asset_id, "PAT-001");
  assert.ok(index.assets[0].source_project);
  assert.equal(index.metrics.total, 1);
  assert.equal(index.metrics.provenance_complete, 1);
  assert.equal(index.metrics.provenance_completeness, 1);
  assert.deepEqual(index.metrics.top_tags, [{ tag: "tdd", count: 1 }]);
});

test("parseFrontmatter supports scalar and inline array metadata", () => {
  const parsed = parseFrontmatter("---\ntitle: \"示例\"\ntags: [a, b]\n---\n# 正文\n");
  assert.equal(parsed.frontmatter.title, "示例");
  assert.deepEqual(parsed.frontmatter.tags, ["a", "b"]);
  assert.equal(parsed.body.trim(), "# 正文");
});
