"use client";

import { ContactShadows, OrbitControls, useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";

/**
 * Halsduken i 3D till heron: modellen från Tripo, förenklad till en tiondel av trianglarna, på mörk botten.
 * Kameran vaggar sakta runt halsduken tills besökaren själv tar tag i den. Loggan läggs som tryck på de två
 * hängande ändarna, strax ovanför fransarna; en bred logga vrids så att den löper längs änden, som text på en halsduk.
 */

const MODEL = "/halsduk/halsduk.glb";
/** Kamerans avstånd: halsduken fyller drygt tre fjärdedelar av höjden. */
const DISTANCE = 2.5;
/** Fransarna tar ungefär den nedersta sjättedelen av modellens höjd. */
const FRINGE = 0.17;

export type HeroLogo = { canvas: HTMLCanvasElement; aspect: number };

function Lights() {
  const gl = useThree((s) => s.gl);
  const env = useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    return texture;
  }, [gl]);
  useEffect(() => () => env.dispose(), [env]);
  return (
    <>
      <primitive object={env} attach="environment" />
      <ambientLight intensity={0.18} />
      {/* Huvudljus snett uppifrån vänster, och ett kallt motljus som tecknar kanten mot den mörka bottnen. */}
      <directionalLight position={[-2.2, 2.6, 2.8]} intensity={1.9} />
      <directionalLight position={[2.6, 1.2, -2.4]} intensity={1.5} color="#cfe0ff" />
      <directionalLight position={[0.6, -1.5, 1.5]} intensity={0.25} />
    </>
  );
}

type End = { x: number; width: number };

/** Var de två hängande ändarna sitter: strålar skjuts framifrån längs en linje strax ovanför fransarna. */
function findEnds(mesh: THREE.Mesh, box: THREE.Box3): End[] {
  const height = box.max.y - box.min.y;
  const y = box.min.y + height * (FRINGE + 0.12);
  const ray = new THREE.Raycaster();
  const steps = 64;
  const runs: { from: number; to: number }[] = [];
  let open: { from: number; to: number } | null = null;
  for (let i = 0; i <= steps; i++) {
    const x = box.min.x + ((box.max.x - box.min.x) * i) / steps;
    ray.set(new THREE.Vector3(x, y, box.max.z + 1), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(mesh, false)[0];
    if (hit) {
      if (open) open.to = x;
      else open = { from: x, to: x };
    } else if (open) {
      runs.push(open);
      open = null;
    }
  }
  if (open) runs.push(open);
  return runs
    .map((r) => ({ x: (r.from + r.to) / 2, width: r.to - r.from }))
    .filter((r) => r.width > 0.05)
    .sort((a, b) => b.width - a.width)
    .slice(0, 2)
    .sort((a, b) => a.x - b.x);
}

/** Tar bort de trianglar i trycket som vetter bort från betraktaren – insidan av tuben. */
function keepFacing(geometry: THREE.BufferGeometry, dir: THREE.Vector3) {
  const pos = geometry.getAttribute("position");
  const nor = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const keep: number[] = [];
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) n.add(new THREE.Vector3().fromBufferAttribute(nor, i + k));
    if (n.normalize().dot(dir) > 0.1) keep.push(i, i + 1, i + 2);
  }
  if (keep.length === pos.count) return geometry;
  const out = new THREE.BufferGeometry();
  const copy = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number) => {
    const arr = new Float32Array(keep.length * size);
    keep.forEach((src, dst) => {
      for (let s = 0; s < size; s++) arr[dst * size + s] = attr.getComponent(src, s);
    });
    return new THREE.Float32BufferAttribute(arr, size);
  };
  out.setAttribute("position", copy(pos, 3));
  out.setAttribute("normal", copy(nor, 3));
  if (uv) out.setAttribute("uv", copy(uv, 2));
  geometry.dispose();
  return out;
}

