# spider-paint — AI development contract

## Purpose and boundaries
spider-paint is the interactive 3D workshop and eyes for AI agents: a bidirectional bridge between AI, a human user, and a shared 3D scene. Its applications include modelling, teaching, scientific visualizations, presentations, simulations, games, and XR.

**3Draft** is the reusable, headless 3D presentation and interaction engine. It must not own keyboard bindings, toolbars, dialogs, or application-specific UI. **spider-paint** owns the workshop, viewers, UI input mapping, MCP transports, and human/agent collaboration. Reuse 3Draft rather than fork its core. Changes to engine behavior belong upstream; shared code moves between sibling checkouts with `npm run transfer` (see TRANSFER.md).

## Scene interaction contract
- AI and human must be able to read the same scene, observe changes, edit it, and inspect results.
- Treat the scene as a persistent shared state, not as unrelated screenshots or generated URLs. An `open_url` is a fallback, not the collaboration protocol.
- Keep geometry and scene operations independent of input devices. Keyboard, pointer, XR, and MCP map to the same commands.
- Agent operations should be addressable, inspectable, deterministic where possible, and reversible where feasible. Distinguish commands from observations.
- Separate local MCP (stdio, potentially stateful and connected to a live viewer) from remote HTTP MCP (which may be stateless). Never claim two-way live synchronization unless implemented and tested.
- Preserve the current clean, sharp-edged rendering approach. Texture-heavy/PBR pipelines are not a prerequisite.
- Prefer plain browser ES modules, no bundler, and minimal runtime dependencies. Keep code and docs in English; user-facing discussions may be Hungarian.

## ChatGPT-native Workshop — primary product direction
- The standalone `workshop.html` / `npm run workshop` UI was rejected by the owner: do not extend or promote it as the product. Keep legacy prototype only for diagnostics until deliberately removed.
- The **primary** spider-paint workshop is an MCP App widget rendered *inside the ChatGPT conversation*, not another browser tab.
- An MCP `open_workshop` / `build_model` tool returns a UI resource using `_meta.ui.resourceUri` (with `openai/outputTemplate` compatibility), MIME type `text/html;profile=mcp-app`.
- The embedded workshop must use **spider-paint's actual application UI and existing keyboard shortcuts/key bindings** as its authoritative interaction model. The normal editor panels, toggles, navigation, selection, and keyboard handling are part of the workshop experience; do not silently replace them with a separately invented miniature interface.
- **Never proactively design, add, or rebuild UI.** An instruction to open or test the workshop, create a model, or exercise MCP tools is **not** authorization to invent controls, panels, toolbars, overlays, or a custom UI. Change UI only when the owner explicitly requests that UI change.
- Reuse the existing application's UI/input code and command mapping wherever technically possible, rather than maintaining a second imitation of spider-paint. Keyboard, mouse/trackpad, XR, and MCP operations must map to the existing app behavior, not to agent-invented shortcuts.
- In ChatGPT, the conversation can issue modeling commands, but it must not displace or redefine the app's own UI. If embedding or host keyboard focus restrictions prevent an existing function from working, report the precise limitation and propose an integration fix **without fabricating substitute UI**.
- A "UI test" means testing the **real spider-paint controls and key bindings** in the intended workshop host: existing panels/toggles, pointer/orbit/zoom, shortcut dispatch, input focus, event capture, and any host-reserved keys. Compare behavior to the regular browser app. An MCP command relay response alone proves neither UI behavior nor that keyboard shortcuts work.
- The plugin MCP layer is separate from the reusable headless 3Draft core. Widget-specific presentation metadata belongs in spider-paint.
- Initial MVP must demonstrate the widget rendered in ChatGPT and model changes reflected in it; avoid claiming a working live two-way persistent session until host callbacks, state transport, and tests prove it.
- Plan for N participants with independent cameras, and for a nonblocking instruction queue, but build these on the shared session layer incrementally.
- Shared workshop v7 MVP: the real native editor emits `native_scene_changed` from its existing rebuild path; the ChatGPT MCP App publishes the exported scene with an optimistic revision. `workshop_state` observes human changes and `workshop_edit` queues agent steps for **the same live iframe**. The widget applies steps with browser-local `WorkshopModel` and imports through the native `loadScene`. An accepted queue entry is never proof the scene changed: check `last_edit.status`.
- Session storage is process-local, time-limited and capability-scoped; it is not durable or multi-instance safe. The browser may be disconnected. Never claim live sync until a real host-side acceptance test validates both directions; see WORKSHOP.md. Preserve the no-duplicate-UI rule throughout.


