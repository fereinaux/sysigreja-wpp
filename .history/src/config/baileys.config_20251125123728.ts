import {
  makeWASocket,
  DisconnectReason,
  ConnectionState,
  WASocket,
  Browsers,
} from "baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import { RedisStorageService } from "../services/redis-storage.service";
import { convertQRCodeToBase64 } from "../utils/qr-code.util";

export interface BaileysConfig {
  userId: string;
  onQRCode?: (qr: string) => void;
  onConnectionUpdate?: (update: Partial<ConnectionState>) => void;
}

export async function createBaileysSocket(
  config: BaileysConfig
): Promise<{ socket: WASocket; saveCreds: () => Promise<void> }> {
  const storage = new RedisStorageService(config.userId);
  const { state, saveCreds } = await storage.getState();

  // Configuração do socket conforme documentação oficial do Baileys
  // https://baileys.wiki/docs/intro
  // O socket é criado com makeWASocket e é um EventEmitter
  const socket = makeWASocket({
    // Auth state fornecido pelo RedisStorageService (implementação customizada)
    // Seguindo recomendação da documentação de não usar useMultiFileAuthState em produção
    auth: state,

    // Logger conforme documentação - silencioso para reduzir logs
    logger: pino({ level: "silent" }),

    // Browser configuration
    browser: ["SysIgreja", "Chrome", "1.0.0"],

    // Função obrigatória getMessage conforme documentação
    // Retorna undefined para modo envio somente (não armazenamos mensagens)
    getMessage: async (key) => {
      return undefined;
    },

    // Configurações de timeout
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,

    // CONFIGURAÇÕES PARA MODO ENVIO SOMENTE
    // Não sincronizar histórico de mensagens
    shouldSyncHistoryMessage: () => false,

    // Ignorar todas as mensagens recebidas (não processar)
    shouldIgnoreJid: () => true,
  });

  // Gerenciar atualizações de credenciais conforme documentação oficial
  // https://baileys.wiki/docs/intro
  socket.ev.on("creds.update", async () => {
    await saveCreds();
  });

  // Gerenciar atualizações de conexão conforme documentação oficial
  // https://baileys.wiki/docs/intro
  // O evento connection.update é o principal para monitorar conexão e QR Code
  socket.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // Converter QR code string para base64 image
      try {
        const qrBase64 = await convertQRCodeToBase64(qr);
        await storage.setQRCode(qrBase64);
        if (config.onQRCode) {
          config.onQRCode(qrBase64);
        }
      } catch (error) {
        console.error(
          `[Baileys] ❌ Erro ao converter QR code para base64:`,
          error
        );
        await storage.setQRCode(qr);
        if (config.onQRCode) {
          config.onQRCode(qr);
        }
      }
    }

    if (connection === "open") {
      console.log(`[Baileys] ✅ Conexão estabelecida para userId: ${config.userId}`);
      await storage.deleteQRCode();
      await storage.setStatus("connected");
      if (config.onConnectionUpdate) {
        config.onConnectionUpdate(update);
      }
    }

    if (connection === "close") {
      const error = lastDisconnect?.error as Boom;
      const statusCode = error?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(
        `[Baileys] 🔴 Conexão fechada para userId: ${config.userId} - statusCode: ${statusCode}`
      );

      // Atualizar status para disconnected
      await storage.setStatus("disconnected");

      // Notificar callback para remover socket do Map
      if (config.onConnectionUpdate) {
        config.onConnectionUpdate(update);
      }

      // Reconexão automática apenas para alguns casos
      if (shouldReconnect && statusCode !== 405) {
        setTimeout(() => {
          createBaileysSocket(config).catch((err) => {
            console.error(
              `[Baileys] ❌ Erro ao reconectar sessão ${config.userId}:`,
              err
            );
          });
        }, 3000);
      } else {
        if (statusCode === DisconnectReason.loggedOut) {
          await storage.clearState();
        }
      }
    }

    if (connection === "connecting") {
      await storage.setStatus("connecting");
      if (config.onConnectionUpdate) {
        config.onConnectionUpdate(update);
      }
    }
  });

  return { socket, saveCreds };
}
