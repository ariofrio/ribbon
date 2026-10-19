"""Acceptance-harness regression tests; no model execution."""
import json
from pathlib import Path
import tempfile
import unittest

from sessions import session_args, grade_turn, prepare_session, session_events, regrade
from run import load_source
from oracle import load_cases, skill_reads
from fixture import invoke

WORK = Path(__file__).resolve().parents[5] / '.scratch/work/session-units'


class SessionTests(unittest.TestCase):
    def setUp(self):
        WORK.mkdir(parents=True, exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=WORK)
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.case = next(c for c in load_cases() if c['id'] == 43)
        self.project, self.control = prepare_session(self.root, self.case, load_source())

    def test_regrade_records_saved_execution_configuration_without_credentials(self):
        (self.root / 'run.json').write_text(json.dumps({'caseIds':[], 'suiteHash':'saved-suite',
            'codexPoolConfigured':True}))
        (self.root / 'cases.json').write_text('{"evals":[]}')
        self.assertEqual(regrade(self.root),0)
        provenance=json.loads((self.root / 'regrade-provenance.json').read_text())
        self.assertTrue(provenance['codexPoolConfigured'])
        self.assertEqual(provenance['contractsHash'],'saved-suite')

    def test_user_visible_question_is_not_lost_before_final_acknowledgment(self):
        raw = [{'type':'item.completed','item':{'type':'agent_message','text':'Which region: us or eu?'}},
               {'type':'item.completed','item':{'type':'agent_message','text':'I will wait for your answer.'}},
               {'type':'turn.completed'}]
        result = session_events(raw, 'codex')[-1]
        self.assertIn('Which region: us or eu?', result['result'])
        self.assertIn('I will wait', result['result'])

    def test_complete_skill_read_survives_an_unrelated_shell_failure(self):
        skill = self.project / 'skills/thread-stages/SKILL.md'
        events = [{'type':'assistant','message':{'content':[{'type':'tool_use','id':'read','name':'Bash',
            'input':{'command':f'cat {skill}; ls missing'}}]}},
            {'type':'user','message':{'content':[{'type':'tool_result','tool_use_id':'read',
                'is_error':True,'content':skill.read_text()+'\nls: missing: No such file'}]}}]
        self.assertIn('thread-stages', skill_reads(events, self.project))

    def test_amounts_can_use_the_requested_source_field(self):
        turn = dict(self.case['turns'][1])
        turn['expected'] = dict(turn['expected'], artifacts={'totals.json':{
            'json':{'acme':2000,'beta':550},'value_field':'amount_cents'}})
        (self.project / 'totals.json').write_text('{"acme":{"amount_cents":2000},"beta":{"amount_cents":550}}')
        events = [{'type':'result','is_error':False,'result':'Saved totals for review.'}]
        grade = grade_turn(turn,self.project,self.control,events,0,0)
        check = next(c for c in grade['checks'] if c['text']=='Deliverable totals.json has correct data')
        self.assertTrue(check['passed'])

    def test_count_fact_accepts_the_items_but_rejects_wrong_or_duplicate_counts(self):
        turn = dict(self.case['turns'][1])
        turn['expected'] = dict(turn['expected'], artifacts={'facts.json':{
            'json':{'running':4},'count_fields':['running']}})
        events = [{'type':'result','is_error':False,'result':'Saved facts.'}]
        for value, expected in [(4,True), (['sidebar','features','ordering','placement'],True),
                                (3,False), (['sidebar']*4,False)]:
            (self.project / 'facts.json').write_text(json.dumps({'running':value}))
            grade = grade_turn(turn,self.project,self.control,events,0,0)
            check = next(c for c in grade['checks'] if c['text']=='Deliverable facts.json has correct data')
            self.assertEqual(check['passed'],expected)

    def test_worker_has_no_scenario_summary_or_ground_truth(self):
        self.assertFalse((self.project / 'work.json').exists())
        self.assertFalse((self.project / 'state.json').exists())
        self.assertFalse((self.project / 'oracle.py').exists())
        system = (self.control / 'system.txt').read_text().lower()
        for marker in ('fixture', 'eval', 'baseline', 'isolated', 'expected_stage'):
            self.assertNotIn(marker, system)

    def test_worker_has_its_own_git_root_and_strict_tool_network_policy(self):
        self.assertTrue((self.project / '.git').is_dir())
        args = session_args(self.project,self.control,'claude','model','high','hello',None)
        settings = json.loads(args[args.index('--settings')+1])
        self.assertTrue(settings['sandbox']['enabled'])
        self.assertFalse(settings['sandbox']['allowUnsandboxedCommands'])
        self.assertTrue(settings['sandbox']['failIfUnavailable'])
        self.assertEqual(settings['sandbox']['network']['allowedDomains'], [])
        args = session_args(self.project,self.control,'codex','model','low','hello',None)
        self.assertIn('sandbox_workspace_write.network_access=false', args)

    def test_native_resume_reuses_session_and_keeps_persistence(self):
        for runtime in ('codex', 'claude'):
            args = session_args(self.project, self.control, runtime, 'model', 'low', 'hello', None)
            self.assertNotIn('--ephemeral', args)
            self.assertNotIn('--no-session-persistence', args)
            args = session_args(self.project, self.control, runtime, 'model', 'low', 'next', 'abc')
            self.assertIn('abc', args)
            self.assertIn('resume' if runtime == 'codex' else '--resume', args)

    def test_stage_trace_alone_cannot_pass_without_deliverable(self):
        turn = self.case['turns'][1]
        invoke(self.control, ['thread-stages', 'show', '--self'])
        invoke(self.control, ['thread-stages', 'stage', 'Active', '--self'])
        for path in turn['expected']['source_reads']:
            state = json.loads((self.control / 'state.json').read_text())
            state['files'][path] = '[]'
            (self.control / 'state.json').write_text(json.dumps(state))
            invoke(self.control, ['files', 'read', path])
        invoke(self.control, ['thread-stages', 'stage', 'BlockedOnUser', '--self'])
        events = [{'type': 'result', 'is_error': False, 'result': 'Done.'}]
        result = grade_turn(turn, self.project, self.control, events, 0, 0)
        self.assertFalse(result['passed'])
        self.assertTrue(any('Deliverable' in c['text'] and not c['passed'] for c in result['checks']))

    def test_bb_files_can_read_created_local_outputs(self):
        (self.project / 'totals.json').write_text('{"acme":2000}')
        code, output = invoke(self.control, ['files', 'read', 'totals.json'])
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(output), {'acme':2000})

    def test_recovered_file_discovery_error_does_not_hide_correct_stage_work(self):
        turn = self.case['turns'][0]
        invoke(self.control,['files','list'])
        invoke(self.control,['thread-stages','show','--self'])
        invoke(self.control,['thread-stages','stage','BlockedOnOtherAgent','--self'])
        events=[{'type':'result','is_error':False,'result':'Waiting for the export delivery.'}]
        self.assertTrue(grade_turn(turn,self.project,self.control,events,0,0)['passed'])

    def test_referenced_thread_is_real_readonly_context(self):
        code, row = invoke(self.control, ['thread', 'show', 'thr_81jsk27pq9', '--json'])
        self.assertEqual(code, 0)
        self.assertEqual(row['title'], 'Prepare invoice export')
        self.assertNotEqual(row['id'], json.loads((self.control / 'state.json').read_text())['id'])

    def test_unsupported_help_probe_is_not_a_task_failure(self):
        turn = self.case['turns'][0]
        invoke(self.control, ['files', 'write', '--help'])
        invoke(self.control, ['thread-stages', 'show', '--self'])
        invoke(self.control, ['thread-stages', 'stage', 'BlockedOnOtherAgent', '--self'])
        events = [{'type':'result','is_error':False,'result':'Waiting for export delivery.'}]
        self.assertTrue(grade_turn(turn, self.project, self.control, events, 0, 0)['passed'])

    def test_valid_deliverable_and_order_pass_but_late_stage_write_fails(self):
        turn = self.case['turns'][1]
        state = json.loads((self.control / 'state.json').read_text())
        state['stage'] = 'BlockedOnOtherAgent'
        state['files']['exports/invoices.csv'] = 'account,amount_cents,status\nacme,2000,paid\nbeta,550,paid\n'
        (self.control / 'state.json').write_text(json.dumps(state))
        (self.project / 'totals.json').write_text('{"acme":2000,"beta":550}')
        events = [{'type': 'result', 'is_error': False, 'result': 'Saved totals.json for review.'}]
        invoke(self.control, ['thread-stages', 'show', '--self'])
        invoke(self.control, ['thread-stages', 'stage', 'Active', '--self'])
        invoke(self.control, ['files', 'read', 'exports/invoices.csv'])
        invoke(self.control, ['thread-stages', 'stage', 'BlockedOnUser', '--self'])
        self.assertTrue(grade_turn(turn, self.project, self.control, events, 0, 0)['passed'])
        calls = [json.loads(x) for x in (self.control / 'calls.jsonl').read_text().splitlines()]
        read = next(c for c in calls if c.get('source_read'))
        read['before'] = read['after'] = 'BlockedOnOtherAgent'
        (self.control / 'calls.jsonl').write_text('\n'.join(json.dumps(c) for c in calls))
        grade = grade_turn(turn, self.project, self.control, events, 0, 0)
        self.assertFalse(grade['passed'])
        self.assertEqual([c['text'] for c in grade['checks'] if not c['passed']], ['Stage fit before independent work'])

    def test_report_basename_can_be_saved_in_a_named_subdirectory(self):
        from sessions import artifact_path
        output = self.project / 'exports/totals.json'
        output.parent.mkdir()
        output.write_text('{"acme":2000,"beta":550}')
        self.assertEqual(artifact_path(self.project, 'totals.json'), output)
        self.assertEqual(artifact_path(self.project, 'drafts/totals.json'), self.project / 'drafts/totals.json')

    def test_ready_status_can_be_rechecked_during_integration(self):
        turn = next(c for c in load_cases() if c['id']==56)['turns'][1]
        state = json.loads((self.control / 'state.json').read_text())
        state['stage']='BlockedOnOtherAgent'
        state['files']={'jobs/export.json':'{"status":"completed","artifact":"exports/invoices.csv"}',
                        'exports/invoices.csv':'account,amount_cents,status\nacme,2000,paid\nbeta,550,paid\n'}
        (self.control / 'state.json').write_text(json.dumps(state))
        (self.project / 'totals.json').write_text('{"acme":2000,"beta":550}')
        invoke(self.control,['thread-stages','show','--self'])
        invoke(self.control,['files','read','jobs/export.json'])
        invoke(self.control,['thread-stages','stage','Active','--self'])
        invoke(self.control,['files','read','jobs/export.json'])
        invoke(self.control,['files','read','exports/invoices.csv'])
        invoke(self.control,['thread-stages','stage','BlockedOnUser','--self'])
        events=[{'type':'result','is_error':False,'result':'Saved totals for your review.'}]
        self.assertTrue(grade_turn(turn,self.project,self.control,events,0,0)['passed'])

    def test_wrong_data_fails_even_with_nonempty_deliverable(self):
        turn = self.case['turns'][1]
        (self.project / 'totals.json').write_text('{"acme": 99, "beta": 99}')
        events = [{'type': 'result', 'is_error': False, 'result': 'Totals saved.'}]
        result = grade_turn(turn, self.project, self.control, events, 0, 0)
        self.assertFalse(result['passed'])
        check = next(c for c in result['checks'] if c['text'] == 'Deliverable totals.json has correct data')
        self.assertFalse(check['passed'])

    def test_completion_requires_final_deliverable_before_stage_write(self):
        case = next(c for c in load_cases() if c['id'] == 49)
        events = [{'type':'result', 'is_error':False, 'result':'Saved totals.json.'}]
        for order, expected in [('before', True), ('after', False), ('changed', False)]:
            with self.subTest(order=order):
                project, control = prepare_session(self.root / order, case, load_source())
                invoke(control, ['thread-stages', 'show', '--self'])
                invoke(control, ['files', 'read', 'exports/invoices.csv'])
                output = project / 'totals.json'
                if order != 'after':
                    output.write_text('{"acme":2000,"beta":550}' if order == 'before' else '{}')
                invoke(control, ['thread-stages', 'stage', 'Completed', '--self'])
                output.write_text('{"acme":2000,"beta":550}')
                grade = grade_turn(case['turns'][0], project, control, events, 0, 0)
                self.assertEqual(grade['passed'], expected, grade)


if __name__ == '__main__':
    unittest.main()