## Multi-participant and interruptible-work principles
- No privileged world origin: (0,0,0) is not a special user or AI seat. A scene may serve N participants, including humans and AI agents.
- Each participant owns their camera/viewport, selection and navigation mode. Camera control is opt-in (free / follow / directed), following the Lark build replay camera switch. Do not let one agent unexpectedly move another participant's camera.
- The scene model is shared. Participant-presence and camera state belong to the workshop/session layer, not the 3Draft geometry engine.
- Agents must remain **addressable and interruptible** while carrying out tasks. Accept additional human instructions without losing the current scene, and check the instruction inbox at safe operation boundaries.
- Treat `workshop_messages` as a queue of instructions, not a self-running AI service; `workshop_reply` acknowledges an instruction. Never claim that simply queuing a message automatically makes a remote language model read it.
- Distinguish `append instruction`, `pause/interrupt`, and `ask while working`. A full task coordinator is a future capability; the first workshop implements only message collection/acknowledgement.
- Multiple simultaneous editors will eventually require concurrency control, revisions and conflict detection. Do not equate N viewers with conflict-free N writers.

## Versioning — mandatory
Use the exact same date-based npm-compatible scheme as 3Draft (see `Pengeszikra/3Draft/scripts/bump.js`):

- Stored semver: `YY.M.DNNN` (three numbers, no leading zeros). The final number = day of month × 1000 + build count for that day.
- Human-readable version: `YY.MM.DD.NNN`, zero-padded. Example: `26.11.20001` displays as `26.11.20.001`.
- Each new release/version bump on the same local calendar day increments the daily build counter; on a different day it starts at 001. Never decrease the version; fail on date rollback, and do not exceed 999 builds/day.
- Run `npm run bump` to bump; `npm run bump -- --dry` to preview. The package.json version is the authoritative source. Keep UI version labels, manifests, and release metadata consistent with it; do not maintain an unrelated hard-coded version.
- A source commit or build is **not** an npm publish: explicitly report which of commit, push, build, test, and publish occurred. Do not publish automatically.

## Automated Cloud Run deployment — mandatory process
- **Deployment to Google Cloud Run is automated via GitHub Actions.** After a push to `main`, the existing `spider-paint MCP App` CI runs tests. On a successful `main` CI run, `.github/workflows/cloud-run-deploy.yml` deploys the *tested commit* to the existing Cloud Run service `spider-paint` in `europe-west1`. Agents should push changes and check **both** CI and the deployment workflow; they must not ask for a routine manual `gcloud run deploy`.
- The workflow uses short-lived Google Workload Identity Federation credentials (no stored Google service-account key), builds the existing Dockerfile from source, keeps the Cloud Run instance limit at one while workshop sessions are process-local, and sets `SPIDER_PAINT_GIT_SHA` from the exact commit.
- **Never assert that a GitHub commit, green CI, or an accepted deploy command means the new version is live.** A deployment succeeds only after the workflow's `GET /api/version` check confirms the actual Cloud Run `gitHash` equals the source SHA. Report commit SHA, CI state, deployment state, and live SHA separately.
- **One-time setup is still required in each Google Cloud project.** The owner must run `bash scripts/setup-cloud-run-oidc.sh PROJECT_ID` with authorized `gcloud` and `gh` credentials. This configures Google OIDC/IAM and GitHub Actions repository variables `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER` and `GCP_DEPLOY_SA`. Until setup is complete, deploy jobs fail fast; do not call the pipeline "operational" without a successful deploy/verification. See `docs/cloud-run-ci.md`.
- The workflow skips stale commits and serializes deploys; do not create competing Cloud Run or Cloud Build triggers without removing/reconciling the existing trigger.
- A Cloud Run revision change can interrupt in-memory shared workshop sessions. Preserve the one-instance constraint until the session store becomes durable and multi-instance safe.
- **npm release is independent.** Automatic Cloud Run deployment must not call `npm run release`, bump the package version, or publish to npm. Do not alter Cloud Run access policy or runtime service identity as a routine deploy step.
- Exception handling: if automated deployment fails, inspect the GitHub Actions logs and underlying Cloud Run build; do not silently deploy manually or claim success. Any manual emergency deploy should be explicitly identified as such and verified against `/api/version`.

## Development workflow
1. Inspect the relevant source, tests, `APP.md`, `MCP.md`, and `README.md` before changes; legacy project documents can be stale.
2. Prefer small, independently testable changes; run `npm test` when dependencies/environment permit.
3. Verify user-to-agent and agent-to-user scene synchronization before promising inline interactive use in any host.
4. No architectural changes or unrequested product concepts by assumption; document proposed interfaces separately. In particular, never proactively build or redesign the UI during workshop integration or testing.
5. State clearly what was changed, what was validated, and what remains unfinished.
