import {
  Router,
} from "express";

import rateLimit from "express-rate-limit";

import {
  adminAuth,
} from "../middleware/adminAuth.js";

import {
  adminSessionAuth,
} from "../middleware/adminSessionAuth.js";

import {
  crearAdministrador,
  autenticarAdministrador,
} from "../services/auth.service.js";


const router =
  Router();


// ==================================================
// PROTECCIÓN LOGIN ADMIN
//
// Máximo:
// 5 intentos FALLIDOS cada 15 minutos por IP.
//
// Un login correcto NO cuenta.
//
// Intento 1 incorrecto -> 401
// Intento 2 incorrecto -> 401
// ...
// Intento 5 incorrecto -> 401
// Intento 6 -> 429
//
// Solo protege:
// POST /api/admin/auth/login
// ==================================================

const adminLoginLimiter =
  rateLimit({

    windowMs:
      5 * 60 * 1000,

    limit:
      5,

    standardHeaders:
      true,

    legacyHeaders:
      false,

    // Los login exitosos no cuentan
    // para el límite de intentos.
    skipSuccessfulRequests:
      true,

    handler(
      req,
      res
    ) {

      return res
        .status(429)
        .json({

          success:
            false,

          error:
            "Se realizaron demasiados intentos de inicio de sesión. Intente nuevamente más tarde.",

          code:
            "ADMIN_LOGIN_RATE_LIMITED",
        });
    },
  });


// ==================================================
// COOKIE SESIÓN ADMIN
// ==================================================

const cookieOptions = {

  httpOnly:
    true,

  secure:
    process.env.NODE_ENV ===
    "production",

  sameSite:
    "lax",

  maxAge:
    8 * 60 * 60 * 1000,

  path:
    "/",
};


// --------------------------------------------------
// CREAR ADMINISTRADOR
//
// Protegido con ADMIN_API_KEY.
// NO usa el rate limit de login.
// --------------------------------------------------

router.post(
  "/crear",

  adminAuth,

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await crearAdministrador({

          usuario:
            req.body?.usuario,

          password:
            req.body?.password,

          nombre:
            req.body?.nombre,
        });


      return res
        .status(201)
        .json({

          success:
            true,

          data:
            resultado,
        });


    } catch (error) {

      console.error(
        "Error creando administrador:",
        error
      );


      return res
        .status(
          error.statusCode ||
          500
        )
        .json({

          success:
            false,

          error:
            error.statusCode
              ? error.message
              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);


// --------------------------------------------------
// LOGIN
//
// Protección:
// 5 intentos fallidos / 15 minutos / IP.
// --------------------------------------------------

router.post(
  "/login",

  adminLoginLimiter,

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await autenticarAdministrador({

          usuario:
            req.body?.usuario,

          password:
            req.body?.password,
        });


      res.cookie(
        "admin_session",
        resultado.tokenSesion,
        cookieOptions
      );


      return res
        .status(200)
        .json({

          success:
            true,

          data: {

            administrador:
              resultado.administrador,
          },
        });


    } catch (error) {

      console.error(
        "Error iniciando sesión administrador:",
        error
      );


      return res
        .status(
          error.statusCode ||
          500
        )
        .json({

          success:
            false,

          error:
            error.statusCode
              ? error.message
              : "Error interno del servidor.",

          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);


// --------------------------------------------------
// SESIÓN ACTUAL
// --------------------------------------------------

router.get(
  "/me",

  adminSessionAuth,

  (
    req,
    res
  ) => {

    return res
      .status(200)
      .json({

        success:
          true,

        data: {

          administrador:
            req.admin,
        },
      });
  }
);


// --------------------------------------------------
// LOGOUT
// --------------------------------------------------

router.post(
  "/logout",

  (
    req,
    res
  ) => {

    res.clearCookie(
      "admin_session",
      {

        httpOnly:
          true,

        secure:
          process.env.NODE_ENV ===
          "production",

        sameSite:
          "lax",

        path:
          "/",
      }
    );


    return res
      .status(200)
      .json({

        success:
          true,

        message:
          "Sesión cerrada correctamente.",
      });
  }
);


export default router;