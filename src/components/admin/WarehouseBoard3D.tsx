import { useMemo } from "react";
import boardImage from "./tabuleiro_vazio5.png";

interface Player {
  id: string;
  nickname: string;
  cor_empilhadeira: string;
  posicao: number;
}

interface WarehouseBoard3DProps {
  players: Player[];
  currentPlayerId: string | null;
}

interface BoardPoint {
  x: number;
  y: number;
}

interface TrackCleaner {
  x: number;
  y: number;
  w: number;
  h: number;
  radius: number;
}

const CELL_COUNT = 42;
const IMAGE_W = 1698;
const IMAGE_H = 926;
const CHALLENGE_CELLS = new Set([10, 20, 30, 40]);
const TRACK_CLEANERS: TrackCleaner[] = [
  { x: 530, y: 300, w: 742, h: 68, radius: 18 },
  { x: 520, y: 390, w: 794, h: 76, radius: 26 },
  { x: 470, y: 480, w: 848, h: 78, radius: 28 },
  { x: 455, y: 590, w: 836, h: 78, radius: 28 },
  { x: 525, y: 704, w: 760, h: 76, radius: 18 },
  { x: 1175, y: 610, w: 112, h: 170, radius: 26 },
  { x: 1210, y: 410, w: 112, h: 150, radius: 26 },
  { x: 470, y: 400, w: 96, h: 260, radius: 28 },
];

const BOARD_POINTS: Record<number, BoardPoint> = {
  0: { x: 480, y: 742 },
  1: { x: 574, y: 742 },
  2: { x: 667, y: 742 },
  3: { x: 760, y: 742 },
  4: { x: 853, y: 742 },
  5: { x: 946, y: 742 },
  6: { x: 1038, y: 742 },
  7: { x: 1131, y: 742 },
  8: { x: 1224, y: 742 },
  9: { x: 1228, y: 646 },
  10: { x: 1145, y: 626 },
  11: { x: 1053, y: 626 },
  12: { x: 961, y: 626 },
  13: { x: 868, y: 626 },
  14: { x: 775, y: 626 },
  15: { x: 682, y: 626 },
  16: { x: 590, y: 626 },
  17: { x: 506, y: 626 },
  18: { x: 506, y: 536 },
  19: { x: 616, y: 518 },
  20: { x: 707, y: 518 },
  21: { x: 801, y: 518 },
  22: { x: 894, y: 518 },
  23: { x: 987, y: 518 },
  24: { x: 1080, y: 518 },
  25: { x: 1173, y: 518 },
  26: { x: 1266, y: 518 },
  27: { x: 1265, y: 426 },
  28: { x: 1176, y: 426 },
  29: { x: 1083, y: 426 },
  30: { x: 990, y: 426 },
  31: { x: 897, y: 426 },
  32: { x: 804, y: 426 },
  33: { x: 711, y: 426 },
  34: { x: 619, y: 426 },
  35: { x: 568, y: 333 },
  36: { x: 661, y: 333 },
  37: { x: 755, y: 333 },
  38: { x: 848, y: 333 },
  39: { x: 941, y: 333 },
  40: { x: 1034, y: 333 },
  41: { x: 1127, y: 333 },
  42: { x: 1219, y: 333 },
};

function toStyle(point: BoardPoint) {
  return {
    left: `${(point.x / IMAGE_W) * 100}%`,
    top: `${(point.y / IMAGE_H) * 100}%`,
  };
}

function rectToStyle(rect: TrackCleaner) {
  return {
    left: `${(rect.x / IMAGE_W) * 100}%`,
    top: `${(rect.y / IMAGE_H) * 100}%`,
    width: `${(rect.w / IMAGE_W) * 100}%`,
    height: `${(rect.h / IMAGE_H) * 100}%`,
    borderRadius: `${rect.radius}px`,
  };
}

function getBoardPoint(position: number) {
  const safePosition = Math.max(0, Math.min(CELL_COUNT, position));
  return BOARD_POINTS[safePosition] ?? BOARD_POINTS[0];
}

function getPlayerOffset(index: number, total: number) {
  if (total <= 1) return { x: 0, y: 0 };

  const radius = total <= 3 ? 26 : 34;
  const angle = (-Math.PI / 2) + (index / total) * Math.PI * 2;
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
  };
}

