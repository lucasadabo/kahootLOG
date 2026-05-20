import { useEffect, useState } from "react";
import { Trophy, Medal, Star } from "lucide-react";

interface Player {
  id: string;
  nickname: string;
  cor_empilhadeira: string;
  posicao: number;
}

interface PodiumOverlayProps {
  players: Player[];
  onClose: () => void;
}

function Confetti() {
  const pieces = Array.from({ length: 48 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    delay: `${Math.random() * 2}s`,
    duration: `${2.5 + Math.random() * 2}s`,
    color: ["#FFD700", "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#DDA0DD", "#F7DC6F"][i % 7],
    size: `${6 + Math.random() * 8}px`,
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute top-0 rounded-sm opacity-0"
          style={{
            left: p.left,
            width: p.size,
            height: p.size,
            backgroundColor: p.color,
            animation: `confetti-fall ${p.duration} ${p.delay} ease-in forwards`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0%   { transform: translateY(-20px) rotate(0deg);   opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export function PodiumOverlay({ players, onClose }: PodiumOverlayProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 100);
    return () => window.clearTimeout(t);
  }, []);

  // Sort by position descending, take top 3
  const sorted = [...players].sort((a, b) => b.posicao - a.posicao);
  const top3 = sorted.slice(0, 3);
  const [first, second, third] = top3;

  // Podium order: 2nd | 1st | 3rd
  const podiumOrder = [second, first, third].filter(Boolean);

  const podiumConfig = [
    { place: 2, height: "h-28", label: "2º", icon: <Medal className="w-7 h-7 text-slate-300" />, color: "from-slate-400 to-slate-600", delay: "delay-300" },
    { place: 1, height: "h-40", label: "1º", icon: <Trophy className="w-9 h-9 text-yellow-300" />, color: "from-yellow-400 to-yellow-600", delay: "delay-100" },
    { place: 3, height: "h-20", label: "3º", icon: <Star className="w-6 h-6 text-amber-600" />, color: "from-amber-600 to-amber-800", delay: "delay-500" },
  ];

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/75 backdrop-blur-md transition-opacity duration-500 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      <Confetti />

      <div className="relative w-full max-w-2xl mx-4 space-y-8">

        {/* Title */}
        <div className="text-center space-y-2 animate-bounce-in">
          <Trophy className="w-16 h-16 text-yellow-400 mx-auto animate-float drop-shadow-[0_0_24px_rgba(250,204,21,0.8)]" />
          <h1 className="text-5xl font-display font-bold text-yellow-300 drop-shadow-[0_0_16px_rgba(250,204,21,0.6)]">
            Fim de Jogo!
          </h1>
          {first && (
            <p className="text-2xl font-display font-medium text-white/90">
              🏆 <span style={{ color: first.cor_empilhadeira }} className="font-bold">{first.nickname}</span> venceu!
            </p>
          )}
        </div>

        {/* Podium */}
        <div className="flex items-end justify-center gap-3 px-4">
          {podiumOrder.map((player, idx) => {
            const config = podiumConfig.find((c) => c.place === (idx === 0 ? 2 : idx === 1 ? 1 : 3))!;
            const actualConfig = [
              podiumConfig[0], // 2nd
              podiumConfig[1], // 1st
              podiumConfig[2], // 3rd
            ][idx];

            return (
              <div
                key={player.id}
                className={`flex flex-col items-center gap-3 flex-1 animate-bounce-in ${actualConfig.delay}`}
              >
                {/* Player avatar */}
                <div className="flex flex-col items-center gap-2">
                  {actualConfig.icon}
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-display font-bold border-2 border-white/20 shadow-lg"
                    style={{ backgroundColor: player.cor_empilhadeira, color: "hsl(var(--background))" }}
                  >
                    {player.nickname[0].toUpperCase()}
                  </div>
                  <div className="text-center">
                    <p className="font-display font-bold text-white text-sm leading-tight max-w-[7rem] truncate">
                      {player.nickname}
                    </p>
                    <p className="text-xs font-body text-white/60">
                      Casa {player.posicao}
                    </p>
                  </div>
                </div>

                {/* Podium block */}
                <div
                  className={`w-full ${actualConfig.height} rounded-t-xl bg-gradient-to-b ${actualConfig.color} flex items-center justify-center shadow-lg border border-white/10`}
                >
                  <span className="font-display font-black text-3xl text-white/90 drop-shadow">
                    {actualConfig.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Remaining players */}
        {sorted.length > 3 && (
          <div className="px-4 animate-bounce-in delay-700">
            <div className="rounded-2xl bg-white/5 border border-white/10 divide-y divide-white/10">
              {sorted.slice(3).map((player, idx) => (
                <div key={player.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="font-display font-bold text-white/40 w-6 text-center">{idx + 4}º</span>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-display font-bold shrink-0"
                    style={{ backgroundColor: player.cor_empilhadeira, color: "hsl(var(--background))" }}
                  >
                    {player.nickname[0].toUpperCase()}
                  </div>
                  <span className="font-display font-medium text-white/70 flex-1 truncate">{player.nickname}</span>
                  <span className="text-xs font-body text-white/40">Casa {player.posicao}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Close button */}
        <div className="flex justify-center animate-bounce-in delay-1000">
          <button
            onClick={onClose}
            className="h-12 px-8 rounded-2xl bg-white/10 border border-white/20 text-white font-display font-medium hover:bg-white/20 transition-all"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
