# Stories

A **story** (a Spider Build file, `.build.json`) is a recorded build: how a model was put together step by step, with its own camera moves and narration. Load one from the **+ scene** list (the *stories* group) or with **f↑**. While a story is open the console becomes a player: the scene and system controls give way to the playback controls.

Stories can also contain an animated scene, with moving objects and characters, cinematic
cameras and a compact native environment. Their camera and captions stay independent
of object motion. A Deep Sky black hole keeps its usual accretion and light-bending effect.
Only audio supplied by the story plays; silent stories create no sound. For an animated
story the step arrows jump between chapters/shots. **✕** retains the objects in their
current animated poses for ordinary editing. A `?scene=story:name` link opens a bundled Story. A `#scene=…` or `#sky=…` link (made by the public MCP server) carries a whole scene or sky catalogue in the address, and `?target=name` flies to that object once the scene is open.

Animated Stories can save darker lighting and pulsing emissive lamps. Their glow lights
follow the animated parts and illuminate nearby surfaces. Brightness stays synchronized
with playback, pause and seeking, and the saved scene restores its glow and studio switches.

The controls are:

- ⏮ the beginning, ◀ one step back, ▶ / ❚❚ play and pause, ▶ one step forward, ⏭ the finished model, and the speed (0.5–8×)
- the **time slider**: drag to any moment; going back rebuilds exactly what was there
- **info**: the story panel (the chapter and its text, what is being built, a chapter list, the views such as exterior / cutaway / rooms, the step's details)
- **cam**: the recorded camera; switch it off to look round freely while it plays
- **text**: the captions under the view, in large type so they read from a distance (and the voice, when the story has one)
- **?** help, **✕** leave the story: the model of that moment stays in the scene as ordinary objects, and the usual controls come back

Keys: ← → a step, Home / End the beginning / the end (Space stays the speed stop).
