#!/usr/bin/env node
// Convert or validate a Spider build recording without running its commands.
import {readFileSync, writeFileSync} from 'node:fs';
import {normalizeBuildDocument} from '../models/spider-build-v2.mjs';

const [command, input, output] = process.argv.slice(2);
try {
  if (!['convert', 'validate'].includes(command) || !input || (command === 'convert' && !output)) {
    throw Error('Usage: node scripts/spider-build.mjs validate INPUT | convert INPUT OUTPUT.build.json');
  }
  const doc = normalizeBuildDocument(JSON.parse(readFileSync(input, 'utf8')));
  if (command === 'convert') writeFileSync(output, JSON.stringify(doc));
  console.log(JSON.stringify({valid: true, version: doc.version, steps: doc.tracks.construction.steps.length,
    cameraKeyframes: doc.tracks.camera.keyframes.length, narrationCues: doc.tracks.narration.cues.length,
    durationMs: doc.timeline.durationMs}));
} catch (error) {console.error(error.message); process.exitCode = 1;}
