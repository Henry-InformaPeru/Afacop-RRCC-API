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


// --------------------------------------------------
// RESERVAR / CONSUMIR 1 CRÉDITO
// --------------------------------------------------

export async function reservarCredito({
  idCliente,
  idToken,
}) {

  const pool =
    await getSqlPool();

  const transaction =
    new sql.Transaction(pool);


  try {

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    // --------------------------------------------------
    // BLOQUEAR SALDO
    // --------------------------------------------------

    const saldoResult =
      await new sql.Request(transaction)

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .query(`
          SELECT
            CREDITOS_DISPONIBLES,
            TOTAL_ASIGNADO,
            TOTAL_CONSUMIDO

          FROM GestionAPIClientes.Saldos
            WITH (
              UPDLOCK,
              HOLDLOCK
            )

          WHERE
            ID_CLIENTE = @idCliente
        `);


    if (
      saldoResult.recordset.length === 0
    ) {
      throw crearError(
        "No existe saldo para este cliente.",
        404,
        "BALANCE_NOT_FOUND"
      );
    }


    const saldoAntes =
      Number(
        saldoResult
          .recordset[0]
          .CREDITOS_DISPONIBLES
      );


    if (saldoAntes <= 0) {

      throw crearError(
        "No tiene créditos disponibles para realizar consultas.",
        402,
        "INSUFFICIENT_CREDITS"
      );
    }


    const saldoDespues =
      saldoAntes - 1;


    // --------------------------------------------------
    // DESCONTAR
    // --------------------------------------------------

    await new sql.Request(transaction)

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
      )

      .query(`
        UPDATE GestionAPIClientes.Saldos

        SET
          CREDITOS_DISPONIBLES =
            CREDITOS_DISPONIBLES - 1,

          TOTAL_CONSUMIDO =
            TOTAL_CONSUMIDO + 1,

          FECHA_ACTUALIZACION =
            SYSDATETIME()

        WHERE
          ID_CLIENTE = @idCliente
      `);


    // --------------------------------------------------
    // MOVIMIENTO DE CONSUMO
    // --------------------------------------------------

    const movimientoResult =
      await new sql.Request(transaction)

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
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
    // ÚLTIMO USO DEL TOKEN
    // --------------------------------------------------

    await new sql.Request(transaction)

      .input(
        "idToken",
        sql.BigInt,
        idToken
      )

      .query(`
        UPDATE GestionAPIClientes.Tokens

        SET
          ULTIMO_USO =
            SYSDATETIME()

        WHERE
          ID_TOKEN = @idToken
      `);


    await transaction.commit();


    return {
      idMovimiento,
      saldoAntes,
      saldoActual:
        saldoDespues,
      creditosConsumidos: 1,
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

export async function revertirCredito({
  idCliente,
  idMovimientoOriginal,
}) {

  const pool =
    await getSqlPool();

  const transaction =
    new sql.Transaction(pool);


  try {

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    const saldoResult =
      await new sql.Request(transaction)

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .query(`
          SELECT
            CREDITOS_DISPONIBLES,
            TOTAL_CONSUMIDO

          FROM GestionAPIClientes.Saldos
            WITH (
              UPDLOCK,
              HOLDLOCK
            )

          WHERE
            ID_CLIENTE = @idCliente
        `);


    if (
      saldoResult.recordset.length === 0
    ) {
      throw crearError(
        "No existe saldo para este cliente.",
        404,
        "BALANCE_NOT_FOUND"
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


    // --------------------------------------------------
    // DEVOLVER CRÉDITO
    // --------------------------------------------------

    await new sql.Request(transaction)

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
      )

      .query(`
        UPDATE GestionAPIClientes.Saldos

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
          ID_CLIENTE = @idCliente
      `);


    // --------------------------------------------------
    // REGISTRAR REVERSIÓN
    // --------------------------------------------------

    const observacion =
      idMovimientoOriginal
        ? `Reversión del movimiento ${idMovimientoOriginal} por consulta no cobrada`
        : "Reversión de crédito por consulta no cobrada";


    await new sql.Request(transaction)

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
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
      saldoAntes,
      saldoActual:
        saldoDespues,
      creditosRevertidos: 1,
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