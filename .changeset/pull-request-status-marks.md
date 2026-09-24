---
"bb-plugin-ribbon-sidebar": minor
---

Show what each thread's pull request is waiting on. The PR icon turns amber when auto-merge is on or the PR is queued to merge, and the status indicator adds GitHub's red ✗, amber ●, and green ✓ marks, ranked against bb's own indicators. Auto-merge, reviewers, and check counts come from the GitHub CLI on the bb server; without it, marks follow bb's pull request status.
