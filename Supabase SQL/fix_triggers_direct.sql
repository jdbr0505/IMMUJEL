-- Reemplazar funciones de trigger para usar valores directos (sin vault)
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
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZ2Z5cW9kaWVibGhmYndiYW1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4NDA0ODIsImV4cCI6MjA1OTQxNjQ4Mn0.ZZP5WsYLXDEhzQK4wVwYx-UZYs9GfXQUIM9KWyUrNYY'
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
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZ2Z5cW9kaWlibGhmYndiYW1hIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM4MDA0ODIsImV4cCI6MjA1OTQxNjQ4Mn0.ZZP5WsYLXDEhzQK4wVwYx-UZYs9GfXQUIM9KWyUrNYY'
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