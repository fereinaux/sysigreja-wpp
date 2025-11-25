import { WASocket, WAMessage } from "baileys";
import { MinioClient } from "../utils/minio.client";

export class MessageSender {
  constructor(private minioClient: MinioClient) {}

  /**
   * Envia mensagem de texto
   */
  async sendText(
    socket: WASocket,
    to: string,
    message: string
  ): Promise<WAMessage> {
    console.log(`[MessageSender] 📤 Iniciando envio de mensagem de texto`);
    console.log(`[MessageSender] 📋 Destinatário: ${to}`);
    console.log(`[MessageSender] 💬 Mensagem: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`);

    const jid = this.formatJid(to);
    console.log(`[MessageSender] 🔗 JID formatado: ${jid}`);

    try {
      console.log(`[MessageSender] ⏳ Enviando mensagem via socket...`);
      const result = await socket.sendMessage(jid, {
        text: message,
      });

      if (!result) {
        console.error(`[MessageSender] ❌ sendMessage retornou null/undefined`);
        throw new Error("Falha ao enviar mensagem de texto - resposta vazia");
      }

      console.log(`[MessageSender] ✅ Mensagem enviada com sucesso`);
      console.log(`[MessageSender] 📝 Message ID: ${result?.key?.id || 'N/A'}`);
      return result;
    } catch (error: any) {
      console.error(`[MessageSender] ❌ Erro ao enviar mensagem:`, error);
      console.error(`[MessageSender] 📋 Detalhes do erro:`, {
        message: error?.message,
        statusCode: error?.output?.statusCode,
        error: error?.output?.payload,
      });
      throw error;
    }
  }

  /**
   * Envia imagem com legenda
   */
  async sendImage(
    socket: WASocket,
    to: string,
    imageKey: string,
    caption: string = ""
  ): Promise<WAMessage> {
    const jid = this.formatJid(to);

    // Verificar se a imagem existe no MinIO
    const exists = await this.minioClient.objectExists(imageKey);
    if (!exists) {
      throw new Error(`Imagem não encontrada no MinIO: ${imageKey}`);
    }

    // Busca imagem no MinIO
    const imageBuffer = await this.minioClient.getObject(imageKey);

    const result = await socket.sendMessage(jid, {
      image: imageBuffer,
      caption: caption,
    });

    if (!result) {
      throw new Error("Falha ao enviar imagem");
    }

    return result;
  }

  /**
   * Envia áudio
   */
  async sendAudio(
    socket: WASocket,
    to: string,
    audioKey: string
  ): Promise<WAMessage> {
    const jid = this.formatJid(to);

    // Verificar se o áudio existe no MinIO
    const exists = await this.minioClient.objectExists(audioKey);
    if (!exists) {
      throw new Error(`Áudio não encontrado no MinIO: ${audioKey}`);
    }

    // Busca áudio no MinIO
    const audioBuffer = await this.minioClient.getObject(audioKey);

    // Determinar mimetype baseado na extensão
    const mimetype = this.getAudioMimetype(audioKey);

    const result = await socket.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: mimetype,
      ptt: true, // Push to talk (áudio de voz)
    });

    if (!result) {
      throw new Error("Falha ao enviar áudio");
    }

    return result;
  }

  /**
   * Formata número para JID do WhatsApp
   */
  private formatJid(phone: string): string {
    // Remove caracteres não numéricos
    const cleaned = phone.replace(/\D/g, "");

    // Formato: 55999999999@s.whatsapp.net
    return `${cleaned}@s.whatsapp.net`;
  }

  /**
   * Determina o mimetype do áudio baseado na extensão
   */
  private getAudioMimetype(audioKey: string): string {
    const extension = audioKey.toLowerCase().split(".").pop();

    switch (extension) {
      case "ogg":
      case "opus":
        return "audio/ogg; codecs=opus";
      case "mp3":
        return "audio/mp4";
      case "m4a":
        return "audio/mp4";
      case "wav":
        return "audio/wav";
      case "aac":
        return "audio/aac";
      default:
        return "audio/ogg; codecs=opus"; // Padrão
    }
  }
}
