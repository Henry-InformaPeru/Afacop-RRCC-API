import {
  verificarTokenAdministrador,
} from "../services/auth.service.js";

import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


export async function adminSessionAuth(
  req,
  res,
  next
) {

  try {

    // --------------------------------------------------
    // COOKIE
    // --------------------------------------------------

    const token =
      req.cookies?.admin_session;


    if (!token) {

      return res
        .status(401)
        .json({

          success:
            false,

          error:
            "Debe iniciar sesión.",

          code:
            "ADMIN_SESSION_REQUIRED",
        });
    }


    // --------------------------------------------------
    // VERIFICAR FIRMA Y EXPIRACIÓN DEL JWT
    // --------------------------------------------------

    const payload =
      verificarTokenAdministrador(
        token
      );


    const idAdmin =
      Number(
        payload.sub
      );


    const sessionVersionToken =
      Number(
        payload.sessionVersion
      );


    if (
      !Number.isInteger(idAdmin) ||
      idAdmin <= 0
    ) {

      return res
        .status(401)
        .json({

          success:
            false,

          error:
            "La sesión administrativa no es válida.",

          code:
            "INVALID_ADMIN_SESSION",
        });
    }


    if (
      !Number.isInteger(
        sessionVersionToken
      ) ||
      sessionVersionToken < 1
    ) {

      return res
        .status(401)
        .json({

          success:
            false,

          error:
            "La sesión administrativa no es válida.",

          code:
            "INVALID_ADMIN_SESSION",
        });
    }


    // --------------------------------------------------
    // CONSULTAR ADMINISTRADOR ACTUAL
    // --------------------------------------------------

    const pool =
      await getSqlPool();


    const result =
      await pool
        .request()

        .input(
          "idAdmin",
          sql.BigInt,
          idAdmin
        )

        .query(`
          SELECT TOP 1
            ID_ADMIN,
            USUARIO,
            NOMBRE,
            EMAIL,
            ROL,
            ESTADO,
            SESSION_VERSION

          FROM
            GestionAPIClientes.Administradores

          WHERE
            ID_ADMIN =
              @idAdmin
        `);


    // --------------------------------------------------
    // ADMINISTRADOR ELIMINADO / NO EXISTE
    // --------------------------------------------------

    if (
      result.recordset.length === 0
    ) {

      return res
        .status(401)
        .json({

          success:
            false,

          error:
            "La sesión administrativa no es válida.",

          code:
            "ADMIN_NOT_FOUND",
        });
    }


    const admin =
      result.recordset[0];


    // --------------------------------------------------
    // ADMINISTRADOR BLOQUEADO
    // --------------------------------------------------

    if (
      admin.ESTADO !==
      "ACTIVO"
    ) {

      return res
        .status(403)
        .json({

          success:
            false,

          error:
            "El administrador se encuentra bloqueado.",

          code:
            "ADMIN_BLOCKED",
        });
    }


    // --------------------------------------------------
    // VALIDAR SESSION_VERSION
    //
    // Si cambia contraseña o cerramos todas sus
    // sesiones:
    //
    // BD: 2
    // JWT antiguo: 1
    //
    // => sesión rechazada
    // --------------------------------------------------

    const sessionVersionActual =
      Number(
        admin.SESSION_VERSION
      );


    if (
      sessionVersionActual !==
      sessionVersionToken
    ) {

      return res
        .status(401)
        .json({

          success:
            false,

          error:
            "La sesión ha sido invalidada. Inicie sesión nuevamente.",

          code:
            "ADMIN_SESSION_REVOKED",
        });
    }


    // --------------------------------------------------
    // VALIDAR ROL
    // --------------------------------------------------

    if (
      ![
        "ADMIN",
        "SUPERADMIN",
      ].includes(
        admin.ROL
      )
    ) {

      return res
        .status(403)
        .json({

          success:
            false,

          error:
            "El administrador no tiene un rol válido.",

          code:
            "INVALID_ADMIN_ROLE",
        });
    }


    // --------------------------------------------------
    // DATOS AUTORIZADOS DEL ADMINISTRADOR
    //
    // Usamos valores actuales de BD, no los del JWT.
    // --------------------------------------------------

    req.admin = {

      idAdmin:
        admin.ID_ADMIN,

      usuario:
        admin.USUARIO,

      nombre:
        admin.NOMBRE,

      email:
        admin.EMAIL,

      rol:
        admin.ROL,

      sessionVersion:
        sessionVersionActual,
    };


    return next();


  } catch (error) {

    console.error(
      "Error validando sesión administrativa:",
      error
    );


    return res
      .status(
        error.statusCode ||
        401
      )
      .json({

        success:
          false,

        error:
          error.statusCode
            ? error.message
            : "La sesión administrativa no es válida.",

        code:
          error.code ||
          "INVALID_ADMIN_SESSION",
      });
  }
}