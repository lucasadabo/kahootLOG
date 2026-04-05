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

const FORKLIFT_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#e11d48",
];

interface WarehouseBoard3DProps {
  players: Player[];
  currentPlayerId: string | null;
}

const CELL_COUNT = 42;
const CELL_W = 1.35;
const CELL_D = 1.15;
const GAP = 0.12;
const STEP_X = CELL_W + GAP;
const STEP_Z = CELL_D + GAP;

// Row definitions: cells per row and direction
const ROWS = [
  { count: 10, dir: 1 },   // row 0: 1-10 L→R
  { count: 10, dir: -1 },  // row 1: 11-20 R→L
  { count: 10, dir: 1 },   // row 2: 21-30 L→R
  { count: 12, dir: -1 },  // row 3: 31-42 R→L
];

function getCellRowCol(index: number): { row: number; col: number; colCount: number } {
  let remaining = index;
  for (let r = 0; r < ROWS.length; r++) {
    if (remaining < ROWS[r].count) {
      return { row: r, col: remaining, colCount: ROWS[r].count };
    }
    remaining -= ROWS[r].count;
  }
  return { row: 3, col: 11, colCount: 12 };
}

function getCellPosition(index: number): THREE.Vector3 {
  const { row, col, colCount } = getCellRowCol(index);
  const rowDef = ROWS[row];

  const maxCols = 12;
  const totalWidth = (maxCols - 1) * STEP_X;
  const rowWidth = (colCount - 1) * STEP_X;
  const rowOffset = (totalWidth - rowWidth) / 2;

  let x: number;
  if (rowDef.dir === 1) {
    x = -totalWidth / 2 + rowOffset + col * STEP_X;
  } else {
    x = totalWidth / 2 - rowOffset - col * STEP_X;
  }

  const z = (ROWS.length - 1) * STEP_Z / 2 - row * STEP_Z;

  return new THREE.Vector3(x, 0.06, z);
}

function getForkliftPosition(position: number, stackIndex: number, totalAtPosition: number) {
  if (position <= 0) {
    const spacing = 2.2;
    const totalWidth = (totalAtPosition - 1) * spacing;
    const startX = -totalWidth / 2;
    return new THREE.Vector3(startX + stackIndex * spacing, 0.15, (ROWS.length - 1) * STEP_Z / 2 + 2.5);
  }

  const base = getCellPosition(Math.min(position, CELL_COUNT) - 1);
  const offsetX = (stackIndex % 3 - 1) * 0.55;
  const offsetZ = Math.floor(stackIndex / 3) * 0.55;

  return new THREE.Vector3(base.x + offsetX, 0.15, base.z + offsetZ);
}

// Hazard stripe texture for DESAFIO cells
function HazardCell({ position }: { position: THREE.Vector3 }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(0, 0, 128, 128);
    const stripeW = 18;
    ctx.fillStyle = "#f59e0b";
    for (let i = -128; i < 256; i += stripeW * 2) {
      ctx.save();
      ctx.translate(64, 64);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(i, -128, stripeW, 256);
      ctx.restore();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }, []);

  return (
    <mesh ref={meshRef} position={[position.x, position.y + 0.01, position.z]} castShadow receiveShadow>
      <boxGeometry args={[CELL_W, 0.14, CELL_D]} />
      <meshStandardMaterial map={texture} roughness={0.7} />
    </mesh>
  );
}

