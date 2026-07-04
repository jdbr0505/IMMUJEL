-- ==========================================================
-- Sincronizar auth.users → perfiles
-- Crea perfiles para usuarios que faltan (rol = 'usuaria')
-- ==========================================================

-- 1. VER usuarios SIN perfil (solo consulta)
SELECT au.id, au.email, au.created_at,
       COALESCE(au.raw_user_meta_data->>'nombre_completo', 'Sin nombre') as nombre_completo,
       COALESCE(au.raw_user_meta_data->>'nombre_usuario', split_part(au.email, '@', 1)) as nombre_usuario
FROM auth.users au
LEFT JOIN public.perfiles p ON p.id = au.id
WHERE p.id IS NULL
ORDER BY au.created_at DESC;

-- 2. INSERTAR perfiles faltantes (rol = 'usuaria')
INSERT INTO public.perfiles (id, email, nombre_completo, nombre_usuario, rol, telefono, created_at)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'nombre_completo', 'Sin nombre'),
  COALESCE(au.raw_user_meta_data->>'nombre_usuario', split_part(au.email, '@', 1)),
  'usuaria',
  COALESCE(au.raw_user_meta_data->>'telefono', ''),
  COALESCE(au.created_at, now())
FROM auth.users au
LEFT JOIN public.perfiles p ON p.id = au.id
WHERE p.id IS NULL;

-- 3. Verificar que ahora todos tengan perfil
SELECT COUNT(*) as total_auth_users FROM auth.users;
SELECT COUNT(*) as total_perfiles FROM perfiles;
SELECT COUNT(*) as sin_perfil FROM auth.users au
LEFT JOIN perfiles p ON p.id = au.id WHERE p.id IS NULL;
