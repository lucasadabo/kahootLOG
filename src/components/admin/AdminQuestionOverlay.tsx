import { useEffect, useState, useRef, useCallback } from "react";
import {
  HelpCircle, CheckCircle2, XCircle, Clock,
  Users, Loader2, ChevronRight,
} from "lucide-react";
import { gameSupabase } from "@/lib/gameSupabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Pergunta {
  id: string;
  texto: string;
  alternativa_a: string;
  alternativa_b: string;
  alternativa_c: string;
  alternativa_d: string;
  resposta_correta: string;
}

interface PlayerResult {
  id: string;
  nickname: string;
  cor_empilhadeira: string;
  posicao: number;
  dado_rodada_atual: number | null;
  respondeu_rodada_atual: boolean;
  acertou_rodada_atual: boolean | null;
}

type FaseRodada = "rolando_dado" | "perguntando" | "respondendo" | "resultado";

interface AdminQuestionOverlayProps {
  gameId: string;
  players: { id: string; nickname: string; cor_empilhadeira: string; posicao: number }[];
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

function playMovementSound() {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const duration = 2.5;
    const osc1 = audioCtx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(55, audioCtx.currentTime);
    osc1.frequency.linearRampToValueAtTime(80, audioCtx.currentTime + duration);
    const gain1 = audioCtx.createGain();
    gain1.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain1.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration + 0.3);
    osc1.connect(gain1).connect(audioCtx.destination);
    osc1.start(); osc1.stop(audioCtx.currentTime + duration + 0.3);
    const osc2 = audioCtx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(523, audioCtx.currentTime);
    osc2.frequency.setValueAtTime(659, audioCtx.currentTime + 0.15);
    osc2.frequency.setValueAtTime(784, audioCtx.currentTime + 0.3);
    const gain2 = audioCtx.createGain();
    gain2.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain2.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6);
    osc2.connect(gain2).connect(audioCtx.destination);
    osc2.start(); osc2.stop(audioCtx.currentTime + 0.6);
  } catch (_) { /* audio not supported */ }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AdminQuestionOverlay({ gameId, players }: AdminQuestionOverlayProps) {
  const [fase, setFase] = useState<FaseRodada>("rolando_dado");
  const [pergunta, setPergunta] = useState<Pergunta | null>(null);
  const [playerResults, setPlayerResults] = useState<PlayerResult[]>([]);
  const [tempoRestante, setTempoRestante] = useState<number | null>(null);
  const [tempoTotal, setTempoTotal] = useState<number>(0);
  const [advancing, setAdvancing] = useState(false);

  const timerRef = useRef<number | null>(null);
  const prevFaseRef = useRef<FaseRodada | null>(null);
  const prevPerguntaIdRef = useRef<string | null>(null);
  const soundPlayedRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Timer
  // ---------------------------------------------------------------------------

  const stopTimer = useCallback(() => {
    if (timerRef.current) { window.clearInterval(timerRef.current); timerRef.current = null; }
    setTempoRestante(null);
  }, []);

  const startTimer = useCallback((seconds: number) => {
    stopTimer();
    setTempoRestante(seconds);
    timerRef.current = window.setInterval(() => {
      setTempoRestante((prev) => {
        if (prev === null) return null;
        if (prev <= 1) { window.clearInterval(timerRef.current!); timerRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }, [stopTimer]);

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchState = useCallback(async () => {
    const { data: jogoData } = await gameSupabase
      .from("jogos")
      .select("fase_rodada, pergunta_rodada_id, tempo_limite, status")
      .eq("id", gameId)
      .single();

    if (!jogoData) return;

    const novaFase = (jogoData.fase_rodada ?? "rolando_dado") as FaseRodada;
    const novaPerguntaId = jogoData.pergunta_rodada_id ?? null;
    const faseChanged = prevFaseRef.current !== novaFase;
    const perguntaChanged = prevPerguntaIdRef.current !== novaPerguntaId;
    prevFaseRef.current = novaFase;
    prevPerguntaIdRef.current = novaPerguntaId;

    setFase(novaFase);

    if ((novaFase === "perguntando" || novaFase === "respondendo") && novaPerguntaId) {
      if (faseChanged || perguntaChanged) {
        // Fetch question text
        const { data: pData } = await gameSupabase
          .from("perguntas")
          .select("*")
          .eq("id", novaPerguntaId)
          .single();
        if (pData) {
          setPergunta({
            id: String(pData.id),
            texto: String(pData.pergunta ?? ""),
            alternativa_a: String(pData.alternativa_a ?? ""),
            alternativa_b: String(pData.alternativa_b ?? ""),
            alternativa_c: String(pData.alternativa_c ?? ""),
            alternativa_d: String(pData.alternativa_d ?? ""),
            resposta_correta: String(pData.correta ?? ""),
          });
        }

        // Start timer when question appears
        if (novaFase === "perguntando") {
          const tempo = typeof (jogoData as any).tempo_limite === "number"
            ? (jogoData as any).tempo_limite : 0;
          setTempoTotal(tempo);
          if (tempo > 0) startTimer(tempo);
        }
      }
    }

    if (novaFase === "rolando_dado" && faseChanged) {
      setPergunta(null);
      stopTimer();
      soundPlayedRef.current = false;
    }

    if (novaFase === "resultado" && faseChanged) {
      stopTimer();
    }

    // Always refresh player results
    const { data: jogadoresData } = await gameSupabase
      .from("jogadores")
      .select("id, nickname, cor_empilhadeira, posicao, dado_rodada_atual, respondeu_rodada_atual, acertou_rodada_atual")
      .eq("jogo_id", gameId)
      .order("created_at", { ascending: true });

    if (jogadoresData) {
      setPlayerResults(jogadoresData as PlayerResult[]);

      // Play sound when first player moves
      if (!soundPlayedRef.current && novaFase === "resultado") {
        const alguemMoveu = (jogadoresData as PlayerResult[]).some(
          (p) => p.acertou_rodada_atual === true
        );
        if (alguemMoveu) { playMovementSound(); soundPlayedRef.current = true; }
      }
    }
  }, [gameId, startTimer, stopTimer]);

  // ---------------------------------------------------------------------------
  // Subscriptions + polling
  // ---------------------------------------------------------------------------

  useEffect(() => {
    fetchState();
    const channel = gameSupabase
      .channel(`admin-overlay-db-${gameId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "jogos", filter: `id=eq.${gameId}` }, fetchState)
      .on("postgres_changes", { event: "*", schema: "public", table: "jogadores", filter: `jogo_id=eq.${gameId}` }, fetchState)
      .subscribe();
    const poll = window.setInterval(fetchState, 1500);

    return () => {
      stopTimer();
      window.clearInterval(poll);
      gameSupabase.removeChannel(channel);
    };
  }, [gameId, fetchState, stopTimer]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

const handleNextRound = async () => {
  if (advancing) return;
  setAdvancing(true);
  try {
    if (fase === "resultado") {
      await gameSupabase.rpc("iniciar_proxima_rodada", { p_jogo_id: gameId });
    } else {
      await gameSupabase.rpc("forcar_proxima_fase", { p_jogo_id: gameId });
    }
    await fetchState();
  } catch (err) {
    console.error("[AdminOverlay] handleNextRound error:", err);
  } finally {
    setAdvancing(false);
  }
};

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const totalJogadores = playerResults.length || players.length;
  const jaRolaram = playerResults.filter((p) => p.dado_rodada_atual != null).length;
  const jaResponderam = playerResults.filter((p) => p.respondeu_rodada_atual).length;
  const acertaram = playerResults.filter((p) => p.acertou_rodada_atual === true);
  const erraram = playerResults.filter((p) => p.respondeu_rodada_atual && p.acertou_rodada_atual === false);
  const todosResponderam = jaResponderam >= totalJogadores && totalJogadores > 0;
  const timerLow = tempoRestante !== null && tempoRestante <= 10;

  // ---------------------------------------------------------------------------
  // Render: only shows overlay for perguntando / respondendo / resultado
  // ---------------------------------------------------------------------------

// DEPOIS
const showOverlay = fase === "perguntando" || fase === "respondendo" || fase === "resultado";

// Caso especial: fase rolando_dado mostra só o botão de força (sem pergunta)
if (fase === "rolando_dado") {
  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={handleNextRound}
        disabled={advancing}
        className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-destructive text-destructive-foreground font-display font-bold text-sm shadow-lg hover:scale-[1.03] active:scale-[0.97] transition-all disabled:opacity-60"
      >
        {advancing ? "Forçando..." : "⚡ Forçar início da pergunta"}
      </button>
    </div>
  );
}

if (!showOverlay || !pergunta) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-3xl mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-primary/10">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-6 h-6 text-primary" />
            <div>
              <p className="font-display font-bold text-lg text-foreground">
                Pergunta da Rodada
              </p>
              <p className="text-sm text-muted-foreground font-body flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {jaResponderam}/{totalJogadores} responderam
              </p>
            </div>
          </div>

          {/* Timer */}
          {tempoRestante !== null && fase !== "resultado" && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border-2 transition-colors ${
              timerLow
                ? "bg-destructive/10 border-destructive/50 animate-pulse"
                : "bg-accent/10 border-accent/30"
            }`}>
              <Clock className={`w-5 h-5 ${timerLow ? "text-destructive" : "text-accent"}`} />
              <span className={`font-display font-bold text-2xl ${timerLow ? "text-destructive" : "text-accent"}`}>
                {tempoRestante}s
              </span>
            </div>
          )}
        </div>

        {/* ── Body ── */}
        <div className="p-6 space-y-5">

          {/* Pergunta */}
          <p className="font-display font-bold text-xl text-foreground text-center">
            {pergunta.texto}
          </p>

          {/* Alternativas com resposta destacada se fase=resultado */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(["A", "B", "C", "D"] as const).map((letter) => {
              const fieldKey = `alternativa_${letter.toLowerCase()}` as keyof Pergunta;
              const isCorreta = letter.toUpperCase() === pergunta.resposta_correta.toUpperCase();
              return (
                <div
                  key={letter}
                  className={`p-4 rounded-xl border font-body text-foreground transition-all ${
                    fase === "resultado" && isCorreta
                      ? "bg-accent/15 border-accent/60 ring-1 ring-accent/30"
                      : "border-border bg-background/50"
                  }`}
                >
                  <span className={`font-display font-bold mr-2 ${fase === "resultado" && isCorreta ? "text-accent" : "text-primary"}`}>
                    {letter})
                  </span>
                  {pergunta[fieldKey]}
                  {fase === "resultado" && isCorreta && (
                    <CheckCircle2 className="inline-block w-4 h-4 text-accent ml-2 mb-0.5" />
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Aguardando respostas ── */}
          {(fase === "perguntando" || fase === "respondendo") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm font-body text-muted-foreground">
                <span>Aguardando respostas...</span>
                <span className="font-bold text-foreground">{jaResponderam}/{totalJogadores}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {playerResults.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-display font-medium border transition-all ${
                      p.respondeu_rodada_atual
                        ? p.acertou_rodada_atual
                          ? "bg-accent/10 border-accent/30 text-accent"
                          : "bg-destructive/10 border-destructive/30 text-destructive"
                        : "bg-card border-border text-muted-foreground"
                    }`}
                  >
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.cor_empilhadeira }} />
                    {p.nickname}
                    {p.dado_rodada_atual != null && (
                      <span className="text-xs font-body opacity-70">🎲{p.dado_rodada_atual}</span>
                    )}
                    {p.respondeu_rodada_atual
                      ? p.acertou_rodada_atual
                        ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 shrink-0" />
                      : <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin opacity-50" />
                    }
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Resultado completo ── */}
          {fase === "resultado" && (
            <div className="space-y-4 animate-in zoom-in-95 duration-300">

              {/* Acertaram */}
              {acertaram.length > 0 && (
                <div className="p-4 rounded-xl bg-accent/10 border border-accent/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-accent" />
                    <span className="font-display font-bold text-accent">Acertaram ({acertaram.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {acertaram.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-accent/20 text-sm font-display">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.cor_empilhadeira }} />
                        <span className="text-foreground font-medium">{p.nickname}</span>
                        <span className="text-muted-foreground text-xs">🎲{p.dado_rodada_atual}</span>
                        <span className="text-accent text-xs font-bold">→ casa {p.posicao}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Erraram */}
              {erraram.length > 0 && (
                <div className="p-4 rounded-xl bg-destructive/5 border border-destructive/20 space-y-3">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-destructive" />
                    <span className="font-display font-bold text-destructive">Erraram / Timeout ({erraram.length})</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {erraram.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-card border border-destructive/20 text-sm font-display">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.cor_empilhadeira }} />
                        <span className="text-foreground font-medium">{p.nickname}</span>
                        <span className="text-muted-foreground text-xs">casa {p.posicao}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botão próxima rodada */}
              <div className="flex justify-center pt-2">
                <button
                  onClick={handleNextRound}
                  disabled={advancing}
                  className="inline-flex items-center gap-2 h-14 px-8 rounded-2xl bg-primary text-primary-foreground font-display font-bold text-lg shadow-[var(--shadow-glow)] hover:scale-[1.03] active:scale-[0.97] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {advancing
                    ? <><Loader2 className="w-5 h-5 animate-spin" />Avançando...</>
                    : <><ChevronRight className="w-5 h-5" />Próxima Rodada</>
                  }
                </button>
              </div>
            </div>
          )}

          {/* Forçar próxima rodada durante resposta (escape hatch pro professor) */}
          {(fase === "perguntando" || fase === "respondendo") && !todosResponderam && (
            <div className="flex justify-center">
              <button
                onClick={handleNextRound}
                disabled={advancing}
                className="text-xs font-body text-muted-foreground hover:text-foreground underline transition-colors disabled:opacity-50"
              >
                {advancing ? "Avançando..." : "Forçar próxima rodada"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
