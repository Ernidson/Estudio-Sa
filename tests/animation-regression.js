import assert from 'node:assert/strict';
import test from 'node:test';
import {samplePose,turn} from '../src/animation/PoseClip.js';

const pose=x=>({bones:{root:[1,0,0,1,x,0]},pieces:{hand:[x,0,0,1,1,0.5,0.5]}});
test('four curves interpolate local bone and piece channels',()=>{
  for (const [curve,expected] of [['linear',0.25],['ease-in',0.0625],['ease-out',0.4375],['ease-in-out',0.15625]]) {
    const keys=[{time:0,curve,pose:pose(0)},{time:1,pose:pose(1)}];
    const sample=samplePose(keys,0.25);
    assert.equal(sample.bones.root[4],expected);
    assert.equal(sample.pieces.hand[0],expected);
    assert.equal(samplePose(keys,1),keys[1].pose);
  }
});
test('rotation crosses the short arc in either direction',()=>{
  assert.equal(turn(170,-170,0.5),180);
  assert.equal(turn(-170,170,0.5),-180);
});
