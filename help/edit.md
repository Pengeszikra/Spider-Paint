# Edit mode

Put the cross on an object and press **Q**. That object is the active one; everything else stays visible. The grid lies under it, its **origin is the middle of its base**, the camera looks at the middle of the whole object, so all of it is in view, and distances are in **metres**. **Q** again leaves; the camera goes back. With nothing under the cross and no target, **Q** makes a new 1 m cube of the selected material.

| Key | Action |
|---|---|
| 1 / 2 / 3 | Select points / lines / faces (the grey points show only in points mode, 1). Click selects, Shift+click adds or removes; a click on empty space clears the selection, but a drag there (orbiting) keeps it |
| A, A A | Select everything; two quick presses clear the selection |
| G | Grab: move the selection with the pointer; X Y Z lock an axis; type metres; click or Enter confirms, Esc cancels |
| S | Scale about the centre; X Y Z scale along an axis; type a factor |
| R | Rotate: about the middle of the selected points or faces; with a selected **line** the line is the axis (the other selected parts turn about it, or the whole object when the line is all that is selected). Move the pointer round the pivot, X Y Z turn about a world axis, type degrees |
| E | Extrude and grab at once: a point becomes a line, a line becomes a face, a face is pushed out along its normal |
| 5 | Sketch mode: V draws lines on the surface; **Enter** (or 5 again) turns the drawing into the mesh: a chain that comes back near where it began (within a third of a stroke) becomes a face, an open chain becomes lines. The new faces are selected, so E pulls them out. They take the selected material and sit a hair above the surface |
| V | Sketch a line from point to point on the surface (in the sketch mode, 5; Enter builds it) |
| 4, then V | **Saw**: V puts two or three points. Two on one face: a cut square to it. Three: a cut through the triangle. **Enter** cuts the object into closed solids that keep their material |
| Alt+N | **Flip normals:** the selected faces (3) turn round, their winding is reversed, so they face the other way (a screen drawn on the back of its face, a face that came out inside out). With no faces selected, the whole object. One U step |
| B | **Box select** in edit mode: B, then drag a box (B twice: a lasso) round points (1), lines (2) or faces (3): a point inside, a line with both ends inside, a face whose middle is inside (through the model too). Shift adds to the selection; Esc stops |
| M | **Mirror:** M, then X, Y or Z (or M - X / Y / Z: to the minus side): the selected faces (and lines) get a mirrored copy across a plane square to that axis, starting at the edge of the selection on that side (a magenta square shows it). What reaches over the plane is cut off there first, so the two halves meet at the plane without overlapping. Move the pointer to shift the plane, or type a shift in metres. **Enter** welds what meets: points that land on points become one, faces back to back on the plane go, a face and its mirror lying flat across the plane join into one; the line under the picture says whether it closed. What does not close is left for you to edit (F fills a hole). **Esc** cancels. (M no longer shoots a prism in edit mode) |
| F | **Fill:** the selected points (or the points of the selected lines) become one new face, wound to face away from the object, in the material of a neighbouring face. Closes a hole; a concave outline (L, V) is followed along its lines, not ordered by angle |
| Ctrl+R | **Loop cut:** with a line selected (2), the ring of four-sided faces through it is cut across. Type a number for how many cuts (1 by default), move the pointer along the line to slide them, Enter confirms, Esc cancels. The new line stays selected |
| Shift+W A S D R F | Fly (plain, these are edit keys) |
| U | Undo (stops at the start of the edit session) |

## Selecting faces from inside
In edit mode the pointer also finds the far side of a face, so from inside a hull (a spaceship, a room) its walls can be selected with 3 like any other face.

## Editing from inside
Pressing **Q** with the eye inside the object (inside its bounding box, e.g. flying in a hull) does not move the camera: you stay where you are, and leaving edit mode does not move it either.

## Ctrl+B: bevel
In edit mode select lines (**2**), then **Ctrl+B** (Cmd+B on a Mac): each line becomes a strip. Move the pointer away to set the width, the **wheel** or **↑ ↓** sets the number of segments (1 is a flat chamfer, more make a round edge), or type the width in metres. **Enter** or a click confirms, **Esc** cancels. Corners where several lines meet are filled. The width stops at what the faces allow.

## Ctrl+E: extrude with a back face
In edit mode **E** pulls the selected faces out (open at the start side where they were part of the model). **Ctrl+E** (Cmd+E on a Mac) does the same but leaves a face on the starting side as well, so what you pull out is a closed shell: good for building a mass inward from a wall, and for sawing or boolean afterwards.

Pulled the other way (against the face's normal, e.g. building a mass inward from a wall), Ctrl+E keeps the shell's normals outward, so it stays a proper solid; the sides of an inward E stay whole four-sided faces.

## Lathe (6)
Edit mode: select a face (3), press **6**. The face's plane is the drawing board and its **bottom line is the axis** (green). **V** puts the points of a contour above the axis (near the axis counts as on it: a tip); Esc takes the last point back. **Enter** ends the contour and asks for the **number of segments** (4 or more); **Enter again** takes 7. The contour is turned round the axis into a **new model**, independent of the one being edited, in the active material, with both ends closed (a flat disc where the contour does not end on the axis).

## L in edit mode: select the loop
**L** no longer switches the light while you edit (the LIGHT button still does; outside edit mode L is the light switch as before). With a line selected (2), **L** selects all the lines of its loop: the lines a loop cut (Ctrl+R) would cross, round and round until the loop closes or ends. With a face selected (3), **L** selects the faces of its loop; one face has two loops (two ways round), **L** again takes the other, and two touching faces go the way of their shared line.

## Pose mode (J)
Put the cross on a figure (or target it with T) and press **J**. The figure must stand on two feet, look to +z and let its arms hang; its skeleton is read off its shape, so nothing has to be prepared, and what it wears (hair, a hat: objects inside its box) moves with it. The skeleton is drawn over it (smaller as the figure gets smaller on the screen, and not at all when it is small and far), and the console shows the **pose** panel:

| Key | Action |
|---|---|
| 1 | Rest: as it was made |
| 2 3 4 5 | T pose, wave, sit, look at a phone |
| 6 | Walk on the spot; again: stand still in that step |
| 7 | Run on the spot; again: stand still in that step |
| Enter | Keep the pose: the figure becomes this shape (one U takes it back) |
| J, Esc | Leave: the figure goes back as it was |

Flying, targeting and the view switches work as usual; freeze (;) holds the walk. Keys that would change the figure (Q, G, M, O, U, Shift+X) wait until you leave. A kept pose is a new shape: posing it again reads a new skeleton off it, which works while the arms still hang and the feet are still the lowest points. If the object is not a figure, a note says what is missing. The **Betterman** example is made for this.
