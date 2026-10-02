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


function validarIds(
  idCliente,
  idToken
) {

  const cliente =
    Number(idCliente);

  const token =
    Number(idToken);


  if (
    !Number.isInteger(cliente) ||
    cliente <= 0
  ) {

    throw crearError(
      "El cliente no es válido.",
      400,
      "INVALID_CLIENT"
    );
  }


  if (
    !Number.isInteger(token) ||
    token <= 0
  ) {

    throw crearError(
      "El token no es válido.",
      400,
      "INVALID_TOKEN_ID"
    );
  }


  return {
    idCliente:
      cliente,

    idToken:
      token,
  };
}


// --------------------------------------------------
// RESERVAR / CONSUMIR 1 CRÉDITO DEL TOKEN
// --------------------------------------------------

export async function reservarCredito({
  idCliente,
  idToken,
}) {

  ({
    idCliente,
    idToken,
  } = validarIds(
    idCliente,
    idToken
  ));


  const pool =
    await getSqlPool();


  const transaction =
    new sql.Transaction(pool);


  try {

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    // --------------------------------------------------
    // VALIDAR TOKEN DENTRO DE LA TRANSACCIÓN
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
          "idToken",
          sql.BigInt,
          idToken
        )

        .query(`
          SELECT
            T.ID_TOKEN,
            T.ID_CLIENTE,
            T.ESTADO AS TOKEN_ESTADO,
            T.FECHA_VENCIMIENTO,
            C.ESTADO AS CLIENTE_ESTADO

          FROM
            GestionAPIClientes.Tokens T
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          INNER JOIN
            GestionAPIClientes.Clientes C
              ON C.ID_CLIENTE =
                 T.ID_CLIENTE

          WHERE
            T.ID_TOKEN =
              @idToken

            AND T.ID_CLIENTE =
              @idCliente
        `);


    if (
      tokenResult.recordset.length === 0
    ) {

      throw crearError(
        "El token no pertenece al cliente indicado.",
        401,
        "INVALID_TOKEN"
      );
    }


    const token =
      tokenResult.recordset[0];


    if (
      token.TOKEN_ESTADO !==
      "ACTIVO"
    ) {

      throw crearError(
        "El token no se encuentra activo.",
        403,
        "TOKEN_NOT_ACTIVE"
      );
    }


    if (
      token.CLIENTE_ESTADO !==
      "ACTIVO"
    ) {

      throw crearError(
        "El cliente no se encuentra activo.",
        403,
        "CLIENT_NOT_ACTIVE"
      );
    }


    if (
      token.FECHA_VENCIMIENTO &&
      new Date(
        token.FECHA_VENCIMIENTO
      ) <= new Date()
    ) {

      throw crearError(
        "El token ha vencido.",
        403,
        "TOKEN_EXPIRED"
      );
    }


    // --------------------------------------------------
    // BLOQUEAR SALDO DEL TOKEN
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
          "idToken",
          sql.BigInt,
          idToken
        )

        .query(`
          SELECT
            ID_CLIENTE,
            ID_TOKEN,
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
            ID_TOKEN =
              @idToken

            AND ID_CLIENTE =
              @idCliente
        `);


    if (
      saldoResult.recordset.length === 0
    ) {

      throw crearError(
        "No existe saldo para este token.",
        409,
        "TOKEN_BALANCE_NOT_FOUND"
      );
    }


    const saldoAntes =
      Number(
        saldoResult
          .recordset[0]
          .CREDITOS_DISPONIBLES
      );


    if (
      saldoAntes <= 0
    ) {

      throw crearError(
        "No tiene créditos disponibles para realizar consultas.",
        402,
        "INSUFFICIENT_CREDITS"
      );
    }


    const saldoDespues =
      saldoAntes - 1;


    // --------------------------------------------------
    // DESCONTAR CRÉDITO
    // --------------------------------------------------

    const updateResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .input(
          "idToken",
          sql.BigInt,
          idToken
        )

        .query(`
          UPDATE
            GestionAPIClientes.Saldos

          SET
            CREDITOS_DISPONIBLES =
              CREDITOS_DISPONIBLES - 1,

            TOTAL_CONSUMIDO =
              TOTAL_CONSUMIDO + 1,

            FECHA_ACTUALIZACION =
              SYSDATETIME()

          WHERE
            ID_TOKEN =
              @idToken

            AND ID_CLIENTE =
              @idCliente
        `);


    if (
      updateResult.rowsAffected[0] !== 1
    ) {

      throw crearError(
        "No fue posible descontar el crédito del token.",
        409,
        "CREDIT_UPDATE_FAILED"
      );
    }


    // --------------------------------------------------
    // MOVIMIENTO
    // --------------------------------------------------

    const movimientoResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .input(
          "idToken",
          sql.BigInt,
          idToken
        )

        .input(
          "saldoAntes",
          sql.Int,
          saldoAntes
        )

        .input(
          "saldoDespues",
          sql.Int,
          saldoDespues
        )

        .query(`
          INSERT INTO
            GestionAPIClientes.Movimientos
          (
            ID_CLIENTE,
            ID_TOKEN,

            TIPO,
            CANTIDAD,

            SALDO_ANTES,
            SALDO_DESPUES,

            ORIGEN,
            OBSERVACION
          )

          OUTPUT
            INSERTED.ID_MOVIMIENTO

          VALUES
          (
            @idCliente,
            @idToken,

            'CONSUMO',
            1,

            @saldoAntes,
            @saldoDespues,

            'CONSULTA',
            'Reserva de crédito para consulta'
          )
        `);


    const idMovimiento =
      movimientoResult
        .recordset[0]
        .ID_MOVIMIENTO;


    // --------------------------------------------------
    // ÚLTIMO USO
    // --------------------------------------------------

    await new sql.Request(
      transaction
    )

      .input(
        "idToken",
        sql.BigInt,
        idToken
      )

      .query(`
        UPDATE
          GestionAPIClientes.Tokens

        SET
          ULTIMO_USO =
            SYSDATETIME()

        WHERE
          ID_TOKEN =
            @idToken
      `);


    await transaction.commit();


    return {

      idCliente,
      idToken,

      idMovimiento,

      saldoAntes,

      saldoActual:
        saldoDespues,

      creditosConsumidos:
        1,
    };


  } catch (error) {

    try {

      await transaction.rollback();

    } catch {

      // Ya pudo haberse revertido.
    }


    throw error;
  }
}


