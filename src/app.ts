import express from "express";
import { GatewayController } from "./controllers/gateway.controller.js";
import * as dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(express.json());

// Middleware de autenticação (opcional)
app.use((req, res, next) => {
  const expectedToken = process.env.GATEWAY_TOKEN;

  // Se não há token configurado, não requer autenticação
  if (!expectedToken || expectedToken.trim() === "") {
    return next();
  }

  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token || token !== expectedToken) {
    return res.status(401).json({ error: "Não autorizado" });
  }

  next();
});

// CORS (opcional, ajustar conforme necessário)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  next();
});

const gatewayController = new GatewayController();
app.use("/", gatewayController.getRouter());

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    service: "whatsapp-gateway",
  });
});

export default app;
