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

  // Configuração do socket conforme documentação oficial do Baileys
  const socket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "warn" }), // Logs de warning para debug
    browser: ["SysIgreja", "Chrome", "1.0.0"],

    // Configurações de timeout
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: 60000,
    keepAliveIntervalMs: 30000,

    // CONFIGURAÇÕES PARA MODO ENVIO SOMENTE
    // Não sincronizar histórico de mensagens
    shouldSyncHistoryMessage: () => false,

    // Ignorar todas as mensagens recebidas (não processar)
    shouldIgnoreJid: () => true,

    // Função obrigatória getMessage - retorna undefined para não buscar mensagens
    // Esta função é chamada quando o Baileys precisa de uma mensagem para reenvio ou descriptografia
    getMessage: async (key) => {
      // Retornar undefined indica que não temos a mensagem armazenada
      // Isso é esperado no modo envio somente
      return undefined;
    },
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
    const { connection, lastDisconnect, qr, isNewLogin } = update;

    // Log detalhado de todas as atualizações de conexão
    console.log(
      `[Baileys] 📡 Connection update para userId: ${
        config.userId
      } - connection: ${connection}, qr: ${
        qr ? "presente" : "ausente"
      }, isNewLogin: ${isNewLogin}`
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

      console.log(`[Baileys] 🔴 Conexão fechada para userId: ${config.userId}`);
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
        console.log(
          `[Baileys] ⚠️  Bad Session - Sessão corrompida, limpando credenciais`
        );
      } else if (statusCode === DisconnectReason.connectionClosed) {
        console.log(
          `[Baileys] ⚠️  Connection Closed - Conexão fechada pelo servidor`
        );
      } else if (statusCode === DisconnectReason.connectionLost) {
        console.log(`[Baileys] ⚠️  Connection Lost - Conexão perdida`);
      } else if (statusCode === DisconnectReason.connectionReplaced) {
        console.log(
          `[Baileys] ⚠️  Connection Replaced - Outra sessão substituiu esta`
        );
      } else if (statusCode === DisconnectReason.loggedOut) {
        console.log(`[Baileys] ⚠️  Logged Out - Usuário fez logout`);
      } else if (statusCode === DisconnectReason.restartRequired) {
        console.log(`[Baileys] ⚠️  Restart Required - Reinício necessário`);
      } else if (statusCode === DisconnectReason.timedOut) {
        console.log(`[Baileys] ⚠️  Timed Out - Timeout na conexão`);
      } else if (statusCode === 405) {
        console.log(
          `[Baileys] ⚠️  Connection Failure (405) - Falha na conexão inicial com WhatsApp Web`
        );
        console.log(
          `[Baileys] 💡 Possíveis causas: problema de rede, firewall bloqueando, ou WhatsApp bloqueando a conexão`
        );
      } else if (statusCode) {
        console.log(`[Baileys] ⚠️  Código desconhecido: ${statusCode}`);
      }

      await storage.setStatus("disconnected");

      // Não reconectar automaticamente para código 405 (Connection Failure)
      // pois geralmente indica problema de rede/firewall que precisa ser resolvido manualmente
      if (shouldReconnect && statusCode !== 405) {
        // Reconectar automaticamente após 3 segundos (exceto para erro 405)
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
        if (statusCode === 405) {
          console.log(
            `[Baileys] ⛔ Reconexão automática desabilitada para erro 405. Verifique rede/firewall.`
          );
        } else {
          // Logout - limpar estado
          console.log(
            `[Baileys] 🗑️  Limpando estado (logout) para userId: ${config.userId}`
          );
          await storage.clearState();
        }
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
