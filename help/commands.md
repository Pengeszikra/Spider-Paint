# Commands

Enter opens the find box (in the edit mode, where Enter builds, cuts or turns: **Shift+Enter**); a text starting with **/** is a command, the words after it are its argument. **/** alone lists the commands; a command with choices lists them as you type (↑↓ choose, Enter runs, Esc closes); the answer shows for a moment at the bottom.

| Command | What it does |
|---|---|
| `/l name`, `/load` | open a scene of the + scene list (examples, stories, saved here, online) **alone**: the scene before goes (U brings it back) |
| `/merge name` | add a scene of the list to this one |
| `/s name`, `/save` | save the scene here (no name: the name box, or a dated one) |
| `/cloud name` | save the scene online (the store) |
| `/dl`, `/open`, `/new` | download the scene (.3draft), add one from a file, empty the scene (U brings it back) |
| `/forget name` | forget a scene saved here |
| `/svg [width]` | save the view as an SVG (the svg panel's settings: lit colours, background, edges) |
| `/png [size]` | save the view as a PNG: GPU light, see-through background, cut to the model with a little room (size: its longer side, 1200) |
| `/gif [frames] [seconds]`, `/anim …` | save the motion (the svg panel's turntable or story part) as an animated GIF / SVG |
| `/edges`, `/light`, `/studio`, `/smooth`, `/glow`, `/freeze` | switch it; with `on` or `off` set it |
| `/gpu webgpu · webgl · svg` | the renderer |
| `/view front · back · left · right · top · bottom · iso` | look at the scene from there |
| `/zen`, `/fit` | only the model; frame the scene again |
| `/mat name` | choose the material (a list with the colours) |
| `/add prism · box · cylinder · cone · pyramid · sphere` | a shape of the chosen material floats at the cross: a click sticks it, Enter keeps it (M then puts down more) |
| `/char [random · panel]` | put a character down (a random one, or the one the Characters panel shows) |
| `/text [words]` | put words down: on the face under the cross, or in front of the camera (Y); without words the text box opens |
| `/bool union · subtract · subtract-swap · intersect` | the boolean of the two selected objects (B) |
| `/go name` or `/go x y z` | target an object, or fly to a point |
| `/vehicle starship · car · none` | how the camera moves |
| `/play`, `/seek seconds`, `/rec` | the story: play / pause, go to a moment; record the moves |
| `/help word`, `/keys`, `/ver` | search this help (the found paragraph is marked), the keyboard map, the running version |
