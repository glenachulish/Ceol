Run a full audit of $ARGUMENTS (or the whole project if no argument given).

Spawn parallel checks for:
1. **Bloat scan** — unused imports, dead functions, redundant variables, leftover scaffolding
2. **Documentation gaps** — functions or routes with no comments or docstrings
3. **Code quality** — overly complex logic, inconsistent naming, functions doing too much

Report findings grouped by file, with severity: High / Medium / Low.
Then ask me which issues to fix before making any changes.
