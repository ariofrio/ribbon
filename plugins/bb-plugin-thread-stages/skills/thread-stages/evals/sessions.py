#!/usr/bin/env python3
"""Run natural tasks as persistent native CLI conversations against the local BB backend."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess
import sys
import time
import uuid

from oracle import validate, skill_reads
from run import HERE, REPO, MODEL_CONFIGS, load_source, normalize_events, write_grading


def prepare_session(root, case, source):
    root = Path(root)
    root.mkdir(parents=True, exist_ok=True)
    project, control = root / 'project', root / 'control'
    project.mkdir()
    subprocess.run(["git", "init", "--quiet", "--initial-branch=main", str(project)], check=True,
                   env=dict(os.environ, GIT_CONFIG_GLOBAL="/dev/null", GIT_CONFIG_NOSYSTEM="1"))
    control.mkdir(mode=0o700)
    for name, content in source['files'].items():
        if name.startswith('skills/'):
            path = project / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content)
    (control / 'bb_service.py').write_text(source['fixture'])
    binary = project / 'bin/bb'
    binary.parent.mkdir()
    binary.write_text('#!/bin/sh\nexec ' + shlex.quote(sys.executable) + ' '
                      + shlex.quote(str(control / 'bb_service.py')) + ' "$@"\n')
    binary.chmod(0o755)
    thread_id = 'thr_' + uuid.uuid4().hex[:10]
    (control / 'state.json').write_text(json.dumps({'id': thread_id, 'stage': case['initial_stage'],
        'stages': source['stages'], 'automaticStageUpdates': case['automatic_updates'], 'projectPath': str(project),
        'threads': {'thr_81jsk27pq9': {'id': 'thr_81jsk27pq9', 'title': 'Prepare invoice export',
            'stage': 'Active', 'status': 'active', 'messages': ['Preparing the invoice export; will send its path when ready.']}},
        'files': {name: (HERE.parent / path).read_text() for name, path in case['workspace_files'].items()}}))
    skill = project / 'skills/thread-stages/SKILL.md'
    description = re.search(r'^description: (.+)$', skill.read_text(), re.M)[1]
    guidance = source['instructions']['on' if case['automatic_updates'] else 'off']
    # Match the production instruction surface. Isolation belongs to PATH/env/backend,
    # never to a prompt announcing a test or supplying workflow conclusions.
    system = f"""You are a coding agent working inside BB. Carry out the user's request with the available tools.
The BB CLI is on PATH at {binary}. BB_THREAD_ID is {thread_id}.

The following dynamic instructions come from the BB plugin thread-stages:
{guidance}

