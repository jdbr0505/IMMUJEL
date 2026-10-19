-- ==========================================================
-- add_finalizado_en.sql — Guarda cuándo se finaliza una solicitud
-- Sirve para el "Tiempo medio de resolución" del dashboard
-- (Admin/Dashboard.html). Ejecutar en el SQL Editor de Supabase.
--
-- - Es seguro ejecutarlo más de una vez.
-- - No modifica filas existentes: las solicitudes que ya estaban
--   finalizadas quedan sin fecha de cierre y el dashboard las ignora.
-- - Desde que se ejecuta, cada cambio de estado a 'finalizado' registra
--   la fecha; si la solicitud se reabre, la fecha se borra.
-- ==========================================================

ALTER TABLE public.solicitudes
  ADD COLUMN IF NOT EXISTS finalizado_en timestamptz;

CREATE OR REPLACE FUNCTION public.set_solicitud_finalizado_en()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.estado = 'finalizado' AND OLD.estado IS DISTINCT FROM 'finalizado' THEN
    NEW.finalizado_en := now();
  ELSIF NEW.estado IS DISTINCT FROM 'finalizado' THEN
    NEW.finalizado_en := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_solicitud_finalizado_en ON public.solicitudes;
CREATE TRIGGER trg_solicitud_finalizado_en
  BEFORE UPDATE OF estado ON public.solicitudes
  FOR EACH ROW
  EXECUTE FUNCTION public.set_solicitud_finalizado_en();

-- Verificación: debe listar la columna y el trigger.
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'solicitudes' AND column_name = 'finalizado_en';

SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.solicitudes'::regclass AND tgname = 'trg_solicitud_finalizado_en';
