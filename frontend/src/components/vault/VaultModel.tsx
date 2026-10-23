import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { VaultStatus } from "../../lib/types";
import { vaultColor } from "../../lib/status";

/**
 * Low-poly vault: a dark steel body, glowing edge frame and an octagonal door with a dial.
 * Behaviour per status (Frontend Specification §2):
 *   healthy     slow green glow
 *   checking    cyan scanning plane sweeping the door
 *   warning     amber glow
 *   compromised red with glitch flicker and shake
 */
export function VaultModel({ status, spin = 0.12 }: { status: VaultStatus; spin?: number }) {
  const root = useRef<THREE.Group>(null);
  const dial = useRef<THREE.Group>(null);
  const scan = useRef<THREE.Mesh>(null);
  const edgeMat = useRef<THREE.LineBasicMaterial>(null);
  const glowMat = useRef<THREE.MeshStandardMaterial>(null);
  const ringMat = useRef<THREE.MeshStandardMaterial>(null);
  const light = useRef<THREE.PointLight>(null);

  const target = useMemo(() => new THREE.Color(vaultColor(status)), [status]);
  const current = useRef(new THREE.Color(vaultColor(status)));
  const bodyEdges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(2.2, 2.2, 1.4)), []);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    current.current.lerp(target, Math.min(1, delta * 3));
    const color = current.current;

    let intensity = 0.9 + Math.sin(t * 1.2) * 0.25;
    if (status === "checking") intensity = 1.2 + Math.sin(t * 6) * 0.35;
    if (status === "compromised") intensity = Math.random() > 0.92 ? 0.15 : 1.4 + Math.sin(t * 9) * 0.3;

    edgeMat.current?.color.copy(color);
    glowMat.current?.emissive.copy(color);
    ringMat.current?.emissive.copy(color);
    if (glowMat.current) glowMat.current.emissiveIntensity = intensity;
    if (ringMat.current) ringMat.current.emissiveIntensity = intensity * 0.8;
    if (light.current) {
      light.current.color.copy(color);
      light.current.intensity = 6 + intensity * 4;
    }

    if (root.current) {
      root.current.rotation.y += delta * (status === "checking" ? spin * 2.5 : spin);
      if (status === "compromised") {
        root.current.position.x = (Math.random() - 0.5) * 0.06;
        root.current.position.y = (Math.random() - 0.5) * 0.04;
      } else {
        root.current.position.x *= 0.8;
        root.current.position.y = Math.sin(t * 0.8) * 0.05;
      }
    }

    if (dial.current) {
      const speed = status === "checking" ? 2.4 : status === "compromised" ? -0.9 : 0.25;
      dial.current.rotation.z += delta * speed;
    }

    if (scan.current) {
      scan.current.visible = status === "checking";
      scan.current.position.y = Math.sin(t * 2.2) * 1;
    }
  });

  return (
    <group ref={root}>
      {/* Body */}
      <mesh castShadow>
        <boxGeometry args={[2.2, 2.2, 1.4]} />
        <meshStandardMaterial color="#141c36" metalness={0.75} roughness={0.38} flatShading />
      </mesh>
      <lineSegments geometry={bodyEdges}>
        <lineBasicMaterial ref={edgeMat} transparent opacity={0.85} />
      </lineSegments>

      {/* Corner bolts */}
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((y) => (
          <mesh key={`${x}${y}`} position={[x * 0.88, y * 0.88, 0.71]}>
            <cylinderGeometry args={[0.07, 0.07, 0.06, 6]} />
            <meshStandardMaterial color="#2a3660" metalness={0.8} roughness={0.3} />
          </mesh>
        )),
      )}

      {/* Door */}
      <group position={[0, 0, 0.72]}>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.78, 0.78, 0.1, 8]} />
          <meshStandardMaterial color="#1b2549" metalness={0.8} roughness={0.32} flatShading />
        </mesh>
        <mesh position={[0, 0, 0.055]}>
          <torusGeometry args={[0.8, 0.045, 6, 8]} />
          <meshStandardMaterial ref={ringMat} color="#0b1020" emissiveIntensity={1} />
        </mesh>
        <group ref={dial} position={[0, 0, 0.09]}>
          <mesh>
            <cylinderGeometry args={[0.2, 0.2, 0.08, 10]} />
            <meshStandardMaterial ref={glowMat} color="#0b1020" emissiveIntensity={1} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 3]}>
              <boxGeometry args={[1.1, 0.06, 0.05]} />
              <meshStandardMaterial color="#3a4a80" metalness={0.85} roughness={0.25} />
            </mesh>
          ))}
        </group>
        {/* Scanning plane, visible only while checking */}
        <mesh ref={scan} position={[0, 0, 0.16]} visible={false}>
          <planeGeometry args={[2.3, 0.05]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.85} />
        </mesh>
      </group>

      <pointLight ref={light} position={[0, 0, 2.2]} distance={7} decay={1.6} />
    </group>
  );
}
