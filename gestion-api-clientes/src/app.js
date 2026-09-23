import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import clienteRoutes from "./routes/cliente.routes.js";

import adminRoutes  from "./routes/admin.routes.js";

import {getSqlPool,} from "./config/sqlserver.js";

import cookieParser from "cookie-parser";

import authRoutes from "./routes/auth.routes.js";

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(
  express.json({
    limit: "100kb",
  })
);

app.use(
  cookieParser()
);

app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get("/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    service: "gestion-api-clientes",
    timestamp: new Date().toISOString(),
  });
});

// --------------------------------------------------
// HEALTH SQL SERVER
// --------------------------------------------------

app.get(
  "/health/sqlserver",
  async (req, res) => {
    try {
      const pool =
        await getSqlPool();

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
        "Error conectando a SQL Server:",
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

app.use(
  "/api/admin",
  adminRoutes
);

app.use(
  "/api/cliente",
  clienteRoutes
);

app.use(
  "/api/admin/auth",
  authRoutes
);

export default app;