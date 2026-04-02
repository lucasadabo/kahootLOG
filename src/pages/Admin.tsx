import { useState, useEffect, useCallback } from "react";
import { Monitor, Play, Plus, Copy, Check, Trophy, Zap } from "lucide-react";
import { WarehouseBoard3D } from "@/components/admin/WarehouseBoard3D";
import { AdminPlayersPanel } from "@/components/admin/AdminPlayersPanel";
import { AdminQuestionOverlay } from "@/components/admin/AdminQuestionOverlay";
import { gameSupabase } from "@/lib/gameSupabase";

interface Player {
  id: string;
  nickname: string;
  cor_empilhadeira: string;
  posicao: number;
}

interface Game {
  id: string;
  pin: string;
  status: string;
  jogador_atual_id: string | null;
}

export default function Admin() {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchGame = useCallback(async (gameId: string) => {
    const { data, error } = await gameSupabase
      .from("jogos")
      .select("id, pin, status, jogador_atual_id")
      .eq("id", gameId)
      .single();

    console.log("[Admin] jogo SELECT:", { data, error });

    if (!error && data) {
      setGame({
        ...data,
        jogador_atual_id: data.jogador_atual_id ?? null,
      });
    }
  }, []);

  const fetchPlayers = useCallback(async (gameId: string) => {
    const { data, error } = await gameSupabase
      .from("jogadores")
      .select("id, nickname, cor_empilhadeira, posicao")
      .eq("jogo_id", gameId)
      .order("created_at", { ascending: true });

    console.log("[Admin] jogadores SELECT:", { data, error });

    if (!error && data) {
      setPlayers(data);
    }
  }, []);

  useEffect(() => {
    if (!game) return;

    fetchGame(game.id);
    fetchPlayers(game.id);

    const playersChannel = gameSupabase
      .channel(`admin-jogadores-${game.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "jogadores", filter: `jogo_id=eq.${game.id}` },
        () => fetchPlayers(game.id)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jogadores", filter: `jogo_id=eq.${game.id}` },
        () => fetchPlayers(game.id)
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "jogadores", filter: `jogo_id=eq.${game.id}` },
        () => fetchPlayers(game.id)
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") fetchPlayers(game.id);
      });

    const gameChannel = gameSupabase
      .channel(`admin-jogo-${game.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jogos", filter: `id=eq.${game.id}` },
        () => { fetchGame(game.id); fetchPlayers(game.id); }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") fetchGame(game.id);
      });

    const syncInterval = window.setInterval(() => {
      fetchGame(game.id);
      fetchPlayers(game.id);
    }, 2000);

    return () => {
      window.clearInterval(syncInterval);
      gameSupabase.removeChannel(playersChannel);
      gameSupabase.removeChannel(gameChannel);
    };
  }, [game?.id, fetchGame, fetchPlayers]);

  const handleCreateGame = async () => {
    setCreating(true);
    try {
      const { data, error } = await gameSupabase.rpc("criar_jogo");
      console.log("[Admin] criar_jogo RPC:", { data, error });
      if (error || !data) throw error;

      const gameId = data as string;
      const { data: jogoData, error: fetchError } = await gameSupabase
        .from("jogos")
        .select("id, pin, status, jogador_atual_id")
        .eq("id", gameId)
        .single();

      console.log("[Admin] jogo pós-criação SELECT:", { jogoData, fetchError });
      if (fetchError || !jogoData) throw fetchError;

      setGame({
        ...jogoData,
        jogador_atual_id: jogoData.jogador_atual_id ?? null,
      });
      setPlayers([]);
    } catch (err) {
      console.error("[Admin] Erro ao criar jogo:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleStartGame = async () => {
    if (!game) return;
    setStarting(true);
    try {
      const { error } = await gameSupabase.rpc("iniciar_jogo", { p_jogo_id: game.id });
      console.log("[Admin] iniciar_jogo RPC:", { gameId: game.id, error });
      if (error) throw error;
      await fetchGame(game.id);
      await fetchPlayers(game.id);
    } catch (err) {
      console.error("[Admin] Erro ao iniciar jogo:", err);
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
  const gameStatus = game?.status ?? "aguardando";

  if (!game) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-lg text-center space-y-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-primary/10 border border-primary/20 animate-float">
            <Monitor className="w-12 h-12 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-display font-bold text-primary text-glow">Painel do Professor</h1>
            <p className="text-muted-foreground font-body text-lg">Crie um jogo e compartilhe o PIN com seus alunos</p>
          </div>
          <button
            onClick={handleCreateGame}
            disabled={creating}
            className="inline-flex items-center gap-3 h-20 px-12 rounded-2xl bg-primary text-primary-foreground text-2xl font-display font-bold shadow-[var(--shadow-glow)] hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:hover:scale-100"
          >
            {creating ? <span className="animate-pulse-slow">Criando...</span> : <><Plus className="w-7 h-7" />Criar Jogo</>}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col px-6 py-8">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground font-body text-lg uppercase tracking-widest">PIN do Jogo</p>
          <div className="flex items-center justify-center gap-4">
            <div className="text-8xl md:text-9xl font-display font-bold text-primary text-glow tracking-[0.3em] select-all">{game.pin}</div>
            <button
              onClick={handleCopyPin}
              className="p-3 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
            >
              {copied ? <Check className="w-6 h-6 text-accent" /> : <Copy className="w-6 h-6" />}
            </button>
          </div>
          <p className="text-muted-foreground font-body">Peça aos alunos para acessarem <span className="text-accent font-bold">/join</span> e digitarem este PIN</p>
        </div>

        {(gameStatus === "finalizado" || gameStatus === "finished") && winner && (
          <div className="p-6 rounded-xl bg-primary/10 border border-primary/30 text-center animate-bounce-in">
            <Trophy className="w-12 h-12 text-primary mx-auto mb-2" />
            <p className="text-primary font-display font-bold text-2xl">🏆 {winner.nickname} venceu o jogo!</p>
          </div>
        )}

        {(gameStatus === "em_andamento" || gameStatus === "playing") && currentPlayer && (
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/30 text-center space-y-2">
            <p className="text-accent font-display font-bold text-xl flex items-center justify-center gap-2">
              <Zap className="w-5 h-5" /> Vez de: {currentPlayer.nickname}
            </p>
            <p className="text-sm text-muted-foreground font-body">Jogo em andamento</p>
          </div>
        )}

        <WarehouseBoard3D players={players} currentPlayerId={game.jogador_atual_id} />

        <AdminPlayersPanel
          players={players}
          currentPlayerId={game.jogador_atual_id}
          gameFinished={gameStatus === "finalizado" || gameStatus === "finished"}
          gameId={game.id}
          onPlayerRemoved={() => fetchPlayers(game.id)}
        />

        {(gameStatus === "aguardando" || gameStatus === "waiting") && (
          <div className="flex justify-center pt-4">
            <button
              onClick={handleStartGame}
              disabled={starting || players.length === 0}
              className="inline-flex items-center gap-3 h-20 px-16 rounded-2xl bg-accent text-accent-foreground text-2xl font-display font-bold hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
            >
              {starting ? <span className="animate-pulse-slow">Iniciando...</span> : <><Play className="w-7 h-7" />Iniciar Jogo</>}
            </button>
          </div>
        )}
      </div>

      {/* Question overlay - shows when a player is answering */}
      <AdminQuestionOverlay
        gameId={game.id}
        players={players}
        onRoundFinished={async () => {
          const { error } = await gameSupabase.rpc("proximo_turno", { p_jogo_id: game.id });
          console.log("[Admin] proximo_turno RPC:", { error });
          if (error) {
            // Manual fallback
            const { data: allPlayers } = await gameSupabase
              .from("jogadores")
              .select("id, pular_vez")
              .eq("jogo_id", game.id)
              .order("created_at", { ascending: true });
            if (allPlayers && allPlayers.length > 0) {
              const currentIdx = allPlayers.findIndex((p) => p.id === game.jogador_atual_id);
              let nextIdx = (currentIdx + 1) % allPlayers.length;
              let attempts = 0;
              while (attempts < allPlayers.length) {
                if (allPlayers[nextIdx].pular_vez) {
                  await gameSupabase.from("jogadores").update({ pular_vez: false }).eq("id", allPlayers[nextIdx].id);
                  nextIdx = (nextIdx + 1) % allPlayers.length;
                  attempts++;
                } else break;
              }
              await gameSupabase.from("jogos").update({ jogador_atual_id: allPlayers[nextIdx].id }).eq("id", game.id);
            }
          }
          fetchGame(game.id);
          fetchPlayers(game.id);
        }}
      />
    </div>
  );
}
