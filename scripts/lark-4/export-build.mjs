import {readFileSync, writeFileSync} from 'node:fs';
import {migrateV1} from '../../models/spider-build-v2.mjs';

export function exportBuild(journal, destination = new URL('../../models/lark-4.build.json', import.meta.url)) {
  const document = migrateV1(journal);
  writeFileSync(destination, JSON.stringify(document));
  return document;
}
if (process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url) {
  const source = new URL('../../models/lark-4-tutorial.json', import.meta.url);
  const doc = exportBuild(JSON.parse(readFileSync(source, 'utf8')));
  console.log(JSON.stringify({version: doc.version, steps: doc.tracks.construction.steps.length,
    cameraKeyframes: doc.tracks.camera.keyframes.length, narrationCues: doc.tracks.narration.cues.length,
    durationMs: doc.timeline.durationMs}));
}
