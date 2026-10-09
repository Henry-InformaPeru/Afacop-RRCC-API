import crypto from "node:crypto";

import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


// ==================================================
// UTILIDADES
// ==================================================

function crearError(
  message,
  statusCode,
  code
) {

  const error =
    new Error(message);

  error.statusCode =
    statusCode;

  error.code =
    code;

  return error;
}


// ==================================================
// CONTEXTO DEL ADMINISTRADOR
// ==================================================

function obtenerContextoAdministrador(
  adminActual
) {

  const idAdmin =
    Number(
      adminActual?.idAdmin
    );


  const rol =
    String(
      adminActual?.rol || ""
    )
      .trim()
      .toUpperCase();


  if (
    !Number.isInteger(idAdmin) ||
    idAdmin <= 0
  ) {

    throw crearError(
      "El administrador no es válido.",
      401,
      "INVALID_ADMIN"
    );
  }


  if (
    ![
      "ADMIN",
      "SUPERADMIN",
    ].includes(rol)
  ) {

    throw crearError(
      "El administrador no tiene un rol válido.",
      403,
      "INVALID_ADMIN_ROLE"
    );
  }


  return {

    idAdmin,

    rol,

    esSuperAdmin:
      rol === "SUPERADMIN",

  };
}


// ==================================================
// GENERAR TOKEN
// ==================================================

function generarToken() {

  const secreto =
    crypto
      .randomBytes(32)
      .toString("hex");


  return `rrcc_live_${secreto}`;
}


// ==================================================
// GENERAR HASH
// ==================================================

function generarHash(token) {

  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex")
    .toUpperCase();
}


// ==================================================
// NORMALIZAR FECHA DE VENCIMIENTO
// ==================================================

function normalizarFechaVencimiento(
  fechaVencimiento
) {

  if (!fechaVencimiento) {

    return null;
  }


  const fecha =
    new Date(
      fechaVencimiento
    );


  if (
    Number.isNaN(
      fecha.getTime()
    )
  ) {

    throw crearError(
      "La fecha de vencimiento no es válida.",
      400,
      "INVALID_EXPIRATION_DATE"
    );
  }


  return fecha;
}


// ==================================================
// REGENERAR TOKEN
// ==================================================

