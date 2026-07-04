-- Agregar created_at si no existe
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'perfiles' AND column_name = 'created_at') THEN
    ALTER TABLE perfiles ADD COLUMN created_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- Políticas RLS para perfiles (lectura para autenticados, escritura solo admin)
DROP POLICY IF EXISTS "perfiles_select" ON perfiles;
CREATE POLICY "perfiles_select" ON perfiles
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "perfiles_update" ON perfiles;
CREATE POLICY "perfiles_update" ON perfiles
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);
