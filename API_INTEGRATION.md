# Documentação de Integração - WhatsApp Gateway API

Esta documentação explica como seu backend NestJS (ou qualquer outro backend) deve consumir o serviço WhatsApp Gateway.

## Configuração Base

### URL Base
```
http://localhost:3001
```
(ou a URL onde o gateway estiver hospedado)

### Autenticação
Se o gateway estiver configurado com `GATEWAY_TOKEN` no `.env`, todas as requisições devem incluir o header:

```
Authorization: Bearer {seu-token}
```

Se `GATEWAY_TOKEN` estiver vazio, a autenticação é desabilitada.

---

## Fluxo Completo de Uso

### 1. Criar/Iniciar Sessão
1. Backend chama `POST /sessions/:userId/create`
2. Gateway retorna QR Code (base64)
3. Backend exibe QR Code para o usuário escanear
4. Backend faz polling em `GET /sessions/:userId/status` até status = "connected"
5. Após conectar, pode enviar mensagens

### 2. Enviar Mensagens
- Usar `sessionUserId` (mesmo `userId` usado na criação da sessão)
- Enviar mensagens de texto, imagem ou áudio

### 3. Gerenciar Sessões
- Verificar status: `GET /sessions/:userId/status`
- Remover sessão: `DELETE /sessions/:userId`

---

## Endpoints da API

### 1. Criar Sessão / Gerar QR Code

**POST** `/sessions/:userId/create`

Cria uma nova sessão WhatsApp para o usuário. Se a sessão já existir e estiver conectada, retorna status "connected".

**Parâmetros:**
- `userId` (path): Identificador único do usuário (ex: UUID do usuário no seu sistema)

**Resposta de Sucesso (200):**
```json
{
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "status": "qr_pending"
}
```

**Resposta se já conectado (200):**
```json
{
  "qr": null,
  "status": "connected"
}
```

**Exemplo de Requisição (cURL):**
```bash
curl -X POST http://localhost:3001/sessions/user-123/create \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer seu-token-aqui"
```

**Exemplo de Requisição (JavaScript/TypeScript):**
```typescript
const userId = 'user-123';
const response = await fetch(`http://localhost:3001/sessions/${userId}/create`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer seu-token-aqui'
  }
});

const data = await response.json();
// data.qr contém o QR Code em base64
// data.status pode ser: "qr_pending", "connected", "timeout"
```

**Exemplo de Requisição (NestJS Service):**
```typescript
import { Injectable, HttpService } from '@nestjs/common';

@Injectable()
export class WhatsAppService {
  constructor(private httpService: HttpService) {}

  private readonly GATEWAY_URL = 'http://localhost:3001';
  private readonly GATEWAY_TOKEN = 'seu-token-aqui';

