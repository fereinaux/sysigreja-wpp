import { WASocket } from "baileys";
import { createBaileysSocket } from "../config/baileys.config";
import { RedisStorageService } from "./redis-storage.service";
import { SessionStatus, CreateSessionResponse } from "../types/session.types";

export class SessionManager {
  private sessions: Map<string, WASocket> = new Map();
  private storageServices: Map<string, RedisStorageService> = new Map();

  private getStorage(userId: string): RedisStorageService {
    if (!this.storageServices.has(userId)) {
      this.storageServices.set(userId, new RedisStorageService(userId));
    }
    return this.storageServices.get(userId)!;
  }

  /**
   * Cria uma nova sessão para o usuário
   */
  async createSession(userId: string): Promise<CreateSessionResponse> {
    console.log(
      `[SessionManager] 🔍 Verificando sessão existente para userId: ${userId}`
    );

    // Verificar se já existe uma sessão em processo de criação
    const storage = this.getStorage(userId);
    const currentStatus = await storage.getStatus();

    if (currentStatus === "connecting") {
      console.log(
        `[SessionManager] ⚠️  Sessão já está sendo criada para userId: ${userId}, aguardando...`
      );
      // Aguardar um pouco e verificar se QR Code foi gerado
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const qr = await storage.getQRCode();
      if (qr) {
        return { qr, status: "qr_pending" };
      }
      // Se ainda está conectando após 2s, pode continuar
    }

    // Verificar se já existe uma sessão conectada
    if (this.sessions.has(userId)) {
      console.log(
        `[SessionManager] ⚠️  Sessão já existe para userId: ${userId}`
      );
      const socket = this.sessions.get(userId)!;
      const status = await this.getSessionStatus(userId);

      if (status === "connected") {
        console.log(
          `[SessionManager] ✅ Sessão já conectada para userId: ${userId}`
        );
        return { qr: null, status: "connected" };
      }

      // Se está conectando, retorna QR existente
      const existingQr = await storage.getQRCode();
      if (existingQr) {
        console.log(
          `[SessionManager] 📱 QR Code existente encontrado para userId: ${userId}`
        );
        return { qr: existingQr, status: "qr_pending" };
      }
    }

    console.log(
      `[SessionManager] 🚀 Iniciando criação de nova sessão para userId: ${userId}`
    );
    await storage.setStatus("connecting");
    console.log(
      `[SessionManager] 📝 Status definido como 'connecting' para userId: ${userId}`
    );

    try {
      let qrCode: string | null = null;
      let qrResolved = false;

      console.log(
        `[SessionManager] 🔌 Criando socket Baileys para userId: ${userId}`
      );
      const { socket } = await createBaileysSocket({
        userId,
        onQRCode: (qr) => {
          console.log(
            `[SessionManager] 🎯 QR Code recebido via callback para userId: ${userId}`
          );
          qrCode = qr;
          qrResolved = true;
        },
        onConnectionUpdate: async (update) => {
          if (update.connection === "open") {
            console.log(
              `[SessionManager] ✅ Conexão estabelecida para userId: ${userId}`
            );
            this.sessions.set(userId, socket);
            await storage.setStatus("connected");
          } else if (update.connection === "close") {
            console.log(
              `[SessionManager] 🔴 Conexão fechada para userId: ${userId} - removendo socket do Map`
            );
            // Remover socket do Map quando conexão fecha
            this.sessions.delete(userId);
            await storage.setStatus("disconnected");
          }
        },
      });

      console.log(
        `[SessionManager] ⏳ Aguardando QR Code ser gerado (timeout: 10s) para userId: ${userId}`
      );
      // Aguardar QR Code ser gerado (timeout de 10s)
      const qrPromise = new Promise<string | null>((resolve) => {
        const checkInterval = setInterval(() => {
          if (qrResolved) {
            clearInterval(checkInterval);
            console.log(
              `[SessionManager] ✅ QR Code resolvido para userId: ${userId}`
            );
            resolve(qrCode);
          }
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          if (!qrResolved) {
            console.log(
              `[SessionManager] ⏰ Timeout aguardando QR Code para userId: ${userId}`
            );
            resolve(null);
          }
        }, 10000);
      });

      const qr = await qrPromise;

      if (qr) {
        console.log(
          `[SessionManager] ✅ QR Code gerado com sucesso para userId: ${userId} (tamanho: ${qr.length} chars)`
        );
        return { qr, status: "qr_pending" };
      }

      // Verificar se já está conectado
      const currentStatus = await storage.getStatus();
      if (currentStatus === "connected") {
        console.log(
          `[SessionManager] ✅ Sessão já conectada (verificação pós-timeout) para userId: ${userId}`
        );
        this.sessions.set(userId, socket);
        return { qr: null, status: "connected" };
      }

      console.log(
        `[SessionManager] ⚠️  Timeout - QR Code não foi gerado para userId: ${userId}`
      );
      return { qr: null, status: "timeout" };
    } catch (error: any) {
      console.error(
        `[SessionManager] ❌ Erro ao criar sessão para userId: ${userId}:`,
        error
      );
      await storage.setStatus("disconnected");
      throw new Error(`Erro ao criar sessão: ${error.message}`);
    }
  }

  /**
   * Obtém o socket da sessão do usuário
   */
  getSession(userId: string): WASocket | null {
    return this.sessions.get(userId) || null;
  }

  /**
   * Obtém o status da sessão
   */
  async getSessionStatus(userId: string): Promise<SessionStatus> {
    const storage = this.getStorage(userId);
    const status = await storage.getStatus();

    if (!status) {
      return "not_found";
    }

    const socket = this.sessions.get(userId);
    if (socket && status === "connected") {
      return "connected";
    }

    const qr = await storage.getQRCode();
    if (qr) {
      return "qr_pending";
    }

    if (status === "connecting") {
      return "connecting";
    }

    if (status === "connected") {
      return "connected";
    }

    return "disconnected";
  }

  /**
   * Obtém o QR Code pendente
   */
  async getQRCode(userId: string): Promise<string | null> {
    const storage = this.getStorage(userId);
    return await storage.getQRCode();
  }

  /**
   * Remove uma sessão
   */
  async removeSession(userId: string): Promise<void> {
    const socket = this.sessions.get(userId);
    if (socket) {
      try {
        await socket.logout();
      } catch (error) {
        console.error(`Error logging out session ${userId}:`, error);
      }
      this.sessions.delete(userId);
    }

    const storage = this.getStorage(userId);
    await storage.deleteQRCode();
    await storage.clearState();
    this.storageServices.delete(userId);
  }

  /**
   * Lista todas as sessões ativas
   */
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys());
  }
}
