import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
      const { data: jogo, error: jogoError } = await supabase
        .from("jogos")
        .select("id")
        .eq("pin", pin)
        .maybeSingle();

      console.log("[JoinGame] PIN lookup:", { pin, jogo, jogoError });

      if (jogoError) throw jogoError;
      if (!jogo) {
        setError("PIN inválido! Verifique e tente novamente.");
        setLoading(false);
        return;
      }

      const { data: insertData, error: insertError } = await supabase
        .from("jogadores")
        .insert({
          jogo_id: jogo.id,
          nickname: nick.trim(),
          cor_empilhadeira: generateRandomColor(),
        })
        .select("id")
        .single();

      console.log("[JoinGame] INSERT:", { insertData, insertError });

      if (insertError) {
        if (insertError.code === "23505") {
          setError("Esse nickname já está em uso! Escolha outro.");
        } else {
          setError("Erro ao entrar no jogo. Tente novamente.");
        }
        setLoading(false);
        return;
      }

      const { data: insertedPlayer, error: insertedPlayerError } = await supabase
        .from("jogadores")
        .select("id, jogo_id, nickname, cor_empilhadeira")
        .eq("id", insertData.id)
        .single();

      console.log("[JoinGame] INSERT validation SELECT:", { insertedPlayer, insertedPlayerError });

      if (insertedPlayerError || !insertedPlayer) {
        setError("Erro ao confirmar sua entrada no banco. Tente novamente.");
        setLoading(false);
        return;
      }

      setGameId(jogo.id);
      setPlayerId(insertedPlayer.id);
      setNickname(nick.trim());
    } catch (err) {
      console.error("[JoinGame] Error:", err);
      setError("Erro inesperado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  if (gameId && playerId && gameStatus === "em_andamento") {
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
