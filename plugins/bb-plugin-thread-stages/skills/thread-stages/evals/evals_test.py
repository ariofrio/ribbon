import copy
import json
from pathlib import Path
import tempfile
import unittest

from fixture import invoke
from oracle import answer_matches, grade_run, load_cases, parse_answer, validate
from run import load_source, prepare_case


HERE = Path(__file__).resolve().parent
WORK = HERE.parents[4] / ".scratch/work/thread-stage-evals-unit"


def transcript(skill, result=True):
    return [
        {"type": "assistant", "message": {"content": [
            {"type": "tool_use", "id": "read", "name": "Read",
             "input": {"file_path": str(skill)}}]}},
        {"type": "user", "message": {"content": [
            {"type": "tool_result", "tool_use_id": "read", "is_error": False,
             "content": "# Thread stages\n## Stages"}]}},
        *([{"type": "result", "is_error": False, "result": "Done"}] if result else []),
    ]


class EvalTests(unittest.TestCase):
    def setUp(self):
        WORK.mkdir(parents=True, exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(dir=WORK)
        self.addCleanup(self.temporary.cleanup)
        self.workspace = Path(self.temporary.name)
        self.source = load_source()
        self.case = next(x for x in load_cases() if x["id"] == 17)
        prepare_case(self.workspace, self.case, self.source)
        self.skill = self.workspace / "skills/thread-stages/SKILL.md"

    def grade(self, events=None, exit_code=0):
        return grade_run(self.case, self.workspace,
                         transcript(self.skill) if events is None else events, exit_code)

    def transition(self):
        invoke(self.workspace, ["thread-stages", "show", "--self", "--json"])
        invoke(self.workspace, ["thread-stages", "stage", "Waiting", "--self"])

    def test_manifest_and_source_contract(self):
        validate()
        self.assertEqual(len(load_cases()), 31)
        self.assertIn("Waiting", self.source["stages"])
        self.assertIn("Inspect the current stage", self.source["instructions"]["on"])
        self.assertIn("only when the user explicitly", self.source["instructions"]["off"])

    def test_success_requires_real_recorded_transition(self):
        self.transition()
        self.assertTrue(self.grade()["passed"])

    def test_correct_answer_without_transition_fails(self):
        self.assertFalse(self.grade()["passed"])

    def test_correct_stage_without_prior_inspection_fails(self):
        invoke(self.workspace, ["thread-stages", "stage", "Waiting", "--self"])
        self.assertFalse(self.grade()["passed"])

    def test_redundant_write_fails_even_with_correct_final_stage(self):
        self.transition()
        invoke(self.workspace, ["thread-stages", "stage", "Waiting", "--self"])
        self.assertFalse(self.grade()["passed"])

    def test_wrong_thread_does_not_mutate_and_fails_grading(self):
        code, _ = invoke(self.workspace, ["thread-stages", "stage", "Waiting", "thr_other"])
        self.assertNotEqual(code, 0)
        self.assertEqual(json.loads((self.workspace / "state.json").read_text())["stage"], "Active")
        self.transition()
        self.assertFalse(self.grade()["passed"])

    def test_invalid_command_is_not_hidden_by_recovery(self):
        invoke(self.workspace, ["thread-stages", "get", "--self"])
        self.transition()
        self.assertFalse(self.grade()["passed"])

    def test_failed_or_missing_skill_read_fails(self):
        self.transition()
        events = transcript(self.skill)
        events[1]["message"]["content"][0]["is_error"] = True
        self.assertFalse(self.grade(events)["passed"])
        self.assertFalse(self.grade(events[-1:])["passed"])

    def test_successful_shell_read_is_accepted(self):
        self.transition()
        events = transcript(self.skill)
        events[0]["message"]["content"][0].update(
            name="Bash", input={"command": f"cat '{self.skill}'"})
        self.assertTrue(self.grade(events)["passed"])

    def test_missing_result_and_timeout_fail_even_after_correct_transition(self):
        self.transition()
        self.assertFalse(self.grade(transcript(self.skill, result=False))["passed"])
        self.assertFalse(self.grade(exit_code="timeout")["passed"])

    def test_automatic_updates_off_needs_no_read_or_cli_call(self):
        case = next(x for x in load_cases() if x["id"] == 26)
        other = self.workspace / "off"
        prepare_case(other, case, self.source)
        events = [{"type": "result", "is_error": False, "result": "Unchanged"}]
        self.assertTrue(grade_run(case, other, events, 0)["passed"])
        invoke(other, ["thread-stages", "stage", "BlockedOnOtherAgent", "--self"])
        self.assertFalse(grade_run(case, other, events, 0)["passed"])

    def test_recommendation_case_checks_answer_without_performing_mutations(self):
        case = next(x for x in load_cases() if x["id"] == 8)
        other = self.workspace / "recommendation"
        prepare_case(other, case, self.source)
        events = transcript(other / "skills/thread-stages/SKILL.md")
        answer = {"stage": "Active", "command": None,
                  "reason": "Production deployment is outstanding."}
        events[-1]["result"] = json.dumps(answer)
        self.assertTrue(grade_run(case, other, events, 0)["passed"])
        bad = copy.deepcopy(events)
        bad[-1]["result"] = json.dumps({**answer, "stage": "Completed"})
        self.assertFalse(grade_run(case, other, bad, 0)["passed"])
        invoke(other, ["thread-stages", "stage", "Completed", "--self"])
        self.assertFalse(grade_run(case, other, events, 0)["passed"])

    def test_fenced_answer_with_prose_is_not_a_stage_error(self):
        answer = parse_answer('I did not run commands.\n```json\n{"stage":"Active"}\n```')
        self.assertEqual(answer, {"stage": "Active"})

    def test_command_plan_accepts_inspection_without_accepting_extra_mutations(self):
        expected = {"commands": ["bb thread-stages prefs set organizationMode project"]}
        answer = {"commands": ["bb thread-stages prefs list", expected["commands"][0],
                               "bb thread-stages prefs get organizationMode"], "reason": "Inspect, set, verify."}
        self.assertTrue(answer_matches(answer, expected))
        answer["commands"].append("bb thread-stages prefs set environmentGrouping true")
        self.assertFalse(answer_matches(answer, expected))

    def test_action_payload_compares_json_values_and_rejects_invalid_json(self):
        expected = {"commands": ["bb thread-stages actions set --self --actions '[{\"id\":\"review\",\"label\":\"Review\",\"prompt\":\"Review this change.\"}]'"]}
        answer = {"commands": ["bb thread-stages actions set --self --actions '[{\"label\":\"Review\",\"prompt\":\"Review this change.\",\"id\":\"review\"}]'"], "reason": "Replace."}
        self.assertTrue(answer_matches(answer, expected))
        answer["commands"] = ["bb thread-stages actions set --self --actions '[{bad-json}]'"]
        self.assertFalse(answer_matches(answer, expected))


if __name__ == "__main__":
    unittest.main()
