import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import clienteRoutes from "./routes/cliente.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import authRoutes from "./routes/auth.routes.js";
import administradoresRoutes from "./routes/administradores.routes.js";

import {
  getSqlPool,
} from "./config/sqlserver.js";


const app =
  express();


// --------------------------------------------------
// SEGURIDAD HTTP
// --------------------------------------------------

app.use(
  helmet({
    contentSecurityPolicy:
      false,
  })
);


// --------------------------------------------------
// JSON
// --------------------------------------------------

app.use(
  express.json({
    limit:
      "100kb",
  })
);


// --------------------------------------------------
// COOKIES
// --------------------------------------------------

app.use(
  cookieParser()
);


// --------------------------------------------------
// HEALTH
// --------------------------------------------------

app.get(
  "/health",
  (
    req,
    res
  ) => {

    return res
      .status(200)
      .json({

        status:
          "ok",

        service:
          "gestion-api-clientes",

        timestamp:
          new Date()
            .toISOString(),
      });
  }
);


// --------------------------------------------------
// HEALTH SQL SERVER
// --------------------------------------------------

app.get(
  "/health/sqlserver",

  async (
    req,
    res
  ) => {

    try {

      const pool =
        await getSqlPool();


      const result =
        await pool
          .request()
          .query(`
            SELECT
              DB_NAME()
                AS base_datos,

              @@SERVERNAME
                AS servidor
          `);


      return res
        .status(200)
        .json({

          status:
            "ok",

          conectado:
            true,

          sqlServer:
            result.recordset[0],
        });


    } catch (error) {

      console.error(
        "Error conectando a SQL Server:",
        error
      );


      return res
        .status(500)
        .json({

          status:
            "error",

          conectado:
            false,

          mensaje:
            "No se pudo conectar a SQL Server.",
        });
    }
  }
);


// --------------------------------------------------
// AUTENTICACIÓN ADMIN
// --------------------------------------------------

app.use(
  "/api/admin/auth",
  authRoutes
);


// --------------------------------------------------
// GESTIÓN DE ADMINISTRADORES
// SOLO SUPERADMIN
// --------------------------------------------------

app.use(
  "/api/admin/administradores",
  administradoresRoutes
);


// --------------------------------------------------
// ADMIN
// CLIENTES / DASHBOARD / CONSUMOS
// --------------------------------------------------

app.use(
  "/api/admin",
  adminRoutes
);


// --------------------------------------------------
// CLIENTE / API COMERCIAL
//
// Los rate limits específicos están dentro
// de cliente.routes.js.
// --------------------------------------------------

app.use(
  "/api/cliente",
  clienteRoutes
);


// --------------------------------------------------
// 404 API
//
// SIEMPRE DEBE IR AL FINAL.
// --------------------------------------------------

app.use(
  (
    req,
    res
  ) => {

    return res
      .status(404)
      .json({

        success:
          false,

        error:
          "Ruta no encontrada.",

        code:
          "ROUTE_NOT_FOUND",
      });
  }
);


export default app;