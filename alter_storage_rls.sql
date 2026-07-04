-- Política para permitir subida de archivos a Storage sin autenticación
-- (para subidas desde PowerShell/anónimo, ejemplo: logos, imágenes base)

-- Bucket: publicacion-imagenes
DROP POLICY IF EXISTS "anon_insert_publicacion_imagenes" ON storage.objects;
CREATE POLICY "anon_insert_publicacion_imagenes" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'publicacion-imagenes');

DROP POLICY IF EXISTS "anon_select_publicacion_imagenes" ON storage.objects;
CREATE POLICY "anon_select_publicacion_imagenes" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'publicacion-imagenes');

-- Bucket: publicacion-pdfs
DROP POLICY IF EXISTS "anon_insert_publicacion_pdfs" ON storage.objects;
CREATE POLICY "anon_insert_publicacion_pdfs" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'publicacion-pdfs');

DROP POLICY IF EXISTS "anon_select_publicacion_pdfs" ON storage.objects;
CREATE POLICY "anon_select_publicacion_pdfs" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'publicacion-pdfs');

-- También permitir a usuarios autenticados (los del CMS)
DROP POLICY IF EXISTS "auth_insert_publicacion_imagenes" ON storage.objects;
CREATE POLICY "auth_insert_publicacion_imagenes" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'publicacion-imagenes');

DROP POLICY IF EXISTS "auth_insert_publicacion_pdfs" ON storage.objects;
CREATE POLICY "auth_insert_publicacion_pdfs" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'publicacion-pdfs');
