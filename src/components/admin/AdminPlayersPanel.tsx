import { Users, Zap } from "lucide-react";

interface Player {
  id: string;
  nickname: string;
  cor_empilhadeira: string;
  posicao: number;
}

interface AdminPlayersPanelProps {
  players: Player[];
  currentPlayerId: string | null;
  gameFinished: boolean;
}

export function AdminPlayersPanel({ players, currentPlayerId, gameFinished }: AdminPlayersPanelProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-muted-foreground font-body text-lg">
        <Users className="w-6 h-6" />
        <span>
          {players.length} jogador{players.length !== 1 ? "es" : ""} conectado{players.length !== 1 ? "s" : ""}
        </span>
      </div>

      {players.length === 0 ? (
        <div className="p-12 rounded-2xl bg-card/50 border border-border text-center">
          <p className="text-muted-foreground font-body text-lg animate-pulse-slow">
            Aguardando jogadores...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {players.map((player, i) => (
            <div
              key={player.id}
              className={`flex items-center gap-3 p-4 rounded-xl border animate-bounce-in ${
                player.id === currentPlayerId && !gameFinished
                  ? "bg-accent/10 border-accent/30 ring-2 ring-accent/20"
                  : "bg-card border-border"
              }`}
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div
                className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-display font-bold shrink-0"
                style={{ backgroundColor: player.cor_empilhadeira, color: "hsl(var(--background))" }}
              >
                {player.nickname[0].toUpperCase()}
              </div>

              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-display font-medium text-foreground text-lg truncate block">
                    {player.nickname}
                  </span>
                  {player.id === currentPlayerId && !gameFinished && (
                    <Zap className="w-4 h-4 text-accent shrink-0" />
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="h-2 rounded-full bg-muted overflow-hidden flex-1">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(player.posicao / 42) * 100}%`,
                        backgroundColor: player.cor_empilhadeira,
                      }}
                    />
                  </div>
                  <span className="text-xs font-display font-bold text-muted-foreground">
                    {player.posicao}/42
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}