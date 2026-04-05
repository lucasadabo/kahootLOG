import { useState } from "react";
import { Users, Zap, X } from "lucide-react";
import { gameSupabase } from "@/lib/gameSupabase";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

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
  gameId: string;
  onPlayerRemoved?: () => void;
  vertical?: boolean;
}

export function AdminPlayersPanel({ players, currentPlayerId, gameFinished, gameId, onPlayerRemoved, vertical }: AdminPlayersPanelProps) {
  const [playerToRemove, setPlayerToRemove] = useState<Player | null>(null);
  const [removing, setRemoving] = useState(false);

  const handleRemovePlayer = async () => {
    if (!playerToRemove) return;
    setRemoving(true);
    try {
      if (playerToRemove.id === currentPlayerId) {
        await gameSupabase.rpc("proximo_turno", { p_jogo_id: gameId });
      }
      const { error } = await gameSupabase
        .from("jogadores")
        .delete()
        .eq("id", playerToRemove.id);
      if (!error) onPlayerRemoved?.();
    } catch (err) {
      console.error("[Admin] erro ao remover jogador:", err);
    } finally {
      setRemoving(false);
      setPlayerToRemove(null);
    }
  };

  return (
    <>
      <div className={`space-y-3 ${vertical ? "h-full" : ""}`}>
        <div className="flex items-center gap-2 text-muted-foreground font-body text-sm">
          <Users className="w-4 h-4" />
          <span>{players.length} jogador{players.length !== 1 ? "es" : ""}</span>
        </div>

        {players.length === 0 ? (
          <div className="p-8 rounded-xl bg-card/50 border border-border text-center">
            <p className="text-muted-foreground font-body text-sm animate-pulse-slow">
              Aguardando jogadores...
            </p>
          </div>
        ) : (
          <div className={vertical ? "flex flex-col gap-2" : "grid grid-cols-1 md:grid-cols-2 gap-4"}>
            {players.map((player, i) => (
              <div
                key={player.id}
                className={`flex items-center gap-2 p-3 rounded-xl border ${
                  player.id === currentPlayerId && !gameFinished
                    ? "bg-accent/10 border-accent/30 ring-1 ring-accent/20"
                    : "bg-card border-border"
                }`}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-display font-bold shrink-0"
                  style={{ backgroundColor: player.cor_empilhadeira, color: "hsl(var(--background))" }}
                >
                  {player.nickname[0].toUpperCase()}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-1">
                    <span className="font-display font-medium text-foreground text-sm truncate block">
                      {player.nickname}
                    </span>
                    {player.id === currentPlayerId && !gameFinished && (
                      <Zap className="w-3 h-3 text-accent shrink-0" />
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden flex-1">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(player.posicao / 42) * 100}%`,
                          backgroundColor: player.cor_empilhadeira,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-display font-bold text-muted-foreground">
                      {player.posicao}/42
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => setPlayerToRemove(player)}
                  className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  title="Remover jogador"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!playerToRemove} onOpenChange={(open) => !open && setPlayerToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Remover jogador</AlertDialogTitle>
            <AlertDialogDescription className="font-body">
              Tem certeza que deseja remover <strong>{playerToRemove?.nickname}</strong> da partida?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemovePlayer}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Removendo..." : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
