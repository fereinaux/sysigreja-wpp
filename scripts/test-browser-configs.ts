/**
 * Script para testar diferentes configurações de browser do Baileys
 * Execute: npx ts-node scripts/test-browser-configs.ts
 */

import {
  makeWASocket,
  Browsers,
  DisconnectReason,
  initAuthCreds,
  BufferJSON,
} from "baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";

// Configurações de browser para testar
const browserConfigs = [
  {
    name: "Custom (atual)",
    config: ["SysIgreja", "Chrome", "1.0.0"],
  },
  {
    name: "Ubuntu Chrome",
    config: ["Ubuntu", "Chrome", "22.04.4"],
  },
  {
    name: "macOS Desktop",
    config: Browsers.macOS("Desktop"),
  },
  {
    name: "Windows Desktop",
    config: Browsers.windows("Desktop"),
  },
  {
    name: "Ubuntu Desktop",
    config: Browsers.ubuntu("Desktop"),
  },
];

async function testBrowserConfig(configName: string, browserConfig: any) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Testando: ${configName}`);
  console.log(`Configuração: ${JSON.stringify(browserConfig)}`);
  console.log(`${"=".repeat(60)}\n`);

  const creds = initAuthCreds();
  const state = {
    creds,
    keys: {
      get: async () => ({}),
      set: async () => {},
    },
  };

  const socket = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    browser: browserConfig,
    connectTimeoutMs: 30000,
  });

  return new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.end(undefined);
      console.log(`⏱️  Timeout após 30 segundos`);
      resolve();
    }, 30000);

    socket.ev.on("connection.update", (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        console.log(`✅ QR Code gerado com sucesso!`);
        clearTimeout(timeout);
        socket.end(undefined);
        resolve();
        return;
      }

      if (connection === "open") {
        console.log(`✅ Conexão estabelecida com sucesso!`);
        clearTimeout(timeout);
        socket.end(undefined);
        resolve();
        return;
      }

      if (connection === "close") {
        const error = lastDisconnect?.error as Boom;
        const statusCode = error?.output?.statusCode;

        console.log(`❌ Conexão fechada - Status Code: ${statusCode}`);

        if (statusCode === 405) {
          console.log(`   ⚠️  Erro 405 (Connection Failure) - Esta configuração não funcionou`);
        } else if (statusCode === DisconnectReason.loggedOut) {
          console.log(`   ⚠️  Logged Out`);
        } else {
          console.log(`   ⚠️  Outro erro: ${statusCode}`);
        }

        clearTimeout(timeout);
        resolve();
        return;
      }
    });
  });
}

async function main() {
  console.log("🧪 Testando diferentes configurações de browser do Baileys");
  console.log("Este script testa várias configurações para identificar qual funciona\n");

  for (const { name, config } of browserConfigs) {
    try {
      await testBrowserConfig(name, config);
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Aguardar 2s entre testes
    } catch (error) {
      console.error(`❌ Erro ao testar ${name}:`, error);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("✅ Testes concluídos!");
  console.log("Revise os resultados acima para identificar qual configuração funcionou");
  console.log(`${"=".repeat(60)}\n`);
}

main().catch(console.error);

