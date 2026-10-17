#!/usr/bin/env python3
"""Run the committed cases in fresh Codex or Claude sessions with a local BB fixture."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import shutil
import signal
import subprocess
import sys
import time
import uuid

from oracle import grade_run, validate


HERE = Path(__file__).resolve().parent
PLUGIN = HERE.parents[2]
REPO = PLUGIN.parents[1]
SOURCE_FILES = ["skills/thread-stages/SKILL.md", "skills/thread-actions/SKILL.md",
                "src/ribbon/agent-instructions.ts", "src/ribbon/workflow/workflow-stage.ts"]


def load_source(ref=None):
    commit = None
    if ref:
        if ref.startswith("-"):
            raise ValueError("A source ref cannot start with a dash")
        commit = subprocess.check_output(["git", "rev-parse", "--verify", ref + "^{commit}"],
                                         cwd=REPO, text=True).strip()
    files = {}
    for name in SOURCE_FILES:
        files[name] = (subprocess.check_output(["git", "show", f"{commit}:plugins/{PLUGIN.name}/{name}"],
                                              cwd=REPO, text=True) if commit else (PLUGIN / name).read_text())
    literal = r'"(?:\\.|[^"\\])*"'
    source = files["src/ribbon/agent-instructions.ts"]
    match = re.search(r"instructions:\s*automaticStageUpdates\(\)\s*\?\s*(" + literal
                      + r")\s*:\s*(" + literal + r")", source)
    if not match:
        raise ValueError("Agent instruction source changed; update its eval extraction")
    stages = re.search(r"export const WORKFLOW_STAGES\s*=\s*\[([^]]+)\]",
                       files["src/ribbon/workflow/workflow-stage.ts"])
    if not stages:
        raise ValueError("Workflow stage source changed; update its eval extraction")
    return {"files": files, "ref": commit or "working-tree",
            "instructions": {"on": json.loads(match[1]), "off": json.loads(match[2])},
            "stages": [json.loads(x) for x in re.findall(literal, stages[1])],
            "hashes": {name: hashlib.sha256(value.encode()).hexdigest() for name, value in files.items()}}


def prepare_case(workspace, case, source):
    workspace = Path(workspace)
    workspace.mkdir(parents=True, exist_ok=True)
    if any(workspace.iterdir()):
        raise ValueError("Each agent needs a new, empty workspace")
    stage = case.get("scenario", {}).get("initial_stage", "Active")
    if stage not in source["stages"]:
        raise ValueError(f"The selected source has no stage {stage}")
    for name, text in source["files"].items():
        if name.startswith("skills/"):
            path = workspace / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
    shutil.copyfile(HERE / "fixture.py", workspace / "fixture.py")
    binary = workspace / "bin/bb"
    binary.parent.mkdir()
    binary.write_text("#!/bin/sh\nexec " + shlex.quote(sys.executable) + " "
                      + shlex.quote(str(workspace / "fixture.py")) + ' "$@"\n')
    binary.chmod(0o755)
    (workspace / "state.json").write_text(json.dumps({"id": "thr_eval", "stage": stage,
        "stages": source["stages"], "automaticStageUpdates": case["automatic_updates"],
        "files": {name: (HERE.parent / path).read_text()
                  for name, path in case.get("workspace_files", {}).items()}}))
    if case["mode"] == "automatic":
        (workspace / "work.json").write_text(json.dumps(case["scenario"]["work"], indent=2))
    skill = workspace / "skills/thread-stages/SKILL.md"
    description = re.search(r"^description: (.+)$", skill.read_text(), re.M)[1]
    guidance = source["instructions"]["on" if case["automatic_updates"] else "off"]
    system = f"""You are a coding agent working inside BB. Carry out the user's request with the available tools.
The BB CLI is isolated and serves local thread state and recorded project files; never connect to live services, send messages, or start jobs. Do not fabricate evidence or arrangements.
The BB CLI is on PATH, with absolute path {binary}. BB_THREAD_ID is thr_eval.
Stage IDs available in this fixture: {', '.join(source['stages'])}.
{'work.json contains the complete relevant conversation and verified workflow evidence.' if case['mode'] == 'automatic' else 'The user message supplies the relevant workflow context. Follow its limits on execution.'}

The following dynamic instructions come from the BB plugin thread-stages:
{guidance}

