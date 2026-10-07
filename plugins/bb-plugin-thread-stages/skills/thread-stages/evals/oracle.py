#!/usr/bin/env python3
"""Validate cases and grade the completion-scope decisions in cases 8–10."""

import argparse
import json
from pathlib import Path


def validate():
    root = Path(__file__).resolve().parent.parent
    data = json.loads((root / "evals/evals.json").read_text())
    assert data["skill_name"] == "thread-stages"
    ids = [case["id"] for case in data["evals"]]
    assert len(ids) == len(set(ids))
    assert {8, 9, 10}.issubset(ids)
    for case in data["evals"]:
        assert isinstance(case["id"], int)
        assert isinstance(case["prompt"], str) and case["prompt"]
        assert isinstance(case["expected_output"], str) and case["expected_output"]
        assert case["expectations"] and all(isinstance(x, str) for x in case["expectations"])
        for file in case["files"]:
            assert (root / file).is_file(), file
    print("Validated all durable cases and referenced files.")


def grade(case_id, answer_path):
    text = answer_path.read_text().strip()
    if text.startswith("```json\n") and text.endswith("\n```"):
        text = text[len("```json\n") : -len("\n```")]
    elif text.startswith("```\n") and text.endswith("\n```"):
        text = text[len("```\n") : -len("\n```")]
    answer = json.loads(text)
    expected = {
        8: ("Active", None),
        9: ("Completed", "bb thread-stages stage Completed --self"),
        10: ("Active", None),
    }[case_id]
    checks = [
        {"text": "Selected stage matches the thread's completion boundary", "passed": answer.get("stage") == expected[0], "evidence": answer.get("stage")},
        {"text": "Proposed command matches the required transition", "passed": answer.get("command", "missing") == expected[1], "evidence": answer.get("command")},
    ]
    assert isinstance(answer.get("reason"), str) and answer["reason"]
    passed = sum(check["passed"] for check in checks)
    result = {"expectations": checks, "summary": {"passed": passed, "failed": len(checks) - passed, "total": len(checks), "pass_rate": passed / len(checks)}, "reason_for_review": answer["reason"]}
    print(json.dumps(result, indent=2))
    return int(passed != len(checks))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    sub.add_parser("validate")
    grading = sub.add_parser("grade")
    grading.add_argument("--case", type=int, choices=(8, 9, 10), required=True)
    grading.add_argument("--answer", type=Path, required=True)
    args = parser.parse_args()
    if args.action == "validate":
        validate()
    else:
        raise SystemExit(grade(args.case, args.answer))
