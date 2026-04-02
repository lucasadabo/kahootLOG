import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

interface Player {
  id: string;
  nickname: string;
  cor_empilhadeira: string;
  posicao: number;
}

// Unique intense colors for up to 8 players
const FORKLIFT_COLORS = [
  "#ef4444", // red
  "#3b82f6", // blue
  "#22c55e", // green
  "#f59e0b", // amber
  "#a855f7", // purple
  "#ec4899", // pink
  "#14b8a6", // teal
  "#e11d48", // rose
];

interface WarehouseBoard3DProps {
  players: Player[];
  currentPlayerId: string | null;
}

const CELL_COUNT = 42;
const COLUMNS = 6;
const ROWS = 7;
const CELL_GAP_X = 1.85;
const CELL_GAP_Z = 1.55;

function getCellPosition(index: number) {
  const row = Math.floor(index / COLUMNS);
  const rawColumn = index % COLUMNS;
  const column = row % 2 === 0 ? rawColumn : COLUMNS - 1 - rawColumn;

  return new THREE.Vector3(
    (column - (COLUMNS - 1) / 2) * CELL_GAP_X,
    0.2,
    ((ROWS - 1) / 2 - row) * CELL_GAP_Z,
  );
}

function getForkliftPosition(position: number, stackIndex: number, totalAtPosition: number) {
  if (position <= 0) {
    // Spread out at entrance area — more space between forklifts
    const spacing = 1.4;
    const totalWidth = (totalAtPosition - 1) * spacing;
    const startX = -7.4 - totalWidth / 2;
    return new THREE.Vector3(startX + stackIndex * spacing, 0.25, 5.5);
  }

  const base = getCellPosition(Math.min(position, CELL_COUNT) - 1);
  const offsetX = (stackIndex % 2) * 0.5 - 0.25;
  const offsetZ = Math.floor(stackIndex / 2) * 0.5 - 0.25;

  return new THREE.Vector3(base.x + offsetX, 0.25, base.z + offsetZ);
}

function ForkliftPawn({ color, label, active, position }: { color: string; label: string; active: boolean; position: THREE.Vector3 }) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (groupRef.current) {
      groupRef.current.position.copy(position);
    }
  }, []);

  useFrame((_, delta) => {
    if (!groupRef.current) return;

    groupRef.current.position.lerp(position, 1 - Math.exp(-4 * delta));
  });

  return (
    <group ref={groupRef}>
      {active && <mesh position={[0, 1.5, 0]}>
        <sphereGeometry args={[0.14, 24, 24]} />
        <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={0.8} />
      </mesh>}

      <mesh castShadow receiveShadow position={[0, 0.32, 0]}>
        <boxGeometry args={[0.72, 0.34, 0.54]} />
        <meshStandardMaterial color={color} metalness={0.55} roughness={0.35} />
      </mesh>

      <mesh castShadow receiveShadow position={[0.06, 0.62, 0]}>
        <boxGeometry args={[0.34, 0.32, 0.42]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.85} roughness={0.25} />
      </mesh>

      <mesh castShadow position={[-0.24, 0.72, 0]}>
        <boxGeometry args={[0.08, 0.9, 0.08]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.35} />
      </mesh>

      <mesh castShadow position={[-0.08, 0.72, 0]}>
        <boxGeometry args={[0.08, 0.9, 0.08]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.35} />
      </mesh>

      <mesh castShadow position={[-0.24, 0.12, 0.12]}>
        <boxGeometry args={[0.52, 0.05, 0.05]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.25} />
      </mesh>

      <mesh castShadow position={[-0.24, 0.12, -0.12]}>
        <boxGeometry args={[0.52, 0.05, 0.05]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.25} />
      </mesh>

      {[
        [0.22, 0.1, 0.24],
        [0.22, 0.1, -0.24],
        [-0.18, 0.1, 0.24],
        [-0.18, 0.1, -0.24],
      ].map((wheel, index) => (
        <mesh key={index} castShadow rotation={[Math.PI / 2, 0, 0]} position={wheel as [number, number, number]}>
          <cylinderGeometry args={[0.1, 0.1, 0.08, 24]} />
          <meshStandardMaterial color="#111827" roughness={0.8} />
        </mesh>
      ))}

      <Text position={[0, 1.1, 0]} fontSize={0.22} color="white" anchorX="center" anchorY="middle">
        {label}
      </Text>
    </group>
  );
}

