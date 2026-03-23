
-- 1. Create perguntas table
CREATE TABLE public.perguntas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  texto TEXT NOT NULL,
  alternativa_a TEXT NOT NULL,
  alternativa_b TEXT NOT NULL,
  alternativa_c TEXT NOT NULL,
  alternativa_d TEXT NOT NULL,
  resposta_correta TEXT NOT NULL CHECK (resposta_correta IN ('a','b','c','d')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.perguntas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read perguntas" ON public.perguntas
  FOR SELECT TO public USING (true);

-- 2. Add posicao and pular_vez to jogadores
ALTER TABLE public.jogadores
  ADD COLUMN posicao INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN pular_vez BOOLEAN NOT NULL DEFAULT false;

-- 3. Add jogador_atual_id to jogos
ALTER TABLE public.jogos
  ADD COLUMN jogador_atual_id UUID REFERENCES public.jogadores(id);

-- 4. Enable realtime for jogos (already have jogadores)
ALTER PUBLICATION supabase_realtime ADD TABLE public.jogos;

-- 5. Function: pegar_pergunta (returns random question)
CREATE OR REPLACE FUNCTION public.pegar_pergunta()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  pergunta_row perguntas%ROWTYPE;
BEGIN
  SELECT * INTO pergunta_row FROM perguntas ORDER BY random() LIMIT 1;
  IF pergunta_row IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN json_build_object(
    'id', pergunta_row.id,
    'texto', pergunta_row.texto,
    'alternativa_a', pergunta_row.alternativa_a,
    'alternativa_b', pergunta_row.alternativa_b,
    'alternativa_c', pergunta_row.alternativa_c,
    'alternativa_d', pergunta_row.alternativa_d
  );
END;
$$;

-- 6. Function: jogar (process a play)
CREATE OR REPLACE FUNCTION public.jogar(
  p_jogo_id UUID,
  p_jogador_id UUID,
  p_dado INTEGER,
  p_acertou BOOLEAN,
  p_pergunta_id UUID
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  nova_posicao INTEGER;
  posicao_atual INTEGER;
  evento TEXT := NULL;
  venceu BOOLEAN := false;
BEGIN
  SELECT posicao INTO posicao_atual FROM jogadores WHERE id = p_jogador_id;

  IF p_acertou THEN
    nova_posicao := posicao_atual + p_dado;
  ELSE
    nova_posicao := posicao_atual;
  END IF;

  -- Special houses
  IF nova_posicao = 10 THEN
    nova_posicao := nova_posicao - 2;
    evento := 'Casa 10: Volte 2 casas!';
  ELSIF nova_posicao = 20 THEN
    nova_posicao := nova_posicao + 1;
    evento := 'Casa 20: Avance +1 casa!';
  ELSIF nova_posicao = 30 THEN
    UPDATE jogadores SET pular_vez = true WHERE id = p_jogador_id;
    evento := 'Casa 30: Perde a próxima vez!';
  ELSIF nova_posicao = 40 THEN
    nova_posicao := nova_posicao - 2;
    evento := 'Casa 40: Volte 2 casas!';
  END IF;

  -- Win condition
  IF nova_posicao >= 42 THEN
    nova_posicao := 42;
    venceu := true;
    UPDATE jogos SET status = 'finalizado' WHERE id = p_jogo_id;
  END IF;

  UPDATE jogadores SET posicao = nova_posicao WHERE id = p_jogador_id;

  RETURN json_build_object(
    'nova_posicao', nova_posicao,
    'evento', evento,
    'venceu', venceu
  );
END;
$$;

-- 7. Function: proximo_turno
CREATE OR REPLACE FUNCTION public.proximo_turno(p_jogo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  jogadores_arr UUID[];
  atual_id UUID;
  idx INTEGER;
  next_id UUID;
  total INTEGER;
  tentativas INTEGER := 0;
BEGIN
  SELECT jogador_atual_id INTO atual_id FROM jogos WHERE id = p_jogo_id;

  SELECT array_agg(id ORDER BY created_at) INTO jogadores_arr
  FROM jogadores WHERE jogo_id = p_jogo_id;

  total := array_length(jogadores_arr, 1);
  IF total IS NULL OR total = 0 THEN RETURN; END IF;

  -- Find current index
  FOR i IN 1..total LOOP
    IF jogadores_arr[i] = atual_id THEN
      idx := i;
      EXIT;
    END IF;
  END LOOP;

  IF idx IS NULL THEN idx := 0; END IF;

  -- Find next player (skip those with pular_vez)
  LOOP
    idx := idx % total + 1;
    next_id := jogadores_arr[idx];
    tentativas := tentativas + 1;

    IF tentativas > total * 2 THEN EXIT; END IF;

    -- Check pular_vez
    IF EXISTS (SELECT 1 FROM jogadores WHERE id = next_id AND pular_vez = true) THEN
      UPDATE jogadores SET pular_vez = false WHERE id = next_id;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  UPDATE jogos SET jogador_atual_id = next_id WHERE id = p_jogo_id;
END;
$$;

-- 8. Update iniciar_jogo to set first player
CREATE OR REPLACE FUNCTION public.iniciar_jogo(p_jogo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  primeiro_jogador UUID;
BEGIN
  SELECT id INTO primeiro_jogador FROM jogadores
  WHERE jogo_id = p_jogo_id ORDER BY created_at LIMIT 1;

  UPDATE jogos SET status = 'em_andamento', jogador_atual_id = primeiro_jogador
  WHERE id = p_jogo_id;
END;
$$;

-- 9. Insert sample questions
INSERT INTO perguntas (texto, alternativa_a, alternativa_b, alternativa_c, alternativa_d, resposta_correta) VALUES
('Qual é a capital do Brasil?', 'São Paulo', 'Rio de Janeiro', 'Brasília', 'Salvador', 'c'),
('Quanto é 7 x 8?', '54', '56', '58', '64', 'b'),
('Qual o maior planeta do sistema solar?', 'Saturno', 'Júpiter', 'Netuno', 'Urano', 'b'),
('Quem pintou a Mona Lisa?', 'Michelangelo', 'Raphael', 'Leonardo da Vinci', 'Donatello', 'c'),
('Qual é o elemento químico representado por "O"?', 'Ouro', 'Oxigênio', 'Ósmio', 'Olívio', 'b'),
('Em que ano o Brasil foi descoberto?', '1498', '1500', '1502', '1510', 'b'),
('Qual é o maior oceano do mundo?', 'Atlântico', 'Índico', 'Pacífico', 'Ártico', 'c'),
('Quantos estados tem o Brasil?', '24', '25', '26', '27', 'c'),
('Qual a fórmula da água?', 'CO2', 'H2O', 'NaCl', 'O2', 'b'),
('Quem escreveu Dom Casmurro?', 'José de Alencar', 'Machado de Assis', 'Monteiro Lobato', 'Clarice Lispector', 'b');

-- 10. Allow UPDATE on jogos for game state changes (needed for functions)
CREATE POLICY "Anyone can update jogos" ON public.jogos
  FOR UPDATE TO public USING (true) WITH CHECK (true);

-- 11. Allow UPDATE on jogadores for position changes
CREATE POLICY "Anyone can update jogadores" ON public.jogadores
  FOR UPDATE TO public USING (true) WITH CHECK (true);
