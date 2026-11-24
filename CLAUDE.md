# Claude Code guidance for spider-paint

Read [AGENTS.md](AGENTS.md) first: it is the shared, tool-independent instruction contract, including the mandatory 3Draft-compatible versioning rule.

For MCP commands and transports, see [MCP.md](MCP.md). How shared code moves between this checkout and its sibling projects (one `package.json` per project names it): [TRANSFER.md](TRANSFER.md). Treat the current source and AGENTS.md as authoritative when docs disagree.

Core architecture: **3Draft = headless 3D presentation + scene interaction**, **spider-paint = human/AI workshop + MCP + viewers/UI**. Avoid copying the engine into another divergent implementation.
