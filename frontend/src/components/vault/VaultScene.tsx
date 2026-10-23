import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VaultStatus } from "../../lib/types";
import { VaultModel } from "./VaultModel";

export interface OrbitBlock {
  id: string;
  color: string;
}

/** One small cube per file, orbiting the vault and colored by that file's status. */
function OrbitBlocks({ blocks, status }: { blocks: OrbitBlock[]; status: VaultStatus }) {
  const group = useRef<THREE.Group>(null);
  const meshes = useRef<(THREE.Mesh | null)[]>([]);
  const radius = 2.25;

  const layout = useMemo(
    () =>
      blocks.map((b, i) => ({
        ...b,
        angle: (i / Math.max(blocks.length, 1)) * Math.PI * 2,
        tilt: ((i % 3) - 1) * 0.35,
      })),
    [blocks],
  );

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (group.current) group.current.rotation.y += delta * (status === "checking" ? 0.9 : 0.25);
    meshes.current.forEach((m, i) => {
      if (!m) return;
      m.rotation.x += delta * 0.6;
      m.rotation.y += delta * 0.8;
      m.position.y = (layout[i]?.tilt ?? 0) + Math.sin(t * 1.4 + i) * 0.08;
    });
  });

  return (
    <group ref={group} rotation={[0.25, 0, 0]}>
      {layout.map((b, i) => (
        <mesh
          key={b.id}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          position={[Math.cos(b.angle) * radius, b.tilt, Math.sin(b.angle) * radius]}
        >
          <boxGeometry args={[0.18, 0.18, 0.18]} />
          <meshStandardMaterial color={b.color} emissive={b.color} emissiveIntensity={0.65} flatShading />
        </mesh>
      ))}
    </group>
  );
}

export default function VaultScene({
  status,
  blocks,
  spin = 0.12,
  cameraZ = 6.2,
}: {
  status: VaultStatus;
  blocks: OrbitBlock[];
  spin?: number;
  cameraZ?: number;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [0, 0.6, cameraZ], fov: 38 }}
      gl={{ antialias: true, powerPreference: "low-power", alpha: true }}
      aria-hidden
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[4, 6, 5]} intensity={1.4} />
      <directionalLight position={[-5, -2, -4]} intensity={0.35} color="#8b5cf6" />
      <VaultModel status={status} spin={spin} />
      <OrbitBlocks blocks={blocks} status={status} />
    </Canvas>
  );
}