export async function regenerarTokenCliente(
  idCliente,
  fechaVencimiento = null,
  adminActual
) {

  // ==================================================
  // 1. VALIDAR ADMINISTRADOR
  // ==================================================

  const contextoAdmin =
    obtenerContextoAdministrador(
      adminActual
    );


  // ==================================================
  // 2. VALIDAR CLIENTE
  // ==================================================

  idCliente =
    Number(
      idCliente
    );


  if (
    !Number.isInteger(idCliente) ||
    idCliente <= 0
  ) {

    throw crearError(
      "El cliente no es válido.",
      400,
      "INVALID_CLIENT"
    );
  }


  // ==================================================
  // 3. VALIDAR FECHA DE VENCIMIENTO
  // ==================================================

  const fechaVencimientoSql =
    normalizarFechaVencimiento(
      fechaVencimiento
    );


  // ==================================================
  // 4. GENERAR NUEVO TOKEN
  // ==================================================

  const token =
    generarToken();


  const tokenHash =
    generarHash(
      token
    );


  const tokenPrefijo =
    token.substring(
      0,
      24
    );


  // ==================================================
  // 5. CONEXIÓN
  // ==================================================

  const pool =
    await getSqlPool();


  const transaction =
    new sql.Transaction(
      pool
    );


  try {

    // ==================================================
    // 6. INICIAR TRANSACCIÓN
    // ==================================================

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    // ==================================================
    // 7. VALIDAR CLIENTE Y PROPIEDAD
    // ==================================================

    const clienteResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .input(
          "idAdmin",
          sql.BigInt,
          contextoAdmin.idAdmin
        )

        .input(
          "esSuperAdmin",
          sql.Bit,
          contextoAdmin.esSuperAdmin
            ? 1
            : 0
        )

        .query(`
          SELECT
            ID_CLIENTE,
            ESTADO,
            ID_ADMIN

          FROM
            GestionAPIClientes.Clientes
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          WHERE
            ID_CLIENTE =
              @idCliente

            AND
            (
              @esSuperAdmin = 1
              OR ID_ADMIN = @idAdmin
            )
        `);


    if (
      clienteResult.recordset.length ===
      0
    ) {

      throw crearError(
        "Cliente no encontrado.",
        404,
        "CLIENT_NOT_FOUND"
      );
    }


    const cliente =
      clienteResult.recordset[0];


    // ==================================================
    // 8. VALIDAR ESTADO DEL CLIENTE
    // ==================================================

    if (
      cliente.ESTADO !== "ACTIVO"
    ) {

      throw crearError(
        "El cliente no se encuentra activo.",
        409,
        "CLIENT_NOT_ACTIVE"
      );
    }


    // ==================================================
    // 9. BUSCAR TOKEN ACTIVO
    // ==================================================

    const tokenActivoResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .query(`
          SELECT
            ID_TOKEN

          FROM
            GestionAPIClientes.Tokens
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          WHERE
            ID_CLIENTE =
              @idCliente

            AND ESTADO =
              'ACTIVO'

          ORDER BY
            ID_TOKEN DESC
        `);


    if (
      tokenActivoResult.recordset.length ===
      0
    ) {

      throw crearError(
        "El cliente no tiene un token activo para regenerar.",
        409,
        "ACTIVE_TOKEN_NOT_FOUND"
      );
    }


    if (
      tokenActivoResult.recordset.length >
      1
    ) {

      throw crearError(
        "El cliente tiene más de un token activo. Corrija la inconsistencia antes de regenerar.",
        409,
        "MULTIPLE_ACTIVE_TOKENS"
      );
    }


    const idTokenAnterior =
      Number(
        tokenActivoResult
          .recordset[0]
          .ID_TOKEN
      );


    // ==================================================
    // 10. REVOCAR TOKEN ANTERIOR
    // ==================================================

    const revocarResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idTokenAnterior",
          sql.BigInt,
          idTokenAnterior
        )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .query(`
          UPDATE
            GestionAPIClientes.Tokens

          SET
            ESTADO =
              'REVOCADO'

          WHERE
            ID_TOKEN =
              @idTokenAnterior

            AND ID_CLIENTE =
              @idCliente

            AND ESTADO =
              'ACTIVO'
        `);


    if (
      revocarResult.rowsAffected[0] !== 1
    ) {

      throw crearError(
        "No fue posible revocar el token anterior.",
        409,
        "TOKEN_REVOKE_FAILED"
      );
    }


    // ==================================================
    // 11. CREAR TOKEN NUEVO
    // ==================================================

    const tokenResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .input(
          "tokenHash",
          sql.Char(64),
          tokenHash
        )

        .input(
          "tokenPrefijo",
          sql.VarChar(30),
          tokenPrefijo
        )

        .input(
          "fechaVencimiento",
          sql.DateTime2,
          fechaVencimientoSql
        )

        .query(`
          INSERT INTO
            GestionAPIClientes.Tokens
          (
            ID_CLIENTE,

            TOKEN_HASH,
            TOKEN_PREFIJO,

            ESTADO,

            FECHA_VENCIMIENTO
          )

          OUTPUT
            INSERTED.ID_TOKEN

          VALUES
          (
            @idCliente,

            @tokenHash,
            @tokenPrefijo,

            'ACTIVO',

            @fechaVencimiento
          )
        `);


    const idToken =
      Number(
        tokenResult
          .recordset[0]
          .ID_TOKEN
      );


    // ==================================================
    // IMPORTANTE
    //
    // NO SE MODIFICAN LOS SALDOS.
    //
    // Las bolsas de créditos ahora pertenecen a:
    //
    // ID_CLIENTE + ID_SERVICIO
    //
    // en:
    //
    // GestionAPIClientes.SaldosServicios
    //
    // Por eso regenerar el token NO debe:
    //
    // - crear bolsas nuevas
    // - mover créditos
    // - cambiar ID_TOKEN en saldos
    // - reiniciar créditos
    //
    // RRCC y SUELDOS conservan exactamente sus saldos.
    // ==================================================


    // ==================================================
    // 12. CONFIRMAR TRANSACCIÓN
    // ==================================================

    await transaction.commit();


    // ==================================================
    // 13. RESPUESTA
    // ==================================================

    return {

      idCliente,

      idTokenAnterior,

      idToken,

      token,

      estado:
        "ACTIVO",

      fechaVencimiento:
        fechaVencimientoSql,

    };


  } catch (error) {

    // ==================================================
    // REVERTIR TRANSACCIÓN
    // ==================================================

    try {

      await transaction.rollback();

    } catch {

      // La transacción pudo haberse revertido.

    }


    throw error;
  }
}