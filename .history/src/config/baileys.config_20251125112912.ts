import {
  makeWASocket,
  DisconnectReason,
  ConnectionState,
  WASocket,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { RedisStorageService } from "../services/redis-storage.service";

export interface BaileysConfig {
  userId: string;
  onQRCode?: (qr: string) => void;
  onConnectionUpdate?: (update: Partial<ConnectionState>) => void;
}

export async function createBaileysSocket(
  config: BaileysConfig
): Promise<{ socket: WASocket; saveCreds: () => Promise<void> }> {
  console.log(
    `[Baileys] 🔧 Inicializando socket para userId: ${config.userId}`
  );
  const storage = new RedisStorageService(config.userId);
  const { state, saveCreds } = await storage.getState();
  console.log(
    `[Baileys] 📦 Estado de autenticação carregado para userId: ${config.userId}`
  );

  const socket = makeWASocket({
    auth: state,
    printQRInTerminal: false, // Não imprimir QR no terminal
    logger: pino({ level: "silent" }), // Silenciar logs
    browser: ["SysIgreja", "Chrome", "1.0.0"],

    // CONFIGURAÇÕES CRÍTICAS PARA MODO ENVIO SOMENTE
    shouldSyncHistoryMessage: () => false, // NÃO sincronizar histórico
    shouldIgnoreJid: () => true, // IGNORAR todas as mensagens recebidas
    getMessage: async () => undefined, // NÃO buscar mensagens
  });

  console.log(`[Baileys] ✅ Socket criado para userId: ${config.userId}`);

  // NÃO registrar listeners de mensagens recebidas
  // socket.ev.on('messages.upsert', ...) ❌ NÃO FAZER ISSO
  // socket.ev.on('messages.update', ...) ❌ NÃO FAZER ISSO
  // socket.ev.on('messages.delete', ...) ❌ NÃO FAZER ISSO

  // Salvar credenciais quando atualizadas
  socket.ev.on("creds.update", async () => {
    console.log(
      `[Baileys] 💾 Salvando credenciais atualizadas para userId: ${config.userId}`
    );
    await saveCreds();
  });

  // Gerenciar reconexão e QR Code
  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr, isNewLogin, qrCode } = update;
    
    // Log detalhado de todas as atualizações de conexão
    console.log(
      `[Baileys] 📡 Connection update para userId: ${config.userId} - connection: ${connection}, qr: ${qr ? 'presente' : 'ausente'}, isNewLogin: ${isNewLogin}`
    );

    if (qr) {
      console.log(
        `[Baileys] 📱 QR Code gerado para userId: ${config.userId} (tamanho: ${qr.length} chars)`
      );
      // QR Code gerado - salvar no Redis e notificar callback
      await storage.setQRCode(qr);
      console.log(
        `[Baileys] 💾 QR Code salvo no Redis para userId: ${config.userId}`
      );
      if (config.onQRCode) {
        console.log(
          `[Baileys] 📞 Chamando callback onQRCode para userId: ${config.userId}`
        );
        config.onQRCode(qr);
      }
    }

    if (connection === "open") {
      console.log(`[Baileys] 🟢 Conexão aberta para userId: ${config.userId}`);
      // Conexão estabelecida - remover QR Code e atualizar status
      await storage.deleteQRCode();
      await storage.setStatus("connected");
      console.log(
        `[Baileys] ✅ Status atualizado para 'connected' para userId: ${config.userId}`
      );
      if (config.onConnectionUpdate) {
        config.onConnectionUpdate(update);
      }
    }

    if (connection === "close") {
      const error = lastDisconnect?.error as Boom;
      const statusCode = error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `[Baileys] 🔴 Conexão fechada para userId: ${config.userId}`
      );
      console.log(
        `[Baileys] 📋 Detalhes do fechamento: statusCode=${statusCode}, shouldReconnect=${shouldReconnect}`
      );
      
      if (error) {
        console.log(
          `[Baileys] ❌ Erro: ${error.message || JSON.stringify(error)}`
        );
      }

      // Log dos códigos de desconexão conhecidos
      if (statusCode === DisconnectReason.badSession) {
        console.log(`[Baileys] ⚠️  Bad Session - Sessão corrompida, limpando credenciais`);
      } else if (statusCode === DisconnectReason.connectionClosed) {
        console.log(`[Baileys] ⚠️  Connection Closed - Conexão fechada pelo servidor`);
      } else if (statusCode === DisconnectReason.connectionLost) {
        console.log(`[Baileys] ⚠️  Connection Lost - Conexão perdida`);
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        console.log(`[Baileys] ⚠️  Connection Replaced - Outra sessão substituiu esta`);
      } else if (statusCode === DisconnectReason.loggedOut) {
        console.log(`[Baileys] ⚠️  Logged Out - Usuário fez logout`);
      } else if (statusCode === DisconnectReason.restartRequired) {
        console.log(`[Baileys] ⚠️  Restart Required - Reinício necessário`);
      } else if (statusCode === DisconnectReason.timedOut) {
        console.log(`[Baileys] ⚠️  Timed Out - Timeout na conexão`);
      } else if (statusCode) {
        console.log(`[Baileys] ⚠️  Código desconhecido: ${statusCode}`);
      }

      await storage.setStatus("disconnected");

      if (shouldReconnect) {
        // Reconectar automaticamente após 3 segundos
        console.log(
          `[Baileys] 🔄 Agendando reconexão em 3s para userId: ${config.userId}`
        );
        setTimeout(() => {
          createBaileysSocket(config).catch((err) => {
            console.error(
              `[Baileys] ❌ Erro ao reconectar sessão ${config.userId}:`,
              err
            );
          });
        }, 3000);
      } else {
        // Logout - limpar estado
        console.log(
          `[Baileys] 🗑️  Limpando estado (logout) para userId: ${config.userId}`
        );
        await storage.clearState();
      }

      if (config.onConnectionUpdate) {
        config.onConnectionUpdate(update);
      }
    }

    if (connection === "connecting") {
      console.log(`[Baileys] 🔄 Conectando para userId: ${config.userId}`);
      await storage.setStatus("connecting");
      if (config.onConnectionUpdate) {
        config.onConnectionUpdate(update);
      }
    }
  });

  return { socket, saveCreds };
}
