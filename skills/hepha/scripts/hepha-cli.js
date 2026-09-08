#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const {
  buildIndexes,
  createWorkspace,
  publishAsset,
  readJson,
  recordCheck,
  recordReview,
  transitionTask,
  validateBacklog,
  hephaPaths,
  syncPersonalWiki,
} = require("./hepha-core");

const [command = "help", ...argv] = process.argv.slice(2);
const args = parseArgs(argv);
const root = path.resolve(args.root || process.cwd());

try {
  switch (command) {
    case "init": {
      const paths = createWorkspace({ root, requirement: args.requirement, person: args.person });
      print({ ok: true, root: paths.projectRoot, hepha_root: paths.hephaRoot });
      break;
    }
    case "validate": {
      const paths = hephaPaths(root);
      const result = validateBacklog(readJson(paths.backlog), { root, allowEmpty: Boolean(args["allow-empty"]) });
      if (!result.ok) fail(result.errors.join("\n"));
      print({ ok: true, warnings: result.warnings });
      break;
    }
    case "record-check": {
      requireArgs(args, ["task", "phase", "command"]);
      const run = spawnSync(args.command, { cwd: root, shell: true, encoding: "utf8" });
      const output = `${run.stdout || ""}${run.stderr || ""}`;
      process.stdout.write(output);
      recordCheck({ root, taskId: args.task, phase: args.phase, command: args.command, exitCode: run.status ?? 1, output });
      const expected = args.phase === "red" ? (run.status ?? 1) !== 0 : run.status === 0;
      if (!expected) fail(args.phase === "red" ? "RED 阶段测试必须失败" : `${args.phase} 阶段检查未通过`);
      print({ ok: true, phase: args.phase, exit_code: run.status ?? 1 });
      break;
    }
    case "record-review": {
      requireArgs(args, ["task", "type", "status"]);
      const evidence = recordReview({ root, taskId: args.task, type: args.type, status: args.status, reviewer: args.reviewer, notes: args.notes });
      print({ ok: true, review: evidence.reviews[args.type] });
      break;
    }
    case "transition": {
      requireArgs(args, ["task", "to"]);
      const result = transitionTask({ root, taskId: args.task, to: args.to });
      print({ ok: true, task: result.task });
      break;
    }
    case "publish-asset": {
      requireArgs(args, ["file"]);
      const result = publishAsset({ root, file: path.resolve(root, args.file), reviewer: args.reviewer });
      print({ ok: true, asset: result.asset, file: result.target });
      break;
    }
    case "build-index": {
      const result = buildIndexes({ root });
      print({ ok: true, summaries: result.summaries.length, assets: result.assets.length });
      break;
    }
    case "sync-personal": {
      const result = syncPersonalWiki({ root, wikiRoot: args["wiki-root"] });
      print({ ok: true, ...result });
      break;
    }
    case "help":
    default:
      process.stdout.write(`Hepha CLI\n\nCommands:\n  init --root . --requirement \"...\" [--person NAME]\n  validate --root . [--allow-empty]\n  record-check --root . --task TASK-001 --phase red|green|regression|lint|build|browser --command \"...\"\n  record-review --root . --task TASK-001 --type spec|code|human --status passed|failed|changes-requested [--reviewer NAME]\n  transition --root . --task TASK-001 --to doing|review|done|blocked|skipped\n  publish-asset --root . --file .hepha/wiki/candidates/PAT-001.md [--reviewer NAME]\n  build-index --root .\n  sync-personal --root . [--wiki-root /path/to/personal-wiki]\n`);
  }
} catch (error) {
  fail(error.message);
}

function parseArgs(items) {
  const parsed = {};
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = items[index + 1];
    if (!next || next.startsWith("--")) parsed[key] = true;
    else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}

function requireArgs(values, names) {
  const missing = names.filter((name) => !values[name]);
  if (missing.length) throw new Error(`缺少参数：${missing.map((name) => `--${name}`).join(", ")}`);
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(message) {
  process.stderr.write(`Hepha: ${message}\n`);
  process.exit(1);
}