Available skills:
- thread-stages: {description} (file: {skill})
When using a skill, open and read its SKILL.md. Apply relevant skills without requiring the user to invoke them.
"""
    prompt = case["prompt"]
    if case["mode"] == "recommendation":
        # Field shapes only; expected values are never passed to the agent.
        def shape(value, key):
            if isinstance(value, dict):
                return {name: shape(child, name) for name, child in value.items()}
            return ("array of strings" if isinstance(value, list) else "boolean" if type(value) is bool
                    else "string or null" if key == "command" else "string")
        fields = {key: shape(value, key) for key, value in case["expected_answer"].items()}
        prompt += ("\nReply with a JSON object using these fields and types: " + json.dumps(fields)
                   + ". Include a nonempty reason. Use canonical stage IDs. Commands are proposed shell command strings.")
    (workspace / "system.txt").write_text(system)
    (workspace / "prompt.txt").write_text(prompt)
    return system, prompt


def normalize_events(events, runtime):
    """Adapt actual Codex command results to the shared tool-evidence reader."""
    if runtime == "claude":
        return events
    normalized = []
    answer = ""
    for event in events:
        item = event.get("item", {})
        if event.get("type") == "item.completed" and item.get("type") == "command_execution":
            normalized.extend([
                {"type": "assistant", "message": {"content": [{"type": "tool_use",
                    "id": item["id"], "name": "Bash", "input": {"command": item["command"]}}]}},
                {"type": "user", "message": {"content": [{"type": "tool_result",
                    "tool_use_id": item["id"], "is_error": item.get("exit_code") != 0,
                    "content": item.get("aggregated_output", "")}]}},
            ])
        elif event.get("type") == "item.completed" and item.get("type") == "agent_message":
            answer = item["text"]
        elif event.get("type") == "turn.completed":
            normalized.append({"type": "result", "is_error": False, "result": answer})
    return normalized


def run_case(workspace, case, source, executable, timeout, runtime):
    system, prompt = prepare_case(workspace, case, source)
    env = {key: value for key, value in os.environ.items() if not key.startswith("BB_")}
    env.update(PATH=str(workspace / "bin") + os.pathsep + env["PATH"], BB_THREAD_ID="thr_eval")
    env.pop("CLAUDECODE", None)
    if runtime == "claude":
        args = [executable, "--safe-mode", "--system-prompt", system, "--print", "--no-session-persistence",
                "--output-format", "stream-json", "--verbose", "--tools", "Bash,Read",
                "--allowedTools", "Bash", "Read", "--permission-prompts", "none", prompt]
    else:
        args = [executable, "exec", "--ignore-user-config", "--ignore-rules", "--ephemeral",
                "--skip-git-repo-check", "--sandbox", "workspace-write", "--json",
                "-c", "project_doc_max_bytes=0", "-c", "skills.include_instructions=false",
                "-c", "allow_login_shell=false", "-c", 'shell_environment_policy.inherit="all"',
                "-c", "model_instructions_file=" + json.dumps(str(workspace / "system.txt")),
                "--output-last-message", str(workspace / "assistant.md"), prompt]
    (workspace / "command.json").write_text(json.dumps(args, indent=2) + "\n")
    began = time.monotonic()
    with (workspace / "transcript.jsonl").open("w") as stdout, (workspace / "stderr.txt").open("w") as stderr:
        process = subprocess.Popen(args, cwd=workspace, env=env, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                                   start_new_session=True)
        try:
            exit_code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            exit_code = "timeout"
    events = [json.loads(line) for line in (workspace / "transcript.jsonl").read_text().splitlines()]
    events = normalize_events(events, runtime)
    result = grade_run(case, workspace, events, exit_code)
    (workspace / "assistant.md").write_text((result.get("answer") or "") + "\n")
    init = next((e for e in events if e.get("type") == "system" and e.get("subtype") == "init"), {})
    result.update(model=init.get("model"), sessionId=init.get("session_id"),
                  seconds=round(time.monotonic() - began, 2), sourceRef=source["ref"], runtime=runtime)
    (workspace / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    write_grading(workspace, result)
    return result


def write_grading(workspace, result):
    expectations = [{**c, "evidence": json.dumps(c["evidence"], ensure_ascii=False)}
                    for c in result["checks"]]
    passed = sum(c["passed"] for c in expectations)
    (workspace / "grading.json").write_text(json.dumps({"expectations": expectations,
        "summary": {"passed": passed, "failed": len(expectations) - passed,
                    "total": len(expectations), "pass_rate": passed / len(expectations)}}, indent=2) + "\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("all", "recommendation", "automatic"), default="all")
    parser.add_argument("--cases", type=int, nargs="+", help="Select committed case IDs")
    parser.add_argument("--ref", help="Evaluate skill, instructions, and stages from a Git revision")
    parser.add_argument("--output", type=Path, help="New output directory; existing directories are refused")
    parser.add_argument("--prepare", action="store_true", help="Prepare fixtures without launching agents")
    parser.add_argument("--grade", type=Path, help="Regrade a saved run without launching agents")
    parser.add_argument("--claude", default="claude", help="Claude Code executable (uses its configured default model)")
    parser.add_argument("--codex", default="codex", help="Codex executable (uses its clean-config default model)")
    parser.add_argument("--runtime", choices=("claude", "codex"), default="claude")
    parser.add_argument("--timeout", type=int, default=180, help="Seconds allowed per case")
    args = parser.parse_args()
    cases = validate()
    if args.grade:
        if args.prepare or args.ref or args.output or args.cases or args.mode != "all":
            parser.error("--grade uses the saved run's complete selection")
        metadata = json.loads((args.grade / "run.json").read_text())
        if metadata["preparedOnly"] or not metadata["caseIds"]:
            parser.error("Prepared inputs are not evaluated results")
        if metadata["suiteHash"] != hashlib.sha256((HERE / "evals.json").read_bytes()).hexdigest():
            parser.error("The saved run used different cases; rerun against the current suite")
        results = []
        for case in cases:
            if case["id"] not in metadata["caseIds"]:
                continue
            workspace = args.grade / f"case-{case['id']:02d}"
            prior = json.loads((workspace / "result.json").read_text())
            if prior.get("error"):
                results.append(prior)
                print(f"Case {case['id']}: FAIL ({prior['error']})", flush=True)
                continue
            events = [json.loads(line) for line in (workspace / "transcript.jsonl").read_text().splitlines()]
            exit_code = next(c["evidence"]["exitCode"] for c in prior["checks"]
                             if c["text"] == "Agent completed successfully")
            result = grade_run(case, workspace, normalize_events(events, metadata.get("runtime", "claude")), exit_code)
            (workspace / "grade.json").write_text(json.dumps(result, indent=2) + "\n")
            write_grading(workspace, result)
            results.append(result)
            print(f"Case {case['id']}: {'PASS' if result['passed'] else 'FAIL'}", flush=True)
        (args.grade / "graded-results.json").write_text(json.dumps(results, indent=2) + "\n")
        print(f"Passed {sum(r['passed'] for r in results)}/{len(results)} saved cases (no new agents)")
        return 0 if all(r["passed"] for r in results) else 1
    if args.cases and set(args.cases) - {c["id"] for c in cases}:
        parser.error("Unknown case ID")
    cases = [c for c in cases if (args.mode == "all" or c["mode"] == args.mode)
             and (not args.cases or c["id"] in args.cases)]
    if not cases or args.timeout <= 0:
        parser.error("Select at least one case and a positive timeout")
    source = load_source(args.ref)
    name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    output = (args.output or REPO / ".scratch/work/thread-stage-evals" / name).resolve()
    output.mkdir(parents=True, exist_ok=False)
    executable = args.claude if args.runtime == "claude" else args.codex
    version = None if args.prepare else subprocess.check_output([executable, "--version"], text=True).strip()
    (output / "run.json").write_text(json.dumps({"sourceRef": source["ref"], "sourceHashes": source["hashes"],
        "suiteHash": hashlib.sha256((HERE / "evals.json").read_bytes()).hexdigest(),
        "runtime": args.runtime, "cliVersion": version, "caseIds": [c["id"] for c in cases], "preparedOnly": args.prepare}, indent=2))
    print(f"Artifacts: {output}", flush=True)
    results = []
    for case in cases:
        workspace = output / f"case-{case['id']:02d}"
        if args.prepare:
            prepare_case(workspace, case, source)
            print(f"Prepared case {case['id']} (not evaluated)", flush=True)
            continue
        try:
            result = run_case(workspace, case, source, executable, args.timeout, args.runtime)
        except (OSError, ValueError) as error:
            result = {"caseId": case["id"], "passed": False, "error": str(error)}
            workspace.mkdir(parents=True, exist_ok=True)
            (workspace / "result.json").write_text(json.dumps(result, indent=2))
        results.append(result)
        print(f"Case {case['id']}: {'PASS' if result['passed'] else 'FAIL'}", flush=True)
    (output / "results.json").write_text(json.dumps(results, indent=2) + "\n")
    if args.prepare:
        return 0
    print(f"Passed {sum(r['passed'] for r in results)}/{len(results)} cases", flush=True)
    return 0 if all(r["passed"] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
