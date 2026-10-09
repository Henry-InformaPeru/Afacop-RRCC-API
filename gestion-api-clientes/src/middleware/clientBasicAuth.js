import crypto from "node:crypto";
import { promisify } from "node:util";

import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


const scryptAsync =
  promisify(
    crypto.scrypt
  );


// ==================================================
// RESPUESTA DE ERROR
// ==================================================

function responderError(
  res,
  status,
  error,
  code
) {

  return res
    .status(status)
    .json({
      success: false,
      error,
      code,
    });
}


// ==================================================
// VALIDAR CLIENT_SECRET
// ==================================================

async function validarSecret(
  clientSecret,
  salt,
  hashEsperado
) {

  const hashCalculado =
    await scryptAsync(
      clientSecret,
      salt,
      64
    );


  const hashGuardado =
    Buffer.from(
      hashEsperado,
      "hex"
    );


  if (
    hashCalculado.length !==
    hashGuardado.length
  ) {

    return false;
  }


  return crypto
    .timingSafeEqual(
      hashCalculado,
      hashGuardado
    );
}


// ==================================================
// BASIC AUTH PARA API COMERCIAL
// ==================================================

export async function clientBasicAuth(
  req,
  res,
  next
) {

  try {

    // ==============================================
    // 1. LEER AUTHORIZATION
    // ==============================================

    const authorization =
      String(
        req.get(
          "authorization"
        ) || ""
      )
        .trim();


    if (
      !authorization
        .toLowerCase()
        .startsWith(
          "basic "
        )
    ) {

      res.set(
        "WWW-Authenticate",
        'Basic realm="Solutec API"'
      );


      return responderError(
        res,
        401,
        "Credenciales de acceso requeridas.",
        "BASIC_AUTH_REQUIRED"
      );
    }


    // ==============================================
    // 2. OBTENER BASE64
    // ==============================================

    const encoded =
      authorization
        .substring(6)
        .trim();


    if (!encoded) {

      return responderError(
        res,
        401,
        "Credenciales de acceso no válidas.",
        "INVALID_API_CREDENTIALS"
      );
    }


    let decoded;


    try {

      decoded =
        Buffer
          .from(
            encoded,
            "base64"
          )
          .toString(
            "utf8"
          );

    } catch {

      return responderError(
        res,
        401,
        "Credenciales de acceso no válidas.",
        "INVALID_API_CREDENTIALS"
      );
    }


    // ==============================================
    // 3. SEPARAR CLIENT_ID : CLIENT_SECRET
    //
    // Se usa el primer ":".
    // ==============================================

    const separatorIndex =
      decoded.indexOf(
        ":"
      );


    if (
      separatorIndex <= 0
    ) {

      return responderError(
        res,
        401,
        "Credenciales de acceso no válidas.",
        "INVALID_API_CREDENTIALS"
      );
    }


    const clientId =
      decoded
        .substring(
          0,
          separatorIndex
        )
        .trim();


    const clientSecret =
      decoded
        .substring(
          separatorIndex + 1
        );


    if (
      !clientId ||
      !clientSecret
    ) {

      return responderError(
        res,
        401,
        "Credenciales de acceso no válidas.",
        "INVALID_API_CREDENTIALS"
      );
    }


    // ==============================================
    // 4. BUSCAR CREDENCIAL + CLIENTE
    // ==============================================

    const pool =
      await getSqlPool();


    const credencialResult =
      await pool
        .request()

        .input(
          "clientId",
          sql.VarChar(80),
          clientId
        )

        .query(`
          SELECT
            AC.ID_CREDENCIAL,
            AC.ID_CLIENTE,
            AC.CLIENT_ID,
            AC.CLIENT_SECRET_HASH,
            AC.CLIENT_SECRET_SALT,
            AC.ESTADO AS CREDENCIAL_ESTADO,

            C.ESTADO AS CLIENTE_ESTADO,

            C.TIPO_DOCUMENTO_CLIENTE,
            C.DOCUMENTO_CLIENTE,

            C.NOMBRES,
            C.APELLIDO_PATERNO,
            C.APELLIDO_MATERNO,

            C.RAZON_SOCIAL

          FROM
            GestionAPIClientes.ApiCredenciales AC

          INNER JOIN
            GestionAPIClientes.Clientes C
              ON C.ID_CLIENTE =
                 AC.ID_CLIENTE

          WHERE
            AC.CLIENT_ID =
              @clientId
        `);


    if (
      credencialResult
        .recordset
        .length === 0
    ) {

      return responderError(
        res,
        401,
        "Credenciales de acceso no válidas.",
        "INVALID_API_CREDENTIALS"
      );
    }


    const acceso =
      credencialResult
        .recordset[0];


    // ==============================================
    // 5. VALIDAR CLIENT_SECRET
    // ==============================================

    const secretValido =
      await validarSecret(
        clientSecret,
        acceso.CLIENT_SECRET_SALT,
        acceso.CLIENT_SECRET_HASH
      );


    if (
      !secretValido
    ) {

      return responderError(
        res,
        401,
        "Credenciales de acceso no válidas.",
        "INVALID_API_CREDENTIALS"
      );
    }


    // ==============================================
    // 6. VALIDAR ESTADO DE CREDENCIAL
    // ==============================================

    if (
      acceso.CREDENCIAL_ESTADO !==
      "ACTIVO"
    ) {

      return responderError(
        res,
        403,
        "La credencial API no se encuentra activa.",
        "API_CREDENTIAL_NOT_ACTIVE"
      );
    }


    // ==============================================
    // 7. VALIDAR CLIENTE
    // ==============================================

    if (
      acceso.CLIENTE_ESTADO !==
      "ACTIVO"
    ) {

      return responderError(
        res,
        403,
        "El cliente no se encuentra activo.",
        "CLIENT_NOT_ACTIVE"
      );
    }


    const idCliente =
      Number(
        acceso.ID_CLIENTE
      );


    // ==============================================
    // 8. BUSCAR TOKEN INTERNO ACTIVO
    //
    // La credencial Basic identifica al cliente.
    //
    // El ID_TOKEN se sigue usando internamente
    // para Movimientos y Consumos.
    // ==============================================

    const tokenResult =
      await pool
        .request()

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .query(`
          SELECT
            ID_TOKEN,
            ESTADO,
            FECHA_VENCIMIENTO

          FROM
            GestionAPIClientes.Tokens

          WHERE
            ID_CLIENTE =
              @idCliente

            AND ESTADO =
              'ACTIVO'

          ORDER BY
            ID_TOKEN DESC
        `);


    if (
      tokenResult
        .recordset
        .length === 0
    ) {

      return responderError(
        res,
        403,
        "El cliente no tiene un token interno activo.",
        "ACTIVE_TOKEN_NOT_FOUND"
      );
    }


    if (
      tokenResult
        .recordset
        .length > 1
    ) {

      console.error(
        `Cliente ${idCliente} tiene más de un token activo.`
      );


      return responderError(
        res,
        500,
        "Existe una inconsistencia en la configuración del cliente.",
        "MULTIPLE_ACTIVE_TOKENS"
      );
    }


    const token =
      tokenResult
        .recordset[0];


    // ==============================================
    // 9. TOKEN INTERNO VENCIDO
    // ==============================================

    if (
      token.FECHA_VENCIMIENTO &&
      new Date(
        token.FECHA_VENCIMIENTO
      ) <= new Date()
    ) {

      return responderError(
        res,
        403,
        "El acceso del cliente se encuentra vencido.",
        "TOKEN_EXPIRED"
      );
    }


    const idToken =
      Number(
        token.ID_TOKEN
      );


    // ==============================================
    // 10. OBTENER CRÉDITOS POR SERVICIO
    // ==============================================

    const saldosResult =
      await pool
        .request()

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .query(`
          SELECT
            S.ID_SERVICIO,
            S.CODIGO,
            S.NOMBRE,

            SS.CREDITOS_DISPONIBLES,
            SS.TOTAL_ASIGNADO,
            SS.TOTAL_CONSUMIDO,
            SS.FECHA_ACTUALIZACION

          FROM
            GestionAPIClientes.SaldosServicios SS

          INNER JOIN
            GestionAPIClientes.Servicios S
              ON S.ID_SERVICIO =
                 SS.ID_SERVICIO

          WHERE
            SS.ID_CLIENTE =
              @idCliente

          ORDER BY
            S.ID_SERVICIO
        `);


    const creditosPorServicio =
      {};


    let totalDisponible =
      0;

    let totalAsignado =
      0;

    let totalConsumido =
      0;


    for (
      const saldo
      of saldosResult.recordset
    ) {

      const codigo =
        String(
          saldo.CODIGO
        )
          .trim()
          .toUpperCase();


      const bolsa = {

        idServicio:
          Number(
            saldo.ID_SERVICIO
          ),

        codigo,

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

        fechaActualizacion:
          saldo.FECHA_ACTUALIZACION,

      };


      creditosPorServicio[
        codigo
      ] = bolsa;


      totalDisponible +=
        bolsa.disponibles;


      totalAsignado +=
        bolsa.totalAsignado;


      totalConsumido +=
        bolsa.totalConsumido;
    }


    // ==============================================
    // 11. ACTUALIZAR ÚLTIMO USO
    // ==============================================

    await pool
      .request()

      .input(
        "idCredencial",
        sql.BigInt,
        acceso.ID_CREDENCIAL
      )

      .query(`
        UPDATE
          GestionAPIClientes.ApiCredenciales

        SET
          ULTIMO_USO =
            SYSUTCDATETIME(),

          FECHA_ACTUALIZACION =
            SYSUTCDATETIME()

        WHERE
          ID_CREDENCIAL =
            @idCredencial
      `);


    // ==============================================
    // 12. CONSTRUIR req.clienteApi
    //
    // Mantenemos la misma estructura que utiliza
    // el resto del proyecto.
    // ==============================================

    req.clienteApi = {

      idCliente,

      idToken,

      idCredencial:
        Number(
          acceso.ID_CREDENCIAL
        ),

      clientId:
        acceso.CLIENT_ID,

      tipoAutenticacion:
        "BASIC",

      tipoDocumentoCliente:
        acceso
          .TIPO_DOCUMENTO_CLIENTE,

      documentoCliente:
        acceso
          .DOCUMENTO_CLIENTE,

      nombres:
        acceso.NOMBRES,

      apellidoPaterno:
        acceso.APELLIDO_PATERNO,

      apellidoMaterno:
        acceso.APELLIDO_MATERNO,

      razonSocial:
        acceso.RAZON_SOCIAL,

      creditosDisponibles:
        totalDisponible,

      totalAsignado,

      totalConsumido,

      creditosPorServicio,

    };


    return next();


  } catch (
    error
  ) {

    console.error(
      "Error en clientBasicAuth:",
      error
    );


    return res
      .status(500)
      .json({

        success:
          false,

        error:
          "Error interno validando las credenciales.",

        code:
          "BASIC_AUTH_INTERNAL_ERROR",

      });
  }
}