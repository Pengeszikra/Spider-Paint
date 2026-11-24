import { PART_SLOTS, COLOR_SLOTS, characterScene, inspectionScene } from './compose.mjs';

const $=id=>document.getElementById(id);
const labelOf=example=>`${example.name}${example.kind==='robot'?' (robot)':example.presentation==='woman'?' (woman)':''}`;
let library,api,selection,mode='three-quarter',downloadURL,pending=false,loading=false;
const report=error=>{
  $('status').classList.add('error');
  $('status').textContent=error instanceof Error?error.message:String(error);
};
async function updateViewer() {
  pending=true;
  if (!api||loading) return false;
  loading=true;
  try {
    while (pending) {
      pending=false;
      const scene=inspectionScene(library,characterScene(library,selection),mode);
      scene.view.edges=$('edges').checked;
      await api.loadScene(scene,true);
    }
    $('status').classList.remove('error');
    $('status').textContent='Live native viewer. Drag to orbit; scroll to zoom. Parts stay separate and editable.';
    return true;
  } catch(error) {
    report(new Error(`Live preview failed: ${error.message}. The scene download remains available.`));
    return false;
  } finally {loading=false;}
}
function render() {
  const scene=characterScene(library,selection),data=scene.metadata.modularCharacter;
  $('metrics').textContent=`${data.triangles} triangles / ${scene.objects.length} interchangeable sections`;
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  downloadURL=URL.createObjectURL(new Blob([JSON.stringify(scene)],{type:'application/json'}));
  $('download').href=downloadURL;$('download').hidden=false;
  for (const button of document.querySelectorAll('[data-view]'))
    button.setAttribute('aria-pressed',String(button.dataset.view===mode));
  void updateViewer();
}
function usePreset(id) {
  const example=library.examples.find(e=>e.id===id);
  if (!example) throw new Error(`Unknown preset: ${id}`);
  selection={...example.spec};$('preset').value=id;
  for (const key of [...PART_SLOTS,...COLOR_SLOTS]) $(key).value=selection[key];
  $('fallback').src=`${id}.svg`;$('fallback').alt=labelOf(example);
  render();
}
function fillGallery() {
  $('designs').replaceChildren(...library.examples.map(example=>{
    const article=document.createElement('article');
    const image=document.createElement('img');image.src=`${example.id}.svg`;image.alt=labelOf(example);image.loading='lazy';
    const caption=document.createElement('div');caption.className='caption';
    const title=document.createElement('h3');title.textContent=example.name;
    const description=document.createElement('p');
    description.textContent=`${example.kind==='robot'?'Robot / ':example.presentation==='woman'?'Woman / ':''}${example.spec.body} / ${example.spec.head} / ${characterScene(library,example.spec).metadata.modularCharacter.triangles} triangles`;
    const button=document.createElement('button');button.textContent='Mix these parts';button.type='button';
    button.addEventListener('click',()=>{usePreset(example.id);$('choices').scrollIntoView({behavior:'smooth',block:'start'});});
    const links=document.createElement('div');links.className='links';
    for (const [label,href] of [
      ['Open 3D',`../../?scene=modular-characters/${example.id}`],
      ['Front view',`${example.id}-front.svg`],
      ['Scene JSON',`${example.id}.scene.json`],
    ]) {
      const link=document.createElement('a');link.textContent=label;link.href=href;
      if (label==='Scene JSON') link.download='';
      links.append(link);
    }
    caption.append(title,description,button,links);article.append(image,caption);return article;
  }));
}

try {
  const response=await fetch('library.json');
  if (!response.ok) throw new Error(`Module library HTTP ${response.status}`);
  library=await response.json();
  for (const key of [...PART_SLOTS,...COLOR_SLOTS]) {
    $(key).replaceChildren(...library.options[key].map(option=>Object.assign(document.createElement('option'),{value:option.id,textContent:option.label})));
    $(key).addEventListener('change',()=>{
      selection={...selection,[key]:$(key).value};$('preset').value='';render();
    });
  }
  $('preset').replaceChildren(
    Object.assign(document.createElement('option'),{value:'',textContent:'Custom combination',disabled:true}),
    ...library.examples.map(example=>Object.assign(document.createElement('option'),{value:example.id,textContent:labelOf(example)})),
  );
  $('preset').addEventListener('change',()=>usePreset($('preset').value));
  for (const button of document.querySelectorAll('[data-view]'))
    button.addEventListener('click',()=>{mode=button.dataset.view;render();});
  $('edges').addEventListener('change',()=>void updateViewer());
  fillGallery();usePreset('robot-loader');$('choices').disabled=false;
  const deadline=performance.now()+45000;
  while (!api&&performance.now()<deadline) {
    api=$('viewer').contentWindow?.__3draft;
    if (!api) await new Promise(resolve=>setTimeout(resolve,150));
  }
  if (!api) throw new Error('The native viewer did not start. Check its engine/network access. Static examples and scene downloads are still available.');
  if (await updateViewer()) $('fallback').hidden=true;
} catch(error) {report(error);}

window.addEventListener('pagehide',()=>{if(downloadURL)URL.revokeObjectURL(downloadURL);});
