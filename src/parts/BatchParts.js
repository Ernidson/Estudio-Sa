const history = new WeakMap();
const running = new WeakSet();

export async function generateBatch(manager, map, report) {
  if (running.has(manager)) return;
  running.add(manager);
  const created = [];
  const notes = [];
  const regions = [...map.regions.values()];
  const bones = [];
  function visit(bone) {
    if (!bone) return;
    bones.push(bone.id);
    bone.children.forEach(visit);
  }
  visit(manager.rig.getRoot());
  regions.sort((a,b) => bones.indexOf(a.boneId) - bones.indexOf(b.boneId));
  try {
    for (const [index, region] of regions.entries()) {
      report((index + 1) + '/' + regions.length + ' · ' + region.name);
      try {
        if (manager.getAllParts().some(p => p.regionId === region.id || (!p.regionId && p.boneId === region.boneId))) {
          notes.push(region.name + ' · peça existente');
          continue;
        }
        if (!manager.rig.getBone(region.boneId)) throw Error('sem osso');
        if (!region.raster) throw Error('sem máscara raster');
        const mask = map.generateMask(region.id);
        if (!mask) throw Error('máscara vazia');
        const part = await manager.createPartFromRegion(manager.characterObject, region.boneId, structuredClone(mask), region.name);
        part.regionId = region.id;
        created.push({id:part.id, region, generated:region.generated});
        region.generated = true;
      } catch (error) {
        notes.push(region.name + ' · ' + error.message);
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  } finally {
    running.delete(manager);
    if (created.length) history.set(manager, created);
    report([created.length + ' peças criadas', ...notes].join('\n'));
  }
}

export function undoBatch(manager) {
  if (!manager || running.has(manager)) return;
  for (const item of history.get(manager) || []) {
    if (!manager.getPart(item.id)) continue;
    manager.removePart(item.id);
    item.region.generated = item.generated;
  }
  history.delete(manager);
}

export function hasBatch(manager) {
  return history.has(manager);
}
