-- Agregar columna tipo_asesoria a solicitudes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'solicitudes' AND column_name = 'tipo_asesoria') THEN
    ALTER TABLE solicitudes ADD COLUMN tipo_asesoria TEXT CHECK (tipo_asesoria IN ('juridica', 'psicologica', 'social', 'general'));
  END IF;
END $$;
