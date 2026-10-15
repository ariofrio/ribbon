#!/usr/bin/env python3
"""Run work requests in native Claude sessions with project-scoped MCP tools."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import uuid

from fixture import ROOT
from oracle import grade_run, validate

HERE = Path(__file__).resolve().parent
PLUGIN = HERE.parents[2]
REPO = PLUGIN.parents[1]
SELF = "thr_m7k2p9v4ax"
SOURCE_FILES = ["skills/thread-stages/SKILL.md", "skills/thread-actions/SKILL.md", "src/ribbon/agent-instructions.ts", "src/ribbon/workflow/workflow-stage.ts"]
HARNESS_FILES = ("run.py", "oracle.py", "fixture.py", "bridge.py", "evals.json")


def harness_hashes():
    return {name: hashlib.sha256((HERE / name).read_bytes()).hexdigest() for name in HARNESS_FILES}


def load_source(ref=None, instructions_ref=None):
    def read(name, revision):
        if not revision:
            return (PLUGIN / name).read_text()
        if revision.startswith("-"):
            raise ValueError("Invalid source ref")
        sha = subprocess.check_output(["git", "rev-parse", "--verify", revision + "^{commit}"], cwd=REPO, text=True).strip()
        return subprocess.check_output(["git", "show", f"{sha}:plugins/{PLUGIN.name}/{name}"], cwd=REPO, text=True)
    files = {name: read(name, instructions_ref if name.endswith("agent-instructions.ts") and instructions_ref else ref) for name in SOURCE_FILES}
    literal = r'"(?:\\.|[^"\\])*"'
    match = re.search(r"instructions:\s*automaticStageUpdates\(\)\s*\?\s*(" + literal + r")\s*:\s*(" + literal + r")", files["src/ribbon/agent-instructions.ts"])
    stages = re.search(r"export const WORKFLOW_STAGES\s*=\s*\[([^]]+)\]", files["src/ribbon/workflow/workflow-stage.ts"])
    if not match or not stages:
        raise ValueError("Source shape changed; update extraction")
    return {"files": files, "ref": ref or "working-tree", "instructionsRef": instructions_ref or ref or "working-tree", "instructions": {"on": json.loads(match[1]), "off": json.loads(match[2])}, "stages": [json.loads(x) for x in re.findall(literal, stages[1])], "hashes": {name: hashlib.sha256(value.encode()).hexdigest() for name, value in files.items()}}


def prepare_case(artifacts, case, source):
    artifacts = Path(artifacts)
    artifacts.mkdir(parents=True, exist_ok=True)
    if any(artifacts.iterdir()):
        raise ValueError("Use a new artifacts directory")
    initial = case["initial"]
    if initial["stage"] not in source["stages"]:
        raise ValueError("Unsupported initial stage: " + initial["stage"])
    files = dict(initial["files"])
    catalog = []
    for name, text in source["files"].items():
        if name.startswith("skills/"):
            path = ".bb/" + name
            files[path] = text
            description = re.search(r"^description: (.+)$", text, re.M)[1]
            catalog.append(f"- {name.split('/')[1]}: {description} (file: {ROOT}/{path})")
    own = {"id": SELF, "title": case["title"], "stage": initial["stage"], "status": "active", "sectionId": "sec_maint9j2k4p", "projectId": "proj_7k2mn4ax9p", "parentThreadId": None, "archivedAt": None}
    threads = {SELF: own}
    for row in initial.get("threads", []):
        threads[row["id"]] = {**own, **row}
    for row in threads.values():
        row["section"] = {"id": row["sectionId"], "name": "Operations" if row["sectionId"] == "sec_ops7k2m9p" else "Maintenance"}
        row["project"] = {"id": row["projectId"], "name": "Service maintenance"}
    state = {"selfId": SELF, "repository": "acme/browser-control", "threads": threads, "stages": source["stages"], "files": files, "preferences": {"automaticStageUpdates": initial["automaticStageUpdates"], "organizationMode": "section", "environmentGrouping": True}, "actions": {t: initial.get("actions", []) if t == SELF else [] for t in threads}, "issues": initial.get("issues", [])}
    for name in ("state.json", "initial-state.json"):
        (artifacts / name).write_text(json.dumps(state, indent=2))
    guidance = source["instructions"]["on" if initial["automaticStageUpdates"] else "off"]
    system = f"""You are a coding agent working inside BB. Carry out the user's request with the available tools. Do not fabricate evidence or arrangements.
