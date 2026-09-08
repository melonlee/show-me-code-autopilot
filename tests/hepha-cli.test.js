const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const cli = path.resolve(__dirname, "../skills/hepha/scripts/hepha-cli.js");

function run(root, args, expected = 0) {
  const result = spawnSync(process.execPath, [cli, ...args, "--root", root], { encoding: "utf8" });
  assert.equal(result.status, expected, `${result.stdout}\n${result.stderr}`);
  return result;
}

test("CLI drives a task through TDD, reviews, summary and asset gates", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hepha-cli-"));
  run(root, ["init", "--requirement", "实现问候函数", "--person", "CLI Tester"]);
  const backlogFile = path.join(root, ".hepha", "backlog.json");
  const backlog = JSON.parse(fs.readFileSync(backlogFile, "utf8"));
  backlog.tasks = [{
    id: "TASK-001",
    title: "实现问候函数",
    state: "todo",
    depends_on: [],
    acceptance: [{ id: "AC-001", given: "一个名字", when: "调用 greet", then: "返回带名字的问候语" }],
    risk: "low",
    files_hint: ["greet.js", "greet.test.js"],
    spec_refs: ["SPEC-001"],
    behavior_change: true,
    test_plan: { commands: ["node --test greet.test.js"] },
    knowledge: { asset_policy: "candidate", candidate_types: ["pattern"] },
  }];
  fs.writeFileSync(backlogFile, `${JSON.stringify(backlog, null, 2)}\n`);

  run(root, ["validate"]);
  run(root, ["transition", "--task", "TASK-001", "--to", "doing"]);
  run(root, ["record-check", "--task", "TASK-001", "--phase", "red", "--command", `${process.execPath} -e \"process.exit(1)\"`]);
  run(root, ["record-check", "--task", "TASK-001", "--phase", "green", "--command", `${process.execPath} -e \"process.exit(0)\"`]);
  run(root, ["record-check", "--task", "TASK-001", "--phase", "regression", "--command", `${process.execPath} -e \"process.exit(0)\"`]);
  run(root, ["transition", "--task", "TASK-001", "--to", "review"]);
  run(root, ["record-review", "--task", "TASK-001", "--type", "spec", "--status", "passed", "--reviewer", "Spec Reviewer"]);
  run(root, ["record-review", "--task", "TASK-001", "--type", "code", "--status", "passed", "--reviewer", "Code Reviewer"]);
  run(root, ["record-review", "--task", "TASK-001", "--type", "human", "--status", "passed", "--reviewer", "Owner"]);

  const summaryDir = path.join(root, ".hepha", "summary", "2026-09-09", "cli-tester");
  fs.mkdirSync(summaryDir, { recursive: true });
  fs.writeFileSync(path.join(summaryDir, "TASK-001.md"), "---\ntask_id: TASK-001\ntitle: \"实现问候函数\"\nstate: review\ndate: 2026-09-09\nperson: \"CLI Tester\"\n---\n# TASK-001\n");
  fs.writeFileSync(path.join(root, ".hepha", "wiki", "candidates", "PAT-001.md"), "---\nasset_id: PAT-001\nstatus: candidate\nsource_tasks: [TASK-001]\n---\n# 候选\n");

  run(root, ["transition", "--task", "TASK-001", "--to", "done"]);
  run(root, ["build-index"]);
  const finalBacklog = JSON.parse(fs.readFileSync(backlogFile, "utf8"));
  assert.equal(finalBacklog.tasks[0].state, "done");
  assert.ok(fs.existsSync(path.join(root, ".hepha", "index.json")));
});
