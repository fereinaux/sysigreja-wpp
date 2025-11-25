import app from './app';
import { getRedisClient } from './config/redis.config';

const PORT = process.env.PORT || 3001;

// Verificar conexão com Redis antes de iniciar
const redis = getRedisClient();

redis.on('ready', () => {
  console.log('✅ Redis conectado');
});

redis.on('error', (err) => {
  console.error('❌ Erro no Redis:', err);
});

app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Gateway rodando na porta ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM recebido, encerrando servidor...');
  await redis.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT recebido, encerrando servidor...');
  await redis.quit();
  process.exit(0);
});

