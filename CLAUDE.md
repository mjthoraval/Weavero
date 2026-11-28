@AGENTS.md

# Claude Code specifics

The project instructions are [AGENTS.md](AGENTS.md), imported above, one file for every agent. Only what is specific to Claude Code is here.

- **Skills**: invoke the workflows in [.claude/skills/](.claude/skills/) with the Skill tool or as a slash command (`/verify`, `/branch`, `/feature`, `/bugfix`, `/upstream-check`; `/release` maintainer-only). Where AGENTS.md says to follow a skill, INVOKE it — never reproduce its steps from memory.
- **Rules**: the files in [.claude/rules/](.claude/rules/) load by themselves when you read a file their `paths:` frontmatter matches.
- **Hooks**: the hooks in [.claude/settings.json](.claude/settings.json) are active. `ts-dirty.sh` (PostToolUse on Edit|Write) records, per session, the tree (git top-level) that holds each edited TypeScript file; `typecheck-stop.sh` (Stop) runs `npm run typecheck` in each recorded tree at the end of the turn and refuses to end it while errors remain. Only once: if the errors survive the retry, the turn ends and a message names the failing tree(s) and their error count.
