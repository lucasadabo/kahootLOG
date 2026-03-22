
-- Function to create a new game with random 6-digit PIN
CREATE OR REPLACE FUNCTION public.criar_jogo()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  novo_pin TEXT;
  novo_id UUID;
BEGIN
  -- Generate unique 6-digit PIN
  LOOP
    novo_pin := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM jogos WHERE pin = novo_pin);
  END LOOP;

  INSERT INTO jogos (pin, nome, status)
  VALUES (novo_pin, 'Jogo ' || novo_pin, 'aguardando')
  RETURNING id INTO novo_id;

  RETURN novo_id;
END;
$$;

-- Function to start a game
CREATE OR REPLACE FUNCTION public.iniciar_jogo(p_jogo_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE jogos SET status = 'em_andamento' WHERE id = p_jogo_id;
END;
$$;
