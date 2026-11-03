// 우주정거장 아바타 헬퍼 (라코, 스페이 공용)
// 모델 기준: 키 1, 원점 = 서 있을 때 발바닥 / 앉을 때 의자 앉는 면, 정면 +Z
// 포함된 동작: 'Idle'(서기), 'Sit'(앉기), 'Cheer'(반가워하기), 'SitCheer'(앉아서 반가워하기)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map();

async function loadTemplate(url) {
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).then((gltf) => {
      gltf.scene.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
          o.frustumCulled = false; // 스킨 메쉬가 움직일 때 잘려 보이는 것 방지
        }
      });
      return gltf;
    }));
  }
  return cache.get(url);
}

export class StationAvatar {
  constructor(gltf) {
    this.root = SkeletonUtils.clone(gltf.scene);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of gltf.animations) {
      this.actions[clip.name] = this.mixer.clipAction(clip);
    }
    this.seated = false;
    this.current = null;
    this.play('Idle', 0);
    // 같은 동작을 여러 명이 해도 박자가 겹치지 않게
    this.mixer.setTime(Math.random() * 3);
  }

  play(name, fade = 0.35) {
    const next = this.actions[name];
    if (!next || next === this.current) return;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (this.current) this.current.fadeOut(fade);
    this.current = next;
  }

  sit() { this.seated = true; this.play('Sit'); }
  stand() { this.seated = false; this.play('Idle'); }

  // 클릭, 알림 같은 상호작용 때 호출: 잠깐 통통 튀며 반가워하고 원래 자세로 돌아옴
  cheer(seconds = 2) {
    this.play(this.seated ? 'SitCheer' : 'Cheer');
    clearTimeout(this._cheerTimer);
    this._cheerTimer = setTimeout(() => this.play(this.seated ? 'Sit' : 'Idle'), seconds * 1000);
  }
  wave(seconds) { this.cheer(seconds); } // 이전 코드 호환용

  update(delta) { this.mixer.update(delta); }
}

// target: 씬에 있는 우주인 Object3D. 그 자리·키·방향을 이어받고 우주인은 숨김
// options.sit = true 이면 앉은 자세로 시작 (우주인 발 위치가 의자 앉는 면이 되도록 seatHeight 지정 가능)
export async function replaceAstronaut(target, url, { sit = false, seatHeight = 0 } = {}) {
  const gltf = await loadTemplate(url);
  const avatar = new StationAvatar(gltf);
  const raco = avatar.root;
  const parent = target.parent;

  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const parentScale = parent.getWorldScale(new THREE.Vector3());
  raco.scale.setScalar(size.y / parentScale.y);

  const base = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + seatHeight, (box.min.z + box.max.z) / 2);
  parent.worldToLocal(base);
  raco.position.copy(base);
  raco.rotation.y = target.rotation.y;

  parent.add(raco);
  target.visible = false;
  if (sit) avatar.sit();
  return avatar;
}

/* 사용 예시
const avatars = [];
avatars.push(await replaceAstronaut(astroA, '/models/raco_avatar.glb', { sit: true }));
avatars.push(await replaceAstronaut(astroB, '/models/spay_avatar.glb', { sit: true }));

// 클릭하면 반가워하기
// avatars[0].cheer();

const clock = new THREE.Clock();
function animate() {
  const dt = clock.getDelta();
  avatars.forEach((a) => a.update(dt));
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
animate();
*/
