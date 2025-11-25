import {
  AuthenticationState,
  initAuthCreds,
  BufferJSON,
} from "baileys";
import { getRedisClient } from "../config/redis.config";

export class RedisStorageService {
  private redis = getRedisClient();
  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  private getKey(key: string): string {
    return `whatsapp:auth:${this.userId}:${key}`;
  }

  async getState(): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }> {
    const credsKey = this.getKey("creds");
    console.log(
      `[RedisStorage] 🔍 Buscando estado de autenticação no Redis para userId: ${this.userId}`
    );

    // Buscar credenciais do Redis
    const credsData = await this.redis.get(credsKey);

    let creds: any = null;

    if (credsData) {
      console.log(
        `[RedisStorage] ✅ Credenciais encontradas no Redis para userId: ${this.userId}`
      );
      try {
        creds = JSON.parse(credsData, BufferJSON.reviver);
      } catch (error) {
        console.error(
          `[RedisStorage] ❌ Erro ao fazer parse das credenciais para userId: ${this.userId}:`,
          error
        );
      }
    } else {
      console.log(
        `[RedisStorage] ⚠️  Nenhuma credencial encontrada no Redis para userId: ${this.userId}`
      );
    }

    // Se não há credenciais, inicializar novas
    if (!creds) {
      console.log(
        `[RedisStorage] 🆕 Inicializando novas credenciais para userId: ${this.userId}`
      );
      creds = initAuthCreds();
    }

    const state: AuthenticationState = {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: any } = {};
          for (const id of ids) {
            const key = this.getKey(`${type}-${id}`);
            const value = await this.redis.get(key);
            if (value) {
              try {
                data[id] = JSON.parse(value, BufferJSON.reviver);
              } catch (error) {
                console.error(`Error parsing key ${key}:`, error);
              }
            }
          }
          return data;
        },
        set: async (data) => {
          const tasks: Promise<string>[] = [];
          for (const category in data) {
            const categoryData = data[category as keyof typeof data];
            if (categoryData) {
              for (const jid in categoryData) {
                const value = categoryData[jid];
                const key = this.getKey(`${category}-${jid}`);
                tasks.push(
                  this.redis.set(
                    key,
                    JSON.stringify(value, BufferJSON.replacer),
                    "EX",
                    60 * 60 * 24 * 7 // 7 dias de TTL
                  )
                );
              }
            }
          }
          await Promise.all(tasks);
        },
      },
    };

    const saveCreds = async () => {
      await this.redis.set(
        credsKey,
        JSON.stringify(state.creds, BufferJSON.replacer),
        "EX",
        60 * 60 * 24 * 30 // 30 dias de TTL
      );
    };

    return { state, saveCreds };
  }

  async clearState(): Promise<void> {
    const pattern = this.getKey("*");
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async setQRCode(qr: string, ttl: number = 300): Promise<void> {
    const qrKey = `whatsapp:qr:${this.userId}`;
    console.log(
      `[RedisStorage] 💾 Salvando QR Code no Redis para userId: ${this.userId} (TTL: ${ttl}s)`
    );
    await this.redis.set(qrKey, qr, "EX", ttl);
    console.log(
      `[RedisStorage] ✅ QR Code salvo com sucesso para userId: ${this.userId}`
    );
  }

  async getQRCode(): Promise<string | null> {
    const qrKey = `whatsapp:qr:${this.userId}`;
    console.log(
      `[RedisStorage] 🔍 Buscando QR Code no Redis para userId: ${this.userId}`
    );
    const qr = await this.redis.get(qrKey);
    console.log(
      `[RedisStorage] ${
        qr ? "✅ QR Code encontrado" : "❌ QR Code não encontrado"
      } para userId: ${this.userId}`
    );
    return qr;
  }

  async deleteQRCode(): Promise<void> {
    const qrKey = `whatsapp:qr:${this.userId}`;
    console.log(
      `[RedisStorage] 🗑️  Removendo QR Code do Redis para userId: ${this.userId}`
    );
    await this.redis.del(qrKey);
    console.log(
      `[RedisStorage] ✅ QR Code removido para userId: ${this.userId}`
    );
  }

  async setStatus(status: string, ttl: number = 3600): Promise<void> {
    const statusKey = `whatsapp:status:${this.userId}`;
    console.log(
      `[RedisStorage] 💾 Salvando status '${status}' no Redis para userId: ${this.userId} (TTL: ${ttl}s)`
    );
    await this.redis.set(statusKey, status, "EX", ttl);
    console.log(`[RedisStorage] ✅ Status salvo para userId: ${this.userId}`);
  }

  async getStatus(): Promise<string | null> {
    const statusKey = `whatsapp:status:${this.userId}`;
    console.log(
      `[RedisStorage] 🔍 Buscando status no Redis para userId: ${this.userId}`
    );
    const status = await this.redis.get(statusKey);
    console.log(
      `[RedisStorage] ${
        status
          ? `✅ Status encontrado: '${status}'`
          : "❌ Status não encontrado"
      } para userId: ${this.userId}`
    );
    return status;
  }
}
