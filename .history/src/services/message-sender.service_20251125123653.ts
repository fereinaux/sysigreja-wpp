import { WASocket, WAMessage } from "baileys";
import { MinioClient } from "../utils/minio.client";

export class MessageSender {
  constructor(private minioClient: MinioClient) {}

  /**
   * Verifica se o socket está realmente conectado
   */
  private isSocketConnected(socket: WASocket): boolean {
    try {
      // Verificar se o socket tem a propriedade user (indica conexão ativa)
      return !!(socket as any).user;
    } catch {
      return false;
    }
  }

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

    // Verificar se o socket está realmente conectado
    if (!this.isSocketConnected(socket)) {
      console.error(`[MessageSender] ❌ Socket não está conectado`);
      throw new Error("Socket não está conectado. Por favor, reconecte a sessão.");
    }
    console.log(`[MessageSender] ✅ Socket verificado como conectado`);

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
    console.log(`[MessageSender] 📤 Iniciando envio de imagem`);
    console.log(`[MessageSender] 📋 Destinatário: ${to}`);
    console.log(`[MessageSender] 🖼️  Image Key: ${imageKey}`);
    console.log(`[MessageSender] 💬 Legenda: ${caption || '(sem legenda)'}`);

    const jid = this.formatJid(to);
    console.log(`[MessageSender] 🔗 JID formatado: ${jid}`);

    try {
      // Verificar se a imagem existe no MinIO
      console.log(`[MessageSender] 🔍 Verificando se imagem existe no MinIO...`);
      const exists = await this.minioClient.objectExists(imageKey);
      if (!exists) {
        console.error(`[MessageSender] ❌ Imagem não encontrada no MinIO: ${imageKey}`);
        throw new Error(`Imagem não encontrada no MinIO: ${imageKey}`);
      }
      console.log(`[MessageSender] ✅ Imagem encontrada no MinIO`);

      // Busca imagem no MinIO
      console.log(`[MessageSender] ⬇️  Baixando imagem do MinIO...`);
      const imageBuffer = await this.minioClient.getObject(imageKey);
      console.log(`[MessageSender] ✅ Imagem baixada (tamanho: ${imageBuffer.length} bytes)`);

      console.log(`[MessageSender] ⏳ Enviando imagem via socket...`);
      const result = await socket.sendMessage(jid, {
        image: imageBuffer,
        caption: caption,
      });

      if (!result) {
        console.error(`[MessageSender] ❌ sendMessage retornou null/undefined`);
        throw new Error("Falha ao enviar imagem - resposta vazia");
      }

      console.log(`[MessageSender] ✅ Imagem enviada com sucesso`);
      console.log(`[MessageSender] 📝 Message ID: ${result?.key?.id || 'N/A'}`);
      return result;
    } catch (error: any) {
      console.error(`[MessageSender] ❌ Erro ao enviar imagem:`, error);
      console.error(`[MessageSender] 📋 Detalhes do erro:`, {
        message: error?.message,
        statusCode: error?.output?.statusCode,
        error: error?.output?.payload,
      });
      throw error;
    }
  }

  /**
   * Envia áudio
   */
  async sendAudio(
    socket: WASocket,
    to: string,
    audioKey: string
  ): Promise<WAMessage> {
    console.log(`[MessageSender] 📤 Iniciando envio de áudio`);
    console.log(`[MessageSender] 📋 Destinatário: ${to}`);
    console.log(`[MessageSender] 🎵 Audio Key: ${audioKey}`);

    const jid = this.formatJid(to);
    console.log(`[MessageSender] 🔗 JID formatado: ${jid}`);

    try {
      // Verificar se o áudio existe no MinIO
      console.log(`[MessageSender] 🔍 Verificando se áudio existe no MinIO...`);
      const exists = await this.minioClient.objectExists(audioKey);
      if (!exists) {
        console.error(`[MessageSender] ❌ Áudio não encontrado no MinIO: ${audioKey}`);
        throw new Error(`Áudio não encontrado no MinIO: ${audioKey}`);
      }
      console.log(`[MessageSender] ✅ Áudio encontrado no MinIO`);

      // Busca áudio no MinIO
      console.log(`[MessageSender] ⬇️  Baixando áudio do MinIO...`);
      const audioBuffer = await this.minioClient.getObject(audioKey);
      console.log(`[MessageSender] ✅ Áudio baixado (tamanho: ${audioBuffer.length} bytes)`);

      // Determinar mimetype baseado na extensão
      const mimetype = this.getAudioMimetype(audioKey);
      console.log(`[MessageSender] 🎵 MIME type: ${mimetype}`);

      console.log(`[MessageSender] ⏳ Enviando áudio via socket...`);
      const result = await socket.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: mimetype,
        ptt: true, // Push to talk (áudio de voz)
      });

      if (!result) {
        console.error(`[MessageSender] ❌ sendMessage retornou null/undefined`);
        throw new Error("Falha ao enviar áudio - resposta vazia");
      }

      console.log(`[MessageSender] ✅ Áudio enviado com sucesso`);
      console.log(`[MessageSender] 📝 Message ID: ${result?.key?.id || 'N/A'}`);
      return result;
    } catch (error: any) {
      console.error(`[MessageSender] ❌ Erro ao enviar áudio:`, error);
      console.error(`[MessageSender] 📋 Detalhes do erro:`, {
        message: error?.message,
        statusCode: error?.output?.statusCode,
        error: error?.output?.payload,
      });
      throw error;
    }
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
