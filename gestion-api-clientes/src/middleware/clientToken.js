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


    // ================================================
    // 1. VALIDAR TOKEN Y CLIENTE
    // ================================================

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

            C.RAZON_SOCIAL

          FROM
            GestionAPIClientes.Tokens T

          INNER JOIN
            GestionAPIClientes.Clientes C
              ON C.ID_CLIENTE =
                 T.ID_CLIENTE

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


    // ================================================
    // 2. VALIDAR TOKEN ACTIVO
    // ================================================

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


    // ================================================
    // 3. VALIDAR CLIENTE ACTIVO
    // ================================================

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


    // ================================================
    // 4. VALIDAR VENCIMIENTO
    // ================================================

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


    // ================================================
    // 5. OBTENER BOLSAS DEL CLIENTE
    // ================================================

    const saldosResult =
      await pool
        .request()

        .input(
          "idCliente",
          sql.BigInt,
          acceso.ID_CLIENTE
        )

        .query(`
          SELECT
            SS.ID_SERVICIO,

            S.CODIGO,
            S.NOMBRE,

            SS.CREDITOS_DISPONIBLES,
            SS.TOTAL_ASIGNADO,
            SS.TOTAL_CONSUMIDO

          FROM
            GestionAPIClientes.SaldosServicios SS

          INNER JOIN
            GestionAPIClientes.Servicios S
              ON S.ID_SERVICIO =
                 SS.ID_SERVICIO

          WHERE
            SS.ID_CLIENTE =
              @idCliente

            AND S.ESTADO =
              'ACTIVO'

          ORDER BY
            S.ID_SERVICIO
        `);


    if (
      saldosResult.recordset.length === 0
    ) {

      console.error(
        "Cliente activo sin bolsas de créditos:",
        {
          idCliente:
            acceso.ID_CLIENTE,

          idToken:
            acceso.ID_TOKEN,
        }
      );


      return res
        .status(409)
        .json({
          success: false,
          error:
            "El cliente no tiene bolsas de créditos configuradas.",
          code:
            "CLIENT_SERVICE_BALANCES_NOT_FOUND",
        });
    }


    // ================================================
    // 6. MAPEAR BOLSAS
    // ================================================

    const creditosPorServicio = {};


    let creditosDisponibles = 0;
    let totalAsignado = 0;
    let totalConsumido = 0;


    for (
      const saldo
      of saldosResult.recordset
    ) {

      const codigo =
        String(
          saldo.CODIGO
        ).toUpperCase();


      const datosSaldo = {

        idServicio:
          Number(
            saldo.ID_SERVICIO
          ),

        nombre:
          saldo.NOMBRE,

        disponibles:
          Number(
            saldo.CREDITOS_DISPONIBLES
          ),

        totalAsignado:
          Number(
            saldo.TOTAL_ASIGNADO
          ),

        totalConsumido:
          Number(
            saldo.TOTAL_CONSUMIDO
          ),

      };


      creditosPorServicio[codigo] =
        datosSaldo;


      creditosDisponibles +=
        datosSaldo.disponibles;

      totalAsignado +=
        datosSaldo.totalAsignado;

      totalConsumido +=
        datosSaldo.totalConsumido;
    }


    // ================================================
    // 7. CONTEXTO DEL CLIENTE
    // ================================================

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


      // NUEVO
      creditosPorServicio,


      // Compatibilidad temporal
      creditosDisponibles,

      totalAsignado,

      totalConsumido,

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