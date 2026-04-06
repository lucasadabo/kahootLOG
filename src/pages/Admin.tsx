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

  // Category selection
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [loadingCategories, setLoadingCategories] = useState(false);

  const fetchGame = useCallback(async (gameId: string) => {
    const { data, error } = await gameSupabase
      .from("jogos")
      .select("id, pin, status, jogador_atual_id")
      .eq("id", gameId)
      .single();

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

    if (!error && data) {
      setPlayers(data);
    }
  }, []);

  // Fetch unique categories from perguntas table
  const fetchCategories = useCallback(async () => {
    setLoadingCategories(true);
    try {
      const { data, error } = await gameSupabase
        .from("perguntas")
        .select("categoria");

      if (!error && data) {
        const unique = [...new Set(data.map((r: { categoria: string }) => r.categoria).filter(Boolean))];
        setCategories(unique.sort());
        // Select all by default
        setSelectedCategories(new Set(unique));
      }
    } catch (err) {
      console.error("[Admin] Erro ao buscar categorias:", err);
    } finally {
      setLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    if (!game) return;

    fetchGame(game.id);
    fetchPlayers(game.id);

    const playersChannel = gameSupabase
      .channel(`admin-jogadores-${game.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "jogadores", filter: `jogo_id=eq.${game.id}` }, () => fetchPlayers(game.id))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jogadores", filter: `jogo_id=eq.${game.id}` }, () => fetchPlayers(game.id))
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "jogadores", filter: `jogo_id=eq.${game.id}` }, () => fetchPlayers(game.id))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") fetchPlayers(game.id);
      });

    const gameChannel = gameSupabase
      .channel(`admin-jogo-${game.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jogos", filter: `id=eq.${game.id}` }, () => { fetchGame(game.id); fetchPlayers(game.id); })
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
      if (error || !data) throw error;

      const gameId = data as string;
      const { data: jogoData, error: fetchError } = await gameSupabase
        .from("jogos")
        .select("id, pin, status, jogador_atual_id")
        .eq("id", gameId)
        .single();

      if (fetchError || !jogoData) throw fetchError;

      setGame({
        ...jogoData,
        jogador_atual_id: jogoData.jogador_atual_id ?? null,
      });
      setPlayers([]);
      // Fetch categories after creating game
      fetchCategories();
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
      // Save selected categories to DB so players can read them
      const catsJson = JSON.stringify(Array.from(selectedCategories));
      await gameSupabase.from("jogos").update({ categorias_selecionadas: catsJson } as any).eq("id", game.id);

      const { error } = await gameSupabase.rpc("iniciar_jogo", { p_jogo_id: game.id });
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

  const toggleCategory = (cat: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        // Don't allow deselecting all
        if (next.size <= 1) return prev;
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const selectAllCategories = () => setSelectedCategories(new Set(categories));

  const handleAdvanceTurn = useCallback(async () => {
    if (!game) return;

    const currentGameId = game.id;
    const currentPlayerId = game.jogador_atual_id;

    await new Promise((resolve) => window.setTimeout(resolve, 150));

    if (game.status === "finalizado" || game.status === "finished") {
      await fetchGame(currentGameId);
      await fetchPlayers(currentGameId);
      return;
    }

    const { error } = await gameSupabase.rpc("proximo_turno", { p_jogo_id: currentGameId });
    console.log("[Admin] proximo_turno RPC:", { error });

    if (error) {
      const { data: allPlayers } = await gameSupabase
        .from("jogadores")
        .select("id, pular_vez")
        .eq("jogo_id", currentGameId)
        .order("created_at", { ascending: true });

      if (allPlayers && allPlayers.length > 0) {
        const currentIdx = allPlayers.findIndex((p) => p.id === currentPlayerId);
        let nextIdx = (currentIdx + 1) % allPlayers.length;
        let attempts = 0;

        while (attempts < allPlayers.length) {
          if (allPlayers[nextIdx].pular_vez) {
            await gameSupabase.from("jogadores").update({ pular_vez: false }).eq("id", allPlayers[nextIdx].id);
            nextIdx = (nextIdx + 1) % allPlayers.length;
            attempts++;
          } else {
            break;
          }
        }

        await gameSupabase.from("jogos").update({ jogador_atual_id: allPlayers[nextIdx].id }).eq("id", currentGameId);
      }
    }

    await fetchGame(currentGameId);
    await fetchPlayers(currentGameId);
  }, [game, fetchGame, fetchPlayers]);

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
    <div className="min-h-screen flex flex-col px-4 py-4">
      <div className="w-full max-w-[1600px] mx-auto space-y-4">
        {/* Header: PIN + status */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <p className="text-muted-foreground font-body text-sm uppercase tracking-widest">PIN</p>
            <div className="text-5xl md:text-6xl font-display font-bold text-primary text-glow tracking-[0.3em] select-all">{game.pin}</div>
            <button
              onClick={handleCopyPin}
              className="p-2 rounded-xl bg-card border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-all"
            >
              {copied ? <Check className="w-5 h-5 text-accent" /> : <Copy className="w-5 h-5" />}
            </button>
          </div>

          {(gameStatus === "em_andamento" || gameStatus === "playing") && currentPlayer && (
            <div className="px-4 py-2 rounded-xl bg-accent/10 border border-accent/30 flex items-center gap-2">
              <Zap className="w-4 h-4 text-accent" />
              <span className="text-accent font-display font-bold">Vez de: {currentPlayer.nickname}</span>
            </div>
          )}

          {(gameStatus === "finalizado" || gameStatus === "finished") && winner && (
            <div className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-primary" />
              <span className="text-primary font-display font-bold">🏆 {winner.nickname} venceu!</span>
            </div>
          )}
        </div>

        {/* Category selection (before starting) */}
        {(gameStatus === "aguardando" || gameStatus === "waiting") && categories.length > 0 && (
          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-display font-bold text-foreground text-lg">📚 Categorias de Perguntas</p>
              <button
                onClick={selectAllCategories}
                className="text-sm text-primary font-body hover:underline"
              >
                Selecionar todas
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const selected = selectedCategories.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`px-4 py-2 rounded-xl font-body font-medium text-sm transition-all border ${
                      selected
                        ? "bg-primary text-primary-foreground border-primary shadow-[var(--shadow-glow)]"
                        : "bg-card text-muted-foreground border-border hover:border-primary/40"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground font-body">
              {selectedCategories.size} de {categories.length} selecionada{selectedCategories.size !== 1 ? "s" : ""}
            </p>
          </div>
        )}

        {/* Main content: Board + Players side by side */}
        <div className="flex gap-4">
          {/* Board - takes most of the space */}
          <div className="flex-1 min-w-0">
            <WarehouseBoard3D players={players} currentPlayerId={game.jogador_atual_id} />
          </div>

          {/* Players panel - right side */}
          <div className="w-72 shrink-0">
            <AdminPlayersPanel
              players={players}
              currentPlayerId={game.jogador_atual_id}
              gameFinished={gameStatus === "finalizado" || gameStatus === "finished"}
              gameId={game.id}
              onPlayerRemoved={() => fetchPlayers(game.id)}
              vertical
            />
          </div>
        </div>

        {/* Start button */}
        {(gameStatus === "aguardando" || gameStatus === "waiting") && (
          <div className="flex justify-center pt-2">
            <button
              onClick={handleStartGame}
              disabled={starting || players.length === 0 || selectedCategories.size === 0}
              className="inline-flex items-center gap-3 h-16 px-12 rounded-2xl bg-accent text-accent-foreground text-xl font-display font-bold hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:hover:scale-100 disabled:cursor-not-allowed"
            >
              {starting ? <span className="animate-pulse-slow">Iniciando...</span> : <><Play className="w-6 h-6" />Iniciar Jogo</>}
            </button>
          </div>
        )}

      </div>

      {/* Question overlay */}
      <AdminQuestionOverlay
        gameId={game.id}
        players={players}
        onAdvanceTurn={handleAdvanceTurn}
      />
    </div>
  );
}