function WarehouseScene({ players, currentPlayerId }: WarehouseBoard3DProps) {
  const cells = useMemo(() => Array.from({ length: CELL_COUNT }, (_, index) => ({
    number: index + 1,
    position: getCellPosition(index),
  })), []);

  const playersByPosition = useMemo(() => {
    const grouped = new Map<number, Player[]>();

    players.forEach((player) => {
      const key = Math.max(0, Math.min(42, player.posicao));
      const list = grouped.get(key) ?? [];
      list.push(player);
      grouped.set(key, list);
    });

    return grouped;
  }, [players]);

  return (
    <>
      <color attach="background" args={["#10151d"]} />
      <fog attach="fog" args={["#10151d", 16, 34]} />

      <ambientLight intensity={1.2} />
      <directionalLight
        castShadow
        intensity={2}
        position={[8, 14, 8]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <spotLight position={[-10, 14, 6]} angle={0.45} intensity={1.2} penumbra={0.5} color="#7dd3fc" />

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[18, 16]} />
        <meshStandardMaterial color="#2a3441" roughness={0.95} />
      </mesh>

      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[12.8, 11.6]} />
        <meshStandardMaterial color="#3a4654" roughness={0.85} />
      </mesh>

      {[-7.2, 7.2].map((x, sideIndex) => (
        <group key={sideIndex} position={[x, 0, 0]}>
          {Array.from({ length: 5 }).map((_, rackIndex) => (
            <group key={rackIndex} position={[0, 0, 4.8 - rackIndex * 2.4]}>
              <mesh castShadow receiveShadow position={[0, 1.15, 0]}>
                <boxGeometry args={[0.5, 2.2, 1.4]} />
                <meshStandardMaterial color="#334155" metalness={0.55} roughness={0.45} />
              </mesh>
              {[0.45, 1.0, 1.55].map((y, shelfIndex) => (
                <mesh key={shelfIndex} castShadow receiveShadow position={[0, y, 0]}>
                  <boxGeometry args={[1.45, 0.08, 1.4]} />
                  <meshStandardMaterial color="#64748b" metalness={0.5} roughness={0.4} />
                </mesh>
              ))}
              {[-0.32, 0, 0.32].map((zOffset, boxIndex) => (
                <mesh key={boxIndex} castShadow receiveShadow position={[0.14, 0.55 + boxIndex * 0.55, zOffset]}>
                  <boxGeometry args={[0.42, 0.38, 0.32]} />
                  <meshStandardMaterial color={boxIndex % 2 === 0 ? "#f59e0b" : "#22c55e"} roughness={0.85} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}

      <mesh receiveShadow position={[-7.3, 0.15, 5.5]}>
        <boxGeometry args={[2.4, 0.2, 1.2]} />
        <meshStandardMaterial color="#1e293b" roughness={0.65} />
      </mesh>

      <Text position={[-7.3, 0.45, 5.5]} fontSize={0.26} color="#e2e8f0" anchorX="center" anchorY="middle">
        Entrada
      </Text>

      {cells.map((cell) => {
        const specialColor = cell.number === 10 || cell.number === 40
          ? "#fb7185"
          : cell.number === 20
            ? "#2dd4bf"
            : cell.number === 30
              ? "#facc15"
              : "#cbd5e1";

        return (
          <group key={cell.number} position={cell.position}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[1.25, 0.18, 0.95]} />
              <meshStandardMaterial color={specialColor} metalness={0.15} roughness={0.65} />
            </mesh>
            <Text position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.22} color="#0f172a" anchorX="center" anchorY="middle">
              {cell.number}
            </Text>
          </group>
        );
      })}

      {Array.from(playersByPosition.entries()).flatMap(([position, positionPlayers]) =>
        positionPlayers.map((player, index) => {
          // Use ordered index from full players array for unique color
          const playerGlobalIndex = players.findIndex(p => p.id === player.id);
          const color = FORKLIFT_COLORS[playerGlobalIndex % FORKLIFT_COLORS.length];
          return (
            <ForkliftPawn
              key={player.id}
              color={color}
              label={player.nickname.slice(0, 1).toUpperCase()}
              active={player.id === currentPlayerId}
              position={getForkliftPosition(position, index, positionPlayers.length)}
            />
          );
        }),
      )}

      <OrbitControls enablePan={false} minDistance={12} maxDistance={20} minPolarAngle={0.8} maxPolarAngle={1.35} />
    </>
  );
}

export function WarehouseBoard3D({ players, currentPlayerId }: WarehouseBoard3DProps) {
  return (
    <div className="rounded-[2rem] border border-border bg-card/70 shadow-[var(--shadow-card)] overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border bg-background/40">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground font-body">Tabuleiro do armazém</p>
          <h2 className="text-2xl font-display font-bold text-foreground">Progresso em tempo real</h2>
        </div>
        <div className="text-right text-sm font-body text-muted-foreground">
          <p>Casas especiais: 10, 20, 30, 40</p>
          <p>Empilhadeira brilhando = jogador da vez</p>
        </div>
      </div>

      <div className="h-[520px] w-full">
        <Canvas shadows gl={{ antialias: true }} camera={{ position: [0, 11.5, 9], fov: 42 }}>
          <WarehouseScene players={players} currentPlayerId={currentPlayerId} />
        </Canvas>
      </div>
    </div>
  );
}