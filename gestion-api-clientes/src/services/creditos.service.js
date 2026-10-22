import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


// ==================================================
// SERVICIOS PERMITIDOS
// ==================================================

const SERVICIOS_PERMITIDOS = [
  "RRCC",
  "SUELDOS",
  "FALLECIDOS",
  "TELEFONOS",
];


// ==================================================
// CREAR ERROR
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
// VALIDAR IDS
// ==================================================

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


// ==================================================
// NORMALIZAR SERVICIO
// ==================================================

function normalizarServicio(
  servicio
) {

  const servicioNormalizado =
    String(
      servicio || "RRCC"
    )
      .trim()
      .toUpperCase();


  if (
    !SERVICIOS_PERMITIDOS.includes(
      servicioNormalizado
    )
  ) {

    throw crearError(
      "El servicio indicado no es válido.",
      400,
      "INVALID_SERVICE"
    );
  }


  return servicioNormalizado;
}


// ==================================================
// RESERVAR / CONSUMIR 1 CRÉDITO DEL TOKEN
// ==================================================

export async function reservarCredito({

  idCliente,
  idToken,

  // Mantiene compatibilidad con RRCC actual.
  servicio = "RRCC",

}) {

  // --------------------------------------------------
  // VALIDAR CLIENTE Y TOKEN
  // --------------------------------------------------

  ({
    idCliente,
    idToken,
  } = validarIds(
    idCliente,
    idToken
  ));


  // --------------------------------------------------
  // VALIDAR SERVICIO
  // --------------------------------------------------

  servicio =
    normalizarServicio(
      servicio
    );


  // --------------------------------------------------
  // CONEXIÓN
  // --------------------------------------------------

  const pool =
    await getSqlPool();


  const transaction =
    new sql.Transaction(pool);


  try {

    // ==================================================
    // INICIAR TRANSACCIÓN
    // ==================================================

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    // ==================================================
    // 1. VALIDAR TOKEN DENTRO DE LA TRANSACCIÓN
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


    // --------------------------------------------------
    // TOKEN ACTIVO
    // --------------------------------------------------

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


    // --------------------------------------------------
    // CLIENTE ACTIVO
    // --------------------------------------------------

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


    // --------------------------------------------------
    // TOKEN VENCIDO
    // --------------------------------------------------

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


   // ==================================================
// 2. OBTENER SERVICIO
// ==================================================

const servicioResult =
  await new sql.Request(
    transaction
  )

    .input(
      "servicio",
      sql.VarChar(30),
      servicio
    )

    .query(`
      SELECT
        ID_SERVICIO,
        CODIGO,
        NOMBRE,
        ESTADO

      FROM
        GestionAPIClientes.Servicios

      WHERE
        CODIGO = @servicio
    `);


if (
  servicioResult.recordset.length === 0
) {

  throw crearError(
    "El servicio indicado no existe.",
    400,
    "SERVICE_NOT_FOUND"
  );
}


const servicioDb =
  servicioResult.recordset[0];


if (
  servicioDb.ESTADO !== "ACTIVO"
) {

  throw crearError(
    "El servicio indicado no se encuentra activo.",
    403,
    "SERVICE_NOT_ACTIVE"
  );
}


const idServicio =
  Number(
    servicioDb.ID_SERVICIO
  );


// ==================================================
// 3. BLOQUEAR BOLSA DEL SERVICIO
// ==================================================

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
      "idServicio",
      sql.BigInt,
      idServicio
    )

    .query(`
      SELECT
        ID_CLIENTE,
        ID_SERVICIO,

        CREDITOS_DISPONIBLES,
        TOTAL_ASIGNADO,
        TOTAL_CONSUMIDO

      FROM
        GestionAPIClientes.SaldosServicios
          WITH (
            UPDLOCK,
            HOLDLOCK
          )

      WHERE
        ID_CLIENTE =
          @idCliente

        AND ID_SERVICIO =
          @idServicio
    `);


if (
  saldoResult.recordset.length === 0
) {

  throw crearError(
    `El cliente no tiene una bolsa de créditos configurada para ${servicio}.`,
    409,
    "SERVICE_BALANCE_NOT_FOUND"
  );
}


const saldoAntes =
  Number(
    saldoResult
      .recordset[0]
      .CREDITOS_DISPONIBLES
  );


// --------------------------------------------------
// SIN CRÉDITOS EN ESTE SERVICIO
// --------------------------------------------------

if (
  saldoAntes <= 0
) {

  throw crearError(
    `No tiene créditos disponibles para el servicio ${servicio}.`,
    402,
    "INSUFFICIENT_SERVICE_CREDITS"
  );
}


const saldoDespues =
  saldoAntes - 1;


// ==================================================
// 4. DESCONTAR DE LA BOLSA DEL SERVICIO
// ==================================================

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
      "idServicio",
      sql.BigInt,
      idServicio
    )

    .query(`
      UPDATE
        GestionAPIClientes.SaldosServicios

      SET
        CREDITOS_DISPONIBLES =
          CREDITOS_DISPONIBLES - 1,

        TOTAL_CONSUMIDO =
          TOTAL_CONSUMIDO + 1,

        FECHA_ACTUALIZACION =
          SYSDATETIME()

      WHERE
        ID_CLIENTE =
          @idCliente

        AND ID_SERVICIO =
          @idServicio

        AND CREDITOS_DISPONIBLES > 0
    `);


