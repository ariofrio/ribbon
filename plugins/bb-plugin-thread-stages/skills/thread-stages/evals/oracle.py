#!/usr/bin/env python3
"""Validate the suite and grade recommendations or recorded agent behavior."""

import argparse
import json
from pathlib import Path
import re
import shlex

from fixture import dispatch


HERE = Path(__file__).resolve().parent


def load_cases():
    data = json.loads((HERE / "evals.json").read_text())
    assert data["skill_name"] == "thread-stages"
    return data["evals"]


def validate():
    cases = load_cases()
    ids = [case["id"] for case in cases]
    assert len(ids) == len(set(ids)), "Duplicate case IDs"
    for case in cases:
        assert type(case["id"]) is int
        for key in ("prompt", "expected_output"):
            assert isinstance(case[key], str) and case[key]
        assert case["expectations"] and all(isinstance(x, str) for x in case["expectations"])
        assert type(case["automatic_updates"]) is bool
        assert all(x in ("thread-stages", "thread-actions") for x in case["required_reads"])
        for file in case["files"]:
            assert (HERE.parent / file).is_file(), file
        if case["mode"] == "recommendation":
            assert isinstance(case["expected_answer"], dict) and case["expected_answer"]
            assert type(case["allow_inspection"]) is bool
        else:
            assert case["mode"] == "automatic"
            assert case["scenario"]["initial_stage"]
            assert case["scenario"]["work"]["objective"]
            assert case["expected_action"]["stage"]
            assert type(case["expected_action"]["writes"]) is int
            assert case["expected_action"]["writes"] in (0, 1)
    return cases


def parse_answer(text):
    text = text.strip()
    fenced = re.findall(r"```(?:json)?\s*\n(.*?)\n```", text, re.S)
    if len(fenced) > 1:
        raise ValueError("Ambiguous answer: more than one JSON block")
    return json.loads(fenced[0] if fenced else text)


def command_tokens(command):
    # Ignore presentation choices that preserve these CLI commands' meaning.
    tokens = []
    for token in shlex.split(command):
        if token == "--json":
            continue
        try:
            token = json.dumps(json.loads(token), sort_keys=True)
        except json.JSONDecodeError:
            pass
        tokens.append(token)
    return tokens


def answer_matches(answer, expected):
    if not isinstance(answer, dict):
        return False
    for key, value in expected.items():
        actual = answer.get(key, "<missing>")
        if key == "in_scope" and isinstance(actual, list):
            if sorted(actual) != sorted(value):
                return False
        elif key == "command" and isinstance(value, str):
            if not isinstance(actual, str) or command_tokens(actual) != command_tokens(value):
                return False
        elif key == "commands":
            if not isinstance(actual, list) or not all(isinstance(x, str) for x in actual):
                return False
            required = [command_tokens(x) for x in value]
            position = 0
            for command in actual:
                tokens = command_tokens(command)
                if position < len(required) and tokens == required[position]:
                    position += 1
                elif not readonly_command(tokens):
                    return False
            if position != len(required):
                return False
        elif actual != value:
            return False
    return isinstance(answer.get("reason"), str) and bool(answer["reason"].strip())


def readonly_command(tokens):
    if not tokens or tokens[0] != "bb":
        return False
    target = next((t for t in tokens[3:] if not t.startswith("--")), "thr_eval")
    state = {"id": target, "stage": "Active", "stages": [], "automaticStageUpdates": True}
    record = {}
    code, _ = dispatch(state, tokens[1:], record)
    return code == 0 and not record.get("mutation_attempt")


