import { Router, Request, Response } from "express";
import { SessionManager } from "../services/session-manager.service.js";
import { MessageSender } from "../services/message-sender.service.js";
import { MinioClient } from "../utils/minio.client.js";
import {
  SendTextRequest,
  SendImageRequest,
  SendAudioRequest,
  SendMessageResponse,
  SessionInfo,
} from "../types/session.types.js";

export class GatewayController {
  private router: Router;
  private sessionManager: SessionManager;
  private messageSender: MessageSender;

  constructor() {
    this.router = Router();
    this.sessionManager = new SessionManager();
    this.messageSender = new MessageSender(new MinioClient());
    this.setupRoutes();
  }

  private setupRoutes() {
    // Criar sessão / gerar QR
    this.router.post(
      "/sessions/:userId/create",
      async (req: Request, res: Response) => {
        try {
          const { userId } = req.params;
          console.log(`[Gateway] 📱 Criando sessão para userId: ${userId}`);
          const result = await this.sessionManager.createSession(userId);
          console.log(
            `[Gateway] ✅ Sessão criada - Status: ${result.status
            }, QR gerado: ${result.qr ? "Sim" : "Não"}`
          );
          res.json(result);
        } catch (error: any) {
          console.error(`[Gateway] ❌ Erro ao criar sessão:`, error.message);
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Status da sessão
    this.router.get(
      "/sessions/:userId/status",
      async (req: Request, res: Response) => {
        try {
          const { userId } = req.params;
          const status = await this.sessionManager.getSessionStatus(userId);
          const qr = await this.sessionManager.getQRCode(userId);

          const response: SessionInfo = {
            status,
            qr: qr || null,
            connected: status === "connected",
            userId,
          };

          console.log(
            `[Gateway] 📊 Status da sessão ${userId}: ${status}, QR disponível: ${qr ? "Sim" : "Não"
            }`
          );
          res.json(response);
        } catch (error: any) {
          console.error(
            `[Gateway] ❌ Erro ao verificar status:`,
            error.message
          );
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Obter QR Code
    this.router.get(
      "/sessions/:userId/qr",
      async (req: Request, res: Response) => {
        try {
          const { userId } = req.params;
          const qr = await this.sessionManager.getQRCode(userId);

          if (!qr) {
            return res.status(404).json({ error: "QR Code não encontrado" });
          }

          res.json({ qr, status: "qr_pending" });
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Enviar texto
    this.router.post("/send-text", async (req: Request, res: Response) => {
      const { sessionUserId, to, message }: SendTextRequest = req.body;
      try {
        console.log(
          `[Gateway] 📨 Recebida requisição para enviar mensagem de texto`
        );
        console.log(`[Gateway] 👤 Session User ID: ${sessionUserId}`);
        console.log(`[Gateway] 📱 Destinatário: ${to}`);

        if (!sessionUserId || !to || !message) {
          return res.status(400).json({
            error: "Campos obrigatórios: sessionUserId, to, message",
          });
        }

        // Obter socket diretamente - getSession() já verifica se está conectado
        const socket = await this.sessionManager.getSession(sessionUserId);
        if (!socket) {
          // Verificar status para retornar mensagem mais específica
          const status = await this.sessionManager.getSessionStatus(
            sessionUserId
          );
          console.error(
            `[Gateway] ❌ Socket não encontrado ou não conectado para userId: ${sessionUserId}, status: ${status}`
          );
          return res.status(404).json({
            error:
              "Sessão não encontrada ou não conectada. Por favor, reconecte a sessão.",
          });
        }

        console.log(`[Gateway] ✅ Socket conectado e válido para userId: ${sessionUserId}`);
        const result = await this.messageSender.sendText(socket, to, message);
        const response: SendMessageResponse = {
          success: true,
          messageId: result?.key?.id || "",
        };
        console.log(
          `[Gateway] ✅ Mensagem enviada com sucesso. Message ID: ${response.messageId}`
        );
        res.json(response);
      } catch (error: any) {
        console.error(`[Gateway] ❌ Erro ao enviar mensagem de texto:`, error);
        console.error(`[Gateway] 📋 Detalhes:`, {
          message: error?.message,
          statusCode: error?.output?.statusCode,
          error: error?.output?.payload,
        });

        // Tratamento específico para erro 428 (Connection Closed)
        if (error?.output?.statusCode === 428) {
          console.log(
            `[Gateway] 🔴 Erro 428 detectado - limpando sessão para userId: ${sessionUserId}`
          );
          // Limpar sessão quando receber erro 428
          await this.sessionManager.clearSessionOnError(sessionUserId);
          return res.status(428).json({
            success: false,
            error: "Conexão fechada. Por favor, reconecte a sessão.",
          });
        }

        res.status(500).json({
          success: false,
          error: error.message || "Erro ao enviar mensagem",
        });
      }
    });

    // Enviar imagem
    this.router.post("/send-image", async (req: Request, res: Response) => {
      const { sessionUserId, to, imageKey, caption }: SendImageRequest =
        req.body;
      try {
        console.log(`[Gateway] 📨 Recebida requisição para enviar imagem`);
        console.log(`[Gateway] 👤 Session User ID: ${sessionUserId}`);
        console.log(`[Gateway] 📱 Destinatário: ${to}`);
        console.log(`[Gateway] 🖼️  Image Key: ${imageKey}`);

        if (!sessionUserId || !to || !imageKey) {
          return res.status(400).json({
            error: "Campos obrigatórios: sessionUserId, to, imageKey",
          });
        }

        // Obter socket diretamente - getSession() já verifica se está conectado
        const socket = await this.sessionManager.getSession(sessionUserId);
        if (!socket) {
          // Verificar status para retornar mensagem mais específica
          const status = await this.sessionManager.getSessionStatus(
            sessionUserId
          );
          console.error(
            `[Gateway] ❌ Socket não encontrado ou não conectado para userId: ${sessionUserId}, status: ${status}`
          );
          return res.status(404).json({
            error:
              "Sessão não encontrada ou não conectada. Por favor, reconecte a sessão.",
          });
        }

        console.log(`[Gateway] ✅ Socket conectado e válido, enviando imagem...`);
        const result = await this.messageSender.sendImage(
          socket,
          to,
          imageKey,
          caption || ""
        );
        const response: SendMessageResponse = {
          success: true,
          messageId: result?.key?.id || "",
        };
        console.log(
          `[Gateway] ✅ Imagem enviada com sucesso. Message ID: ${response.messageId}`
        );
        res.json(response);
      } catch (error: any) {
        console.error(`[Gateway] ❌ Erro ao enviar imagem:`, error);
        console.error(`[Gateway] 📋 Detalhes:`, {
          message: error?.message,
          statusCode: error?.output?.statusCode,
          error: error?.output?.payload,
        });

        // Tratamento específico para erro 428 (Connection Closed)
        if (error?.output?.statusCode === 428) {
          console.log(
            `[Gateway] 🔴 Erro 428 detectado - limpando sessão para userId: ${sessionUserId}`
          );
          // Limpar sessão quando receber erro 428
          await this.sessionManager.clearSessionOnError(sessionUserId);
          return res.status(428).json({
            success: false,
            error: "Conexão fechada. Por favor, reconecte a sessão.",
          });
        }

        res.status(500).json({
          success: false,
          error: error.message || "Erro ao enviar imagem",
        });
      }
    });

    // Enviar áudio
    this.router.post("/send-audio", async (req: Request, res: Response) => {
      const { sessionUserId, to, audioKey }: SendAudioRequest = req.body;
      try {
        console.log(`[Gateway] 📨 Recebida requisição para enviar áudio`);
        console.log(`[Gateway] 👤 Session User ID: ${sessionUserId}`);
        console.log(`[Gateway] 📱 Destinatário: ${to}`);
        console.log(`[Gateway] 🎵 Audio Key: ${audioKey}`);

        if (!sessionUserId || !to || !audioKey) {
          return res.status(400).json({
            error: "Campos obrigatórios: sessionUserId, to, audioKey",
          });
        }

        // Obter socket diretamente - getSession() já verifica se está conectado
        const socket = await this.sessionManager.getSession(sessionUserId);
        if (!socket) {
          // Verificar status para retornar mensagem mais específica
          const status = await this.sessionManager.getSessionStatus(
            sessionUserId
          );
          console.error(
            `[Gateway] ❌ Socket não encontrado ou não conectado para userId: ${sessionUserId}, status: ${status}`
          );
          return res.status(404).json({
            error:
              "Sessão não encontrada ou não conectada. Por favor, reconecte a sessão.",
          });
        }

        console.log(`[Gateway] ✅ Socket conectado e válido, enviando áudio...`);
        const result = await this.messageSender.sendAudio(socket, to, audioKey);
        const response: SendMessageResponse = {
          success: true,
          messageId: result?.key?.id || "",
        };
        console.log(
          `[Gateway] ✅ Áudio enviado com sucesso. Message ID: ${response.messageId}`
        );
        res.json(response);
      } catch (error: any) {
        console.error(`[Gateway] ❌ Erro ao enviar áudio:`, error);
        console.error(`[Gateway] 📋 Detalhes:`, {
          message: error?.message,
          statusCode: error?.output?.statusCode,
          error: error?.output?.payload,
        });

        // Tratamento específico para erro 428 (Connection Closed)
        if (error?.output?.statusCode === 428) {
          console.log(
            `[Gateway] 🔴 Erro 428 detectado - limpando sessão para userId: ${sessionUserId}`
          );
          // Limpar sessão quando receber erro 428
          await this.sessionManager.clearSessionOnError(sessionUserId);
          return res.status(428).json({
            success: false,
            error: "Conexão fechada. Por favor, reconecte a sessão.",
          });
        }

        res.status(500).json({
          success: false,
          error: error.message || "Erro ao enviar áudio",
        });
      }
    });

    // Remover sessão
    this.router.delete(
      "/sessions/:userId",
      async (req: Request, res: Response) => {
        try {
          const { userId } = req.params;
          await this.sessionManager.removeSession(userId);
          res.json({ success: true });
        } catch (error: any) {
          res.status(500).json({ error: error.message });
        }
      }
    );

    // Listar sessões ativas
    this.router.get("/sessions", async (req: Request, res: Response) => {
      try {
        const activeSessions = this.sessionManager.getActiveSessions();
        res.json({ sessions: activeSessions });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  getRouter(): Router {
    return this.router;
  }
}
