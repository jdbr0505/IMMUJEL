-- ==========================================================
-- add_client_id_solicitudes.sql — Evita solicitudes duplicadas cuando un envío se reintenta
-- Ejecutar en el SQL Editor de Supabase ANTES de subir la versión del formulario que envía client_id.
--
-- Por qué: si una solicitud llega al servidor pero la respuesta se pierde (señal débil, conexión cortada
-- justo al enviar), el formulario la guarda en el dispositivo y la reenvía. Sin una marca que la
-- identifique, el reenvío crea una segunda fila. Cada solicitud nace en el navegador con un client_id
-- (UUID al azar, sin datos personales). Si llega otra con un client_id que ya existe, un trigger la
-- descarta en silencio (la respuesta es la misma de siempre, así que el navegador la da por enviada).
--
-- Por qué un trigger y no INSERT ... ON CONFLICT DO NOTHING: Postgres exige permiso de lectura sobre las
-- columnas del ON CONFLICT, y anon no debe poder leer solicitudes (proteger_solicitudes.sql). Con ON CONFLICT
-- el envío público falla con "new row violates row-level security policy". El trigger corre con los
-- permisos de quien lo creó, así que no hace falta abrir ninguna lectura.
--
-- - Es seguro ejecutarlo más de una vez.
-- - No modifica filas existentes: las solicitudes que ya estaban quedan con client_id vacío, y el
--   índice único permite cualquier cantidad de filas vacías.
-- - Las solicitudes creadas desde el panel (Admin.js) no llevan client_id: no cambia nada para ellas.
-- - Las políticas de seguridad no cambian. Un envío repetido tampoco dispara otros triggers de INSERT
--   (por ejemplo, avisos) porque la fila nunca se crea.
-- ==========================================================

ALTER TABLE public.solicitudes
  ADD COLUMN IF NOT EXISTS client_id uuid;

-- Respaldo y velocidad: la comprobación del trigger usa este índice, y si dos envíos idénticos llegaran
-- exactamente a la vez, la base rechaza el segundo (el navegador lo reconoce como ya recibido).
CREATE UNIQUE INDEX IF NOT EXISTS solicitudes_client_id_key
  ON public.solicitudes (client_id);

COMMENT ON COLUMN public.solicitudes.client_id IS
  'UUID generado en el navegador al llenar el formulario; evita duplicados al reenviar una solicitud guardada sin conexión.';

CREATE OR REPLACE FUNCTION public.ignorar_solicitud_repetida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.client_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.solicitudes s WHERE s.client_id = NEW.client_id) THEN
    RETURN NULL; -- ya se recibió: se ignora sin error
  END IF;
  RETURN NEW;
END;
$$;

-- Es una función de trigger: nadie necesita llamarla directamente.
REVOKE ALL ON FUNCTION public.ignorar_solicitud_repetida() FROM PUBLIC, anon, authenticated;

-- El nombre va antes (orden alfabético) que el de otros triggers BEFORE INSERT, para que una repetida se descarte primero.
DROP TRIGGER IF EXISTS trg_a_ignorar_solicitud_repetida ON public.solicitudes;
CREATE TRIGGER trg_a_ignorar_solicitud_repetida
  BEFORE INSERT ON public.solicitudes
  FOR EACH ROW
  EXECUTE FUNCTION public.ignorar_solicitud_repetida();

-- Verificación: debe listar la columna (uuid), el índice único y el trigger.
SELECT column_name, data_type FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'solicitudes' AND column_name = 'client_id';

SELECT indexname FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'solicitudes' AND indexname = 'solicitudes_client_id_key';

SELECT tgname FROM pg_trigger
WHERE tgrelid = 'public.solicitudes'::regclass AND tgname = 'trg_a_ignorar_solicitud_repetida';
