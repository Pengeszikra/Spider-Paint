// The material palette the MCP tools build with: the viewer's starting palette (index.html MATERIALS, without its screen
// entry), so a step naming `glass` or `lamp` looks the same in the viewer and in the previews. A material is data:
// { name, color, metal, rough, alpha, emit, soft } (engine/material.ts reads it); a face points at one by name (`mat`) and
// keeps its colour as a fallback. tests/materials.mjs checks that this list and the viewer's agree.

export const MATERIAL_KEYS = ['color', 'metal', 'rough', 'alpha', 'emit', 'soft'];

export const BUILTIN_MATERIALS = [
  { name: 'plaster', color: '#e9e4d8', metal: 0, rough: 0.9, alpha: 1, emit: 0 },
  { name: 'sand', color: '#c9b79a', metal: 0, rough: 0.95, alpha: 1, emit: 0 },
  { name: 'wood', color: '#8a5a36', metal: 0, rough: 0.8, alpha: 1, emit: 0 },
  { name: 'dark-wood', color: '#5a3d2b', metal: 0, rough: 0.7, alpha: 1, emit: 0 },
  { name: 'concrete', color: '#8c8c88', metal: 0, rough: 1, alpha: 1, emit: 0 },
  { name: 'slate', color: '#4f5358', metal: 0, rough: 0.6, alpha: 1, emit: 0 },
  { name: 'grass', color: '#7d9b4e', metal: 0, rough: 1, alpha: 1, emit: 0 },
  { name: 'brick', color: '#b5473a', metal: 0, rough: 0.85, alpha: 1, emit: 0 },
  { name: 'steel', color: '#9aa7b4', metal: 1, rough: 0.3, alpha: 1, emit: 0 },
  { name: 'gold', color: '#d9b04a', metal: 1, rough: 0.25, alpha: 1, emit: 0 },
  { name: 'glass', color: '#a9d3e8', metal: 0.2, rough: 0.05, alpha: 0.3, emit: 0 },
  { name: 'copper', color: '#c87533', metal: 1, rough: 0.3, alpha: 1, emit: 0 },
  { name: 'ruby-glass', color: '#c0263a', metal: 0.2, rough: 0.05, alpha: 0.45, emit: 0 },
  { name: 'lacquer-blue', color: '#2257b8', metal: 0.15, rough: 0.12, alpha: 1, emit: 0 },
  { name: 'lamp', color: '#ffd36b', metal: 0, rough: 0.5, alpha: 1, emit: 1 },
];
