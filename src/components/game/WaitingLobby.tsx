import { useEffect, useState } from "react";
import { gameSupabase } from "@/lib/gameSupabase";
import { Users, Loader2 } from "lucide-react";

interface Player {
  id: string;
  nickname: string;
  cor_empilhadeira: string;
}

interface WaitingLobbyProps {
  gameId: string;
  nickname: string;
  onGameStart: () => void;
}

export function WaitingLobby({ gameId, nickname, onGameStart }: WaitingLobbyProps) {
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const fetchPlayers = async () => {
      const { data, error } = await gameSupabase
        .from("jogadores")
        .select("id, nickname, cor_empilhadeira")
        .eq("jogo_id", gameId)
        .order("created_at", { ascending: true });

      console.log("[WaitingLobby] jogadores SELECT:", { data, error });
      if (!error && data) setPlayers(data);
    };

    const fetchGame = async () => {
      const { data, error } = await gameSupabase
        .from("jogos")
        .select("status")
        .eq("id", gameId)
        .single();

      console.log("[WaitingLobby] jogo SELECT:", { data, error });

      if (!error && (data?.status === "playing" || data?.status === "finished")) {
        onGameStart();
      }
    };

    fetchPlayers();
    fetchGame();

    const playersChannel = gameSupabase
      .channel(`lobby-jogadores-${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jogadores", filter: `jogo_id=eq.${gameId}` },
        (payload) => {
          console.log("[WaitingLobby] jogadores realtime:", payload);
          fetchPlayers();
        }
      )
      .subscribe((status) => console.log("[WaitingLobby] players subscription:", status));

    const gameChannel = gameSupabase
      .channel(`lobby-jogo-${gameId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jogos", filter: `id=eq.${gameId}` },
        (payload) => {
          console.log("[WaitingLobby] jogo realtime:", payload.new);
          fetchGame();
        }
      )
      .subscribe((status) => console.log("[WaitingLobby] game subscription:", status));

    return () => {
      gameSupabase.removeChannel(playersChannel);
      gameSupabase.removeChannel(gameChannel);
    };
  }, [gameId, onGameStart]);

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent/10 border border-accent/20">
            <Loader2 className="w-8 h-8 text-accent animate-spin" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">
            Aguardando o jogo iniciar...
          </h1>
          <p className="text-muted-foreground font-body">
            Você entrou como <span className="text-primary font-bold">{nickname}</span>
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2 text-muted-foreground font-body">
            <Users className="w-5 h-5" />
            <span>
              {players.length} jogador{players.length !== 1 ? "es" : ""} conectado
              {players.length !== 1 ? "s" : ""}
            </span>
          </div>

          <div className="grid gap-3">
            {players.map((player, i) => (
              <div
                key={player.id}
                className="flex items-center gap-3 p-4 rounded-xl bg-card border border-border animate-bounce-in"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-display font-bold shrink-0"
                  style={{ backgroundColor: player.cor_empilhadeira, color: "hsl(var(--background))" }}
                >
                  {player.nickname[0].toUpperCase()}
                </div>
                <span className="font-display font-medium text-foreground truncate">
                  {player.nickname}
                </span>
                {player.nickname === nickname && (
                  <span className="ml-auto text-xs font-body text-primary bg-primary/10 px-2 py-1 rounded-full">
                    Você
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}