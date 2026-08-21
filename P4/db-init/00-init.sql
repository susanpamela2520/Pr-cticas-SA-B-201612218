-- Este script corre UNA sola vez, la primera vez que se crea el
-- volumen de Postgres (docker-entrypoint-initdb.d). Crea las 3 bases
-- de datos (una por microservicio con persistencia) y las tablas de
-- los dos servicios Node/pg. tickets-service (Python/SQLAlchemy) crea
-- su propia tabla automáticamente al arrancar, así que no aparece aquí.

CREATE DATABASE auth_db;
CREATE DATABASE tickets_db;
CREATE DATABASE comentarios_db;

\c auth_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre_cifrado TEXT NOT NULL,
  correo_cifrado TEXT NOT NULL,
  contrasena_cifrada TEXT NOT NULL,
  correo_hash CHAR(64) NOT NULL UNIQUE,
  rol VARCHAR(20) NOT NULL CHECK (rol IN ('Cliente', 'Agente', 'Admin')),
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_usuarios_correo_hash ON usuarios (correo_hash);

\c tickets_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- La tabla "tickets" la crea sola tickets-service (SQLAlchemy) al arrancar.

\c comentarios_db
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL,
  autor_id UUID NOT NULL,
  autor_rol VARCHAR(20) NOT NULL,
  mensaje TEXT NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_comentarios_ticket_id ON comentarios (ticket_id);
