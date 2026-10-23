import { useLayoutEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const CUBE = 0.36;
const GAP = 0.42;

/** Target slots: the outer shell of a 5x5x3 block with the centre of the front face left open for the door. */
function buildTargets(): THREE.Vector3[] {
  const targets: THREE.Vector3[] = [];
  for (let x = -2; x <= 2; x++) {
    for (let y = -2; y <= 2; y++) {
      for (let z = -1; z <= 1; z++) {
        const onShell = Math.abs(x) === 2 || Math.abs(y) === 2 || Math.abs(z) === 1;
        const doorOpening = z === 1 && Math.abs(x) <= 1 && Math.abs(y) <= 1;
        if (onShell && !doorOpening) targets.push(new THREE.Vector3(x * GAP, y * GAP, z * GAP));
      }
    }
  }
  return targets;
}

function seeded(i: number) {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

function AssemblingVault({ progress }: { progress: { current: number } }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const door = useRef<THREE.Mesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const cubes = useMemo(() => {
    return buildTargets().map((target, i) => {
      const dir = new THREE.Vector3(seeded(i) - 0.5, seeded(i + 99) - 0.5, seeded(i + 7) - 0.3).normalize();
      return {
        target,
        start: dir.multiplyScalar(7 + seeded(i + 3) * 4),
        delay: seeded(i + 42) * 0.55,
        spin: new THREE.Euler(seeded(i + 5) * 6, seeded(i + 6) * 6, 0),
      };
    });
  }, []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const palette = [new THREE.Color("#22d3ee"), new THREE.Color("#8b5cf6"), new THREE.Color("#2a3a70")];
    cubes.forEach((_, i) => m.setColorAt(i, palette[i % 3]!));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [cubes]);

  useFrame((_, delta) => {
    const p = progress.current;
    const m = mesh.current;
    if (!m) return;
    cubes.forEach((c, i) => {
      const local = ease(Math.min(1, Math.max(0, (p - c.delay) / 0.4)));
      dummy.position.lerpVectors(c.start, c.target, local);
      dummy.rotation.set(c.spin.x * (1 - local), c.spin.y * (1 - local), 0);
      dummy.scale.setScalar(0.4 + 0.6 * local);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;

    if (group.current) group.current.rotation.y += delta * 0.35;
    if (door.current) {
      const d = ease(Math.min(1, Math.max(0, (p - 0.85) / 0.15)));
      door.current.scale.setScalar(Math.max(0.001, d));
      door.current.rotation.z += delta * 0.8;
    }
  });

  return (
    <group ref={group} rotation={[0.3, -0.5, 0]}>
      <instancedMesh ref={mesh} args={[undefined, undefined, cubes.length]}>
        <boxGeometry args={[CUBE, CUBE, CUBE]} />
        <meshStandardMaterial metalness={0.6} roughness={0.35} emissive="#22d3ee" emissiveIntensity={0.12} flatShading />
      </instancedMesh>
      <mesh ref={door} position={[0, 0, GAP + 0.1]}>
        <torusGeometry args={[0.55, 0.06, 6, 8]} />
        <meshStandardMaterial color="#0b1020" emissive="#34d399" emissiveIntensity={1.4} />
      </mesh>
    </group>
  );
}

export default function IntroScene({ progress }: { progress: { current: number } }) {
  return (
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 7], fov: 40 }} gl={{ antialias: true, powerPreference: "low-power", alpha: true }} aria-hidden>
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 5, 6]} intensity={1.5} />
      <pointLight position={[0, 0, 3]} intensity={8} color="#22d3ee" distance={8} />
      <AssemblingVault progress={progress} />
    </Canvas>
  );
}
