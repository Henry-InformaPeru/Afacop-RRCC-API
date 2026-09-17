import { getRrccPool } from "./config/sqlserver.js";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import rrccRoutes from "./routes/rrcc.routes.js";
import { apiKeyMiddleware } from "./middleware/apiKey.js";

const app = express();

app.use(helmet());

app.use(
  express.json({
    limit: "100kb",
  })
);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// --------------------------------------------------
// HEALTH GENERAL - PÚBLICO
// --------------------------------------------------

app.get("/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    service: "rrcc-api",
    timestamp: new Date().toISOString(),
  });
});

// --------------------------------------------------
// HEALTH SQL SERVER - PROTEGIDO CON API KEY
// --------------------------------------------------

app.get(
  "/health/sqlserver",
  apiKeyMiddleware,
  async (req, res) => {
    try {
      const pool =
        await getRrccPool();

      const result =
        await pool
          .request()
          .query(`
            SELECT
              DB_NAME() AS base_datos,
              @@SERVERNAME AS servidor
          `);

      return res.status(200).json({
        status: "ok",
        conectado: true,
        sqlServer:
          result.recordset[0],
      });
    } catch (error) {
      console.error(
        "Error SQL Server:",
        error
      );

      return res.status(500).json({
        status: "error",
        conectado: false,
        mensaje:
          "No se pudo conectar a SQL Server.",
      });
    }
  }
);

// --------------------------------------------------
// RUTAS RRCC
// --------------------------------------------------

app.use(
  "/v1/rrcc",
  rrccRoutes
);

export default app;