function MiniForklift({ color, nickname, active }: { color: string; nickname: string; active: boolean }) {
  return (
    <div className="relative flex flex-col items-center">
      <div
        className={[
          "absolute bottom-[calc(100%+0.28rem)] max-w-24 rounded-lg border px-2 py-1",
          "bg-slate-950/90 text-[clamp(0.55rem,1.15vw,0.8rem)] font-display font-bold leading-none text-white shadow-lg",
          active ? "border-yellow-200 text-yellow-100" : "border-white/40",
        ].join(" ")}
      >
        <span className="block truncate">{nickname}</span>
        <span className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-inherit bg-slate-950/90" />
      </div>

      <div
        className={[
          "relative h-[clamp(1.4rem,3.25vw,2.75rem)] w-[clamp(1.9rem,4.5vw,3.6rem)]",
          "drop-shadow-[0_6px_8px_rgba(0,0,0,0.65)]",
          active ? "scale-110" : "",
        ].join(" ")}
      >
        <div
          className="absolute bottom-[18%] left-[18%] h-[42%] w-[52%] rounded-[0.25rem] border border-black/35"
          style={{ backgroundColor: color }}
        />
        <div className="absolute bottom-[48%] left-[36%] h-[32%] w-[30%] rounded-t-[0.25rem] border border-black/35 bg-slate-800" />
        <div className="absolute bottom-[55%] left-[43%] h-[18%] w-[16%] rounded-sm bg-slate-300/80" />
        <div className="absolute bottom-[30%] left-[8%] h-[50%] w-[7%] rounded-sm bg-slate-800" />
        <div className="absolute bottom-[28%] left-[2%] h-[7%] w-[24%] rounded-sm bg-slate-300" />
        <div className="absolute bottom-[15%] left-[22%] h-[22%] w-[22%] rounded-full border border-black/60 bg-slate-950" />
        <div className="absolute bottom-[15%] right-[22%] h-[22%] w-[22%] rounded-full border border-black/60 bg-slate-950" />
        <div className="absolute bottom-[66%] left-[56%] h-[14%] w-[14%] rounded-full bg-yellow-300 shadow-[0_0_10px_rgba(250,204,21,0.85)]" />
      </div>
    </div>
  );
}

export function WarehouseBoard3D({ players, currentPlayerId }: WarehouseBoard3DProps) {
  const playersByPosition = useMemo(() => {
    const grouped = new Map<number, Player[]>();
    players.forEach((player) => {
      const key = Math.max(0, Math.min(CELL_COUNT, player.posicao));
      grouped.set(key, [...(grouped.get(key) ?? []), player]);
    });
    return grouped;
  }, [players]);

  return (
    <div className="rounded-[2rem] border border-border bg-card/70 shadow-[var(--shadow-card)] overflow-hidden">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 px-6 py-4 border-b border-border bg-background/40">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground font-body">Tabuleiro do armazem</p>
          <h2 className="text-2xl font-display font-bold text-foreground">Progresso em tempo real</h2>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 text-xs font-body text-muted-foreground">
          <span className="rounded-lg border border-border bg-card/70 px-3 py-2">Casas 1 a 42</span>
          <span className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">Desafios 10, 20, 30, 40</span>
          <span className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-primary">Jogador atual em destaque</span>
        </div>
      </div>

      <div className="bg-slate-950">
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: `${IMAGE_W} / ${IMAGE_H}` }}>
          <img
            src={boardImage}
            alt="Tabuleiro de armazem"
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />



          {Array.from({ length: CELL_COUNT }, (_, index) => index + 1).map((cellNumber) => {
            const isChallenge = CHALLENGE_CELLS.has(cellNumber);

            return (
              <div
                key={cellNumber}
                className={[
                  "absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center",
                  "h-[clamp(1.55rem,3.85vw,3.35rem)] w-[clamp(1.55rem,3.85vw,3.35rem)] rounded-full",
                  "font-display text-[clamp(0.85rem,2vw,1.6rem)] font-black leading-none shadow-[0_4px_12px_rgba(0,0,0,0.55)]",
                  isChallenge
                    ? "border-2 border-amber-100 bg-amber-400 text-slate-950"
                    : "border-2 border-white/80 bg-transparent text-white",
                  cellNumber === CELL_COUNT ? "border-red-200 bg-red-600/70 text-white" : "",
                ].join(" ")}
                style={toStyle(getBoardPoint(cellNumber))}
                aria-label={`Casa ${cellNumber}`}
              >
                {cellNumber}
              </div>
            );
          })}

          {Array.from(playersByPosition.entries()).flatMap(([position, positionPlayers]) =>
            positionPlayers.map((player, index) => {
              const point = getBoardPoint(position);
              const offset = getPlayerOffset(index, positionPlayers.length);
              const active = player.id === currentPlayerId;

              return (
                <div
                  key={player.id}
                  className={[
                    "absolute z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-all duration-500",
                    active ? "drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]" : "",
                  ].join(" ")}
                  style={{
                    ...toStyle(point),
                    marginLeft: offset.x,
                    marginTop: offset.y,
                  }}
                  title={`${player.nickname} - casa ${position}`}
                  aria-label={`${player.nickname} na casa ${position}`}
                >
                  <MiniForklift color={player.cor_empilhadeira || "#3b82f6"} nickname={player.nickname} active={active} />
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
