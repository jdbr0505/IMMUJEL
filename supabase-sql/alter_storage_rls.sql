-- Política para permitir subida de archivos a Storage sin autenticación
-- (para subidas desde PowerShell/anónimo, ejemplo: logos, imágenes base)

-- Bucket: publicacion-imagenes
-- Nota: las inserciones anónimas están deshabilitadas por seguridad.
-- Solo usuarios autenticados pueden subir archivos a Storage.
-- Las políticas SELECT anónimas se mantienen solo para lectura pública.

-- También permitir a usuarios autenticados (los del CMS)
DROP POLICY IF EXISTS "auth_insert_publicacion_imagenes" ON storage.objects;
CREATE POLICY "auth_insert_publicacion_imagenes" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'publicacion-imagenes');

DROP POLICY IF EXISTS "auth_insert_publicacion_pdfs" ON storage.objects;
CREATE POLICY "auth_insert_publicacion_pdfs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'publicacion-pdfs');
