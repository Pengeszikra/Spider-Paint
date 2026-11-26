# spider-paint for VS Code

The [spider-paint](https://github.com/Pengeszikra/spider-paint) 3D workshop (3Draft) in a VS Code tab: the browser app
itself (VS Code is Chromium), so it is sharp and every key works — fly (W A S D R F), target (T, Tab), build (M, G, B, P),
edit (Q, 1 2 3, G R S E…), the Enter box and its commands (`/l`, `/s`, `/svg`, `/gif`, `/add`, `/help`…).

## Commands (Ctrl+Shift+P / Cmd+Shift+P)

- **spider-paint: Open** — the app with its start scene.
- **spider-paint: Open a scene from the list…** — a scene of the + scene list (bridge, globe, deepsky, human, stories…).
- **spider-paint: Show this scene file in 3D** — the open `.json` / `.3draft` file (also the button in the editor's title
  bar and in the explorer's menu) beside the editor; **every save reloads the view**: edit the JSON on the left, see it on
  the right. Scenes, sky catalogues (`3draft-sky`) and stories (`spider-build`) are understood.

## Notes

- WebGPU is used where VS Code's Chromium offers it; otherwise WebGL2, then SVG (the app chooses on its own; 9 switches).
- The online store (☁) and the MCP workshop need the network as in the browser; everything else works offline.
- Click into the view before typing: keys go to the app while the tab has the focus.
