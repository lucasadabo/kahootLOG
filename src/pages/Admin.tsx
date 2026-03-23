import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Monitor, Users, Play, Plus, Copy, Check, Trophy, Zap } from "lucide-react";

interface Player {
  id: string;
  nickname: string;
  cor_empilhadeira: string;
  posicao: number;
}

interface Game {
  id: string;
  pin: string;
  nome: string;
  status: string;
  jogador_atual_id: string | null;
}

export default function Admin() {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchPlayers = useCallback(async (gameId: string) => {
    const { data } = await supabase
      .from("jogadores")
      .select("id, nickname, cor_empilhadeira, posicao")
      .eq("jogo_id", gameId)
      .order("created_at", { ascending: true });

    if (data) {
      console.log("jogadores carregados:", data);
      setPlayers(data);
    }
  }, []);

  useEffect(() => {
    if (!game) return;

    fetchPlayers(game.id);

    const channel = supabase
      .channel(`admin-${game.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "jogadores", filter: `jogo_id=eq.${game.id}` },
        (payload) => {
          const newPlayer = payload.new as Player;
          console.log("novo jogador:", newPlayer);
          setPlayers((prev) => {
            if (prev.some((p) => p.id === newPlayer.id)) return prev;
            return [...prev, { ...newPlayer, posicao: newPlayer.posicao ?? 0 }];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jogadores", filter: `jogo_id=eq.${game.id}` },
        (payload) => {
          const updated = payload.new as Player;
          setPlayers((prev) => prev.map((p) => (p.id === updated.id ? { ...p, posicao: updated.posicao } : p)));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jogos", filter: `id=eq.${game.id}` },
        (payload) => {
          const updated = payload.new as Game;
          console.log("jogo atualizado:", updated);
          setGame((prev) => prev ? { ...prev, status: updated.status, jogador_atual_id: updated.jogador_atual_id } : prev);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [game?.id, fetchPlayers]);

  const handleCreateGame = async () => {
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("criar_jogo");
      if (error) throw error;

      const gameId = data as string;
      console.log("jogo criado:", gameId);

      const { data: jogoData, error: fetchError } = await supabase
        .from("jogos")
        .select("*")
        .eq("id", gameId)
        .single();

      if (fetchError) throw fetchError;
      console.log("jogo carregado:", jogoData);
      setGame({ ...jogoData, jogador_atual_id: jogoData.jogador_atual_id ?? null } as Game);
    } catch (err) {
      console.error("Erro ao criar jogo:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleStartGame = async () => {
    if (!game) return;
    setStarting(true);
    try {
      const { error } = await supabase.rpc("iniciar_jogo", { p_jogo_id: game.id });
      if (error) throw error;
      console.log("início do jogo:", game.id);
    } catch (err) {
      console.error("Erro ao iniciar jogo:", err);
    } finally {
      setStarting(false);
    }
  };

  const handleCopyPin = () => {
    if (!game) return;
    navigator.clipboard.writeText(game.pin);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const currentPlayer = players.find((p) => p.id === game?.jogador_atual_id);
  const winner = players.find((p) => p.posicao >= 42);
  const isStarted = game?.status === "em_andamento" || game?.status === "finalizado";

  if (!game) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg text-center space-y-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-primary/10 border border-primary/20 animate-float">
            <Monitor className="w-12 h-12 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-display font-bold text-primary text-glow">
              Painel do Professor
            </h1>
            <p className="text-muted-foreground font-body text-lg">
              Crie um jogo e compartilhe o PIN com seus alunos
            </p>
          </div>
          <button
            onClick={handleCreateGame}
            disabled={creating}
            className="inline-flex items-center gap-3 h-20 px-12 rounded-2xl bg-primary text-primary-foreground text-2xl font-display font-bold shadow-[var(--shadow-glow)] hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:hover:scale-100"
          >
            {creating ? (
              <span className="animate-pulse-slow">Criando...</span>
            ) : (
              <>
                <Plus className="w-7 h-7" />
                Criar Jogo
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col px-6 py-8">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        {/* PIN Display */}
        <div className="text-center space-y-4">
          <p className="text-muted-foreground font-body text-lg uppercase tracking-widest">
            PIN do Jogo
          </p>
          <div className="flex items-center justify-center gap-4">
            <div className="text-8xl md:text-9xl font-display font-bold text-primary text-glow tracking-[0.3em] select-all">
              {game.pin}
            </div>
            <button
              onClick={handleCopyPin}
              className="p-3 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
            >
              {copied ? <Check className="w-6 h-6 text-accent" /> : <Copy className="w-6 h-6" />}
            </button>
          </div>
          <p className="text-muted-foreground font-body">
            Peça aos alunos para acessarem <span className="text-accent font-bold">/join</span> e digitarem este PIN
          </p>
        </div>

        {/* Game status */}
        {game.status === "finalizado" && winner && (
          <div className="p-6 rounded-xl bg-primary/10 border border-primary/30 text-center animate-bounce-in">
            <Trophy className="w-12 h-12 text-primary mx-auto mb-2" />
            <p className="text-primary font-display font-bold text-2xl">
              🏆 {winner.nickname} venceu o jogo!
            </p>
          </div>
        )}

        {isStarted && currentPlayer && game.status !== "finalizado" && (
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/30 text-center">
            <p className="text-accent font-display font-bold text-xl flex items-center justify-center gap-2">
              <Zap className="w-5 h-5" /> Vez de: {currentPlayer.nickname}
            </p>
          </div>
        )}

        {/* Players */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 text-muted-foreground font-body text-lg">
              <Users className="w-6 h-6" />
              <span>
                {players.length} jogador{players.length !== 1 ? "es" : ""} conectado{players.length !== 1 ? "s" : ""}
              </span>
            </div>
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
                    player.id === game.jogador_atual_id
                      ? "bg-accent/10 border-accent/30 ring-2 ring-accent/20"
                      : "bg-card border-border"
                  }`}
                  style={{ animationDelay: `${i * 0.05}s` }}
                >
                  <div
                    className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-display font-bold shrink-0"
                    style={{ backgroundColor: player.cor_empilhadeira, color: "#1a1a2e" }}
                  >
                    {player.nickname[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-display font-medium text-foreground text-lg truncate block">
                      {player.nickname}
                    </span>
                    {isStarted && (
                      <div className="flex items-center gap-2 mt-1">
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
                    )}
                  </div>
                  {player.id === game.jogador_atual_id && game.status !== "finalizado" && (
                    <Zap className="w-5 h-5 text-accent shrink-0" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Start button */}
        {game.status === "aguardando" && (
          <div className="flex justify-center pt-4">
            <button
              onClick={handleStartGame}
              disabled={starting || players.length === 0}
              className="inline-flex items-center gap-3 h-20 px-16 rounded-2xl bg-accent text-accent-foreground text-2xl font-display font-bold hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
            >
              {starting ? (
                <span className="animate-pulse-slow">Iniciando...</span>
              ) : (
                <>
                  <Play className="w-7 h-7" />
                  Iniciar Jogo
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
