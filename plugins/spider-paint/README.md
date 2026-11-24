# spider-paint — Claude plugin

Packages the remote spider-paint MCP server (`https://spider-paint.vercel.app/api/mcp`, no authentication) together with a skill that teaches Claude the shared-workshop workflow: `open_workshop` → `workshop_state` → `workshop_edit` on the same inline editor.

## Install

**Claude Code**

```
/plugin marketplace add Pengeszikra/spider-paint
/plugin install spider-paint@spider-paint
```

**Claude app (web / desktop)**: upload a zip of this folder (`plugins/spider-paint/`) as a `.plugin` file, or keep using the custom connector (Settings → Connectors → Add custom connector, URL above).

## Contents

| Path | Purpose |
| --- | --- |
| `.claude-plugin/plugin.json` | Claude plugin manifest |
| `.mcp.json` | the remote spider-paint MCP endpoint |
| `skills/spider-paint/SKILL.md` | when and how Claude uses the spider-paint tools |

The plugin version (semver) is independent of spider-paint's date-based npm version. The repository-root `plugin.json` / `mcp.json` remain the OpenAI / agent-plugins package.
