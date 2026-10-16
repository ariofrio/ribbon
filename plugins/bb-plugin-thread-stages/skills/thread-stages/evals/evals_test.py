import copy
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from fixture import Workspace
from oracle import grade_run, load_cases, validate
from run import claude_command, load_source, prepare_case

HERE = Path(__file__).resolve().parent
WORK = HERE.parents[4] / ".scratch/work/thread-stage-evals-unit"


class EvalTests(unittest.TestCase):
    def setUp(self):
        WORK.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=WORK)
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.case = next(c for c in load_cases() if c["id"] == 18)
        self.source = load_source()
        self.prepared = prepare_case(self.root / "artifacts", self.case, self.source)
        self.workspace = Workspace(self.root / "artifacts")
        self.command("cat reports/comparison.md")

    def read_skill(self, workspace=None, name="thread-stages"):
        return (workspace or self.workspace).tool("Read", {"file_path": f"/workspace/project/.bb/skills/{name}/SKILL.md"})

    def command(self, command, workspace=None):
        return (workspace or self.workspace).tool("Bash", {"command": command})

    def finish(self, root=None, text="Both designs are ready for your review.", code=0):
        (root or self.root / "artifacts").joinpath("completion.json").write_text(json.dumps({"exitCode": code, "answer": text}))

    def grade(self):
        return grade_run(self.case, self.root / "artifacts")

    def transition(self):
        self.read_skill()
        self.command("bb thread-stages show --self --json")
        self.command("bb thread-stages stage BlockedOnUser --self --json")
        self.finish()

    def test_manifest_contains_only_work_requests(self):
        cases = validate()
        self.assertEqual(len(cases), 22)
        self.assertNotIn("Waiting", self.source["stages"])
        for case in cases:
            self.assertIn(case["initial"]["stage"], self.source["stages"])
            self.assertTrue(set(case["expected"]["stages"].values()) <= set(self.source["stages"]))
            self.assertNotIn("expected_answer", case)
            self.assertNotIn("What stage", case["request"])
            self.assertNotIn("Reply with JSON", case["request"])

    def test_model_inputs_do_not_disclose_evaluation_or_expected_outcomes(self):
        visible = self.prepared["system"] + self.prepared["prompt"]
        for text in ("evaluation", "fixture", "thr_eval", "work.json", "expected_action", "expected stage"):
            self.assertNotIn(text, visible.lower())
        self.assertNotIn(str(self.root), visible)
        for command in ("bb --help", "bb status --json", "bb thread-stages show --self"):
            self.assertNotIn("eval", json.dumps(self.command(command)).lower())

    def test_private_state_and_grading_files_are_not_readable_or_writable(self):
        before = copy.deepcopy(self.workspace.state)
        for path in ("state.json", "../state.json", str(self.root / "artifacts/state.json"), "/etc/passwd"):
            self.assertTrue(self.workspace.tool("Read", {"file_path": path})["isError"])
            self.assertTrue(self.workspace.tool("Write", {"file_path": path, "content": "forged"})["isError"])
        self.assertEqual(self.workspace.state, before)

    def test_tools_cannot_execute_host_commands_or_contact_services(self):
        for command in ("curl https://example.com", "python3 -c 'print(1)'", "/usr/local/bin/bb thread list", "cat /etc/passwd", "bb thread send other hello"):
            self.assertTrue(self.command(command)["isError"], command)

    def test_only_explicit_project_tools_are_exposed(self):
        args = claude_command("claude", self.prepared)
        self.assertIn("--bare", args)
        self.assertEqual(args[args.index("--tools") + 1], "")
        self.assertIn("--strict-mcp-config", args)
        self.assertNotIn("--dangerously-skip-permissions", args)

    def test_native_process_does_not_inherit_launcher_input(self):
        client = self.root / "claude"
        client.write_text(f"#!{sys.executable}\n" + '''import json, sys
if "--version" in sys.argv:
    print("test client")
else:
    print(json.dumps({"type": "system", "subtype": "init", "tools": ["mcp__project_tools__" + name for name in ("Bash", "Read", "Write")]}))
    print(json.dumps({"type": "result", "result": str(len(sys.stdin.read())), "is_error": False}))
''')
        client.chmod(0o700)
        output = self.root / "native"
        result = subprocess.run([sys.executable, str(HERE / "run.py"), "--cases", "17", "--claude", str(client), "--output", str(output)], input="Unrelated launcher input", text=True, capture_output=True)
        self.assertEqual(result.returncode, 1, result.stderr)
        completion = json.loads((output / "case-17/completion.json").read_text())
        self.assertEqual(completion["answer"], "0")
        self.assertNotIn("harnessError", completion)
        metadata = json.loads((output / "run.json").read_text())
        self.assertEqual(set(metadata["harnessHashes"]), {p.name for p in (output / "harness").iterdir()})
        metadata["harnessHashes"]["oracle.py"] = "changed"
        (output / "run.json").write_text(json.dumps(metadata))
        regrade = subprocess.run([sys.executable, str(HERE / "run.py"), "--grade", str(output)], text=True, capture_output=True)
        self.assertNotEqual(regrade.returncode, 0)
        self.assertIn("Changed harness", regrade.stderr)

    def test_proposed_command_does_not_pass(self):
        self.read_skill()
        self.command("bb thread-stages show --self")
        self.finish(text="I would run bb thread-stages stage BlockedOnUser --self.")
        self.assertFalse(self.grade()["passed"])

    def test_success_requires_recorded_command_and_effect(self):
        self.transition()
        self.assertTrue(self.grade()["passed"])

    def test_missing_inspection_fails(self):
        self.read_skill()
        self.command("bb thread-stages stage BlockedOnUser --self")
        self.finish()
        self.assertFalse(self.grade()["passed"])

    def test_redundant_write_fails(self):
        self.transition()
        self.command("bb thread-stages stage BlockedOnUser --self")
        self.assertFalse(self.grade()["passed"])

    def test_wrong_thread_or_invalid_call_is_not_hidden_by_recovery(self):
        self.command("bb thread-stages stage BlockedOnUser thr_other")
        self.transition()
        self.assertFalse(self.grade()["passed"])

    def test_read_only_discovery_failure_does_not_erase_completed_work(self):
        self.command("gh pr list --state merged --limit 5")
        self.transition()
        self.assertTrue(self.grade()["passed"])

    def test_skill_read_after_mutation_is_too_late(self):
        self.command("bb thread-stages show --self")
        self.command("bb thread-stages stage BlockedOnUser --self")
        self.read_skill()
        self.finish()
        self.assertFalse(self.grade()["passed"])

    def test_missing_completion_and_failed_skill_read_fail(self):
        self.command("bb thread-stages show --self")
        self.command("bb thread-stages stage BlockedOnUser --self")
        self.finish()
        self.assertFalse(self.grade()["passed"])
        self.read_skill()
        (self.root / "artifacts/completion.json").unlink()
        self.assertFalse(self.grade()["passed"])

    def test_timeout_cannot_pass_after_correct_effect(self):
        self.transition()
        self.finish(code="timeout")
        self.assertFalse(self.grade()["passed"])

    def test_noop_requires_inspection_and_rejects_unrecorded_stage_change(self):
        case = next(c for c in load_cases() if c["id"] == 24)
        root = self.root / "noop"
        prepare_case(root, case, self.source)
        ws = Workspace(root)
        self.finish(root)
        self.assertFalse(grade_run(case, root)["passed"])
        self.read_skill(ws)
        self.command("cat reports/network-watch.json", ws)
        self.command("bb thread-stages show --self", ws)
        self.assertTrue(grade_run(case, root)["passed"])
        ws.state["threads"][ws.state["selfId"]]["stage"] = "Completed"
        ws.save()
        self.assertFalse(grade_run(case, root)["passed"])

    def test_preferences_require_real_commands(self):
        case = next(c for c in load_cases() if c["id"] == 4)
        root = self.root / "prefs"
        prepare_case(root, case, self.source)
        ws = Workspace(root)
        self.read_skill(ws)
        self.command("bb thread-stages show --self", ws)
        self.finish(root, "Settings changed.")
        self.assertFalse(grade_run(case, root)["passed"])
        self.command("bb thread-stages prefs set organizationMode project && bb thread-stages prefs set environmentGrouping false", ws)
        self.assertTrue(grade_run(case, root)["passed"])

    def test_action_payload_preserves_existing_buttons(self):
        case = next(c for c in load_cases() if c["id"] == 5)
        root = self.root / "actions"
        prepare_case(root, case, self.source)
        ws = Workspace(root)
        self.read_skill(ws)
        self.read_skill(ws, "thread-actions")
        self.command("bb thread-stages show --self", ws)
        before = copy.deepcopy(ws.state["actions"])
        payload = before[ws.state["selfId"]] + [{"id": "review", "label": "Review", "prompt": "Review this change."}]
        self.command("bb thread-stages actions set --self --actions '" + json.dumps(payload) + "'", ws)
        self.finish(root, "Saved.")
        self.assertTrue(grade_run(case, root)["passed"])

    def test_invalid_action_json_does_not_mutate_state(self):
        before = copy.deepcopy(self.workspace.state["actions"])
        self.assertTrue(self.command("bb thread-stages actions set --self --actions '[{bad}]'")["isError"])
        self.assertEqual(self.workspace.state["actions"], before)

    def test_each_target_must_be_inspected(self):
        case = next(c for c in load_cases() if c["id"] == 1)
        root = self.root / "bulk"
        prepare_case(root, case, self.source)
        ws = Workspace(root)
        self.read_skill(ws)
        self.command("bb thread-stages show --self", ws)
        for target, count in case["expected"]["stage_writes"].items():
            if count:
                self.command(f"bb thread-stages stage {case['expected']['stages'][target]} {target}", ws)
        self.finish(root, "Parked.")
        self.assertFalse(grade_run(case, root)["passed"])

    def test_joined_list_excludes_children_until_requested(self):
        case = next(c for c in load_cases() if c["id"] == 20)
        case["initial"]["threads"][0]["parentThreadId"] = "thr_m7k2p9v4ax"
        root = self.root / "children"
        prepare_case(root, case, self.source)
        ws = Workspace(root)
        rows = json.loads(self.command("bb thread-stages list --json", ws)["content"][0]["text"])
        self.assertEqual([r["id"] for r in rows], [ws.state["selfId"]])
        rows = json.loads(self.command("bb thread-stages list --json --include-children", ws)["content"][0]["text"])
        self.assertEqual(len(rows), 2)

    def test_reporting_requires_submission_and_readback(self):
        case = next(c for c in load_cases() if c["id"] == 31)
        root = self.root / "report"
        prepare_case(root, case, self.source)
        ws = Workspace(root)
        self.read_skill(ws)
        self.command("bb thread-stages show --self", ws)
        self.finish(root, "Filed the report.")
        self.assertFalse(grade_run(case, root)["passed"])
        self.command("gh issue create --repo acme/browser-control --title 'Cookie loss' --body-file reports/cookies.md", ws)
        self.assertFalse(grade_run(case, root)["passed"])
        self.command("gh issue view 41 --repo acme/browser-control --json body,url,state", ws)
        self.command("bb thread-stages stage Completed --self", ws)
        self.assertTrue(grade_run(case, root)["passed"])

    def test_report_completion_before_delivery_is_premature(self):
        case = next(c for c in load_cases() if c["id"] == 31)
        root = self.root / "premature"
        prepare_case(root, case, self.source)
        ws = Workspace(root)
        self.read_skill(ws)
        self.command("bb thread-stages show --self", ws)
        self.command("bb thread-stages stage Completed --self", ws)
        self.command("gh issue create --title Report --body-file reports/cookies.md", ws)
        self.command("gh issue view 41 --json body", ws)
        self.finish(root)
        self.assertFalse(grade_run(case, root)["passed"])

    def test_invalid_mutation_with_global_repository_option_fails_after_recovery(self):
        case = next(c for c in load_cases() if c["id"] == 31)
        root = self.root / "global-option"
        prepare_case(root, case, self.source)
        ws = Workspace(root)
        self.read_skill(ws)
        self.command("bb thread-stages show --self", ws)
        self.command("gh -R other/project issue create --title Report --body-file reports/cookies.md", ws)
        self.command("gh issue create --title Report --body-file reports/cookies.md", ws)
        self.command("gh issue view 41 --json body", ws)
        self.command("bb thread-stages stage Completed --self", ws)
        self.finish(root)
        self.assertFalse(grade_run(case, root)["passed"])

    def test_reading_old_issue_body_does_not_verify_later_edit(self):
        case = next(c for c in load_cases() if c["id"] == 34)
        root = self.root / "edit"
        prepare_case(root, case, self.source)
        ws = Workspace(root)
        self.read_skill(ws)
        self.command("bb thread-stages show --self", ws)
        self.command("gh issue view 41 --json body", ws)
        self.command("gh issue edit 41 --body-file reports/keychain-update.md", ws)
        self.finish(root)
        self.assertFalse(grade_run(case, root)["passed"])
        self.command("gh issue view 41 --json body", ws)
        self.assertTrue(grade_run(case, root)["passed"])

    def test_basic_shell_discovery_and_pipelines_stay_inside_project(self):
        for command in ("ls -la .", "ls -la /workspace/project", "find . -maxdepth 3", "git -C /workspace/project remote -v", "cd /workspace/project && which gh; gh auth status 2>&1 | head -5", "bb thread show --help", "bb thread --help", "date -u", "git log --oneline -5 -- reports 2>/dev/null"):
            self.assertFalse(self.command(command)["isError"], command)
        self.assertTrue(self.command("find /etc -type f")["isError"])

    def test_literal_shell_loops_execute_recorded_commands(self):
        self.read_skill()
        self.command("bb thread-stages show --self")
        self.assertFalse(self.command("for target in " + self.workspace.state["selfId"] + '; do bb thread-stages stage BlockedOnUser "$target"; done')["isError"])
        self.finish()
        self.assertTrue(self.grade()["passed"])

    def test_wrong_github_repository_cannot_mutate_an_issue(self):
        before = copy.deepcopy(self.workspace.state)
        self.assertTrue(self.command("gh issue create --repo other/project --title oops --body hello")["isError"])
        self.assertEqual(self.workspace.state, before)

    def test_reading_only_issue_url_is_not_body_verification(self):
        self.command("gh issue create --repo acme/browser-control --title 'Report' --body 'Approved body'")
        self.command("gh issue view 41 --json url")
        events = [json.loads(line) for line in (self.root / "artifacts/events.jsonl").read_text().splitlines()]
        self.assertFalse(any("issueRead" in e for e in events))

    def test_status_report_requires_reading_current_evidence(self):
        root = self.root / "unread"
        prepare_case(root, self.case, self.source)
        ws = Workspace(root)
        self.read_skill(ws)
        self.command("bb thread-stages show --self", ws)
        self.command("bb thread-stages stage BlockedOnUser --self", ws)
        self.finish(root)
        self.assertFalse(grade_run(self.case, root)["passed"])
        self.command("cat reports/comparison.md", ws)
        self.assertTrue(grade_run(self.case, root)["passed"])

    def test_bridge_protocol_exposes_only_project_tools(self):
        requests = [
            {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2024-11-05"}},
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "Bash", "arguments": {"command": "bb status --json"}}},
        ]
        result = subprocess.run([sys.executable, str(HERE / "bridge.py"), str(self.root / "artifacts")], input="\n".join(json.dumps(r) for r in requests) + "\n", text=True, capture_output=True, check=True)
        responses = [json.loads(line) for line in result.stdout.splitlines()]
        self.assertEqual([r["id"] for r in responses], [1, 2, 3])
        self.assertEqual({t["name"] for t in responses[1]["result"]["tools"]}, {"Bash", "Read", "Write"})
        self.assertFalse(responses[2]["result"].get("isError", False))


if __name__ == "__main__":
    unittest.main()
