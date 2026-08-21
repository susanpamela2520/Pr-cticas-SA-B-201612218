import dotenv from 'dotenv';
dotenv.config();

import { crearApp } from './app';

const PORT = process.env.PORT || 3002;
crearApp().listen(PORT, () => {
  console.log(`[comentarios-service] escuchando en http://localhost:${PORT}`);
});