Available skills:
- thread-stages: {description} (file: {skill})
When using a skill, open and read its SKILL.md. Apply relevant skills without requiring the user to invoke them.
"""
    (control / 'system.txt').write_text(system)
    return project, control


def session_args(project, control, runtime, model, effort, prompt, session_id):
    if runtime == 'claude':
        settings = {'sandbox': {'enabled': True, 'autoAllowBashIfSandboxed': True,
            'allowUnsandboxedCommands': False, 'failIfUnavailable': True,
            'filesystem': {'allowWrite': [str(control)], 'denyRead': [str(Path.home())],
                           'allowRead': [str(project), str(control)]},
            'network': {'allowedDomains': [], 'deniedDomains': ['*']}},
            'permissions': {'blockReadsOutsideWorkingDirectories': True}}
        args = ['claude', '--model', model, '--effort', effort, '--safe-mode',
                '--settings', json.dumps(settings),
                '--system-prompt', (control / 'system.txt').read_text(), '--print',
                '--output-format', 'stream-json', '--verbose', '--tools', 'Bash,Read',
                '--allowedTools', 'Bash', 'Read', '--permission-prompts', 'none']
        return args + (['--resume', session_id] if session_id else []) + [prompt]
    return ['codex', 'exec'] + (['resume'] if session_id else []) + [
        '--model', model, '-c', 'model_reasoning_effort=' + json.dumps(effort),
        '--ignore-user-config', '--ignore-rules', '--skip-git-repo-check', '--json',
        '-c', 'sandbox_mode="workspace-write"', '-c', 'sandbox_workspace_write.network_access=false',
        '-c', 'sandbox_workspace_write.writable_roots=' + json.dumps([str(control)]),
        '-c', 'project_doc_max_bytes=0',
        '-c', 'skills.include_instructions=false', '-c', 'allow_login_shell=false',
        '-c', 'shell_environment_policy.inherit="all"',
        '-c', 'model_instructions_file=' + json.dumps(str(control / 'system.txt')),
        '--output-last-message', str(control / 'last-message.md'),
        *([session_id] if session_id else []), prompt]


def calls_at(control):
    path = control / 'calls.jsonl'
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def artifact_path(project, name):
    """A basename leaves its directory open; an explicit path does not."""
    path = project / name
    if path.is_file() or len(Path(name).parts) != 1:
        return path
    candidates = [p for p in project.rglob(name) if p.is_file()
                  and p.relative_to(project).parts[0] not in ('bin', 'skills')]
    return candidates[0] if len(candidates) == 1 else path


def grade_turn(turn, project, control, events, exit_code, call_offset, saved_state=None, saved_calls=None):
    expected = turn['expected']
    state = saved_state if saved_state is not None else json.loads((control / 'state.json').read_text())
    calls = saved_calls if saved_calls is not None else calls_at(control)[call_offset:]
    writes = [c for c in calls if c.get('write')]
    results = [e for e in events if e.get('type') == 'result']
    result = results[-1] if results else {}
    answer = result.get('result', '')
    checks = []

    def check(text, passed, evidence):
        checks.append({'text': text, 'passed': bool(passed), 'evidence': evidence})

    check('Native turn completed', exit_code == 0 and result and not result.get('is_error'), exit_code)
    check('Final stage fits remaining work', state['stage'] == expected['stage'], state['stage'])
    check('Required stage writes occurred in order', [c['after'] for c in writes] == expected['writes'], writes)
    mutations = [c for c in calls if c.get('mutation_attempt')]
    def harmless_discovery(call):
        args = call['args']
        return not call.get('mutation_attempt') and ('--help' in args or '-h' in args
            or (len(args) >= 2 and args[0] == 'files' and args[1] in ('read','root','tree','find','list')))
    check('No invalid stage operations or unrelated mutations',
          not any(c.get('error') and not harmless_discovery(c) for c in calls)
          and len(mutations) == len(writes) and all(c.get('threadId') == state['id'] for c in writes), calls)
    inspected = False
    valid = True
    for call in calls:
        inspected |= bool(call.get('inspected'))
        if call.get('write') and not inspected:
            valid = False
    check('Stage inspected before writes', valid, calls)
    reads = [c for c in calls if c.get('source_read')]
    check('Requested evidence was inspected', set(expected['source_reads']) <= {c['source_read'] for c in reads}, reads)
    seen, fits = set(), True
    for call in reads:
        path = call['source_read']
        stage = expected.get('source_stages', {}).get(path, expected['work_stage'])
        if path not in seen:
            stage = expected.get('first_read_stages', {}).get(path, stage)
        fits &= call['before'] in ([stage] if isinstance(stage, str) else stage)
        seen.add(path)
    check('Stage fit before independent work', fits, reads)
    for name, contract in expected['artifacts'].items():
        path = artifact_path(project, name)
        text = path.read_text() if path.is_file() else ''
        check(f'Deliverable {name} exists and contains work', bool(text.strip()), text)
        if 'json' in contract:
            try:
                value = json.loads(text)
                if isinstance(value, dict) and contract.get('value_field'):
                    value = {key: child.get(contract['value_field']) if isinstance(child, dict) else child
                             for key, child in value.items()}
                if isinstance(value, dict):
                    for key in contract.get('count_fields', []):
                        items = value.get(key)
                        if isinstance(items, list) and all(isinstance(item, str) for item in items) and len(set(items)) == len(items):
                            value[key] = len(items)
                correct = isinstance(value, dict) and all(value.get(k) == v
                    and (isinstance(value.get(k), bool) == isinstance(v, bool))
                    for k, v in contract['json'].items())
            except ValueError:
                value, correct = text, False
            check(f'Deliverable {name} has correct data', correct, value)
        for pattern in contract.get('patterns', []):
            check(f'Deliverable {name} supports {pattern}', re.search(pattern, text) is not None, text)
    for pattern in expected['answer_patterns']:
        check(f'Answer supports {pattern}', re.search(pattern, answer) is not None, answer)
    check('User received a response', bool(answer.strip()), answer)
    return {'passed': all(c['passed'] for c in checks), 'checks': checks,
            'answer': answer, 'stage': state['stage'], 'writes': len(writes),
            'recoveredDiscoveryErrors': [c for c in calls if c.get('error') and harmless_discovery(c)]}



def session_events(raw, runtime):
    """Retain all user-visible messages, including a question before a final acknowledgment."""
    events = normalize_events(raw, runtime)
    if runtime == 'codex':
        texts = [e['item']['text'] for e in raw if e.get('type') == 'item.completed'
                 and e.get('item', {}).get('type') == 'agent_message']
    else:
        texts = [c['text'] for e in raw if e.get('type') == 'assistant'
                 for c in e.get('message', {}).get('content', []) if c.get('type') == 'text']
    if texts:
        for e in reversed(events):
            if e.get('type') == 'result':
                e['result'] = '\n\n'.join(texts)
                break
    return events


def run_turn(args, project, env, destination, timeout):
    destination.mkdir()
    (destination / 'command.json').write_text(json.dumps(args, indent=2))
    began = time.monotonic()
    with (destination / 'transcript.jsonl').open('w') as out, (destination / 'stderr.txt').open('w') as err:
        process = subprocess.Popen(args, cwd=project, env=env, stdin=subprocess.DEVNULL,
                                   stdout=out, stderr=err, start_new_session=True)
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait()
            code = 'timeout'
    raw = [json.loads(line) for line in (destination / 'transcript.jsonl').read_text().splitlines()]
    return code, raw, round(time.monotonic() - began, 2)


def run_session(root, case, source, runtime, model, effort, timeout):
    project, control = prepare_session(root, case, source)
    env = {k: v for k, v in os.environ.items() if not k.startswith('BB_')}
    env.update(PATH=str(project / 'bin') + os.pathsep + env['PATH'],
               BB_THREAD_ID=json.loads((control / 'state.json').read_text())['id'],
               GIT_CONFIG_GLOBAL='/dev/null', GIT_CONFIG_NOSYSTEM='1')
    env.pop('CLAUDECODE', None)
    session_id, turns, all_events = None, [], []
    for index, turn in enumerate(case['turns'], 1):
        state = json.loads((control / 'state.json').read_text())
        state['files'].update({name: (HERE.parent / path).read_text()
                               for name, path in turn.get('file_updates', {}).items()})
        (control / 'state.json').write_text(json.dumps(state))
        offset = len(calls_at(control))
        args = session_args(project, control, runtime, model, effort, turn['prompt'], session_id)
        destination = control / f'turn-{index}'
        code, raw, seconds = run_turn(args, project, env, destination, timeout)
        events = session_events(raw, runtime)
        all_events.extend(events)
        observed = next((e.get('thread_id') if runtime == 'codex' else e.get('session_id')
                         for e in raw if e.get('type') == ('thread.started' if runtime == 'codex' else 'system')), None)
        grade = grade_turn(turn, project, control, events, code, offset)
        continuation_ok = observed is not None and (session_id is None or observed == session_id)
        grade['checks'].append({'text': 'Native session identity persisted', 'passed': continuation_ok,
                                'evidence': {'previous': session_id, 'observed': observed}})
        grade['passed'] &= continuation_ok
        session_id = observed
        grade.update(seconds=seconds, exitCode=code, sessionId=session_id, callOffset=offset)
        (destination / 'assistant.md').write_text(grade['answer'])
        (destination / 'result.json').write_text(json.dumps(grade, indent=2))
        # Snapshot outputs and state per turn so later work cannot make an earlier
        # missing/wrong deliverable pass a replay of the grader.
        snapshot = destination / 'outputs'
        snapshot.mkdir()
        for name in turn['expected']['artifacts']:
            path = artifact_path(project, name)
            if path.is_file():
                copy = snapshot / name
                copy.parent.mkdir(parents=True, exist_ok=True)
                copy.write_bytes(path.read_bytes())
        (destination / 'state.json').write_text((control / 'state.json').read_text())
        (destination / 'calls.json').write_text(json.dumps(calls_at(control)[offset:], indent=2))
        turns.append(grade)
        print(f"  Case {case['id']} turn {index}: {'PASS' if grade['passed'] else 'FAIL'}", flush=True)
        if code != 0 or session_id is None:
            break
    checks = [dict(c, text=f'Turn {i}: {c["text"]}') for i, g in enumerate(turns, 1) for c in g['checks']]
    wrote = any(c.get('write') for c in calls_at(control))
    read = skill_reads(all_events, project)
    checks.append({'text': 'Stage skill was consulted',
                   'passed': not wrote or 'thread-stages' in read, 'evidence': sorted(read)})
    result = {'caseId': case['id'], 'mode': 'continuation', 'checks': checks,
              'passed': len(turns) == len(case['turns']) and all(c['passed'] for c in checks),
              'turns': turns, 'answer': '\n\n'.join(g['answer'] for g in turns),
              'runtime': runtime, 'requestedModel': model, 'requestedEffort': effort,
              'seconds': sum(g['seconds'] for g in turns), 'sourceRef': source['ref']}
    (root / 'result.json').write_text(json.dumps(result, indent=2))
    (root / 'assistant.md').write_text(result['answer'])
    write_grading(root, result)
    return result


def regrade(output, contracts=None):
    """Replay saved turns and immutable output snapshots; never launch a worker."""
    metadata = json.loads((output / 'run.json').read_text())
    cases = json.loads((output / 'cases.json').read_text())['evals']
    contract_changes = []
    if contracts:
        revised = {c['id']: c for c in json.loads(contracts.read_text())['evals']}
        for index, case in enumerate(cases):
            if case['id'] not in metadata['caseIds']:
                continue
            current = revised[case['id']]
            def task(c):
                return dict(c, turns=[{k:v for k,v in t.items() if k != 'expected'} for t in c['turns']])
            if task(case) != task(current):
                raise ValueError('Regrading cannot change worker-visible tasks or inputs')
            if case != current:
                contract_changes.append({'caseId':case['id'], 'before':[t['expected'] for t in case['turns']],
                    'after':[t['expected'] for t in current['turns']]})
            cases[index] = current
    results = []
    for case in cases:
        if case['id'] not in metadata['caseIds']:
            continue
        root = output / f'session-{case["id"]}'
        project, control = root / 'project', root / 'control'
        prior = json.loads((root / 'result.json').read_text())
        if len(prior['turns']) != len(case['turns']):
            results.append(prior)
            continue
        checks, answers, all_events = [], [], []
        for index, turn in enumerate(case['turns'], 1):
            path = control / f'turn-{index}'
            saved = json.loads((path / 'result.json').read_text())
            raw = [json.loads(line) for line in (path / 'transcript.jsonl').read_text().splitlines()]
            events = session_events(raw, metadata['runtime'])
            all_events.extend(events)
            artifact_root = project if index == len(case['turns']) else path / 'outputs'
            graded = grade_turn(turn, artifact_root, control, events, saved['exitCode'], 0,
                json.loads((path / 'state.json').read_text()), json.loads((path / 'calls.json').read_text()))
            identity = next(c for c in saved['checks'] if c['text'] == 'Native session identity persisted')
            graded['checks'].append(identity)
            checks.extend(dict(c, text=f'Turn {index}: {c["text"]}') for c in graded['checks'])
            answers.append(graded['answer'])
        read = skill_reads(all_events, project)
        checks.append({'text': 'Stage skill was consulted',
            'passed': not any(c.get('write') for c in calls_at(control)) or 'thread-stages' in read,
            'evidence': sorted(read)})
        result = dict(prior, checks=checks, passed=all(c['passed'] for c in checks), answer='\n\n'.join(answers))
        (root / 'grade.json').write_text(json.dumps(result, indent=2))
        results.append(result)
        print(f"Case {case['id']}: {'PASS' if result['passed'] else 'FAIL'}", flush=True)
    (output / 'graded-results.json').write_text(json.dumps(results, indent=2))
    (output / 'regrade-provenance.json').write_text(json.dumps({'runnerHash': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'reason': 'Retain all visible messages, permit read-only help discovery, and accept unique basename outputs in their reported directory. Final-turn outputs use preserved final project state; earlier turns use their snapshots. Optional contract corrections are recorded in full.',
        'contractsHash': hashlib.sha256(contracts.read_bytes()).hexdigest() if contracts else metadata['suiteHash'],
        'contractChanges': contract_changes}, indent=2))
    print(f"Passed {sum(r['passed'] for r in results)}/{len(results)} conversations (saved evidence, no new agents)")
    return 0 if all(r['passed'] for r in results) else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', choices=MODEL_CONFIGS)
    parser.add_argument('--grade', type=Path)
    parser.add_argument('--contracts', type=Path, help='Explicit corrected contracts for replay; task/input changes are refused')
    parser.add_argument('--model')
    parser.add_argument('--effort')
    parser.add_argument('--ref')
    parser.add_argument('--cases', type=int, nargs='+')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--timeout', type=int, default=240)
    args = parser.parse_args()
    if args.grade:
        return regrade(args.grade.resolve(), args.contracts)
    if not args.runtime or not args.output:
        parser.error('--runtime and --output are required for execution')
    cases = [c for c in validate() if c['mode'] == 'continuation']
    if args.cases:
        if set(args.cases) - {c['id'] for c in cases}:
            parser.error('Unknown continuation case')
        cases = [c for c in cases if c['id'] in args.cases]
    source = load_source(args.ref)
    model = args.model or MODEL_CONFIGS[args.runtime]['model']
    effort = args.effort or MODEL_CONFIGS[args.runtime]['effort']
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=False)
    (output / 'run.json').write_text(json.dumps({'sourceRef': source['ref'], 'sourceHashes': source['hashes'],
        'runtime': args.runtime, 'cliVersion': subprocess.check_output([args.runtime, '--version'], text=True).strip(),
        'requestedModel': model, 'requestedEffort': effort,
        'suiteHash': hashlib.sha256((HERE / 'evals.json').read_bytes()).hexdigest(),
        'fixtureHash': hashlib.sha256(source['fixture'].encode()).hexdigest(),
        'runnerHash': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'inputHashes': {p: hashlib.sha256((HERE.parent / p).read_bytes()).hexdigest() for c in cases for p in c['files']},
        'caseIds': [c['id'] for c in cases], 'startedAt': datetime.now(timezone.utc).isoformat()}, indent=2))
    (output / 'cases.json').write_bytes((HERE / 'evals.json').read_bytes())
    (output / 'runner.py').write_bytes(Path(__file__).read_bytes())
    (output / 'oracle.py').write_bytes((HERE / 'oracle.py').read_bytes())
    results = []
    for case in cases:
        root = output / f'session-{case["id"]}'
        root.mkdir()
        result = run_session(root, case, source, args.runtime, model, effort, args.timeout)
        results.append(result)
        (output / 'results.json').write_text(json.dumps(results, indent=2))
        print(f"Case {case['id']}: {'PASS' if result['passed'] else 'FAIL'}", flush=True)
    print(f"Passed {sum(r['passed'] for r in results)}/{len(results)} conversations", flush=True)
    return 0 if all(r['passed'] for r in results) else 1


if __name__ == '__main__':
    sys.exit(main())
