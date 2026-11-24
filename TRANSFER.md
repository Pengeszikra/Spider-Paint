# Transfer: one codebase, sibling projects

The same code runs as more than one project (a published one and a test one that may be broken freely). Each project is
its own git repository; the code moves between them with one command, and the project's name is renamed on the way.

## The only source of truth: package.json

Which project a checkout is comes from **its `package.json`, and nothing else**:

```json
"name": "my-app",
"brand": {
  "repo": "Owner/my-app",
  "branch": "main",
  "site": "https://my-app.example",
  "mcp": "https://my-app.example/mcp",
  "own": ["models/", ".github/"],
  "share": ["models/spider-build-v2.mjs"]
}
```

`npm run brand` prints the tokens of this checkout. Each of them has a role, and every shared file and path is renamed
role by role (the target's `package.json` gives the new value):

| role    | from              | used for                                            |
| ------- | ----------------- | --------------------------------------------------- |
| `mcp`   | `brand.mcp`       | the public MCP endpoint                             |
| `site`  | `brand.site`      | the deployed app                                    |
| `repo`  | `brand.repo`      | the GitHub repository (any letter case)             |
| `env`   | `NAME` in capitals, `_` for separators | environment variables: `NAME_GIT_SHA` |
| `name`  | `name`            | everything else: titles, docs, ids, paths, the MCP server name |
| `ident` | `name`, `_` for separators | JS identifiers (only where `name` is not a valid one) |

So in docs and code **write the project's own name plainly**; the transfer rewrites it. Two rules keep that lossless:

- A shared file never names a sibling project (the check lists every such line). History and notes about a sibling go into
  an `own` folder.
- The project name is not glued into a JS identifier (`window.__myapp_x`): use a neutral name (`__native_x`) or a string.

## What moves and what stays

Everything git tracks moves, except the paths in **either** project's `brand.own` list (a folder ends with `/`); the paths
in `brand.share` move even inside an own folder. `package.json` moves too, but `name`, `version`, `description`, `brand`,
`private`, `repository`, `homepage`, `bugs`, `author`, `keywords` and `publishConfig` stay the target's.

Each project lists its own scenes in `models/index.json` (the "+ scene" list, the phone's Exa menu and the offline cache all
read it), so its own models need no code change.

## The command

```bash
npm run transfer -- ../sibling-checkout --dry   # what would change
npm run transfer -- ../sibling-checkout         # do it (the target's git tree must be clean)
git -C ../sibling-checkout diff --stat          # review, test, commit there
```

Before writing anything it checks that every renamed file renames back to the same text, that no shared file names the
other project, that the project name appears only as one of its tokens, that every JS file parses and every JSON file
reads. One failing check and nothing is written. Files that are shared, exist in the target and no longer exist here are
removed there, so after a transfer the shared part of both checkouts is the same code.

The usual way: develop and break things in the test project, then transfer it to the published one when it works.
The direction can be either way; the version number (`npm run bump`) stays each project's own.
