# Games and keys

## Games (Fifth Percent)

A game brings scenes together: **Fifth Percent** (the scene list, *games*, or `?scene=game:fifth-percent`) is the starship's command bridge in the Deep Sky universe. The universe is drawn first and the bridge over it, so the stars show through the bridge's open window. **C** (or the **helm ⇄ walk** button, top right) switches between two modes:

- **helm**: you stand at the helm and fly the starship as in the Deep Sky (W A S D R F, T / Tab, Enter, Space, a drag turns the ship); the bridge stays with you.
- **walk**: you walk on the bridge, first person: **W A S D** (or the arrows) walk, **Shift** runs, a drag looks round. The desk, the chairs, the crew and the walls stop you, and you step up onto the dais. The ship keeps its course and speed meanwhile.

## Keys are data

The program keeps two plain objects, `ACTIONS` (what it can do) and `KEYMAP` (which key does it), both reachable from the browser console. `bindKey('q', 'scene')` rebinds a key, `bindKey('q')` frees it.