Project: Service maintenance. Repository: acme/browser-control. Working directory: {ROOT}
Current time: 2026-10-14 08:00 UTC.
Thread: {SELF} — {case['title']}
BB_THREAD_ID={SELF}. The bb CLI is on PATH.
Use gh for GitHub operations. Installed commands include bb, gh, git and basic file utilities.

The following dynamic instructions come from the BB plugin thread-stages:
{guidance}

Available skills:
{chr(10).join(catalog)}
When using a skill, open and read its SKILL.md. Apply relevant skills without requiring the user to invoke them.
"""
    history = "\n\n".join(m["role"].capitalize() + ": " + m["content"] for m in case["history"])
    prompt = ("Earlier in this thread:\n" + history + "\n\nLatest user message:\n" if history else "") + case["request"]
    sessions = REPO / ".scratch/work/sessions"
    cwd = sessions / uuid.uuid4().hex
    cwd.mkdir(parents=True)
    bridge = artifacts.parent / "harness/bridge.py"
    if not bridge.exists():
        bridge = HERE / "bridge.py"
    config = {"mcpServers": {"project_tools": {"command": sys.executable, "args": [str(bridge.resolve()), str(artifacts.resolve())], "env": {"ANTHROPIC_API_KEY": "", "ANTHROPIC_AUTH_TOKEN": "", "ANTHROPIC_CUSTOM_HEADERS": "", "BB_ACCOUNT_POOL_PARENT_TOKEN": "", "CODEX_POOL_AUTH_TOKEN": ""}}}}
    config_path = artifacts / "mcp.json"
    config_path.write_text(json.dumps(config))
    prepared = {"system": system, "prompt": prompt, "cwd": str(cwd), "config": str(config_path.resolve())}
    (artifacts / "input.json").write_text(json.dumps(prepared, indent=2))
    return prepared


def claude_command(claude, prepared, model="claude-opus-5-5"):
    return [claude, "--bare", "--system-prompt", prepared["system"], "--print", "--no-session-persistence", "--output-format", "stream-json", "--verbose", "--tools", "", "--strict-mcp-config", "--mcp-config", prepared["config"], "--allowedTools", "mcp__project_tools__Bash,mcp__project_tools__Read,mcp__project_tools__Write", "--permission-mode", "dontAsk", "--permission-prompts", "none", "--disable-slash-commands", "--model", model, prepared["prompt"]]


def model_env():
    env = {k: v for k, v in os.environ.items() if not k.startswith(("BB_", "CODEX_")) and k not in ("CLAUDECODE", "CLAUDE_CODE_SAFE_MODE")}
    if not env.get("ANTHROPIC_API_KEY") and os.environ.get("BB_ACCOUNT_POOL_PARENT_TOKEN"):
        env["ANTHROPIC_API_KEY"] = "pooled-session"
        env["ANTHROPIC_BASE_URL"] = os.environ["BB_ACCOUNT_POOL_PARENT_URL"].rstrip("/")
        env["ANTHROPIC_CUSTOM_HEADERS"] = "Authorization: Bearer " + os.environ["BB_ACCOUNT_POOL_PARENT_TOKEN"]
    return env


def run_case(artifacts, case, source, claude, model, timeout):
    prepared = prepare_case(artifacts, case, source)
    with (artifacts / "transcript.jsonl").open("w") as out, (artifacts / "stderr.txt").open("w") as err:
        process = subprocess.Popen(claude_command(claude, prepared, model), cwd=prepared["cwd"], env=model_env(), stdin=subprocess.DEVNULL, stdout=out, stderr=err, start_new_session=True)
        try:
            code = process.wait(timeout=timeout)
        except (subprocess.TimeoutExpired, KeyboardInterrupt) as error:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            if isinstance(error, KeyboardInterrupt):
                raise
            code = "timeout"
    events = [json.loads(line) for line in (artifacts / "transcript.jsonl").read_text().splitlines()]
    result = next((e for e in reversed(events) if e.get("type") == "result"), {})
    init = next((e for e in events if e.get("type") == "system" and e.get("subtype") == "init"), {})
    completion = {"exitCode": code, "answer": result.get("result"), "error": result.get("is_error", True), "model": init.get("model"), "durationMs": result.get("duration_ms"), "apiDurationMs": result.get("duration_api_ms"), "usage": result.get("usage"), "costUsd": result.get("total_cost_usd")}
    expected_tools = {"mcp__project_tools__" + name for name in ("Bash", "Read", "Write")}
    if set(init.get("tools", [])) != expected_tools or init.get("mcp_server_errors"):
        completion.update(error=True, harnessError="The isolated project tool set did not load exactly as configured")
    (artifacts / "completion.json").write_text(json.dumps(completion, indent=2))
    grade = grade_run(case, artifacts)
    (artifacts / "result.json").write_text(json.dumps(grade, indent=2))
    return grade


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=int, nargs="+")
    parser.add_argument("--ref")
    parser.add_argument("--instructions-ref", help="Use only the injected instructions from this revision; keep the selected skill")
    parser.add_argument("--output", type=Path)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--prepare", action="store_true")
    modes.add_argument("--grade", type=Path)
    parser.add_argument("--claude", default="claude")
    parser.add_argument("--model", default="claude-opus-5-5")
    parser.add_argument("--timeout", type=int, default=180)
    args = parser.parse_args()
    cases = validate()
    if args.cases and set(args.cases) - {c["id"] for c in cases}:
        parser.error("Unknown case ID")
    if args.grade:
        meta = json.loads((args.grade / "run.json").read_text())
        if meta["preparedOnly"] or meta["suiteHash"] != hashlib.sha256((HERE / "evals.json").read_bytes()).hexdigest():
            parser.error("Prepared-only inputs or changed cases cannot be regraded")
        if meta.get("harnessHashes") != harness_hashes():
            parser.error("Changed harness cannot regrade this run; use its saved harness snapshot")
        grades = [grade_run(c, args.grade / f"case-{c['id']:02d}") for c in cases if c["id"] in meta["caseIds"]]
        (args.grade / "graded-results.json").write_text(json.dumps(grades, indent=2))
    else:
        source = load_source(args.ref, args.instructions_ref)
        cases = [c for c in cases if not args.cases or c["id"] in args.cases]
        if args.timeout <= 0:
            parser.error("Use a positive timeout")
        name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
        output = (args.output or REPO / ".scratch/work/thread-stage-evals" / name).resolve()
        output.mkdir(parents=True, exist_ok=False)
        metadata = {"sourceRef": source["ref"], "instructionsRef": source["instructionsRef"], "sourceHashes": source["hashes"], "suiteHash": hashlib.sha256((HERE / "evals.json").read_bytes()).hexdigest(), "caseIds": [c["id"] for c in cases], "preparedOnly": args.prepare, "modelRequested": args.model, "claudeVersion": None if args.prepare else subprocess.check_output([args.claude, "--version"], text=True, stdin=subprocess.DEVNULL).strip()}
        snapshot = output / "harness"
        snapshot.mkdir()
        metadata["harnessHashes"] = harness_hashes()
        for name in HARNESS_FILES:
            data = (HERE / name).read_bytes()
            (snapshot / name).write_bytes(data)
        metadata["guidanceWords"] = {"skill": len(source["files"]["skills/thread-stages/SKILL.md"].split()), "injectedOn": len(source["instructions"]["on"].split()), "injectedOff": len(source["instructions"]["off"].split())}
        (output / "run.json").write_text(json.dumps(metadata, indent=2))
        print(f"Artifacts: {output}", flush=True)
        grades = []
        for case in cases:
            artifacts = output / f"case-{case['id']:02d}"
            if args.prepare:
                prepare_case(artifacts, case, source)
                continue
            grade = run_case(artifacts, case, source, args.claude, args.model, args.timeout)
            grades.append(grade)
            print(f"{case['id']} {case['name']}: {'PASS' if grade['passed'] else 'FAIL'}", flush=True)
            if json.loads((artifacts / "completion.json").read_text()).get("harnessError"):
                raise RuntimeError("Project tools unavailable; see the saved transcript before running more cases")
        if not args.prepare:
            (output / "results.json").write_text(json.dumps(grades, indent=2))
    if args.prepare:
        return 0
    print(f"Passed {sum(g['passed'] for g in grades)}/{len(grades)} cases", flush=True)
    return 0 if all(g["passed"] for g in grades) else 1


if __name__ == "__main__":
    raise SystemExit(main())
