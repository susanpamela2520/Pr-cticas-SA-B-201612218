import dotenv from 'dotenv';
dotenv.config();

import { crearApp } from './app';

const PORT = process.env.PORT || 8080;
crearApp().listen(PORT, () => {
  console.log(`[api-gateway] escuchando en http://localhost:${PORT}`);
});