// --------------------------------------------------
// REVERTIR CRÉDITO
// --------------------------------------------------
// La consulta normal NO utiliza esta función.
// Se conserva únicamente por compatibilidad.

export async function revertirCredito({

  idCliente,
  idToken = null,
  idMovimientoOriginal = null,

}) {

  idCliente =
    Number(idCliente);


  idToken =
    idToken === null
      ? null
      : Number(idToken);


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


  const pool =
    await getSqlPool();


  const transaction =
    new sql.Transaction(pool);


  try {

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    if (
      (
        !Number.isInteger(idToken) ||
        idToken <= 0
      ) &&
      idMovimientoOriginal
    ) {

      const movimientoOriginalResult =
        await new sql.Request(
          transaction
        )

          .input(
            "idCliente",
            sql.BigInt,
            idCliente
          )

          .input(
            "idMovimientoOriginal",
            sql.BigInt,
            Number(
              idMovimientoOriginal
            )
          )

          .query(`
            SELECT TOP 1
              ID_TOKEN

            FROM
              GestionAPIClientes.Movimientos

            WHERE
              ID_MOVIMIENTO =
                @idMovimientoOriginal

              AND ID_CLIENTE =
                @idCliente
          `);


      idToken =
        Number(
          movimientoOriginalResult
            .recordset[0]
            ?.ID_TOKEN
        );
    }


    if (
      !Number.isInteger(idToken) ||
      idToken <= 0
    ) {

      throw crearError(
        "No se pudo determinar el token que debe recibir la reversión.",
        400,
        "REVERSAL_TOKEN_REQUIRED"
      );
    }


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
          "idToken",
          sql.BigInt,
          idToken
        )

        .query(`
          SELECT
            CREDITOS_DISPONIBLES,
            TOTAL_CONSUMIDO

          FROM
            GestionAPIClientes.Saldos
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          WHERE
            ID_TOKEN =
              @idToken

            AND ID_CLIENTE =
              @idCliente
        `);


    if (
      saldoResult.recordset.length === 0
    ) {

      throw crearError(
        "No existe saldo para este token.",
        404,
        "TOKEN_BALANCE_NOT_FOUND"
      );
    }


    const saldoAntes =
      Number(
        saldoResult
          .recordset[0]
          .CREDITOS_DISPONIBLES
      );


    const saldoDespues =
      saldoAntes + 1;


    await new sql.Request(
      transaction
    )

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
      )

      .input(
        "idToken",
        sql.BigInt,
        idToken
      )

      .query(`
        UPDATE
          GestionAPIClientes.Saldos

        SET
          CREDITOS_DISPONIBLES =
            CREDITOS_DISPONIBLES + 1,

          TOTAL_CONSUMIDO =
            CASE
              WHEN TOTAL_CONSUMIDO > 0
                THEN TOTAL_CONSUMIDO - 1
              ELSE 0
            END,

          FECHA_ACTUALIZACION =
            SYSDATETIME()

        WHERE
          ID_TOKEN =
            @idToken

          AND ID_CLIENTE =
            @idCliente
      `);


    const observacion =
      idMovimientoOriginal

        ? `Reversión del movimiento ${idMovimientoOriginal} por consulta no cobrada`

        : "Reversión de crédito por consulta no cobrada";


    await new sql.Request(
      transaction
    )

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
      )

      .input(
        "idToken",
        sql.BigInt,
        idToken
      )

      .input(
        "saldoAntes",
        sql.Int,
        saldoAntes
      )

      .input(
        "saldoDespues",
        sql.Int,
        saldoDespues
      )

      .input(
        "observacion",
        sql.NVarChar(300),
        observacion
      )

      .query(`
        INSERT INTO
          GestionAPIClientes.Movimientos
        (
          ID_CLIENTE,
          ID_TOKEN,

          TIPO,
          CANTIDAD,

          SALDO_ANTES,
          SALDO_DESPUES,

          ORIGEN,
          OBSERVACION
        )

        VALUES
        (
          @idCliente,
          @idToken,

          'AJUSTE',
          1,

          @saldoAntes,
          @saldoDespues,

          'SISTEMA',
          @observacion
        )
      `);


    await transaction.commit();


    return {

      idCliente,
      idToken,

      saldoAntes,

      saldoActual:
        saldoDespues,

      creditosRevertidos:
        1,
    };


  } catch (error) {

    try {

      await transaction.rollback();

    } catch {

      // Ya pudo haberse revertido.
    }


    throw error;
  }
}