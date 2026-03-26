import { useState } from "react";
import { gameSupabase } from "@/lib/gameSupabase";
import { JoinForm } from "@/components/game/JoinForm";
import { WaitingLobby } from "@/components/game/WaitingLobby";
import { GamePlay } from "@/components/game/GamePlay";

function generateRandomColor(): string {
  const colors = [
    "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4",
    "#FFEAA7", "#DDA0DD", "#98D8C8", "#F7DC6F",
    "#BB8FCE", "#85C1E9", "#F8C471", "#82E0AA",
    "#F1948A", "#AED6F1", "#D7BDE2", "#A3E4D7",
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

export default function JoinGame() {
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [nickname, setNickname] = useState("");
  const [gameStatus, setGameStatus] = useState<string>("aguardando");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async (pin: string, nick: string) => {
    setError("");
    setLoading(true);

    try {
      const { data: jogo, error: jogoError } = await gameSupabase
        .from("jogos")
        .select("id, status")
        .eq("pin", pin)
        .maybeSingle();

      console.log("[JoinGame] PIN lookup SELECT:", { pin, jogo, jogoError });

      if (jogoError) throw jogoError;
      if (!jogo) {
        setError("PIN inválido! Verifique e tente novamente.");
        return;
      }

      const { data: insertData, error: insertError } = await gameSupabase
        .from("jogadores")
        .insert({
          jogo_id: jogo.id,
          nickname: nick.trim(),
          cor_empilhadeira: generateRandomColor(),
        })
        .select("id")
        .single();

      console.log("[JoinGame] jogador INSERT:", { insertData, insertError });

      if (insertError || !insertData) {
        console.error("[JoinGame] jogador INSERT ERROR:", insertError);
        if (insertError?.code === "23505") {
          setError("Esse nickname já está em uso! Escolha outro.");
        } else {
          setError("Erro ao entrar no jogo. Tente novamente.");
        }
        return;
      }

      const { data: insertedPlayer, error: insertedPlayerError } = await gameSupabase
        .from("jogadores")
        .select("id, jogo_id, nickname, cor_empilhadeira, posicao")
        .eq("id", insertData.id)
        .single();

      console.log("[JoinGame] jogador validation SELECT:", { insertedPlayer, insertedPlayerError });

      if (insertedPlayerError || !insertedPlayer) {
        console.error("[JoinGame] jogador validation ERROR:", insertedPlayerError);
        setError("Erro ao confirmar sua entrada no banco. Tente novamente.");
        return;
      }

      setGameId(jogo.id);
      setPlayerId(insertedPlayer.id);
      setNickname(insertedPlayer.nickname);
      setGameStatus(jogo.status ?? "aguardando");
    } catch (err) {
      console.error("[JoinGame] Error:", err);
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (gameId && playerId && (gameStatus === "em_andamento" || gameStatus === "finalizado")) {
    return <GamePlay gameId={gameId} playerId={playerId} nickname={nickname} />;
  }

  if (gameId && playerId) {
    return (
      <WaitingLobby
        gameId={gameId}
        nickname={nickname}
        onGameStart={() => setGameStatus("em_andamento")}
      />
    );
  }

  return <JoinForm onJoin={handleJoin} error={error} loading={loading} />;
}