// Checkered finish texture
function FinishCell({ position }: { position: THREE.Vector3 }) {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    const size = 16;
    for (let y = 0; y < 128; y += size) {
      for (let x = 0; x < 128; x += size) {
        ctx.fillStyle = (x / size + y / size) % 2 === 0 ? "#ffffff" : "#111111";
        ctx.fillRect(x, y, size, size);
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    return tex;
  }, []);

  return (
    <group position={[position.x, position.y + 0.01, position.z]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[CELL_W, 0.14, CELL_D]} />
        <meshStandardMaterial map={texture} roughness={0.5} />
      </mesh>
      <Text position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.2} color="#cc0000" anchorX="center" anchorY="middle" font="https://fonts.gstatic.com/s/fredoka/v14/5aUV9_-1phKLFgshYDc5kQ.woff2" fontWeight={700}>
        FINISH
      </Text>
    </group>
  );
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
      {active && (
        <mesh position={[0, 1.3, 0]}>
          <sphereGeometry args={[0.12, 24, 24]} />
          <meshStandardMaterial color="#facc15" emissive="#facc15" emissiveIntensity={1} />
        </mesh>
      )}

      {/* Body */}
      <mesh castShadow receiveShadow position={[0, 0.32, 0]}>
        <boxGeometry args={[0.75, 0.35, 0.52]} />
        <meshStandardMaterial color={color} metalness={0.5} roughness={0.35} emissive={color} emissiveIntensity={0.15} />
      </mesh>

      {/* Cabin */}
      <mesh castShadow receiveShadow position={[0.05, 0.54, 0]}>
        <boxGeometry args={[0.28, 0.26, 0.36]} />
        <meshStandardMaterial color="#d1d5db" metalness={0.8} roughness={0.25} />
      </mesh>

      {/* Mast */}
      <mesh castShadow position={[-0.2, 0.6, 0]}>
        <boxGeometry args={[0.06, 0.72, 0.06]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh castShadow position={[-0.06, 0.6, 0]}>
        <boxGeometry args={[0.06, 0.72, 0.06]} />
        <meshStandardMaterial color="#475569" metalness={0.7} roughness={0.35} />
      </mesh>

      {/* Forks */}
      <mesh castShadow position={[-0.2, 0.1, 0.1]}>
        <boxGeometry args={[0.44, 0.04, 0.04]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.25} />
      </mesh>
      <mesh castShadow position={[-0.2, 0.1, -0.1]}>
        <boxGeometry args={[0.44, 0.04, 0.04]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.25} />
      </mesh>

      {/* Wheels */}
      {[
        [0.2, 0.08, 0.2],
        [0.2, 0.08, -0.2],
        [-0.15, 0.08, 0.2],
        [-0.15, 0.08, -0.2],
      ].map((wheel, index) => (
        <mesh key={index} castShadow rotation={[Math.PI / 2, 0, 0]} position={wheel as [number, number, number]}>
          <cylinderGeometry args={[0.08, 0.08, 0.06, 24]} />
          <meshStandardMaterial color="#111827" roughness={0.8} />
        </mesh>
      ))}

      <Text position={[0, 0.95, 0]} fontSize={0.2} color="white" anchorX="center" anchorY="middle" outlineWidth={0.02} outlineColor="#000000">
        {label}
      </Text>
    </group>
  );
}

