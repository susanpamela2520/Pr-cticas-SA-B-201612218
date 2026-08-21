CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_cifrado TEXT NOT NULL,
  correo_cifrado TEXT NOT NULL,
  contrasena_cifrada TEXT NOT NULL,
  correo_hash CHAR(64) NOT NULL UNIQUE,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('Cliente', 'Agente', 'Admin')),
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_correo_hash ON usuarios (correo_hash);
