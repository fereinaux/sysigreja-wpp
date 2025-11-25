import { Router, Request, Response } from "express";
import { SessionManager } from "../services/session-manager.service";
import { MessageSender } from "../services/message-sender.service";
import { MinioClient } from "../utils/minio.client";
import {
  SendTextRequest,
  SendImageRequest,
  SendAudioRequest,
  SendMessageResponse,
  SessionInfo,
} from "../types/session.types";

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
            `[Gateway] ✅ Sessão criada - Status: ${
              result.status
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
            `[Gateway] 📊 Status da sessão ${userId}: ${status}, QR disponível: ${
              qr ? "Sim" : "Não"
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
      try {
        const { sessionUserId, to, message }: SendTextRequest = req.body;

        if (!sessionUserId || !to || !message) {
          return res.status(400).json({
            error: "Campos obrigatórios: sessionUserId, to, message",
          });
        }

        const socket = this.sessionManager.getSession(sessionUserId);
        if (!socket) {
          return res.status(404).json({
            error: "Sessão não encontrada ou não conectada",
          });
        }

        const result = await this.messageSender.sendText(socket, to, message);
        const response: SendMessageResponse = {
          success: true,
          messageId: result?.key?.id || '',
        };
        res.json(response);
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Enviar imagem
    this.router.post("/send-image", async (req: Request, res: Response) => {
      try {
        const { sessionUserId, to, imageKey, caption }: SendImageRequest =
          req.body;

        if (!sessionUserId || !to || !imageKey) {
          return res.status(400).json({
            error: "Campos obrigatórios: sessionUserId, to, imageKey",
          });
        }

        const socket = this.sessionManager.getSession(sessionUserId);
        if (!socket) {
          return res.status(404).json({
            error: "Sessão não encontrada ou não conectada",
          });
        }

        const result = await this.messageSender.sendImage(
          socket,
          to,
          imageKey,
          caption || ""
        );
        const response: SendMessageResponse = {
          success: true,
          messageId: result.key.id!,
        };
        res.json(response);
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
        });
      }
    });

    // Enviar áudio
    this.router.post("/send-audio", async (req: Request, res: Response) => {
      try {
        const { sessionUserId, to, audioKey }: SendAudioRequest = req.body;

        if (!sessionUserId || !to || !audioKey) {
          return res.status(400).json({
            error: "Campos obrigatórios: sessionUserId, to, audioKey",
          });
        }

        const socket = this.sessionManager.getSession(sessionUserId);
        if (!socket) {
          return res.status(404).json({
            error: "Sessão não encontrada ou não conectada",
          });
        }

        const result = await this.messageSender.sendAudio(socket, to, audioKey);
        const response: SendMessageResponse = {
          success: true,
          messageId: result.key.id!,
        };
        res.json(response);
      } catch (error: any) {
        res.status(500).json({
          success: false,
          error: error.message,
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
