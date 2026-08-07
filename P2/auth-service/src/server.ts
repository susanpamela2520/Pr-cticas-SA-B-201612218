import dotenv from 'dotenv';
dotenv.config();

import { crearApp } from './app';

const PORT = process.env.AUTH_PORT || 3000;
const app = crearApp();

app.listen(PORT, () => {
  console.log(`[auth-service] escuchando en http://localhost:${PORT}`);
});