  async createSession(userId: string) {
    const response = await this.httpService.post(
      `${this.GATEWAY_URL}/sessions/${userId}/create`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${this.GATEWAY_TOKEN}`
        }
      }
    ).toPromise();

    return response.data;
  }
}
```

---

### 2. Verificar Status da Sessão

**GET** `/sessions/:userId/status`

Verifica o status atual da sessão do usuário.

**Parâmetros:**
- `userId` (path): Identificador único do usuário

**Resposta de Sucesso (200):**
```json
{
  "status": "connected",
  "qr": null,
  "connected": true,
  "userId": "user-123"
}
```

**Status possíveis:**
- `not_found`: Sessão não existe
- `connecting`: Sessão está sendo criada
- `qr_pending`: QR Code gerado, aguardando escaneamento
- `connected`: Sessão conectada e pronta para uso
- `disconnected`: Sessão desconectada

**Exemplo (NestJS):**
```typescript
async getSessionStatus(userId: string) {
  const response = await this.httpService.get(
    `${this.GATEWAY_URL}/sessions/${userId}/status`,
    {
      headers: {
        'Authorization': `Bearer ${this.GATEWAY_TOKEN}`
      }
    }
  ).toPromise();

  return response.data;
}
```

---

### 3. Obter QR Code

**GET** `/sessions/:userId/qr`

Obtém o QR Code pendente de uma sessão (se existir).

**Resposta de Sucesso (200):**
```json
{
  "qr": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "status": "qr_pending"
}
```

**Resposta se não encontrado (404):**
```json
{
  "error": "QR Code não encontrado"
}
```

---

### 4. Enviar Mensagem de Texto

**POST** `/send-text`

Envia uma mensagem de texto via WhatsApp.

**Body (JSON):**
```json
{
  "sessionUserId": "user-123",
  "to": "55999999999",
  "message": "Olá! Esta é uma mensagem de teste."
}
```

**Campos:**
- `sessionUserId` (obrigatório): ID do usuário que criou a sessão
- `to` (obrigatório): Número de telefone do destinatário (formato: 55999999999, sem caracteres especiais)
- `message` (obrigatório): Texto da mensagem

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "messageId": "3EB0C767F26BEC-CD"
}
```

**Resposta de Erro (404):**
```json
{
  "success": false,
  "error": "Sessão não encontrada ou não conectada"
}
```

**Exemplo (NestJS):**
```typescript
async sendTextMessage(userId: string, to: string, message: string) {
  try {
    const response = await this.httpService.post(
      `${this.GATEWAY_URL}/send-text`,
      {
        sessionUserId: userId,
        to: to.replace(/\D/g, ''), // Remove caracteres não numéricos
        message: message
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.GATEWAY_TOKEN}`
        }
      }
    ).toPromise();

    return response.data;
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error('Sessão WhatsApp não conectada');
    }
    throw error;
  }
}
```

---

### 5. Enviar Imagem com Legenda

**POST** `/send-image`

Envia uma imagem com legenda via WhatsApp. A imagem deve estar armazenada no MinIO.

**Body (JSON):**
```json
{
  "sessionUserId": "user-123",
  "to": "55999999999",
  "imageKey": "campaigns/img001.jpg",
  "caption": "Legenda da imagem (opcional)"
}
```

**Campos:**
- `sessionUserId` (obrigatório): ID do usuário que criou a sessão
- `to` (obrigatório): Número de telefone do destinatário
- `imageKey` (obrigatório): Chave do objeto no MinIO (caminho relativo no bucket)
- `caption` (opcional): Legenda da imagem

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "messageId": "3EB0C767F26BEC-CD"
}
```

**Resposta de Erro (500):**
```json
{
  "success": false,
  "error": "Imagem não encontrada no MinIO: campaigns/img001.jpg"
}
```

**Exemplo (NestJS):**
```typescript
async sendImageMessage(
  userId: string,
  to: string,
  imageKey: string,
  caption?: string
) {
  const response = await this.httpService.post(
    `${this.GATEWAY_URL}/send-image`,
    {
      sessionUserId: userId,
      to: to.replace(/\D/g, ''),
      imageKey: imageKey,
      caption: caption || ''
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.GATEWAY_TOKEN}`
      }
    }
  ).toPromise();

  return response.data;
}
```

---

### 6. Enviar Áudio

**POST** `/send-audio`

Envia um áudio (voz) via WhatsApp. O áudio deve estar armazenado no MinIO.

**Body (JSON):**
```json
{
  "sessionUserId": "user-123",
  "to": "55999999999",
  "audioKey": "audios/evento123/convite.ogg"
}
```

**Campos:**
- `sessionUserId` (obrigatório): ID do usuário que criou a sessão
- `to` (obrigatório): Número de telefone do destinatário
- `audioKey` (obrigatório): Chave do objeto no MinIO

**Formatos de áudio suportados:**
- `.ogg` / `.opus` (recomendado)
- `.mp3`
- `.m4a`
- `.wav`
- `.aac`

**Resposta de Sucesso (200):**
```json
{
  "success": true,
  "messageId": "3EB0C767F26BEC-CD"
}
```

**Exemplo (NestJS):**
```typescript
async sendAudioMessage(userId: string, to: string, audioKey: string) {
  const response = await this.httpService.post(
    `${this.GATEWAY_URL}/send-audio`,
    {
      sessionUserId: userId,
      to: to.replace(/\D/g, ''),
      audioKey: audioKey
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.GATEWAY_TOKEN}`
      }
    }
  ).toPromise();

  return response.data;
}
```

---

### 7. Remover Sessão

**DELETE** `/sessions/:userId`

Remove uma sessão WhatsApp e faz logout.

**Parâmetros:**
- `userId` (path): Identificador único do usuário

**Resposta de Sucesso (200):**
```json
{
  "success": true
}
```

**Exemplo (NestJS):**
```typescript
async removeSession(userId: string) {
  const response = await this.httpService.delete(
    `${this.GATEWAY_URL}/sessions/${userId}`,
    {
      headers: {
        'Authorization': `Bearer ${this.GATEWAY_TOKEN}`
      }
    }
  ).toPromise();

  return response.data;
}
```

---

### 8. Listar Sessões Ativas

**GET** `/sessions`

Lista todas as sessões WhatsApp ativas no gateway.

**Resposta de Sucesso (200):**
```json
{
  "sessions": ["user-123", "user-456", "user-789"]
}
```

---

### 9. Health Check

**GET** `/health`

Verifica se o gateway está funcionando.

**Resposta (200):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "service": "whatsapp-gateway"
}
```

---

## Exemplo Completo de Integração (NestJS)

```typescript
import { Injectable, HttpService, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class WhatsAppGatewayService {
  private readonly logger = new Logger(WhatsAppGatewayService.name);
  private readonly gatewayUrl: string;
  private readonly gatewayToken: string;

  constructor(
    private httpService: HttpService,
    private configService: ConfigService
  ) {
    this.gatewayUrl = this.configService.get('WHATSAPP_GATEWAY_URL', 'http://localhost:3001');
    this.gatewayToken = this.configService.get('WHATSAPP_GATEWAY_TOKEN', '');
  }

  private getHeaders() {
    const headers: any = {
      'Content-Type': 'application/json'
    };

    if (this.gatewayToken) {
      headers['Authorization'] = `Bearer ${this.gatewayToken}`;
    }

    return headers;
  }

  /**
   * Cria uma sessão WhatsApp e retorna o QR Code
   */
  async createSession(userId: string) {
    try {
      const response = await this.httpService.post(
        `${this.gatewayUrl}/sessions/${userId}/create`,
        {},
        { headers: this.getHeaders() }
      ).toPromise();

      return response.data;
    } catch (error) {
      this.logger.error(`Erro ao criar sessão para ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Verifica o status da sessão
   */
  async getSessionStatus(userId: string) {
    try {
      const response = await this.httpService.get(
        `${this.gatewayUrl}/sessions/${userId}/status`,
        { headers: this.getHeaders() }
      ).toPromise();

      return response.data;
    } catch (error) {
      this.logger.error(`Erro ao verificar status da sessão ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Aguarda a conexão da sessão (polling)
   */
  async waitForConnection(userId: string, maxAttempts: number = 60, intervalMs: number = 2000) {
    for (let i = 0; i < maxAttempts; i++) {
      const status = await this.getSessionStatus(userId);

      if (status.connected) {
        return true;
      }

      if (status.status === 'disconnected' || status.status === 'not_found') {
        throw new Error('Sessão desconectada ou não encontrada');
      }

      // Aguarda antes da próxima tentativa
      await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Timeout aguardando conexão');
  }

  /**
   * Envia mensagem de texto
   */
  async sendText(userId: string, to: string, message: string) {
    try {
      const response = await this.httpService.post(
        `${this.gatewayUrl}/send-text`,
        {
          sessionUserId: userId,
          to: to.replace(/\D/g, ''),
          message: message
        },
        { headers: this.getHeaders() }
      ).toPromise();

      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Sessão WhatsApp não conectada. Por favor, reconecte.');
      }
      this.logger.error(`Erro ao enviar mensagem:`, error);
      throw error;
    }
  }

  /**
   * Envia imagem com legenda
   */
  async sendImage(userId: string, to: string, imageKey: string, caption?: string) {
    try {
      const response = await this.httpService.post(
        `${this.gatewayUrl}/send-image`,
        {
          sessionUserId: userId,
          to: to.replace(/\D/g, ''),
          imageKey: imageKey,
          caption: caption || ''
        },
        { headers: this.getHeaders() }
      ).toPromise();

      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Sessão WhatsApp não conectada. Por favor, reconecte.');
      }
      this.logger.error(`Erro ao enviar imagem:`, error);
      throw error;
    }
  }

  /**
   * Envia áudio
   */
  async sendAudio(userId: string, to: string, audioKey: string) {
    try {
      const response = await this.httpService.post(
        `${this.gatewayUrl}/send-audio`,
        {
          sessionUserId: userId,
          to: to.replace(/\D/g, ''),
          audioKey: audioKey
        },
        { headers: this.getHeaders() }
      ).toPromise();

      return response.data;
    } catch (error) {
      if (error.response?.status === 404) {
        throw new Error('Sessão WhatsApp não conectada. Por favor, reconecte.');
      }
      this.logger.error(`Erro ao enviar áudio:`, error);
      throw error;
    }
  }

  /**
   * Remove sessão
   */
  async removeSession(userId: string) {
    try {
      const response = await this.httpService.delete(
        `${this.gatewayUrl}/sessions/${userId}`,
        { headers: this.getHeaders() }
      ).toPromise();

      return response.data;
    } catch (error) {
      this.logger.error(`Erro ao remover sessão ${userId}:`, error);
      throw error;
    }
  }
}
```

---

## Exemplo de Controller NestJS

```typescript
import { Controller, Post, Get, Delete, Body, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { WhatsAppGatewayService } from './whatsapp-gateway.service';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private whatsappService: WhatsAppGatewayService) {}

  @Post('sessions/:userId/create')
  async createSession(@Param('userId') userId: string) {
    return await this.whatsappService.createSession(userId);
  }

  @Get('sessions/:userId/status')
  async getStatus(@Param('userId') userId: string) {
    return await this.whatsappService.getSessionStatus(userId);
  }

  @Get('sessions/:userId/qr')
  async getQRCode(@Param('userId') userId: string, @Res() res: Response) {
    const status = await this.whatsappService.getSessionStatus(userId);
    
    if (!status.qr) {
      return res.status(404).json({ error: 'QR Code não encontrado' });
    }

    // Retorna o QR Code como imagem
    const base64Data = status.qr.replace(/^data:image\/png;base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    res.setHeader('Content-Type', 'image/png');
    res.send(imageBuffer);
  }

  @Post('send-text')
  async sendText(
    @Body('userId') userId: string,
    @Body('to') to: string,
    @Body('message') message: string
  ) {
    return await this.whatsappService.sendText(userId, to, message);
  }

  @Post('send-image')
  async sendImage(
    @Body('userId') userId: string,
    @Body('to') to: string,
    @Body('imageKey') imageKey: string,
    @Body('caption') caption?: string
  ) {
    return await this.whatsappService.sendImage(userId, to, imageKey, caption);
  }

  @Post('send-audio')
  async sendAudio(
    @Body('userId') userId: string,
    @Body('to') to: string,
    @Body('audioKey') audioKey: string
  ) {
    return await this.whatsappService.sendAudio(userId, to, audioKey);
  }

  @Delete('sessions/:userId')
  async removeSession(@Param('userId') userId: string) {
    return await this.whatsappService.removeSession(userId);
  }
}
```

---

## Tratamento de Erros

### Códigos de Status HTTP

- **200**: Sucesso
- **400**: Dados inválidos (campos obrigatórios faltando)
- **401**: Não autorizado (token inválido)
- **404**: Recurso não encontrado (sessão não existe, QR Code não encontrado)
- **500**: Erro interno do servidor

### Erros Comuns

1. **Sessão não conectada (404)**
   - **Causa**: Tentativa de enviar mensagem sem sessão conectada
   - **Solução**: Criar sessão e aguardar conexão antes de enviar mensagens

2. **QR Code não encontrado (404)**
   - **Causa**: QR Code expirou ou sessão já conectou
   - **Solução**: Verificar status da sessão, se não conectada, criar nova sessão

3. **Imagem/Áudio não encontrado no MinIO (500)**
   - **Causa**: Arquivo não existe no MinIO com a chave fornecida
   - **Solução**: Verificar se o arquivo foi enviado corretamente para o MinIO

---

## Boas Práticas

1. **Armazenar `userId`**: Use o mesmo `userId` do seu sistema (ex: UUID do usuário) para identificar sessões

2. **Polling de Status**: Após criar sessão, faça polling em `GET /sessions/:userId/status` a cada 2-3 segundos até conectar

3. **Tratamento de Reconexão**: Se a sessão desconectar, o gateway tenta reconectar automaticamente. Monitore o status periodicamente

4. **Formato de Telefone**: Sempre envie números no formato `55999999999` (sem caracteres especiais)

5. **MinIO**: Certifique-se de que as mídias (imagens/áudios) estão no MinIO antes de tentar enviar

6. **Timeout**: Configure timeouts adequados nas requisições HTTP (ex: 30 segundos)

7. **Retry Logic**: Implemente retry para requisições que falharem por problemas de rede

---

## Variáveis de Ambiente no Backend

Adicione no seu `.env` do backend:

```env
WHATSAPP_GATEWAY_URL=http://localhost:3001
WHATSAPP_GATEWAY_TOKEN=seu-token-aqui
```

---

## Fluxo Completo de Uso (Exemplo)

```typescript
// 1. Usuário solicita conectar WhatsApp
const userId = 'user-uuid-123';
const sessionData = await whatsappService.createSession(userId);

// 2. Exibir QR Code para o usuário
if (sessionData.qr) {
  // Renderizar QR Code no frontend
  // <img src={sessionData.qr} />
}

// 3. Aguardar conexão (polling)
await whatsappService.waitForConnection(userId);

// 4. Após conectar, pode enviar mensagens
await whatsappService.sendText(
  userId,
  '55999999999',
  'Olá! Sua sessão foi conectada com sucesso!'
);

// 5. Enviar imagem
await whatsappService.sendImage(
  userId,
  '55999999999',
  'campaigns/banner.jpg',
  'Confira nossa nova campanha!'
);
```

---

## Suporte

Para dúvidas ou problemas, verifique:
- Logs do gateway
- Status da sessão via `GET /sessions/:userId/status`
- Health check via `GET /health`




