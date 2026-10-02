import crypto from "node:crypto";

import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


function generarHash(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex")
    .toUpperCase();
}


export async function clientTokenAuth(
  req,
  res,
  next
) {

  try {

    const authorization =
      String(
        req.get("authorization") || ""
      ).trim();


    if (
      !authorization
        .toLowerCase()
        .startsWith("bearer ")
    ) {

      return res
        .status(401)
        .json({
          success: false,
          error:
            "Token de acceso requerido.",
          code:
            "TOKEN_REQUIRED",
        });
    }


    const token =
      authorization
        .substring(7)
        .trim();


    if (!token) {

      return res
        .status(401)
        .json({
          success: false,
          error:
            "Token de acceso requerido.",
          code:
            "TOKEN_REQUIRED",
        });
    }


    const tokenHash =
      generarHash(token);


    const pool =
      await getSqlPool();


    const result =
      await pool
        .request()

        .input(
          "tokenHash",
          sql.Char(64),
          tokenHash
        )

        .query(`
          SELECT
            T.ID_TOKEN,
            T.ID_CLIENTE,
            T.ESTADO AS TOKEN_ESTADO,
            T.FECHA_VENCIMIENTO,
            T.ULTIMO_USO,

            C.ESTADO AS CLIENTE_ESTADO,
            C.TIPO_DOCUMENTO_CLIENTE,
            C.DOCUMENTO_CLIENTE,
            C.NOMBRES,
            C.APELLIDO_PATERNO,
            C.APELLIDO_MATERNO,
            C.RAZON_SOCIAL,

            S.ID_TOKEN AS SALDO_ID_TOKEN,
            S.CREDITOS_DISPONIBLES,
            S.TOTAL_ASIGNADO,
            S.TOTAL_CONSUMIDO

          FROM
            GestionAPIClientes.Tokens T

          INNER JOIN
            GestionAPIClientes.Clientes C
              ON C.ID_CLIENTE =
                 T.ID_CLIENTE

          LEFT JOIN
            GestionAPIClientes.Saldos S
              ON S.ID_TOKEN =
                 T.ID_TOKEN

          WHERE
            T.TOKEN_HASH =
              @tokenHash
        `);


    if (
      result.recordset.length === 0
    ) {

      return res
        .status(401)
        .json({
          success: false,
          error:
            "Token de acceso no válido.",
          code:
            "INVALID_TOKEN",
        });
    }


    const acceso =
      result.recordset[0];


    if (
      acceso.TOKEN_ESTADO !==
      "ACTIVO"
    ) {

      return res
        .status(403)
        .json({
          success: false,
          error:
            "El token no se encuentra activo.",
          code:
            "TOKEN_NOT_ACTIVE",
        });
    }


    if (
      acceso.CLIENTE_ESTADO !==
      "ACTIVO"
    ) {

      return res
        .status(403)
        .json({
          success: false,
          error:
            "El cliente no se encuentra activo.",
          code:
            "CLIENT_NOT_ACTIVE",
        });
    }


    if (
      acceso.FECHA_VENCIMIENTO &&
      new Date(
        acceso.FECHA_VENCIMIENTO
      ) <= new Date()
    ) {

      return res
        .status(403)
        .json({
          success: false,
          error:
            "El token ha vencido.",
          code:
            "TOKEN_EXPIRED",
        });
    }


    if (
      acceso.SALDO_ID_TOKEN === null ||
      acceso.SALDO_ID_TOKEN === undefined
    ) {

      console.error(
        "Token activo sin registro de saldo:",
        {
          idToken:
            acceso.ID_TOKEN,

          idCliente:
            acceso.ID_CLIENTE,
        }
      );


      return res
        .status(409)
        .json({
          success: false,
          error:
            "El token no tiene un registro de créditos asociado.",
          code:
            "TOKEN_BALANCE_NOT_FOUND",
        });
    }


    req.clienteApi = {

      idCliente:
        acceso.ID_CLIENTE,

      idToken:
        acceso.ID_TOKEN,

      tipoDocumentoCliente:
        acceso.TIPO_DOCUMENTO_CLIENTE,

      documentoCliente:
        acceso.DOCUMENTO_CLIENTE,

      nombres:
        acceso.NOMBRES,

      apellidoPaterno:
        acceso.APELLIDO_PATERNO,

      apellidoMaterno:
        acceso.APELLIDO_MATERNO,

      razonSocial:
        acceso.RAZON_SOCIAL,

      creditosDisponibles:
        Number(
          acceso.CREDITOS_DISPONIBLES
        ),

      totalAsignado:
        Number(
          acceso.TOTAL_ASIGNADO
        ),

      totalConsumido:
        Number(
          acceso.TOTAL_CONSUMIDO
        ),
    };


    return next();


  } catch (error) {

    console.error(
      "Error validando token cliente:",
      error
    );


    return res
      .status(500)
      .json({
        success: false,
        error:
          "Error interno del servidor.",
        code:
          "TOKEN_VALIDATION_ERROR",
      });
  }
}