function Scarf({ color, logo, onReady }: { color: string; logo: HeroLogo | null; onReady: () => void }) {
  const gltf = useGLTF(MODEL).scene;
  const { root, mesh, box } = useMemo(() => {
    const group = new THREE.Group();
    const copy = gltf.clone(true);
    let first: THREE.Mesh | null = null;
    copy.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const material = (m.material as THREE.MeshStandardMaterial).clone();
      // Stickat garn: helt matt, utan metallglans.
      material.roughness = 0.94;
      material.metalness = 0;
      material.envMapIntensity = 0.9;
      m.material = material;
      first ??= m;
    });
    const b = new THREE.Box3().setFromObject(copy);
    const size = b.getSize(new THREE.Vector3());
    const centre = b.getCenter(new THREE.Vector3());
    const s = 1 / (Math.max(size.x, size.y, size.z) || 1);
    copy.position.sub(centre).multiplyScalar(s);
    copy.scale.setScalar(s);
    group.add(copy);
    group.updateMatrixWorld(true);
    return { root: group, mesh: first as THREE.Mesh | null, box: new THREE.Box3().setFromObject(group) };
  }, [gltf]);

  useLayoutEffect(() => {
    (mesh?.material as THREE.MeshStandardMaterial | undefined)?.color.set(color);
  }, [mesh, color]);

  const ends = useMemo(() => (mesh ? findEnds(mesh, box) : []), [mesh, box]);
  const readyRef = useRef(onReady);
  useEffect(() => {
    readyRef.current = onReady;
  });
  useEffect(() => readyRef.current(), [root]);

  const texture = useMemo(() => {
    if (!logo) return null;
    const t = new THREE.CanvasTexture(logo.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, [logo]);
  useEffect(() => () => texture?.dispose(), [texture]);

  const decals = useMemo(() => {
    if (!mesh || !logo || !texture) return [];
    const height = box.max.y - box.min.y;
    const base = box.min.y + height * (FRINGE + 0.035);
    const ray = new THREE.Raycaster();
    return ends.flatMap((end, i) => {
      // En bred logga löper längs änden: nerifrån och upp på den vänstra, uppifrån och ner på den högra.
      const along = logo.aspect > 1.7;
      const across = end.width * 0.62;
      const w = along ? Math.min(height * 0.44, across * logo.aspect) : Math.min(across, end.width * 0.8 * logo.aspect);
      const size = { w, h: w / logo.aspect };
      const span = along ? size.w : size.h;
      const y = base + span / 2;
      ray.set(new THREE.Vector3(end.x, y, box.max.z + 1), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObject(mesh, false)[0];
      if (!hit?.face) return [];
      const normal = hit.face.normal.clone().transformDirection(mesh.matrixWorld).normalize();
      // Ändarna hänger nästan plant; trycket riktas rakt framifrån med en lätt dragning mot ytans lutning.
      const dir = new THREE.Vector3(0, 0, 1).lerp(normal, 0.35).normalize();
      const roll = along ? (i === 0 ? Math.PI / 2 : -Math.PI / 2) : 0;
      const up = new THREE.Vector3(0, 1, 0).applyAxisAngle(dir, roll);
      const orient = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().lookAt(hit.point.clone().add(dir), hit.point, up));
      const geometry = keepFacing(new DecalGeometry(mesh, hit.point, orient, new THREE.Vector3(size.w, size.h, 0.14)), dir);
      return [{ key: `${i}-${logo.aspect}`, geometry }];
    });
  }, [mesh, logo, texture, ends, box]);
  useEffect(() => () => decals.forEach((d) => d.geometry.dispose()), [decals]);

  const material = useMemo(() => (texture ? new THREE.MeshStandardMaterial({ map: texture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 0.92, metalness: 0 }) : null), [texture]);
  useEffect(() => () => material?.dispose(), [material]);

  return (
    <>
      <primitive object={root} />
      {material && decals.map((d) => <mesh key={d.key} geometry={d.geometry} material={material} renderOrder={2} />)}
      <ContactShadows position={[0, box.min.y - 0.012, 0]} scale={2.4} far={1.2} blur={2.6} opacity={0.55} resolution={512} color="#000000" />
    </>
  );
}

/** Kameran vaggar i en mjuk båge framför halsduken tills någon tar tag i den. */
function Sway({ touched }: { touched: React.RefObject<boolean> }) {
  const get = useThree((s) => s.get);
  useFrame(({ clock }) => {
    if (touched.current) return;
    const { camera, controls } = get();
    const a = Math.sin(clock.elapsedTime * 0.32) * 0.5;
    const d = DISTANCE;
    camera.position.set(Math.sin(a) * d, 0.16 + Math.sin(clock.elapsedTime * 0.5) * 0.03, Math.cos(a) * d);
    camera.lookAt(0, 0, 0);
    (controls as { update?: () => void } | null)?.update?.();
  });
  return null;
}

export default function ScarfHero3D({ color, logo, onReady }: { color: string; logo: HeroLogo | null; onReady: () => void }) {
  const touched = useRef(false);
  return (
    <Canvas gl={{ antialias: true, alpha: true, toneMapping: THREE.NeutralToneMapping }} scene={{ environmentIntensity: 0.5 }} dpr={[1, 2]} camera={{ position: [0, 0.16, DISTANCE], fov: 30, near: 0.05, far: 30 }} onPointerDown={() => (touched.current = true)} style={{ touchAction: "pan-y" }}>
      <Lights />
      <Suspense fallback={null}>
        <Scarf color={color} logo={logo} onReady={onReady} />
      </Suspense>
      <Sway touched={touched} />
      <OrbitControls makeDefault enablePan={false} enableZoom={false} enableDamping minPolarAngle={Math.PI * 0.32} maxPolarAngle={Math.PI * 0.62} />
    </Canvas>
  );
}

useGLTF.preload(MODEL);
