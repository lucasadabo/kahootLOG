import { useState, useEffect, useCallback } from "react";
import { Monitor, Play, Plus, Copy, Check, Trophy, Zap } from "lucide-react";
import { WarehouseBoard3D } from "@/components/admin/WarehouseBoard3D";
import { AdminPlayersPanel } from "@/components/admin/AdminPlayersPanel";
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
  status: string | null;
  jogador_atual_id: string | null;
  vencedor_id: string | null;
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
      .select("id, pin, status, jogador_atual_id, vencedor_id")
      .eq("id", gameId)
      .single();

    console.log("[Admin] jogo SELECT:", { data, error });

    if (!error && data) {
      setGame({
        ...data,
        jogador_atual_id: data.jogador_atual_id ?? null,
        vencedor_id: data.vencedor_id ?? null,
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

    const channel = gameSupabase
      .channel(`admin-${game.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jogadores", filter: `jogo_id=eq.${game.id}` },
        (payload) => {
          console.log("[Admin] jogadores realtime:", payload);
          fetchPlayers(game.id);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "jogos", filter: `id=eq.${game.id}` },
        (payload) => {
          console.log("[Admin] jogo realtime:", payload);
          fetchGame(game.id);
        }
      )
      .subscribe((status) => console.log("[Admin] subscription:", status));

    return () => {
      gameSupabase.removeChannel(channel);
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
        .select("id, pin, status, jogador_atual_id, vencedor_id")
        .eq("id", gameId)
        .single();

      console.log("[Admin] jogo pós-criação SELECT:", { jogoData, fetchError });
      if (fetchError || !jogoData) throw fetchError;

      setGame({
        ...jogoData,
        jogador_atual_id: jogoData.jogador_atual_id ?? null,
        vencedor_id: jogoData.vencedor_id ?? null,
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
  const winner = players.find((p) => p.id === game?.vencedor_id) ?? players.find((p) => p.posicao >= 42);
  const isStarted = game?.status === "playing" || game?.status === "finished";

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

        {game.status === "finished" && winner && (
          <div className="p-6 rounded-xl bg-primary/10 border border-primary/30 text-center animate-bounce-in">
            <Trophy className="w-12 h-12 text-primary mx-auto mb-2" />
            <p className="text-primary font-display font-bold text-2xl">🏆 {winner.nickname} venceu o jogo!</p>
          </div>
        )}

        {isStarted && currentPlayer && game.status !== "finished" && (
          <div className="p-4 rounded-xl bg-accent/10 border border-accent/30 text-center space-y-2">
            <p className="text-accent font-display font-bold text-xl flex items-center justify-center gap-2">
              <Zap className="w-5 h-5" /> Vez de: {currentPlayer.nickname}
            </p>
            <p className="text-sm text-muted-foreground font-body">Jogo iniciado</p>
          </div>
        )}

        <WarehouseBoard3D players={players} currentPlayerId={game.jogador_atual_id} />

        <AdminPlayersPanel players={players} currentPlayerId={game.jogador_atual_id} gameFinished={game.status === "finished"} />

        {!game.status && (
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
    </div>
  );
}