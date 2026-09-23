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
// REGENERAR TOKEN DE CLIENTE
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


    // ------------------------------------------------
    // VALIDAR CLIENTE
    // ------------------------------------------------

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


    // ------------------------------------------------
    // REVOCAR TOKENS ACTIVOS
    // ------------------------------------------------

    await new sql.Request(
      transaction
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
          ID_CLIENTE =
            @idCliente

          AND ESTADO =
            'ACTIVO'
      `);


    // ------------------------------------------------
    // CREAR NUEVO TOKEN
    // ------------------------------------------------

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
      tokenResult
        .recordset[0]
        .ID_TOKEN;


    await transaction.commit();


    return {
      idCliente,
      idToken,

      token,

      estado:
        "ACTIVO",

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