"""A local BB CLI fixture; it never imports BB or connects to a server."""

import fcntl
import json
from pathlib import Path
import sys


def invoke(workspace, args):
    workspace = Path(workspace)
    with (workspace / "state.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = json.loads((workspace / "state.json").read_text())
        record = {"args": args, "before": state["stage"], "error": False}
        code, output = dispatch(state, args, record)
        record["after"] = state["stage"]
        (workspace / "state.json").write_text(json.dumps(state))
        with (workspace / "calls.jsonl").open("a") as calls:
            calls.write(json.dumps(record) + "\n")
    return code, output


def dispatch(state, args, record):
    def error(message):
        record["error"] = True
        return 2, {"error": message}

    if not args or args == ["--help"]:
        return 0, "bb: status, thread-stages, thread show"
    if args in (["status"], ["status", "--json"]):
        return 0, {"thread": {"id": state["id"]}, "stage": state["stage"]}
    if args[:2] == ["thread", "show"]:
        if not valid_target(state, args[2:]):
            return error("Unknown thread or unsupported arguments")
        record["inspected"] = True
        return 0, row(state)
    if args[0] != "thread-stages":
        return error("No live service is connected; this fixture only supports thread inspection")
    if len(args) == 1 or args[1:] == ["--help"]:
        return 0, ("bb thread-stages: stage, list, show, prefs, actions. "
                   "Run bb thread-stages <command> --help for arguments.")
    command = args[1]
    rest = args[2:]
    if "--help" in rest or "-h" in rest:
        help_text = {
            "stage": "stage <stage> [<thread>] [--self] [--json]; stages: " + ", ".join(state["stages"]),
            "show": "show [<thread>] [--self] [--json]",
            "list": "list [--json] [--include-children] [--stage <stage>]",
            "prefs": "prefs list|get <key> [--json]; organizationMode, environmentGrouping, automaticStageUpdates",
            "actions": "actions list [<thread>] [--self] [--json]; actions set --self --actions <json-array>; actions run <action-id> --self",
        }
        if command not in help_text:
            return error("Unknown command")
        return 0, "Usage: bb thread-stages " + help_text[command]
    if command == "show":
        if not valid_target(state, rest):
            return error("Unknown thread or unsupported arguments")
        record["inspected"] = True
        return 0, row(state)
    if command == "list":
        options = list(rest)
        selected = None
        if "--stage" in options:
            index = options.index("--stage")
            if index + 1 == len(options):
                return error("--stage needs a value")
            selected = options[index + 1]
            del options[index:index + 2]
        if any(x not in ("--json", "--include-children") for x in options):
            return error("Unsupported list arguments")
        rows = [row(state)] if selected in (None, state["stage"]) else []
        record["inspected"] = bool(rows)
        return 0, rows
    if command == "stage":
        record["mutation_attempt"] = True
        if not rest or rest[0] not in state["stages"]:
            return error("Unknown or missing stage")
        if not valid_target(state, rest[1:]):
            return error("Unknown thread or unsupported arguments")
        state["stage"] = rest[0]
        record.update(write=True, threadId=state["id"])
        return 0, {"threadId": state["id"], "stage": state["stage"]}
    if command == "prefs":
        if rest and rest[0] in ("set", "reset"):
            record["mutation_attempt"] = True
            return error("Preference mutations are outside the evaluation contract")
        preferences = {"automaticStageUpdates": state["automaticStageUpdates"],
                       "organizationMode": "section", "environmentGrouping": True}
        if rest in (["list"], ["list", "--json"]):
            return 0, preferences
        if len(rest) in (2, 3) and rest[0] == "get" and rest[1] in preferences:
            return 0, preferences[rest[1]]
        return error("Unsupported preference command")
    if command == "actions":
        if rest and rest[0] in ("set", "run"):
            record["mutation_attempt"] = True
            return error("Saved action mutations and messages are forbidden in this fixture")
        if rest and rest[0] == "list" and valid_target(state, rest[1:]):
            return 0, []
        return error("Unsupported action command")
    return error("Unknown command")


def valid_target(state, args):
    return (all(x in (state["id"], "--self", "--json") for x in args)
            and sum(x in (state["id"], "--self") for x in args) == 1
            and args.count("--json") <= 1)


def row(state):
    return {"id": state["id"], "title": "Evaluation workflow", "stage": state["stage"],
            "status": "active", "archivedAt": None}


if __name__ == "__main__":
    code, output = invoke(Path(__file__).resolve().parent, sys.argv[1:])
    print(output if isinstance(output, str) else json.dumps(output))
    sys.exit(code)
