-- Reemplazar funciones de trigger para usar valores directos (sin vault)
-- NOTA: reemplaza <SUPABASE_ANON_KEY> con el anon key actual del proyecto
-- (Supabase Dashboard → Settings → API → anon public)
-- Vuelve a ejecutar este script en el SQL Editor cada vez que rotes el JWT secret.

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
        'Authorization', 'Bearer <SUPABASE_ANON_KEY>'
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
        'Authorization', 'Bearer <SUPABASE_ANON_KEY>'
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
