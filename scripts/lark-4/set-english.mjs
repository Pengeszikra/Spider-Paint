// Translate tutorial presentation text without changing construction operations.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {exportBuild} from './export-build.mjs';
const root=new URL('../../',import.meta.url),file=new URL('models/lark-4-tutorial.json',root);
const journal=JSON.parse(readFileSync(file,'utf8'));
const dictionary=new Map(readFileSync(new URL('english-labels.tsv',import.meta.url),'utf8').trim().split('\n').map(line=>{const split=line.indexOf('\t');if(split<0)throw Error(`Invalid translation row: ${line}`);return[line.slice(0,split),line.slice(split+1)]}));
const chapters=[
 ['Scale and floor','All coordinates are in metres. The four-person cabin floor is 1.58 m above ground; a 1.80 m human figure provides a reference for checking the usable space.'],
 ['Cabin frame and clearances','The interior is 3.56 m wide. A clear aisle of at least 72 cm remains between the seats, with more than 2 m of headroom beside the sloping roof shoulders.'],
 ['Four energy-absorbing seats','Two pilots sit in front and two passengers behind, all facing forward. The seat cushions are approximately 55 cm above the cabin floor; each seat has a separate headrest and safety harness.'],
 ['Cockpit and controls','Build two sloping instrument consoles, separate control sticks and pedals. The consoles sit ahead of the seats while the central aisle remains clear.'],
 ['Life support and storage','Equipment lockers, an air-treatment unit and reserve cylinders occupy the aft wall. Luggage stays clear of the crew entrance and central aisle.'],
 ['Side walls and window openings','Separate wall bands and posts surround the windows. The glazing has alpha 0.1 with actual openings behind it. A 1.10 × 2.00 m crew entrance remains on the aft starboard side.'],
 ['Faceted nose and cockpit','The nose narrows toward the front. Two sloping planes form the windshield, with triangular side glazing facets; every glass panel is a separate planar solid.'],
 ['Roof and cabin lighting','The roof is a separate panel group. Interior / cutaway hides this group and the port-side wall, keeping the completed cabin accessible for inspection.'],
 ['Exterior armor and service panels','Ceramic-colored hull panels receive a dark impact protection belt and orange identification stripes. The aft service covers align with the interior life-support equipment.'],
 ['Engines and auxiliary systems','Two open-bell main engines are fitted below the floor. The side pods stop ahead of the crew entrance, keeping the door and ramp approach clear.'],
 ['Four stable landing legs','The bottom of each landing pad lies exactly on the y = 0 ground plane. Outward-splayed legs provide a footprint almost 7 m wide, with individual joints, shock absorbers and diagonal braces.'],
 ['Opening door and crew ramp','Rotate the actual door around its hinge. The 1.10 m wide ramp has anti-slip cross treads and two handrails, with its lower landing resting on the ground.'],
 ['Attitude control, sensors and lights','Four corner blocks receive lateral and vertical attitude-control nozzles. Add two landing lights and a terrain sensor on the nose, plus a short communications antenna above.'],
 ['Finishing the exterior','Fit the thermal panels, identification markings and entrance light. Cabin items remain separate objects; the roof and port-side wall can be hidden in the cutaway view.'],
 ['Aft hull and connecting passage','Open the original cabin through its aft wall. The crew module and hangar continue at the same 1.58 m deck level, preserving the original seats and cockpit dimensions.'],
 ['Rooms and pressure-tight passage','The central corridor serves a washroom, galley and four-berth crew room. A pressure bulkhead and a sliding door separate the hangar from the crew spaces.'],
 ['Washroom, shower and galley','The port-side module contains a washbasin, shower tray and toilet, followed by a galley with storage. Fixtures follow the 1.58 m deck level and retain human-scale dimensions.'],
 ['Four-berth crew quarters','Build two separate bunk-bed units for four people. Each berth is 2.10 m long, with about 1 m between levels, plus a pillow, restraint strap, reading light and ladder.'],
 ['Overhead crane and cargo handling','The recorded construction sequence lifts the crate, moves it sideways and aft, then lowers it onto the securing area. The hook and cable retract afterward, leaving the central cargo lane clear.'],
 ['Large main engine pods','Build two long side-mounted engine pods, approximately 2.1 m in diameter, with open aft nozzles. They leave the central hangar door and cargo ramp approach unobstructed.'],
 ['Four lift engines and aft landing supports','Replace the original small engine pair with four larger vertical nozzles. Two additional aft landing legs support the extended cargo hull on the ground.'],
 ['Opening cargo doors and wide ramp','Two separate cargo door leaves rotate around their hinges. The opening provides approximately 4.6 m clear width and connects to a 4.5 m wide, gently sloping ramp that rests on the ground.'],
 ['Crew module and hangar exterior','Separate hull panels enclose the extension. The roofs and port-side panels can be removed in cutaway view; the observation windows retain alpha 0.1.'],
 ['Wings, ailerons and flaps','The swept main wing spans approximately 14.8 m, with a thicker root, thinner tip and slight dihedral. Inboard flaps and outboard ailerons are separate bodies with their own hinge shafts.'],
 ['Twin tail fins and elevators','Fit two outward-canted vertical stabilizers with separate rudders. Horizontal stabilizers attach above the hangar door, keeping the rear loading route open.'],
 ['Cargo variant final inspection','Complete LARK-4C with room signs, a crane control console and aft maneuvering thrusters. Inspect the hangar and crew quarters in dedicated views; the extension remains part of the original construction tutorial.']
];
const construction=()=>createHash('sha256').update(JSON.stringify(journal.events.map(({label,...event})=>event))).digest('hex');
const before=construction(),replacements=new Map(dictionary);
for(const chapter of journal.chapters){const translation=chapters[chapter.id-1];if(!translation)throw Error(`Missing chapter ${chapter.id}`);const title=`${String(chapter.id).padStart(2,'0')} · ${translation[0]}`;replacements.set(chapter.title,title);replacements.set(chapter.text,translation[1]);chapter.title=title;chapter.text=translation[1]}
for(const event of journal.events){if(dictionary.has(event.label))event.label=dictionary.get(event.label);if(/[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/.test(event.label??''))throw Error(`Untranslated operation: ${event.label}`)}
replacements.set('LARK–4 — négyszemélyes leszállóegység','LARK–4 — four-person lander');
replacements.set('LARK–4C — személyzeti és rakodó leszállóegység','LARK–4C — crew and cargo lander');
journal.title=journal.final?.variant?'LARK–4C — crew and cargo lander':'LARK–4 — four-person lander';journal.language='en';
if(construction()!==before)throw Error('Translation changed construction data');
writeFileSync(file,JSON.stringify(journal));
exportBuild(journal);
// Keep future authoring/finalization runs consistent with the English player.
for(const name of ['author.mjs','extension.mjs','commit.mjs','finalize.mjs']){
 const path=new URL(name,import.meta.url);let source=readFileSync(path,'utf8');
 for(const [hu,en]of replacements){if(hu===en)continue;source=source.replaceAll(`'${hu}'`,JSON.stringify(en))}
 writeFileSync(path,source);
}
console.log(JSON.stringify({language:'en',chapters:journal.chapters.length,operations:journal.events.length,distinctLabels:new Set(journal.events.map(e=>e.label)).size,constructionUnchanged:true}));