if (
  updateResult.rowsAffected[0] !== 1
) {

  throw crearError(
    `No fue posible descontar el crédito del servicio ${servicio}.`,
    409,
    "SERVICE_CREDIT_UPDATE_FAILED"
  );
}


// ==================================================
// 5. REGISTRAR MOVIMIENTO
// ==================================================

const observacion =
  `Reserva de crédito para consulta ${servicio}`;


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
      "idServicio",
      sql.BigInt,
      idServicio
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
        ID_SERVICIO,

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
        @idServicio,

        'CONSUMO',
        1,

        @saldoAntes,
        @saldoDespues,

        'CONSULTA',
        @observacion
      )
    `);


const idMovimiento =
  movimientoResult
    .recordset[0]
    .ID_MOVIMIENTO;


    // ==================================================
    // 5. ACTUALIZAR ÚLTIMO USO DEL TOKEN
    // ==================================================

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


    // ==================================================
    // 6. CONFIRMAR TRANSACCIÓN
    // ==================================================

    await transaction.commit();


    // ==================================================
    // RESPUESTA
    // ==================================================

    return {

      idCliente,

      idToken,

      idServicio,

      idMovimiento,

      servicio,

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

      // La transacción pudo haberse revertido.
    }


    throw error;
  }
}


// ==================================================
// REVERTIR CRÉDITO
// ==================================================
//
// La reversión se realiza sobre la misma bolsa
// de servicio utilizada por el movimiento original.
//
// Ejemplo:
//
// RRCC:
// 10 -> consulta -> 9
//  9 -> reversión -> 10
//
// SUELDOS no se modifica.
//
// El token se conserva únicamente como dato
// de auditoría del movimiento.
// ==================================================

export async function revertirCredito({

  idCliente,

  idToken = null,

  idMovimientoOriginal = null,

}) {


  // ==================================================
  // 1. NORMALIZAR CLIENTE
  // ==================================================

  idCliente =
    Number(
      idCliente
    );


  if (
    !Number.isInteger(
      idCliente
    ) ||
    idCliente <= 0
  ) {

    throw crearError(
      "El cliente no es válido.",
      400,
      "INVALID_CLIENT"
    );
  }


  // ==================================================
  // 2. NORMALIZAR TOKEN
  //
  // El token ya NO identifica la bolsa.
  // Solo se conserva para auditoría.
  // ==================================================

  if (
    idToken === null ||
    idToken === undefined ||
    idToken === ""
  ) {

    idToken = null;

  } else {

    idToken =
      Number(
        idToken
      );


    if (
      !Number.isInteger(
        idToken
      ) ||
      idToken <= 0
    ) {

      idToken = null;
    }
  }


  // ==================================================
  // 3. VALIDAR MOVIMIENTO ORIGINAL
  //
  // Es obligatorio porque desde él obtenemos
  // el servicio que debe recibir la reversión.
  // ==================================================

  idMovimientoOriginal =
    Number(
      idMovimientoOriginal
    );


  if (
    !Number.isInteger(
      idMovimientoOriginal
    ) ||
    idMovimientoOriginal <= 0
  ) {

    throw crearError(
      "El movimiento original es obligatorio para revertir el crédito.",
      400,
      "REVERSAL_ORIGINAL_MOVEMENT_REQUIRED"
    );
  }


  // ==================================================
  // 4. CONEXIÓN
  // ==================================================

  const pool =
    await getSqlPool();


  const transaction =
    new sql.Transaction(
      pool
    );


  try {

    // ==================================================
    // 5. INICIAR TRANSACCIÓN
    // ==================================================

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    // ==================================================
    // 6. OBTENER MOVIMIENTO ORIGINAL
    //
    // De aquí obtenemos:
    //
    // - token
    // - servicio
    // - tipo
    // - cantidad
    //
    // El servicio determina qué bolsa devolver.
    // ==================================================

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
          idMovimientoOriginal
        )

        .query(`
          SELECT TOP 1

            M.ID_MOVIMIENTO,

            M.ID_CLIENTE,

            M.ID_TOKEN,

            M.ID_SERVICIO,

            M.TIPO,

            M.CANTIDAD,

            M.SALDO_ANTES,

            M.SALDO_DESPUES,

            S.CODIGO AS SERVICIO

          FROM
            GestionAPIClientes.Movimientos M
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          LEFT JOIN
            GestionAPIClientes.Servicios S
              ON S.ID_SERVICIO =
                 M.ID_SERVICIO

          WHERE
            M.ID_MOVIMIENTO =
              @idMovimientoOriginal

            AND M.ID_CLIENTE =
              @idCliente
        `);


    // ==================================================
    // 7. MOVIMIENTO NO EXISTE
    // ==================================================

    if (
      movimientoOriginalResult
        .recordset
        .length === 0
    ) {

      throw crearError(
        "No se encontró el movimiento original.",
        404,
        "ORIGINAL_MOVEMENT_NOT_FOUND"
      );
    }


    const movimientoOriginal =
      movimientoOriginalResult
        .recordset[0];


    // ==================================================
    // 8. VALIDAR QUE SEA UN CONSUMO
    // ==================================================

    if (
      String(
        movimientoOriginal.TIPO || ""
      )
        .trim()
        .toUpperCase()
      !== "CONSUMO"
    ) {

      throw crearError(
        "El movimiento indicado no corresponde a un consumo.",
        409,
        "MOVEMENT_NOT_REVERSIBLE"
      );
    }


    // ==================================================
    // 9. VALIDAR CANTIDAD
    //
    // Actualmente cada consulta consume exactamente
    // un crédito.
    // ==================================================

    const cantidadOriginal =
      Number(
        movimientoOriginal.CANTIDAD
      );


    if (
      cantidadOriginal !== 1
    ) {

      throw crearError(
        "El movimiento original no corresponde a un consumo de un crédito.",
        409,
        "INVALID_REVERSAL_AMOUNT"
      );
    }


    // ==================================================
    // 10. OBTENER SERVICIO DEL MOVIMIENTO
    // ==================================================

    const idServicio =
      Number(
        movimientoOriginal.ID_SERVICIO
      );


    if (
      !Number.isInteger(
        idServicio
      ) ||
      idServicio <= 0
    ) {

      throw crearError(
        "No se pudo determinar el servicio del movimiento original.",
        409,
        "REVERSAL_SERVICE_NOT_FOUND"
      );
    }


    const servicio =
      String(
        movimientoOriginal.SERVICIO || ""
      )
        .trim()
        .toUpperCase();


    if (!servicio) {

      throw crearError(
        "No se encontró el servicio asociado al movimiento original.",
        409,
        "REVERSAL_SERVICE_NOT_FOUND"
      );
    }


    // ==================================================
    // 11. TOKEN PARA AUDITORÍA
    //
    // Preferimos siempre el token almacenado
    // en el movimiento original.
    // ==================================================

    const tokenMovimiento =
      Number(
        movimientoOriginal.ID_TOKEN
      );


    if (
      Number.isInteger(
        tokenMovimiento
      ) &&
      tokenMovimiento > 0
    ) {

      idToken =
        tokenMovimiento;
    }


    // ==================================================
    // 12. OBSERVACIÓN DE REVERSIÓN
    // ==================================================

    const observacion =
      `Reversión del movimiento ${idMovimientoOriginal} por consulta no cobrada`;


    // ==================================================
    // 13. EVITAR DOBLE REVERSIÓN
    //
    // No permitimos devolver dos veces
    // el mismo crédito.
    // ==================================================

    const reversaExistenteResult =
      await new sql.Request(
        transaction
      )

        .input(
          "idCliente",
          sql.BigInt,
          idCliente
        )

        .input(
          "observacion",
          sql.NVarChar(300),
          observacion
        )

        .query(`
          SELECT TOP 1

            ID_MOVIMIENTO

          FROM
            GestionAPIClientes.Movimientos
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          WHERE
            ID_CLIENTE =
              @idCliente

            AND TIPO =
              'AJUSTE'

            AND OBSERVACION =
              @observacion
        `);


    if (
      reversaExistenteResult
        .recordset
        .length > 0
    ) {

      throw crearError(
        "El crédito de este movimiento ya fue revertido.",
        409,
        "CREDIT_ALREADY_REVERSED"
      );
    }


    // ==================================================
    // 14. BLOQUEAR BOLSA DEL SERVICIO
    // ==================================================

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
          "idServicio",
          sql.BigInt,
          idServicio
        )

        .query(`
          SELECT

            ID_CLIENTE,

            ID_SERVICIO,

            CREDITOS_DISPONIBLES,

            TOTAL_ASIGNADO,

            TOTAL_CONSUMIDO

          FROM
            GestionAPIClientes.SaldosServicios
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

          WHERE
            ID_CLIENTE =
              @idCliente

            AND ID_SERVICIO =
              @idServicio
        `);


    if (
      saldoResult
        .recordset
        .length === 0
    ) {

      throw crearError(
        `El cliente no tiene una bolsa configurada para el servicio ${servicio}.`,
        404,
        "SERVICE_BALANCE_NOT_FOUND"
      );
    }


    const saldo =
      saldoResult
        .recordset[0];


    const saldoAntes =
      Number(
        saldo.CREDITOS_DISPONIBLES
      );


    const totalConsumido =
      Number(
        saldo.TOTAL_CONSUMIDO
      );


    // ==================================================
    // 15. VALIDAR TOTAL CONSUMIDO
    // ==================================================

    if (
      totalConsumido <= 0
    ) {

      throw crearError(
        `No existe un crédito consumido para revertir en el servicio ${servicio}.`,
        409,
        "NO_CONSUMED_CREDIT_TO_REVERSE"
      );
    }


    const saldoDespues =
      saldoAntes + 1;


    // ==================================================
    // 16. DEVOLVER CRÉDITO A LA BOLSA CORRECTA
    // ==================================================

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
          "idServicio",
          sql.BigInt,
          idServicio
        )

        .query(`
          UPDATE
            GestionAPIClientes.SaldosServicios

          SET
            CREDITOS_DISPONIBLES =
              CREDITOS_DISPONIBLES + 1,

            TOTAL_CONSUMIDO =
              TOTAL_CONSUMIDO - 1,

            FECHA_ACTUALIZACION =
              SYSDATETIME()

          WHERE
            ID_CLIENTE =
              @idCliente

            AND ID_SERVICIO =
              @idServicio

            AND TOTAL_CONSUMIDO > 0
        `);


    if (
      updateResult
        .rowsAffected[0] !== 1
    ) {

      throw crearError(
        `No fue posible revertir el crédito del servicio ${servicio}.`,
        409,
        "SERVICE_CREDIT_REVERSAL_FAILED"
      );
    }


    // ==================================================
    // 17. REGISTRAR MOVIMIENTO DE AJUSTE
    // ==================================================

    const movimientoAjusteResult =
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
          "idServicio",
          sql.BigInt,
          idServicio
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

            ID_SERVICIO,

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

            @idServicio,

            'AJUSTE',

            1,

            @saldoAntes,

            @saldoDespues,

            'SISTEMA',

            @observacion
          )
        `);


    const idMovimientoAjuste =
      movimientoAjusteResult
        .recordset[0]
        .ID_MOVIMIENTO;


    // ==================================================
    // 18. CONFIRMAR TRANSACCIÓN
    // ==================================================

    await transaction.commit();


    // ==================================================
    // 19. RESPUESTA
    // ==================================================

    return {

      idCliente,

      idToken,

      idServicio,

      servicio,

      idMovimientoOriginal,

      idMovimientoAjuste,

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

      // La transacción pudo haberse revertido.
    }


    throw error;
  }
}