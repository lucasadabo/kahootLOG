import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Monitor, Play, Plus, Copy, Check, Trophy, Lock, Volume2, VolumeX, BookOpen } from "lucide-react";
import { WarehouseBoard3D } from "@/components/admin/WarehouseBoard3D";
import { AdminPlayersPanel } from "@/components/admin/AdminPlayersPanel";
import { AdminQuestionOverlay } from "@/components/admin/AdminQuestionOverlay";
import { gameSupabase } from "@/lib/gameSupabase";
import { PodiumOverlay } from "@/components/admin/PodiumOverlay";

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
}

const ADMIN_PASSWORD = "teste123";

export default function Admin() {
  const navigate = useNavigate();
  const [authenticated, setAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(false);

  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [tempoResposta, setTempoResposta] = useState<number>(0);
  const [showPodium, setShowPodium] = useState(false);
  const [positionSnapshot, setPositionSnapshot] = useState<Map<string, number> | null>(null);
  const [muted, setMuted] = useState(false);

  const lobbyAudioRef = useRef<HTMLAudioElement | null>(null);
  const questionAudioRef = useRef<HTMLAudioElement | null>(null);
  const mutedRef = useRef(false);

  
  const selectedCategoriesRef = useRef<string[]>([]);
  const tempoRespostaRef = useRef<number>(0);
  const configChannelRef = useRef<ReturnType<typeof gameSupabase.channel> | null>(null);
  const playersRef = useRef<Player[]>([]);

  useEffect(() => { selectedCategoriesRef.current = Array.from(selectedCategories); }, [selectedCategories]);
  useEffect(() => { tempoRespostaRef.current = tempoResposta; }, [tempoResposta]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // Inicializa os elementos de áudio uma única vez
  useEffect(() => {
    const lobby = new Audio("/LobbyMusic.mp3");
    lobby.loop = true;
    lobby.volume = 0.5;
    lobbyAudioRef.current = lobby;

    const question = new Audio("/QuestionMusic.mp3");
    question.loop = true;
    question.volume = 0.5;
    questionAudioRef.current = question;

    return () => {
      lobby.pause();
      question.pause();
    };
  }, []);
  

  const fetchGame = useCallback(async (gameId: string) => {
    const { data, error } = await gameSupabase
      .from("jogos")
      .select("id, pin, status")
      .eq("id", gameId)
      .single();

    if (!error && data) setGame(data);
  }, []);

  const fetchPlayers = useCallback(async (gameId: string) => {
    const { data, error } = await gameSupabase
      .from("jogadores")
      .select("id, nickname, cor_empilhadeira, posicao")
      .eq("jogo_id", gameId)
      .order("created_at", { ascending: true });

    if (!error && data) setPlayers(data);
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const { data, error } = await gameSupabase.from("perguntas").select("categoria");
      if (!error && data) {
        const unique = [...new Set(data.map((r: any) => r.categoria).filter(Boolean))];
        setCategories(unique.sort());
        setSelectedCategories(new Set(unique));
      }
    } catch (err) {
      console.error("[Admin] Erro ao buscar categorias:", err);
    }
  }, []);

  const broadcastGameConfig = useCallback(() => {
    if (!configChannelRef.current) return;
    configChannelRef.current.send({
      type: "broadcast",
      event: "game_config",
      payload: {
        categorias: selectedCategoriesRef.current,
        tempoResposta: tempoRespostaRef.current,
      },
    });
  }, []);

  useEffect(() => {
    if (!game) return;

    fetchGame(game.id);
    fetchPlayers(game.id);

    const playersChannel = gameSupabase
      .channel(`admin-jogadores-${game.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "jogadores", filter: `jogo_id=eq.${game.id}` }, () => fetchPlayers(game.id))
      .subscribe(() => fetchPlayers(game.id));

    const gameChannel = gameSupabase
      .channel(`admin-jogo-${game.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jogos", filter: `id=eq.${game.id}` }, () => {
        fetchGame(game.id);
        fetchPlayers(game.id);
      })
      .subscribe(() => fetchGame(game.id));

    const syncInterval = window.setInterval(() => {
      fetchGame(game.id);
      fetchPlayers(game.id);
    }, 2000);

    // Config broadcast channel — responds to player requests
    const configChannel = gameSupabase
      .channel(`admin-overlay-${game.id}`)
      .on("broadcast", { event: "request_config" }, () => {
        configChannel.send({
          type: "broadcast",
          event: "game_config",
          payload: {
            categorias: selectedCategoriesRef.current,
            tempoResposta: tempoRespostaRef.current,
          },
        });
      })
      .subscribe();
    configChannelRef.current = configChannel;

    const configHeartbeat = window.setInterval(() => {
      configChannel.send({
        type: "broadcast",
        event: "game_config",
        payload: {
          categorias: selectedCategoriesRef.current,
          tempoResposta: tempoRespostaRef.current,
        },
      });
    }, 1500);

    return () => {
      window.clearInterval(syncInterval);
      window.clearInterval(configHeartbeat);
      gameSupabase.removeChannel(playersChannel);
      gameSupabase.removeChannel(gameChannel);
      gameSupabase.removeChannel(configChannel);
      configChannelRef.current = null;
    };
  }, [game?.id, fetchGame, fetchPlayers]);

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  const handlePasswordSubmit = () => {
    if (passwordInput === ADMIN_PASSWORD) {
      setAuthenticated(true);
      setPasswordError(false);
    } else {
      setPasswordError(true);
    }
  };

  // ---------------------------------------------------------------------------
  // Game actions
  // ---------------------------------------------------------------------------

  const handleCreateGame = async () => {
    setCreating(true);
    try {
      const { data, error } = await gameSupabase.rpc("criar_jogo");
      if (error || !data) throw error;

      const gameId = data as string;
      const { data: jogoData, error: fetchError } = await gameSupabase
        .from("jogos")
        .select("id, pin, status")
        .eq("id", gameId)
        .single();

      if (fetchError || !jogoData) throw fetchError;
      setGame(jogoData);
      setPlayers([]);
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
      const { error } = await gameSupabase.rpc("iniciar_jogo", { p_jogo_id: game.id });
      if (error) throw error;

      // Persiste tempo_limite
      await gameSupabase
        .from("jogos")
        .update({ tempo_limite: tempoResposta } as any)
        .eq("id", game.id);

      await fetchGame(game.id);
      await fetchPlayers(game.id);
      broadcastGameConfig();
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

  const handleRemovePlayer = async (playerId: string) => {
    await gameSupabase.from("jogadores").delete().eq("id", playerId);
    if (game) fetchPlayers(game.id);
  };

  // ---------------------------------------------------------------------------
  // Category / time helpers
  // ---------------------------------------------------------------------------

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size <= 1) return prev;
        next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  };

  const toggleAllCategories = () => {
    setSelectedCategories((prev) =>
      prev.size === categories.length ? new Set() : new Set(categories)
    );
  };

  // Quando a fase vira "rolando_dado" (início de nova rodada), guarda snapshot
  // das posições atuais. O tabuleiro usa esse snapshot durante perguntando/respondendo
  // para manter as empilhadeiras paradas, revelando o movimento só no resultado.
  const handleFaseChange = useCallback((fase: string) => {
    if (fase === "rolando_dado") {
      setPositionSnapshot(new Map(playersRef.current.map((p) => [p.id, p.posicao])));
    } else if (fase === "resultado") {
      setPositionSnapshot(null);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const gameStatus = game?.status ?? "aguardando";
  const isWaiting = gameStatus === "aguardando" || gameStatus === "waiting";
  const isPlaying = gameStatus === "em_andamento" || gameStatus === "playing";
  const isFinished = gameStatus === "finalizado" || gameStatus === "finished";
  const winner = players.find((p) => p.posicao >= 42);
  const allCategoriesSelected =
    categories.length > 0 && selectedCategories.size === categories.length;

  // Troca a música conforme o status do jogo
  useEffect(() => {
    const lobby = lobbyAudioRef.current;
    const question = questionAudioRef.current;
    if (!lobby || !question) return;

    if (isWaiting) {
      question.pause();
      question.currentTime = 0;
      if (!mutedRef.current) lobby.play().catch(() => {});
    } else if (isPlaying) {
      lobby.pause();
      lobby.currentTime = 0;
      if (!mutedRef.current) question.play().catch(() => {});
    } else {
      // finalizado ou outro estado
      lobby.pause();
      question.pause();
    }
  }, [isWaiting, isPlaying, isFinished]);

  useEffect(() => {
    if (isFinished) setShowPodium(true);
  }, [isFinished]);

  const handleToggleMute = () => {
    const newMuted = !mutedRef.current;
    mutedRef.current = newMuted;
    setMuted(newMuted);
    const lobby = lobbyAudioRef.current;
    const question = questionAudioRef.current;
    if (!lobby || !question) return;
    if (newMuted) {
      lobby.pause();
      question.pause();
    } else {
      if (isWaiting) lobby.play().catch(() => {});
      else if (isPlaying) question.play().catch(() => {});
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 border border-primary/20">
            <Lock className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold text-primary text-glow">Painel do Professor</h1>
          <p className="text-muted-foreground font-body">Digite a senha para acessar</p>
          <div className="space-y-3">
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(false); }}
              onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
              placeholder="Senha"
              className="w-full h-14 px-4 rounded-xl bg-card border-2 border-border text-foreground font-body text-lg text-center tracking-widest focus:border-primary focus:outline-none transition-colors"
            />
            {passwordError && (
              <p className="text-destructive font-body text-sm">Senha incorreta. Tente novamente.</p>
            )}
            <button
              onClick={handlePasswordSubmit}
              className="w-full h-14 rounded-xl bg-primary text-primary-foreground font-display font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all"
            >
              Entrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: create game
  // ---------------------------------------------------------------------------

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
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={handleCreateGame}
              disabled={creating}
              className="inline-flex items-center gap-3 h-20 px-12 rounded-2xl bg-primary text-primary-foreground text-2xl font-display font-bold shadow-[var(--shadow-glow)] hover:scale-[1.03] active:scale-[0.97] transition-all duration-200 disabled:opacity-40 disabled:hover:scale-100"
            >
              {creating ? <span className="animate-pulse-slow">Criando...</span> : <><Plus className="w-7 h-7" />Criar Jogo</>}
            </button>
            <button
              onClick={() => navigate("/perguntas")}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/40 transition-all font-display font-bold text-sm"
            >
              <BookOpen className="w-4 h-4" />
              Banco de Perguntas
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: main panel
  // ---------------------------------------------------------------------------

  return (
    <div className="min-h-screen flex flex-col px-4 py-4">
      <div className="w-full max-w-[1600px] mx-auto space-y-4">

        {/* Header: PIN + status */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
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

          <div className="flex items-center gap-3">
            {/* Botão perguntas */}
            <button
              onClick={() => navigate("/perguntas")}
              title="Banco de Perguntas"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-muted-foreground hover:text-primary hover:border-primary/40 transition-all font-display font-bold text-sm"
            >
              <BookOpen className="w-4 h-4" />
              Perguntas
            </button>

            {/* Botão mute/unmute música */}
            <button
              onClick={handleToggleMute}
              title={muted ? "Ativar música" : "Silenciar música"}
              className={`p-2.5 rounded-xl border transition-all ${
                muted
                  ? "bg-card border-border text-muted-foreground hover:border-primary/40 hover:text-primary"
                  : "bg-primary/10 border-primary/30 text-primary hover:bg-primary/20"
              }`}
            >
              {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>

            {isFinished && winner && (
              <div className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/30 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" />
                <span className="text-primary font-display font-bold">🏆 {winner.nickname} venceu!</span>
              </div>
            )}
          </div>
        </div>

        {/* Category selection */}
        {isWaiting && categories.length > 0 && (
          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-display font-bold text-foreground text-lg">📚 Categorias de Perguntas</p>
              <button onClick={toggleAllCategories} className="text-sm text-primary font-body hover:underline">
                {allCategoriesSelected ? "Desselecionar todas" : "Selecionar todas"}
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

        {/* Tempo de resposta */}
        {isWaiting && (
          <div className="p-4 rounded-xl bg-card border border-border space-y-3">
            <p className="font-display font-bold text-foreground text-lg">⏱️ Tempo para responder</p>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 0, label: "Sem tempo" },
                { value: 60, label: "60 seg" },
                { value: 120, label: "120 seg" },
                { value: 180, label: "180 seg" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTempoResposta(opt.value)}
                  className={`px-4 py-2 rounded-xl font-body font-medium text-sm transition-all border ${
                    tempoResposta === opt.value
                      ? "bg-primary text-primary-foreground border-primary shadow-[var(--shadow-glow)]"
                      : "bg-card text-muted-foreground border-border hover:border-primary/40"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Board + Players */}
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <WarehouseBoard3D players={players} currentPlayerId={null} displayPositions={positionSnapshot ?? undefined} />
          </div>
          <div className="w-72 shrink-0">
            <AdminPlayersPanel
              players={players}
              currentPlayerId={null}
              gameFinished={isFinished}
              gameId={game.id}
              onPlayerRemoved={() => fetchPlayers(game.id)}
              vertical
            />
          </div>
        </div>

        {/* Start button */}
        {isWaiting && (
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

      {/* Overlay (perguntando / respondendo / resultado) */}
      {isPlaying && (
        <AdminQuestionOverlay
          gameId={game.id}
          players={players}
          onFaseChange={handleFaseChange}
        />
      )}
      {showPodium && (
  <PodiumOverlay
    players={players}
    onClose={() => setShowPodium(false)}
  />
)}
    </div>
  );
}
