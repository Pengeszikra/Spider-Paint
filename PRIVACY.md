# spider-paint privacy policy

Last updated: 2026-11-24

This policy covers the spider-paint Claude plugin, its hosted MCP server (`https://spider-paint.vercel.app/api/mcp`) and the spider-paint editor that the plugin opens inline in a conversation. spider-paint is an open-source hobby project by Péter Vívó; the source is at https://github.com/Pengeszikra/spider-paint.

## What the server receives

When Claude calls a spider-paint tool, the server receives the tool arguments: modelling steps (object names, sizes, positions, colours), scene data you or Claude create, and story or sky-scene parameters. spider-paint does not ask for, and does not need, your name, email address, account details or conversation text beyond these tool arguments.

## How long it is kept

- **Workshop sessions** are held only in the memory of a single server process. A session is deleted 2 hours after its last activity, when the server holds too many sessions (oldest first), or whenever the server restarts or is redeployed. Scenes are not written to a database or to disk by the MCP server.
- **Diagnostic traces** (a random trace id, processing phase, timings, step and object counts, and a short host or error label) are kept in memory for 15 minutes. The same fields are written to the server's log in Google Cloud Logging, where they are kept for that service's standard retention period. These log lines do not contain scene geometry or conversation text.

## Links and tokens

`workshop_token`, `story_token` and `open_url` values encode the scene itself. Anyone who has such a link can open that scene, so share them only with people you want to see it.

## In your browser

The geometry is built in your browser, inside the spider-paint editor loaded from spider-paint's own site. The editor may keep settings and scenes in your browser's local storage on your device; spider-paint does not receive that data. spider-paint sets no advertising or tracking cookies and uses no analytics.

## Hosting and sharing

The MCP server runs on Google Cloud Run in the `europe-west1` region, so Google processes the requests as the hosting provider. spider-paint does not sell, rent or share your data with anyone else.

## Contact

Questions or deletion requests: open an issue at https://github.com/Pengeszikra/spider-paint/issues.