// Warehouse rack with boxes
function Rack({ position, side }: { position: [number, number, number]; side: "left" | "right" }) {
  const flip = side === "left" ? -1 : 1;
  return (
    <group position={position}>
      {/* Uprights - orange */}
      {[-0.55, 0.55].map((z, i) => (
        <mesh key={i} castShadow position={[0, 1.5, z]}>
          <boxGeometry args={[0.08, 3, 0.08]} />
          <meshStandardMaterial color="#ea580c" metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      {/* Shelves */}
      {[0.5, 1.2, 1.9, 2.6].map((y, i) => (
        <mesh key={i} castShadow receiveShadow position={[flip * 0.15, y, 0]}>
          <boxGeometry args={[0.6, 0.06, 1.2]} />
          <meshStandardMaterial color="#78716c" metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      {/* Boxes */}
      {[
        { pos: [flip * 0.15, 0.7, -0.25] as [number, number, number], color: "#a16207", size: [0.4, 0.35, 0.35] as [number, number, number] },
        { pos: [flip * 0.15, 0.7, 0.25] as [number, number, number], color: "#92400e", size: [0.35, 0.3, 0.35] as [number, number, number] },
        { pos: [flip * 0.15, 1.4, 0] as [number, number, number], color: "#a16207", size: [0.45, 0.35, 0.5] as [number, number, number] },
        { pos: [flip * 0.15, 2.1, -0.2] as [number, number, number], color: "#78350f", size: [0.38, 0.35, 0.38] as [number, number, number] },
        { pos: [flip * 0.15, 2.1, 0.25] as [number, number, number], color: "#92400e", size: [0.3, 0.3, 0.3] as [number, number, number] },
      ].map((box, i) => (
        <mesh key={i} castShadow position={box.pos}>
          <boxGeometry args={box.size} />
          <meshStandardMaterial color={box.color} roughness={0.85} />
        </mesh>
      ))}
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

  const desafioCells = new Set([10, 20, 30, 40]);

  return (
    <>
      <color attach="background" args={["#1a1510"]} />
      <fog attach="fog" args={["#1a1510", 18, 38]} />

      <ambientLight intensity={0.8} />
      <directionalLight
        castShadow
        intensity={1.8}
        position={[6, 16, 8]}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <spotLight position={[-8, 12, 4]} angle={0.5} intensity={0.8} penumbra={0.6} color="#fde68a" />
      <spotLight position={[8, 12, -2]} angle={0.5} intensity={0.6} penumbra={0.6} color="#fef3c7" />

      {/* Warehouse floor */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[24, 16]} />
        <meshStandardMaterial color="#78716c" roughness={0.95} />
      </mesh>

      {/* Board area - concrete */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[19, 8]} />
        <meshStandardMaterial color="#a8a29e" roughness={0.9} />
      </mesh>

      {/* Warehouse racks on both sides */}
      {Array.from({ length: 6 }).map((_, i) => (
        <Rack key={`left-${i}`} position={[-10.5, 0, 3.5 - i * 1.8]} side="left" />
      ))}
      {Array.from({ length: 6 }).map((_, i) => (
        <Rack key={`right-${i}`} position={[10.5, 0, 3.5 - i * 1.8]} side="right" />
      ))}

      {/* START marker */}
      <group position={[cells[0].position.x - STEP_X, 0.06, cells[0].position.z]}>
        <mesh castShadow receiveShadow position={[0, 0.01, 0]}>
          <boxGeometry args={[CELL_W, 0.14, CELL_D]} />
          <meshStandardMaterial color="#16a34a" roughness={0.6} />
        </mesh>
        <Text position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.24} color="#ffffff" anchorX="center" anchorY="middle" fontWeight={700}>
          START
        </Text>
      </group>

      {/* Board cells */}
      {cells.map((cell) => {
        if (cell.number === 42) {
          return <FinishCell key={cell.number} position={cell.position} />;
        }

        if (desafioCells.has(cell.number)) {
          return (
            <group key={cell.number}>
              <HazardCell position={cell.position} />
              <Text
                position={[cell.position.x, cell.position.y + 0.13, cell.position.z + 0.15]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.12}
                color="#f59e0b"
                anchorX="center"
                anchorY="middle"
                fontWeight={700}
              >
                DESAFIO
              </Text>
              <Text
                position={[cell.position.x, cell.position.y + 0.13, cell.position.z - 0.18]}
                rotation={[-Math.PI / 2, 0, 0]}
                fontSize={0.22}
                color="#f59e0b"
                anchorX="center"
                anchorY="middle"
                fontWeight={700}
              >
                {cell.number}
              </Text>
            </group>
          );
        }

        // Alternate gold and dark gray
        const isGold = cell.number % 2 === 1;
        const cellColor = isGold ? "#b59532" : "#3f3f46";
        const textColor = isGold ? "#1a1510" : "#e7e5e4";

        return (
          <group key={cell.number} position={cell.position}>
            <mesh castShadow receiveShadow position={[0, 0.01, 0]}>
              <boxGeometry args={[CELL_W, 0.14, CELL_D]} />
              <meshStandardMaterial color={cellColor} metalness={0.2} roughness={0.65} />
            </mesh>
            <Text
              position={[0, 0.12, 0]}
              rotation={[-Math.PI / 2, 0, 0]}
              fontSize={0.28}
              color={textColor}
              anchorX="center"
              anchorY="middle"
              fontWeight={700}
            >
              {cell.number}
            </Text>
          </group>
        );
      })}

      {/* Forklift pawns */}
      {Array.from(playersByPosition.entries()).flatMap(([position, positionPlayers]) =>
        positionPlayers.map((player, index) => {
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

      <OrbitControls enablePan={false} minDistance={10} maxDistance={22} minPolarAngle={0.5} maxPolarAngle={1.3} />
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
          <p>🟡 Dourada = ímpar · ⬛ Cinza = par</p>
          <p>⚠️ DESAFIO: casas 10, 20, 30, 40</p>
        </div>
      </div>

      <div className="h-[520px] w-full">
        <Canvas shadows gl={{ antialias: true }} camera={{ position: [0, 13, 10], fov: 40 }}>
          <WarehouseScene players={players} currentPlayerId={currentPlayerId} />
        </Canvas>
      </div>
    </div>
  );
}