def skill_reads(events, workspace):
    uses = {}
    reads = set()
    for event in events:
        for content in event.get("message", {}).get("content", []):
            if not isinstance(content, dict):
                continue
            if content.get("type") == "tool_use":
                uses[content["id"]] = content
            elif content.get("type") == "tool_result" and not content.get("is_error", False):
                use = uses.get(content.get("tool_use_id"), {})
                for name in ("thread-stages", "thread-actions"):
                    path = workspace / "skills" / name / "SKILL.md"
                    inputs = use.get("input", {})
                    if use.get("name") == "Read":
                        candidate = Path(inputs.get("file_path", ""))
                        if not candidate.is_absolute():
                            candidate = workspace / candidate
                        if candidate.resolve() == path.resolve():
                            reads.add(name)
                    elif use.get("name") == "Bash":
                        command = inputs.get("command", "")
                        output = json.dumps(content.get("content", ""))
                        # Shell reads must name the skill and return its content.
                        if (re.search(r"\b(cat|sed|head|tail)\b", command)
                                and f"{name}/SKILL.md" in command
                                and ("# Thread stages" if name == "thread-stages" else "# Thread actions") in output):
                            reads.add(name)
    return reads


def grade_run(case, workspace, events, exit_code):
    workspace = Path(workspace)
    state = json.loads((workspace / "state.json").read_text())
    calls_path = workspace / "calls.jsonl"
    calls = [json.loads(x) for x in calls_path.read_text().splitlines()] if calls_path.exists() else []
    result = next((e for e in reversed(events) if e.get("type") == "result"), None)
    reads = skill_reads(events, workspace)
    checks = []

    def check(name, passed, evidence):
        checks.append({"text": name, "passed": bool(passed), "evidence": evidence})

    check("Agent completed successfully", exit_code == 0 and result is not None
          and result.get("is_error") is False, {"exitCode": exit_code, "resultPresent": result is not None})
    check("Required skills were read successfully", set(case["required_reads"]) <= reads, sorted(reads))
    check("Unneeded skills were not loaded", not (set(case.get("forbidden_reads", [])) & reads), sorted(reads))
    errors = [c for c in calls if c.get("error")]
    check("No invalid or forbidden CLI calls", not errors, errors)
    writes = [c for c in calls if c.get("write")]
    mutations = [c for c in calls if c.get("mutation_attempt")]
    if case["mode"] == "recommendation":
        try:
            answer = parse_answer(result.get("result", "") if result else "")
            matched = answer_matches(answer, case["expected_answer"])
        except (ValueError, TypeError):
            answer, matched = result.get("result") if result else None, False
        check("Recommendation matches the case contract", matched, answer)
        check("Recommendation did not perform a mutation", not mutations, mutations)
        check("Respected the request's execution limit", case["allow_inspection"] or not calls, calls)
        check("Fixture state remained unchanged", state["stage"] == "Active", state["stage"])
    else:
        expected = case["expected_action"]
        check("Final stage matches the workflow", state["stage"] == expected["stage"], state["stage"])
        check("Exactly the required stage writes were made", len(writes) == expected["writes"], len(writes))
        check("Every mutation was an allowed write to this thread",
              len(mutations) == len(writes) and all(c.get("threadId") == state["id"] for c in writes), mutations)
        inspected = False
        preinspected = True
        for call in calls:
            inspected |= bool(call.get("inspected"))
            if call.get("write") and not inspected:
                preinspected = False
        check("Current stage was inspected before each write", preinspected, calls)
        recorded = case["scenario"]["initial_stage"]
        for call in writes:
            recorded = call["after"]
        check("Final state agrees with the recorded writes", recorded == state["stage"], state["stage"])
    return {"caseId": case["id"], "mode": case["mode"], "passed": all(c["passed"] for c in checks),
            "checks": checks, "answer": result.get("result") if result else None,
            "stage": state["stage"], "writes": len(writes)}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("validate")
    grading = sub.add_parser("grade", help="Grade a saved recommendation answer")
    grading.add_argument("--case", type=int, required=True)
    grading.add_argument("--answer", type=Path, required=True)
    args = parser.parse_args()
    cases = validate()
    if args.action == "validate":
        print(f"Validated {len(cases)} recommendation and automatic cases.")
    else:
        case = next(c for c in cases if c["id"] == args.case)
        if case["mode"] != "recommendation":
            parser.error("Use run.py to grade automatic behavior from its transcript and state")
        passed = answer_matches(parse_answer(args.answer.read_text()), case["expected_answer"])
        print(json.dumps({"caseId": case["id"], "passed": passed}, indent=2))
        raise SystemExit(0 if passed else 1)
