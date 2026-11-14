// 3Draft: minimalist AI first 3D engine.
// Current stage: points, edges and flat faces rendered to deterministic SVG
// from four fixed cameras, plus surface picking (point, normal, distance) and
// a target cross that lies on the surface under the cursor. No textures, no
// shading yet.
export const name = '3draft';
export const version = '26.11.14004';
export { box, extrude, merge, rotate, bounds, faceNormal, faceCenter } from './mesh.js';
export { validate } from './check.js';
export { boolean, union, subtract, intersect, health, splitParts } from './csg.js';
export { bevel } from './bevel.js';
export { lathe } from './lathe.js';
export { textMesh, faceFrame, GLYPHS, STROKE as TEXT_STROKE, mergeFlat } from './text.js';
export { saw, planeThroughLine, planeThroughTriangle, sectionSegments } from './saw.js';
export { extrudeFace, moveVertices } from './edit.js';
export { VIEW_ORDER, makeCamera, orbit, project, ray } from './camera.js';
export { pick, crosshair } from './pick.js';
export { instantiate, lodLevel } from './instances.js';
export { standOn } from './place.js';
export { paintOrder } from './order.js';
export { createGpu, viewProjection, buildVertices, cornerNormals, buildInstances, buildSkinVertices, MAX_BONES, SKIN_FLOATS, buildScreenQuads, SCREEN_FLOATS, defaultLight, defaultMaterial, mul4 } from './gpu.js';
export { createGl } from './gl.js';
export { renderView, renderViews, renderSheet } from './svg.js';
export { surfaceOf, DEFAULTS as MATERIAL_DEFAULTS } from './material.js';
export { displayVersion } from './version.js';
/** Short, machine-readable description of the current state of the package. */
export const info = () => ({
    name,
    version,
    stage: 'pre-alpha',
    goals: [
        'single palette texture, UVs point at one texel per face',
        'WASM core (HEXAW / Rust) behind a thin ABI',
        'WebGPU renderer with WebGL2 fallback',
        'deterministic SVG preview for AI feedback loops',
    ],
});
export { initKernel } from './kernel.js';
export { insertVertex, cutFace, moveVertex, fillLoop, addLine, findLoop, nearestSurface, wireFromSegments, moveVertexSet, reshape, outlineOf } from './wire.js';
export { triangulate } from './triangulate.js';
export { galaxyPoints } from './galaxy.js';
export { buildEdges, buildMarks, MARK_FLOATS, sceneEdges } from './gpu.js';
export { humanoidRig, posed, posedJoints, boneMatrices, poseLift, walkPose, HUMANOID_POSES, HUMANOID_JOINTS } from './rig.js';
