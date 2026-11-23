import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Bone } from '../src/rigging/Bone.js';
import { PieceMap } from '../src/parts/PieceMap.js';
import { encodeRegion, paintRegion, rasterBounds, rasterContains } from '../src/segmentation/RasterRegion.js';

test('editing a bone preserves rotation and independent scale', () => {
  const bone = new Bone();
  bone.localTransform.scale(2, 0.75);
  bone.setLocalRotation(120);
  bone.setLocalPosition(-4, 9);
  assert.ok(Math.abs(bone.getLocalRotation() - 120) < 1e-9);
  assert.ok(Math.abs(Math.hypot(...bone.localTransform.m.slice(0, 2)) - 2) < 1e-9);
  bone.setLocalRotation(0);
  assert.deepEqual(bone.getLocalPosition(), {x: -4, y: 9});
});

test('raster ownership survives gaps, paint, erase and JSON', () => {
  const a = { raster: encodeRegion([1,0,1,1,0,0], 3, 2) };
  const b = { raster: encodeRegion([0,0,0,0,1,1], 3, 2) };
  const alpha = [1,0,1,1,1,1];
  assert.deepEqual(rasterBounds(a.raster), { x:0, y:0, width:3, height:2 });
  paintRegion([a,b], a, 1, 1, 1, alpha, 3, 2);
  assert.ok(rasterContains(a.raster, 1, 1));
  assert.ok(!rasterContains(b.raster, 1, 1));
  assert.ok(!rasterContains(a.raster, 1, 0));
  paintRegion([a,b], null, 1, 1, 0, alpha, 3, 2);
  assert.ok(!rasterContains(a.raster, 1, 1));
  assert.deepEqual(JSON.parse(JSON.stringify(a)), a);
});

test('old polygon-only maps can still generate a cut', () => {
  const pts = [{x:-3,y:-2},{x:4,y:-2},{x:1,y:8}];
  const map = PieceMap.fromJSON({regions:{head:{boneId:'head',points:pts}}},
    {imageWidth:30, imageHeight:40}, null, null);
  assert.equal(map.generateMask('head').type,'polygon');
  assert.deepEqual(map.generateMask('head').bounds, {x:12,y:18,width:7,height:10});
});

test('a pose can be restored after reopening with a rotated bind joint', () => {
  const shoulder = new Bone({id:'shoulder'});
  const elbow = new Bone({id:'elbow', localPosition:{x:20,y:0}});
  shoulder.addChild(elbow);
  shoulder.setLocalRotation(20);
  shoulder.computeWorldTransform();
  const initial = elbow.worldTransform.clone();
  shoulder.poseAt(65);
  shoulder.computeWorldTransform();
  assert.ok(!elbow.worldTransform.equals(initial));
  const restored = Bone.fromJSON(shoulder.toJSON());
  restored.addChild(elbow);
  restored.restorePose();
  restored.computeWorldTransform();
  assert.ok(elbow.worldTransform.equals(initial));
});

test('moving pivot to joint preserves texture under affine canvas and piece transforms', async () => {
  const {Part} = await import('../src/parts/Part.js');
  const {createTransform} = await import('../src/core/Transform2D.js');
  const part = new Part({imageWidth:83,imageHeight:29,localPosition:{x:91,y:-17},
    localRotation:24,localScale:{x:1.3,y:0.7}});
  const frame = createTransform(280,140,32,1.8,0.6);
  const corner = () => frame.clone().multiply(part.localTransform)
    .transformPoint(-part.pivot.x*part.imageWidth,-part.pivot.y*part.imageHeight);
  const before = corner();
  part.placePivotAt(0,0);
  const after = corner();
  assert.ok(Math.hypot(before.x-after.x,before.y-after.y)<1e-8);
  part.computeWorldTransform(frame);
  assert.deepEqual(part.getWorldPivotPoint(),frame.transformPoint(0,0));
});
