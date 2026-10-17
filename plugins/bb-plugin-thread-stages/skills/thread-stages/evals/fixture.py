"""Project-scoped tools backed by private, recorded BB state. No host execution."""

import copy
import json
from pathlib import Path
import posixpath
import fnmatch
import re
import shlex

ROOT = "/workspace/project"


class Workspace:
    def __init__(self, artifacts):
        self.root = Path(artifacts)
        self.state = json.loads((self.root / "state.json").read_text())

    def save(self):
        (self.root / "state.json").write_text(json.dumps(self.state, indent=2))

    def record(self, event):
        with (self.root / "events.jsonl").open("a") as out:
            out.write(json.dumps(event) + "\n")

    def path(self, path):
        resolved = posixpath.normpath(path if path.startswith("/") else ROOT + "/" + path)
        if resolved == ROOT:
            return ""
        if not resolved.startswith(ROOT + "/"):
            raise PermissionError("Path is outside the project")
        return resolved[len(ROOT) + 1:]

    def tool(self, name, inputs):
        try:
            if name == "Read":
                path = self.path(inputs["file_path"])
                text = self.state["files"].get(path)
                if text is None:
                    raise FileNotFoundError("File not found: " + inputs["file_path"])
                start = max(0, inputs.get("offset", 1) - 1)
                lines = text.splitlines()
                text = "\n".join(lines[start:start + inputs.get("limit", len(lines))])
                self.record({"kind": "read", "path": path, "success": True})
                return content(text)
            if name == "Write":
                path = self.path(inputs["file_path"])
                if not path.startswith(("notes/", "reports/")):
                    raise PermissionError("Only project notes and reports are writable")
                self.state["files"][path] = inputs["content"]
                self.save()
                self.record({"kind": "file-write", "path": path})
                return content("Saved " + ROOT + "/" + path)
            if name == "Bash":
                return self.shell(inputs["command"])
            raise ValueError("Unknown tool: " + name)
        except (ValueError, KeyError, OSError) as error:
            self.record({"kind": "tool-error", "tool": name, "message": str(error)})
            return content(str(error), True)

    def shell(self, command):
        self.record({"kind": "shell", "command": command})
        loop = re.fullmatch(r"\s*for\s+([A-Za-z_]\w*)\s+in\s+([^;]+);\s*do\s+(.+?);\s*done\s*;?\s*", command, re.S)
        if loop:
            variable, values, body = loop.groups()
            items = shlex.split(values)
            if len(items) > 128:
                raise ValueError("Too many loop items")
            outputs, failed = [], False
            for value in items:
                if not re.fullmatch(r"[A-Za-z0-9_./-]+", value):
                    raise ValueError("Loop values must be literal arguments")
                result = self.shell(body.replace("${" + variable + "}", value).replace("$" + variable, value))
                outputs.extend(c["text"] for c in result["content"])
                failed |= result["isError"]
            return content("\n".join(outputs), failed)
        lexer = shlex.shlex(command, posix=True, punctuation_chars=";&|<>")
        lexer.whitespace_split = True
        lexer.commenters = ""
        raw = list(lexer)
        words, index = [], 0
        while index < len(raw):
            if raw[index:index + 3] == ["2", ">&", "1"]:
                index += 3
            elif raw[index:index + 3] == ["2", ">", "/dev/null"]:
                index += 3
            else:
                words.append(raw[index])
                index += 1
        groups, tokens, separator = [], [], ";"
        for token in words:
            if token in ("&&", ";", "||"):
                groups.append((separator, tokens))
                separator, tokens = token, []
            elif token in ("<", ">", ">>", "&", ">&"):
                raise ValueError("Unsupported shell operator: " + token)
            else:
                tokens.append(token)
        groups.append((separator, tokens))
        outputs, code = [], 0
        for separator, tokens in groups:
            if (separator == "&&" and code) or (separator == "||" and not code):
                continue
            pipes, part = [], []
            for token in tokens:
                if token == "|":
                    pipes.append(part)
                    part = []
                else:
                    part.append(token)
            pipes.append(part)
            stdin = None
            for part in pipes:
                if part:
                    code, output = self.execute(part, stdin)
                    stdin = output if isinstance(output, str) else json.dumps(output)
            if stdin is not None:
                outputs.append(stdin)
        return content("\n".join(outputs), code != 0)

    def execute(self, tokens, stdin=None):
        program, args = tokens[0], tokens[1:]
        if program in ("bb", "gh"):
            before = copy.deepcopy(self.state)
            event = {"kind": "cli", "program": program, "args": args, "error": False}
            code, output = self.bb(args, event) if program == "bb" else self.gh(args, event)
            event.update(exitCode=code, error=code != 0)
            self.record(event)
            self.save()
            if code and before != self.state:
                raise AssertionError("Failed command mutated state")
            return code, output
        if program == "pwd":
            return 0, ROOT
        if program == "date" and args in ([], ["-u"], ["-u", "+%Y-%m-%dT%H:%M:%SZ"]):
            return 0, "2026-10-14T08:00:00Z"
        if program == "cd" and len(args) == 1 and self.path(args[0]) == "":
            return 0, ""
        if program == "ls":
            paths = [a for a in args if not a.startswith("-")] or ["."]
            found = []
            for path in paths:
                prefix = self.path(path)
                prefix = prefix.rstrip("/") + "/" if prefix else ""
                found.extend(p for p in self.state["files"] if p.startswith(prefix))
            return 0, "\n".join(sorted(set(found)))
        if program == "cat" and len(args) == 1:
            result = self.tool("Read", {"file_path": args[0]})
            return int(result["isError"]), "\n".join(c["text"] for c in result["content"])
        if program in ("head", "tail"):
            count = 10
            if "-n" in args:
                count = int(args[args.index("-n") + 1])
            elif args and re.fullmatch(r"-\d+", args[0]):
                count = int(args[0][1:])
            lines = (stdin or "").splitlines()
            return 0, "\n".join(lines[:count] if program == "head" else lines[-count:])
        if program == "find":
            path = next((a for a in args if not a.startswith("-")), ".")
            prefix = self.path(path)
            files = [p for p in self.state["files"] if not prefix or p.startswith(prefix.rstrip("/") + "/")]
            if "-maxdepth" in args:
                depth = int(args[args.index("-maxdepth") + 1])
                files = [p for p in files if len(p[len(prefix):].strip("/").split("/")) <= depth]
            if "-name" in args:
                pattern = args[args.index("-name") + 1]
                files = [p for p in files if fnmatch.fnmatch(Path(p).name, pattern)]
            if any(a in args for a in ("-exec", "-delete")):
                raise ValueError("Unsupported find operation")
            return 0, "\n".join(ROOT + "/" + p for p in sorted(files))
        if program in ("which", "command"):
            name = args[-1] if args else ""
            if name in ("bb", "gh", "git", "cat", "ls", "find", "head", "tail", "grep", "pwd", "echo"):
                return 0, "/usr/bin/" + name
            return 1, ""
        if program == "git":
            if args[:1] == ["-C"]:
                self.path(args[1])
                args = args[2:]
            if args[:1] == ["remote"]:
                url = "https://github.com/" + self.state["repository"] + ".git"
                return 0, "origin\t" + url + " (fetch)\norigin\t" + url + " (push)"
            if args[:1] == ["status"]:
                return 0, "" if any(a in args for a in ("--short", "--porcelain")) else "On branch maintenance\nnothing to commit, working tree clean"
            if args[:1] == ["log"]:
                return 0, "a8b43f2 Prepare maintenance workspace"
            if args == ["branch", "--show-current"]:
                return 0, "maintenance"
        if program == "grep":
            plain = [a for a in args if not a.startswith("-")]
            if not plain:
                raise ValueError("grep needs a pattern")
            pattern = plain[0]
            rows = [p + ":" + line for p, text in self.state["files"].items() for line in text.splitlines() if re.search(pattern, line, re.I if any("i" in a for a in args if a.startswith("-")) else 0)]
            return int(not rows), "\n".join(rows)
        if program in ("echo", "printf"):
            values = [self.state["selfId"] if t in ("$BB_THREAD_ID", "${BB_THREAD_ID}") else t for t in args]
            return 0, " ".join(values[1:] if program == "printf" and values[:1] == ["%s"] else values)
        message = program + ": command not found"
        self.record({"kind": "tool-error", "tool": "Bash", "message": message})
        return 127, message

    def target(self, args):
        clean = [x for x in args if x != "--json"]
        if clean == ["--self"]:
            return self.state["selfId"]
        if len(clean) == 1 and clean[0] in self.state["threads"]:
            return clean[0]
        raise ValueError("Specify a thread ID or --self")

    def gh(self, args, event):
        try:
            if args == ["auth", "status"]:
                return 0, "github.com: logged in; active account: project-automation"
            if args[:1] in (["--repo"], ["-R"]) and len(args) >= 4:
                args = args[2:] + args[:2]
            if args in ([], ["--help"], ["issue", "--help"]):
                return 0, "gh issue: create, view, edit\nUse gh issue <command> --help for usage."
            if args[:1] != ["issue"] or len(args) < 2:
                raise ValueError("Unknown command")
            operation = args[1]
            if "--help" in args:
                return 0, "gh issue create --repo <owner/repo> --title <title> --body-file <path>\ngh issue view <number> [--repo <owner/repo>] [--json title,body,url,state]\ngh issue edit <number> --repo <owner/repo> --body-file <path>"
            options, positional = {}, []
            rest = iter(args[2:])
            for token in rest:
                if token.startswith("-"):
                    value = next(rest, None)
                    if value is None or token not in ("--repo", "-R", "--title", "--body-file", "--body", "--json", "--state", "--search", "--limit"):
                        raise ValueError("Unknown or incomplete option: " + token)
                    options[token] = value
                else:
                    positional.append(token)
            issues = self.state["issues"]
            repository = options.get("--repo", options.get("-R", self.state["repository"]))
            if repository.removeprefix("https://github.com/").strip("/").lower() != self.state["repository"].lower():
                raise ValueError("Repository not found")
            if operation == "list":
                if "--json" in options:
                    fields = options["--json"].split(",")
                    if "body" in fields:
                        event["issuesRead"] = [i["number"] for i in issues]
                    return 0, [{k: i[k] for k in fields if k in i} for i in issues]
                return 0, "\n".join(str(i["number"]) + "\t" + i["state"] + "\t" + i["title"] for i in issues)
            if operation == "create":
                if positional or "--title" not in options:
                    raise ValueError("A title is required")
                body = self.issue_body(options)
                number = max([40, *(i["number"] for i in issues)]) + 1
                issue = {"number": number, "title": options["--title"], "body": body, "state": "OPEN", "url": f"https://github.com/acme/browser-control/issues/{number}"}
                issues.append(issue)
                event["mutation"] = {"kind": "issue-create", "number": number, "body": body, "title": issue["title"]}
                return 0, issue["url"]
            if len(positional) != 1:
                raise ValueError("An issue number is required")
            number = int(positional[0].rstrip("/").split("/")[-1])
            issue = next((i for i in issues if i["number"] == number), None)
            if issue is None:
                raise ValueError("Issue not found")
            if operation == "view":
                fields = options.get("--json", "").split(",") if "--json" in options else list(issue)
                if any(f not in issue for f in fields):
                    raise ValueError("Unknown JSON field")
                if "body" in fields:
                    event["issueRead"] = number
                return 0, {k: issue[k] for k in fields}
            if operation == "edit":
                body = self.issue_body(options)
                issue["body"] = body
                event["mutation"] = {"kind": "issue-edit", "number": number, "body": body}
                if "--title" in options:
                    issue["title"] = options["--title"]
                    event["mutation"]["title"] = issue["title"]
                return 0, issue["url"]
            raise ValueError("Unknown issue operation")
        except (ValueError, KeyError) as error:
            return 2, {"error": str(error)}

    def issue_body(self, options):
        if "--body-file" in options:
            return self.state["files"][self.path(options["--body-file"])]
        if "--body" in options:
            return options["--body"]
        raise ValueError("Provide --body-file or --body")

    def bb(self, args, event):
        try:
            return self.dispatch(args, event)
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            return 2, {"error": str(error)}

    def dispatch(self, args, event):
        if not args or args in (["--help"], ["-h"]):
            return 0, "bb: status, thread show, thread-stages. Run a command with --help for usage."
        if args in (["status"], ["status", "--json"]):
            return 0, {"project": {"id": "proj_7k2mn4ax9p", "name": "Service maintenance"},
                       "thread": {"id": self.state["selfId"], "title": self.state["threads"][self.state["selfId"]]["title"]},
                       "environment": {"path": ROOT}}
        if args in (["thread"], ["thread", "--help"], ["thread", "-h"]):
            return 0, "bb thread show [<id>] [--self] [--json]: show thread details."
        if args[:2] == ["thread", "show"]:
            if args[2:] in (["--help"], ["-h"]):
                return 0, "Usage: bb thread show [<id>] [--self] [--json]\nJSON: {thread: {...}, environment: {...}, pendingTodos: []}"
            target = self.target(args[2:])
            row = self.state["threads"][target]
            return 0, {"thread": {k: v for k, v in row.items() if k != "stage"}, "environment": {"path": ROOT}, "pendingTodos": []}
        if not args or args[0] != "thread-stages":
            raise ValueError("Unknown command. Run bb --help for available commands.")
        if len(args) == 1 or args[1:] in (["--help"], ["-h"]):
            return 0, "bb thread-stages: stage, list, show, prefs, actions. Run bb thread-stages <command> --help for arguments."
        command, rest = args[1], args[2:]
        help_text = {
            "stage": "stage <stage> [<thread>] [--self] [--json]\nStages: " + ", ".join(self.state["stages"]),
            "show": "show [<thread>] [--self] [--json]",
            "list": "list [--json] [--include-children] [--stage <stage>] [--section <id>] [--project <id>] [--by section|project|machine]",
            "prefs": "prefs list|get|set|reset [<key>] [<value>] [--json]",
            "actions": "actions list [<thread>] [--self] [--json]\nactions set [<thread>] [--self] --actions <json-array> [--json]\nactions run <action-id> [<thread>] [--self] [--json]",
        }
        if "--help" in rest or "-h" in rest:
            if command not in help_text:
                raise ValueError("Unknown command")
            return 0, "Usage: bb thread-stages " + help_text[command]
        if command == "show":
            target = self.target(rest)
            event["inspected"] = [target]
            return 0, self.state["threads"][target]
        if command == "list":
            rows = [row for row in self.state["threads"].values()
                    if "--include-children" in rest or row.get("parentThreadId") is None]
            options = iter(rest)
            for option in options:
                if option in ("--json", "--include-children"):
                    continue
                if option == "--by":
                    if next(options, None) not in ("section", "project", "machine"):
                        raise ValueError("Invalid organization")
                    continue
                field = {"--stage": "stage", "--section": "sectionId", "--project": "projectId"}.get(option)
                if not field:
                    raise ValueError("Unknown option: " + option)
                value = next(options, None)
                if value is None:
                    raise ValueError("Missing value for " + option)
                rows = [r for r in rows if r.get(field) == value]
            event["inspected"] = [r["id"] for r in rows]
            return 0, rows
        if command == "stage":
            if not rest or rest[0] not in self.state["stages"]:
                raise ValueError("Unknown stage. See bb thread-stages stage --help.")
            target = self.target(rest[1:])
            before = self.state["threads"][target]["stage"]
            self.state["threads"][target]["stage"] = rest[0]
            event["mutation"] = {"kind": "stage", "threadId": target, "before": before, "after": rest[0]}
            return 0, {"threadId": target, "stage": rest[0]}
        if command == "prefs":
            clean = [x for x in rest if x != "--json"]
            prefs = self.state["preferences"]
            if clean == ["list"]:
                if "--json" in rest:
                    return 0, prefs
                descriptions = {"automaticStageUpdates": "Agents maintain workflow stages automatically", "organizationMode": "Group by section, project, or machine", "environmentGrouping": "Group threads sharing an environment into one row"}
                return 0, "\n".join(k + "\t" + json.dumps(v) + "\t" + descriptions.get(k, "") for k, v in prefs.items())
            if len(clean) == 2 and clean[0] == "get" and clean[1] in prefs:
                return 0, prefs[clean[1]]
            if len(clean) == 3 and clean[0] == "set" and clean[1] in prefs:
                try:
                    value = json.loads(clean[2])
                except json.JSONDecodeError:
                    value = clean[2]
                key = clean[1]
                if key == "organizationMode":
                    if value not in ("section", "project", "machine", "chronological"):
                        raise ValueError("Invalid organizationMode")
                elif type(value) is not bool:
                    raise ValueError("Expected a boolean")
                prefs[key] = value
                event["mutation"] = {"kind": "preference", "key": key, "value": value}
                return 0, {"key": key, "value": value}
            raise ValueError("Invalid preference command. See bb thread-stages prefs --help.")
        if command == "actions":
            if not rest:
                raise ValueError("Specify list, set, or run")
            if rest[0] == "list":
                return 0, self.state["actions"][self.target(rest[1:])]
            if rest[0] == "set" and "--actions" in rest:
                index = rest.index("--actions")
                if index + 1 == len(rest):
                    raise ValueError("--actions needs a JSON array")
                target = self.target(rest[1:index] + rest[index + 2:])
                actions = json.loads(rest[index + 1])
                if not isinstance(actions, list) or any(not isinstance(a, dict) or not isinstance(a.get("id"), str) or not 1 <= len(a["id"]) <= 64 or not isinstance(a.get("label"), str) or len(a["label"]) > 24 or not isinstance(a.get("prompt"), str) or not 1 <= len(a["prompt"]) <= 10000 for a in actions):
                    raise ValueError("Invalid actions")
                if len({a["id"] for a in actions}) != len(actions):
                    raise ValueError("Action IDs must be unique")
                self.state["actions"][target] = actions
                event["mutation"] = {"kind": "actions", "threadId": target, "actions": actions}
                return 0, actions
            raise ValueError("Unknown action operation")
        raise ValueError("Unknown command. Run bb thread-stages --help.")


def content(text, error=False):
    return {"content": [{"type": "text", "text": text}], "isError": error}
