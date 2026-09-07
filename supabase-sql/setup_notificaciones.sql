-- ==========================================================
-- setup_notificaciones.sql
-- Webhook que llama a la Edge Function cuando se publica una publicación
-- Requiere: pg_net extension habilitada
-- ==========================================================

-- 1. Habilitar pg_net (solo si no está)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Función que llama al webhook
CREATE OR REPLACE FUNCTION public.notify_new_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Solo notificar si se está publicando (cambió a true)
  IF NEW.publicado = true AND (OLD.publicado IS DISTINCT FROM true) THEN
    PERFORM net.http_post(
      url := CONCAT(current_setting('vault.settings.supa_url', true), '/functions/v1/send-notification'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', CONCAT('Bearer ', current_setting('vault.settings.supa_anon_key', true))
      ),
      body := jsonb_build_object(
        'record', jsonb_build_object(
          'id', NEW.id,
          'titulo', NEW.titulo,
          'resumen', NEW.resumen,
          'tipo', NEW.tipo,
          'fecha_publicacion', NEW.fecha_publicacion,
          'publicado', NEW.publicado
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Trigger sobre publicaciones (solo en UPDATE)
DROP TRIGGER IF EXISTS trg_notify_publication ON publicaciones;
CREATE TRIGGER trg_notify_publication
  AFTER UPDATE OF publicado ON publicaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_publication();

-- 4. También notificar en INSERT si ya viene publicado
CREATE OR REPLACE FUNCTION public.notify_new_publication_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.publicado = true THEN
    PERFORM net.http_post(
      url := CONCAT(current_setting('vault.settings.supa_url', true), '/functions/v1/send-notification'),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', CONCAT('Bearer ', current_setting('vault.settings.supa_anon_key', true))
      ),
      body := jsonb_build_object(
        'record', jsonb_build_object(
          'id', NEW.id,
          'titulo', NEW.titulo,
          'resumen', NEW.resumen,
          'tipo', NEW.tipo,
          'fecha_publicacion', NEW.fecha_publicacion,
          'publicado', NEW.publicado
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_publication_insert ON publicaciones;
CREATE TRIGGER trg_notify_publication_insert
  AFTER INSERT ON publicaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_publication_insert();
