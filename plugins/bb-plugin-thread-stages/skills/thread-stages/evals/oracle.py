"""Grade recorded commands and their effects; prose cannot satisfy an action."""

import copy
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load_cases():
    data = json.loads((HERE / "evals.json").read_text())
    assert data["skill_name"] == "thread-stages"
    return data["evals"]


def validate():
    cases = load_cases()
    assert len({c["id"] for c in cases}) == len(cases)
    for case in cases:
        assert type(case["id"]) is int and case["name"] and case["title"]
        assert isinstance(case["request"], str) and case["request"]
        assert "expected_answer" not in case and "mode" not in case
        assert "what stage" not in case["request"].lower()
        assert all(m["role"] in ("user", "assistant") and m["content"] for m in case["history"])
        assert type(case["initial"]["automaticStageUpdates"]) is bool
        assert case["initial"]["stage"]
        assert all(s in ("thread-stages", "thread-actions") for s in case["required_reads"])
        assert case["expected"]["stages"]
        assert all(type(n) is int and n >= 0 for n in case["expected"]["stage_writes"].values())
    return cases


def grade_run(case, artifacts):
    root = Path(artifacts)
    initial = json.loads((root / "initial-state.json").read_text())
    state = json.loads((root / "state.json").read_text())
    events_path = root / "events.jsonl"
    events = [json.loads(line) for line in events_path.read_text().splitlines()] if events_path.exists() else []
    completion_path = root / "completion.json"
    completion = json.loads(completion_path.read_text()) if completion_path.exists() else {}
    expected = case["expected"]
    checks = []

    def check(name, passed, evidence):
        checks.append({"text": name, "passed": bool(passed), "evidence": evidence})

    check("Session completed successfully", completion.get("exitCode") == 0 and bool(completion.get("answer")) and not completion.get("error"), completion)
    reads = {e["path"].split("/")[-2] for e in events if e["kind"] == "read" and e.get("success") and e["path"].endswith("/SKILL.md")}
    check("Required skills were read", set(case["required_reads"]) <= reads, sorted(reads))
    files_read = {e["path"] for e in events if e["kind"] == "read" and e.get("success")}
    check("Requested report evidence was inspected", set(case.get("required_files", [])) <= files_read, sorted(files_read))
    def mutating_call(event):
        program, args = event.get("program"), event.get("args", [])
        if program == "gh" and args[:1] in (["--repo"], ["-R"]):
            args = args[2:]
        return (program == "bb" and args[:1] == ["thread-stages"] and
                (args[1:2] == ["stage"] or args[1:3] in (["prefs", "set"], ["prefs", "reset"], ["actions", "set"], ["actions", "run"]))) or (program == "gh" and args[:2] in (["issue", "create"], ["issue", "edit"]))
    errors = [e for e in events if e.get("error") and mutating_call(e)]
    check("Mutating commands were valid", not errors, errors)
    mutations = [e["mutation"] for e in events if "mutation" in e]
    writes = [m for m in mutations if m["kind"] == "stage"]
    counts = {target: sum(m["threadId"] == target for m in writes) for target in state["threads"]}
    check("Expected final workflow states", all(state["threads"].get(t, {}).get("stage") == stage for t, stage in expected["stages"].items()), {t: r["stage"] for t, r in state["threads"].items()})
    check("Exactly the required stage commands ran", all(counts.get(t, 0) == n for t, n in expected["stage_writes"].items()) and not any(m["threadId"] not in expected["stage_writes"] for m in writes), writes)
    inspected, seen, skills, preinspected, preread = set(), set(), set(), True, True
    for event in events:
        if event["kind"] == "read" and event.get("success") and event["path"].endswith("/SKILL.md"):
            skills.add(event["path"].split("/")[-2])
        inspected.update(event.get("inspected", []))
        seen.update(event.get("inspected", []))
        mutation = event.get("mutation", {})
        if mutation:
            preread &= set(case["required_reads"]) <= skills
        if mutation.get("kind") == "stage":
            target = mutation["threadId"]
            preinspected &= target in inspected
            inspected.discard(target)
    check("Current state was inspected before stage decisions", preinspected and (not initial["preferences"]["automaticStageUpdates"] or initial["selfId"] in seen), sorted(seen))
    check("Required skills were read before mutations", preread, sorted(skills))
    replay = copy.deepcopy(initial)
    for m in mutations:
        if m["kind"] == "stage":
            replay["threads"][m["threadId"]]["stage"] = m["after"]
        elif m["kind"] == "preference":
            replay["preferences"][m["key"]] = m["value"]
        elif m["kind"] == "actions":
            replay["actions"][m["threadId"]] = m["actions"]
        elif m["kind"] == "issue-create":
            replay["issues"].append({"number": m["number"], "title": m["title"], "body": m["body"], "state": "OPEN", "url": f"https://github.com/acme/browser-control/issues/{m['number']}"})
        elif m["kind"] == "issue-edit":
            issue = next(i for i in replay["issues"] if i["number"] == m["number"])
            issue["body"] = m["body"]
            if "title" in m:
                issue["title"] = m["title"]
    check("Final state agrees with recorded effects", all(replay[k] == state[k] for k in ("threads", "preferences", "actions", "issues")), {})
    prefs = [m for m in mutations if m["kind"] == "preference"]
    check("Requested preferences were set", len(prefs) == expected.get("preference_writes", 0) and all(state["preferences"].get(k) == v for k, v in expected.get("preferences", {}).items()) and all(m["key"] in expected.get("preferences", {}) for m in prefs), prefs)
    actions = [m for m in mutations if m["kind"] == "actions"]
    wanted = expected.get("actions")
    actual = state["actions"][state["selfId"]]
    def action_value(a, include_id=False):
        return {**({"id": a["id"]} if include_id else {}), "label": a["label"], "prompt": a["prompt"], "steer": a.get("steer", False)}
    preserved = all(action_value(a, True) in [action_value(b, True) for b in actual] for a in initial["actions"][initial["selfId"]])
    action_values = [action_value(a) for a in actual]
    wanted = [action_value(a) for a in wanted] if wanted is not None else None
    check("Requested actions were saved without losing existing buttons", len(actions) == expected.get("action_writes", 0) and (wanted is None or action_values == wanted and preserved) and all(m["threadId"] == state["selfId"] for m in actions), actions)
    creates = [m for m in mutations if m["kind"] == "issue-create"]
    edits = [m for m in mutations if m["kind"] == "issue-edit"]
    expected_bodies = [initial["files"][f] for f in expected.get("issue_creates", [])]
    expected_edits = {int(n): initial["files"][f] for n, f in expected.get("issue_edits", {}).items()}
    check("Report delivery commands match the approved bodies", sorted(m["body"].strip() for m in creates) == sorted(b.strip() for b in expected_bodies) and len(edits) == len(expected_edits) and {m["number"]: m["body"].strip() for m in edits} == {n: b.strip() for n, b in expected_edits.items()}, creates + edits)
    delivered, verified, premature = set(), set(), False
    for event in events:
        mutation = event.get("mutation", {})
        if mutation.get("kind") in ("issue-create", "issue-edit"):
            delivered.add(mutation["number"])
            verified.discard(mutation["number"])
        if "issueRead" in event:
            verified.add(event["issueRead"])
        verified.update(event.get("issuesRead", []))
        if mutation.get("kind") == "stage" and mutation.get("after") == "Completed":
            premature |= len(delivered) != len(expected_bodies) + len(expected_edits) or not delivered <= verified
    check("Published reports were read back", delivered <= verified, sorted(verified))
    check("Reporting was delivered and verified before completion", not premature, {"premature": premature})
    return {"caseId": case["id"], "name": case["name"], "passed": all(c["passed"] for c in checks), "checks": checks, "answer": completion.get("answer"), "stages": {t: r["stage"] for t, r in state["threads"].items()}, "stageWrites": writes}
