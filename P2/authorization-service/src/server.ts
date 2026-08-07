import dotenv from 'dotenv';
dotenv.config();

import { crearApp } from './app';

const PORT = process.env.AUTHZ_PORT || 4000;
const app = crearApp();

app.listen(PORT, () => {
  console.log(`[authorization-service] escuchando en http://localhost:${PORT}`);
});
