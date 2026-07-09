-- Recrear funciones con URL directa
-- La anon key de este proyecto es la misma usada en Login_supabase.js
-- En caso de fallar, se reemplaza por la service_role key

-- Función para UPDATE
CREATE OR REPLACE FUNCTION public.notify_new_publication()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.publicado = true AND (OLD.publicado IS DISTINCT FROM true) THEN
    PERFORM net.http_post(
      url := 'https://vhgfyqodiieblhfwbama.supabase.co/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZ2Z5cW9kaWllYmxoZndiYW1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTI4NDEsImV4cCI6MjA5MDkyODg0MX0.rG6waTumXqBTn8GxnuljYre0qUn4ZcAijx2egcGGgB0'
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

-- Función para INSERT
CREATE OR REPLACE FUNCTION public.notify_new_publication_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.publicado = true THEN
    PERFORM net.http_post(
      url := 'https://vhgfyqodiieblhfwbama.supabase.co/functions/v1/send-notification',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZ2Z5cW9kaWllYmxoZndiYW1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTI4NDEsImV4cCI6MjA5MDkyODg0MX0.rG6waTumXqBTn8GxnuljYre0qUn4ZcAijx2egcGGgB0'
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

-- Recrear triggers para asegurar que apunten a las funciones correctas
DROP TRIGGER IF EXISTS trg_notify_publication ON publicaciones;
CREATE TRIGGER trg_notify_publication
  AFTER UPDATE OF publicado ON publicaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_publication();

DROP TRIGGER IF EXISTS trg_notify_publication_insert ON publicaciones;
CREATE TRIGGER trg_notify_publication_insert
  AFTER INSERT ON publicaciones
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_publication_insert();