import {
  Router,
} from "express";

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


const cookieOptions = {
  httpOnly: true,

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
// Protegido con ADMIN_API_KEY
// --------------------------------------------------

router.post(
  "/crear",
  adminAuth,
  async (req, res) => {

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
          success: true,
          data: resultado,
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
          success: false,

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
// --------------------------------------------------

router.post(
  "/login",
  async (req, res) => {

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
          success: true,

          data: {
            administrador:
              resultado.administrador,
          },
        });

    } catch (error) {

      return res
        .status(
          error.statusCode ||
          500
        )
        .json({
          success: false,

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
  (req, res) => {

    return res
      .status(200)
      .json({
        success: true,
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
  (req, res) => {

    res.clearCookie(
      "admin_session",
      {
        httpOnly: true,

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
        success: true,
        message:
          "Sesión cerrada correctamente.",
      });
  }
);


export default router;