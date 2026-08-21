import dotenv from 'dotenv';
dotenv.config();

import { crearApp } from './app';

const PORT = process.env.PORT || 3001;
crearApp().listen(PORT, () => {
  console.log(`[auth-service] escuchando en http://localhost:${PORT}`);
});
