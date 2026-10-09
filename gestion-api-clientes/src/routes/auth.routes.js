import {
  Router,
} from "express";

import rateLimit from "express-rate-limit";

import {
  adminSessionAuth,
} from "../middleware/adminSessionAuth.js";

import {
  autenticarAdministrador,
} from "../services/auth.service.js";

import {
  solicitarRecuperacionPassword,
  validarTokenRecuperacion,
  restablecerPassword,
} from "../services/passwordReset.service.js";

import {
  enviarCorreoRecuperacion,
} from "../services/email.service.js";


const router =
  Router();


// ==================================================
// PROTECCIÓN LOGIN ADMIN
//
// Máximo:
// 5 intentos FALLIDOS cada 5 minutos por IP.
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
// RATE LIMIT - RECUPERACIÓN DE CONTRASEÑA
//
// Máximo:
// 3 solicitudes cada 15 minutos por IP.
//
// Solo protege:
// POST /api/admin/auth/forgot-password
// ==================================================

const forgotPasswordLimiter =
  rateLimit({

    windowMs:
      15 * 60 * 1000,

    limit:
      3,

    standardHeaders:
      true,

    legacyHeaders:
      false,

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
            "Demasiadas solicitudes de recuperación. Intente nuevamente más tarde.",

          code:
            "PASSWORD_RESET_RATE_LIMIT",
        });
    },
  });


// ==================================================
// RATE LIMIT - RESTABLECER CONTRASEÑA
//
// Protege el endpoint final ante abuso.
//
// Máximo:
// 10 intentos cada 15 minutos por IP.
// ==================================================

const resetPasswordLimiter =
  rateLimit({

    windowMs:
      15 * 60 * 1000,

    limit:
      10,

    standardHeaders:
      true,

    legacyHeaders:
      false,

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
            "Demasiados intentos de restablecimiento. Intente nuevamente más tarde.",

          code:
            "PASSWORD_RESET_ATTEMPTS_LIMIT",
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


// ==================================================
// LOGIN
//
// Protección:
// 5 intentos fallidos / 5 minutos / IP.
// ==================================================

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


// ==================================================
// SESIÓN ACTUAL
// ==================================================

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


// ==================================================
// LOGOUT
// ==================================================

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


// ==================================================
// SOLICITAR RECUPERACIÓN DE CONTRASEÑA
//
// Flujo:
// correo
// -> generar token
// -> guardar hash
// -> generar enlace temporal
// -> enviar correo
//
// La respuesta SIEMPRE debe ser genérica.
// No se revela si el correo existe.
// ==================================================

router.post(
  "/forgot-password",

  forgotPasswordLimiter,

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await solicitarRecuperacionPassword({

          email:
            req.body?.email,

          ipSolicitud:
            req.ip ||
            null,
        });


      // ---------------------------------------------
      // Solo enviamos correo si:
      //
      // - existe el administrador
      // - está activo
      //
      // Esa información nunca se expone
      // en la respuesta pública.
      // ---------------------------------------------

      let emailResultado =
        null;


      if (
        resultado.encontrado
      ) {

        emailResultado =
          await enviarCorreoRecuperacion({

            email:
              resultado
                .administrador
                .email,

            nombre:
              resultado
                .administrador
                .nombre,

            token:
              resultado.token,
          });
      }


      // ---------------------------------------------
      // RESPUESTA GENÉRICA
      //
      // Evita enumeración de usuarios/correos.
      // ---------------------------------------------

      const response = {

        success:
          true,

        message:
          "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.",
      };


      // ---------------------------------------------
      // DEBUG SOLO PARA DESARROLLO
      //
      // Requiere:
      //
      // NODE_ENV != production
      // PASSWORD_RESET_DEBUG=true
      //
      // Además solamente aparece cuando
      // email.service está en modo desarrollo
      // sin SMTP configurado.
      //
      // NUNCA debe habilitarse en producción.
      // ---------------------------------------------

      if (
        process.env.NODE_ENV !==
          "production" &&

        process.env.PASSWORD_RESET_DEBUG ===
          "true" &&

        emailResultado
          ?.modoDesarrollo ===
          true &&

        emailResultado
          ?.resetUrl
      ) {

        response.debug = {

          resetUrl:
            emailResultado
              .resetUrl,
        };
      }


      return res
        .status(200)
        .json(
          response
        );


    } catch (error) {

      console.error(
        "Error solicitando recuperación de contraseña:",
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
              : "No se pudo procesar la recuperación de contraseña.",

          code:
            error.code ||
            "PASSWORD_RESET_ERROR",
        });
    }
  }
);


// ==================================================
// VALIDAR ENLACE / TOKEN DE RECUPERACIÓN
//
// El frontend puede utilizar este endpoint
// al abrir:
//
// /admin/restablecer-password?token=...
//
// para comprobar que el enlace:
// - existe
// - no expiró
// - no fue utilizado
// ==================================================

router.get(
  "/reset-password/validate",

  async (
    req,
    res
  ) => {

    try {

      const resultado =
        await validarTokenRecuperacion(
          req.query?.token
        );


      return res
        .status(200)
        .json({

          success:
            true,

          data: {

            valido:
              resultado.valido,

            fechaExpiracion:
              resultado
                .fechaExpiracion,
          },
        });


    } catch (error) {

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
              : "No se pudo validar el enlace.",

          code:
            error.code ||
            "RESET_TOKEN_VALIDATION_ERROR",
        });
    }
  }
);


// ==================================================
// RESTABLECER CONTRASEÑA
//
// Recibe:
// token
// nuevaPassword
// confirmarPassword
//
// Si todo es válido:
//
// PASSWORD_HASH cambia
// SESSION_VERSION + 1
// token queda utilizado
// sesiones antiguas quedan invalidadas
// ==================================================

router.post(
  "/reset-password",

  resetPasswordLimiter,

  async (
    req,
    res
  ) => {

    try {

      const {
        token,
        nuevaPassword,
        confirmarPassword,
      } =
        req.body || {};


      // ---------------------------------------------
      // CONFIRMACIÓN DE CONTRASEÑA
      // ---------------------------------------------

      if (
        typeof nuevaPassword !==
          "string" ||

        typeof confirmarPassword !==
          "string"
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            error:
              "Debe ingresar y confirmar la nueva contraseña.",

            code:
              "PASSWORD_REQUIRED",
          });
      }


      if (
        nuevaPassword !==
        confirmarPassword
      ) {

        return res
          .status(400)
          .json({

            success:
              false,

            error:
              "Las contraseñas no coinciden.",

            code:
              "PASSWORD_CONFIRMATION_MISMATCH",
          });
      }


      const resultado =
        await restablecerPassword({

          token,

          nuevaPassword,
        });


      // ---------------------------------------------
      // ELIMINAR COOKIE ACTUAL
      //
      // Si el navegador tenía una sesión
      // administrativa anterior, se elimina.
      // ---------------------------------------------

      res.clearCookie(
        "admin_session",
        {

          httpOnly:
            true,

          sameSite:
            "lax",

          secure:
            process.env.NODE_ENV ===
            "production",

          path:
            "/",
        }
      );


      return res
        .status(200)
        .json(
          resultado
        );


    } catch (error) {

      console.error(
        "Error restableciendo contraseña:",
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
              : "No se pudo restablecer la contraseña.",

          code:
            error.code ||
            "PASSWORD_RESET_ERROR",
        });
    }
  }
);


export default router;