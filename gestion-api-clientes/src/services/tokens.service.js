import crypto from "node:crypto";

import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


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


function generarToken() {

  const secreto =
    crypto
      .randomBytes(32)
      .toString("hex");


  return `rrcc_live_${secreto}`;
}


function generarHash(token) {

  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex")
    .toUpperCase();
}


// --------------------------------------------------
// REGENERAR TOKEN
// --------------------------------------------------

export async function regenerarTokenCliente(
  idCliente,
  fechaVencimiento = null
) {

  idCliente =
    Number(idCliente);


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


  let fechaVencimientoSql =
    null;


  if (fechaVencimiento) {

    fechaVencimientoSql =
      new Date(
        fechaVencimiento
      );


    if (
      Number.isNaN(
        fechaVencimientoSql.getTime()
      )
    ) {

      throw crearError(
        "La fecha de vencimiento no es válida.",
        400,
        "INVALID_EXPIRATION_DATE"
      );
    }
  }


  const token =
    generarToken();


  const tokenHash =
    generarHash(token);


  const tokenPrefijo =
    token.substring(
      0,
      24
    );


  const pool =
    await getSqlPool();


  const transaction =
    new sql.Transaction(pool);


  try {

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    // --------------------------------------------------
    // VALIDAR CLIENTE
    // --------------------------------------------------

    const clienteResult =
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
            ID_CLIENTE,
            ESTADO

          FROM
            GestionAPIClientes.Clientes

          WHERE
            ID_CLIENTE =
              @idCliente
        `);


    if (
      clienteResult.recordset.length === 0
    ) {

      throw crearError(
        "Cliente no encontrado.",
        404,
        "CLIENT_NOT_FOUND"
      );
    }


    // --------------------------------------------------
    // OBTENER TOKEN ACTIVO
    // --------------------------------------------------

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
      tokenActivoResult.recordset.length === 0
    ) {

      throw crearError(
        "El cliente no tiene un token activo para regenerar.",
        409,
        "ACTIVE_TOKEN_NOT_FOUND"
      );
    }


    if (
      tokenActivoResult.recordset.length > 1
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


    // --------------------------------------------------
    // BLOQUEAR SALDO ACTUAL
    // --------------------------------------------------

    const saldoResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .input(
          "idTokenAnterior",
          sql.BigInt,
          idTokenAnterior
        )

        .query(`
          SELECT
            CREDITOS_DISPONIBLES,
            TOTAL_ASIGNADO,
            TOTAL_CONSUMIDO

          FROM
            GestionAPIClientes.Saldos
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          WHERE
            ID_CLIENTE =
              @idCliente

            AND ID_TOKEN =
              @idTokenAnterior
        `);


    if (
      saldoResult.recordset.length === 0
    ) {

      throw crearError(
        "El token activo no tiene un registro de saldo.",
        409,
        "TOKEN_BALANCE_NOT_FOUND"
      );
    }


    const saldoActual =
      saldoResult.recordset[0];


    // --------------------------------------------------
    // REVOCAR TOKEN ANTERIOR
    // --------------------------------------------------

    await new sql.Request(
      transaction
    )

      .input(
        "idTokenAnterior",
        sql.BigInt,
        idTokenAnterior
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
      `);


    // --------------------------------------------------
    // CREAR TOKEN NUEVO
    // --------------------------------------------------

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


    // --------------------------------------------------
    // TRANSFERIR LA BOLSA DE CRÉDITOS
    // --------------------------------------------------

    const transferResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .input(
          "idTokenAnterior",
          sql.BigInt,
          idTokenAnterior
        )

        .input(
          "idTokenNuevo",
          sql.BigInt,
          idToken
        )

        .query(`
          UPDATE
            GestionAPIClientes.Saldos

          SET
            ID_TOKEN =
              @idTokenNuevo,

            FECHA_ACTUALIZACION =
              SYSDATETIME()

          WHERE
            ID_CLIENTE =
              @idCliente

            AND ID_TOKEN =
              @idTokenAnterior
        `);


    if (
      transferResult.rowsAffected[0] !== 1
    ) {

      throw crearError(
        "No fue posible transferir el saldo al nuevo token.",
        409,
        "TOKEN_BALANCE_TRANSFER_FAILED"
      );
    }


    await transaction.commit();


    return {

      idCliente,

      idTokenAnterior,

      idToken,

      token,

      estado:
        "ACTIVO",

      creditosDisponibles:
        Number(
          saldoActual
            .CREDITOS_DISPONIBLES
        ),

      totalAsignado:
        Number(
          saldoActual
            .TOTAL_ASIGNADO
        ),

      totalConsumido:
        Number(
          saldoActual
            .TOTAL_CONSUMIDO
        ),

      fechaVencimiento:
        fechaVencimientoSql,
    };


  } catch (error) {

    try {

      await transaction.rollback();

    } catch {

      // La transacción pudo haberse revertido.
    }


    throw error;
  }
}