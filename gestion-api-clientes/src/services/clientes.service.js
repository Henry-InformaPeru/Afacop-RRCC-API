import crypto from "node:crypto";

import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


// --------------------------------------------------
// UTILIDADES
// --------------------------------------------------

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
// CREAR CLIENTE
// ==================================================

export async function crearCliente({

  tipoDocumento,
  documento,

  nombres = null,
  apellidoPaterno = null,
  apellidoMaterno = null,

  razonSocial = null,

  email = null,
  telefono = null,

  creditosIniciales = 0,
  fechaVencimiento = null,

}) {

  tipoDocumento =
    String(
      tipoDocumento || ""
    )
      .trim()
      .toUpperCase();


  documento =
    String(
      documento || ""
    )
      .trim();


  nombres =
    nombres

      ? String(
          nombres
        ).trim()

      : null;


  apellidoPaterno =
    apellidoPaterno

      ? String(
          apellidoPaterno
        ).trim()

      : null;


  apellidoMaterno =
    apellidoMaterno

      ? String(
          apellidoMaterno
        ).trim()

      : null;


  razonSocial =
    razonSocial

      ? String(
          razonSocial
        ).trim()

      : null;


  email =
    email

      ? String(
          email
        ).trim()

      : null;


  telefono =
    telefono

      ? String(
          telefono
        ).trim()

      : null;


  const tiposPermitidos = [
    "DNI",
    "RUC",
    "CE",
    "PASAPORTE",
  ];


  if (
    !tiposPermitidos.includes(
      tipoDocumento
    )
  ) {

    throw crearError(
      "Tipo de documento no válido.",
      400,
      "INVALID_DOCUMENT_TYPE"
    );
  }


  if (!documento) {

    throw crearError(
      "El documento es obligatorio.",
      400,
      "DOCUMENT_REQUIRED"
    );
  }


  if (
    tipoDocumento === "DNI" &&
    !/^\d{8}$/.test(
      documento
    )
  ) {

    throw crearError(
      "El DNI debe contener exactamente 8 dígitos.",
      400,
      "INVALID_DNI"
    );
  }


  if (
    tipoDocumento === "RUC" &&
    !/^\d{11}$/.test(
      documento
    )
  ) {

    throw crearError(
      "El RUC debe contener exactamente 11 dígitos.",
      400,
      "INVALID_RUC"
    );
  }


  if (
    tipoDocumento === "CE" &&
    (
      documento.length < 1 ||
      documento.length > 20 ||
      !/^[A-Za-z0-9]+$/.test(
        documento
      )
    )
  ) {

    throw crearError(
      "El Carnet de Extranjería debe ser alfanumérico y no superar 20 caracteres.",
      400,
      "INVALID_CE"
    );
  }


  if (
    tipoDocumento === "PASAPORTE" &&
    (
      documento.length < 1 ||
      documento.length > 20 ||
      !/^[A-Za-z0-9]+$/.test(
        documento
      )
    )
  ) {

    throw crearError(
      "El pasaporte debe ser alfanumérico y no superar 20 caracteres.",
      400,
      "INVALID_PASSPORT"
    );
  }


  if (
    tipoDocumento === "RUC" &&
    !razonSocial
  ) {

    throw crearError(
      "La razón social es obligatoria para clientes con RUC.",
      400,
      "BUSINESS_NAME_REQUIRED"
    );
  }


  if (
    tipoDocumento !== "RUC" &&
    !nombres
  ) {

    throw crearError(
      "Los nombres son obligatorios.",
      400,
      "NAME_REQUIRED"
    );
  }


  const creditos =
    Number(
      creditosIniciales
    );


  if (
    !Number.isInteger(
      creditos
    ) ||
    creditos < 0
  ) {

    throw crearError(
      "Los créditos iniciales deben ser un número entero mayor o igual a 0.",
      400,
      "INVALID_CREDITS"
    );
  }


  const fechaVencimientoSql =
    normalizarFechaVencimiento(
      fechaVencimiento
    );


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


  const pool =
    await getSqlPool();


  const transaction =
    new sql.Transaction(
      pool
    );


  try {

    await transaction.begin(
      sql.ISOLATION_LEVEL.SERIALIZABLE
    );


    // --------------------------------------------------
    // VALIDAR CLIENTE DUPLICADO
    // --------------------------------------------------

    const duplicado =
      await new sql.Request(
        transaction
      )

        .input(
          "tipoDocumento",
          sql.VarChar(20),
          tipoDocumento
        )

        .input(
          "documento",
          sql.VarChar(30),
          documento
        )

        .query(`
          SELECT TOP 1
            ID_CLIENTE

          FROM
            GestionAPIClientes.Clientes

          WHERE
            TIPO_DOCUMENTO_CLIENTE =
              @tipoDocumento

            AND DOCUMENTO_CLIENTE =
              @documento
        `);


    if (
      duplicado.recordset.length > 0
    ) {

      throw crearError(
        "Ya existe un cliente registrado con ese documento.",
        409,
        "CLIENT_ALREADY_EXISTS"
      );
    }


    // --------------------------------------------------
    // CREAR CLIENTE
    // --------------------------------------------------

    const clienteResult =
      await new sql.Request(
        transaction
      )

        .input(
          "tipoDocumento",
          sql.VarChar(20),
          tipoDocumento
        )

        .input(
          "documento",
          sql.VarChar(30),
          documento
        )

        .input(
          "nombres",
          sql.NVarChar(150),
          nombres
        )

        .input(
          "apellidoPaterno",
          sql.NVarChar(100),
          apellidoPaterno
        )

        .input(
          "apellidoMaterno",
          sql.NVarChar(100),
          apellidoMaterno
        )

        .input(
          "razonSocial",
          sql.NVarChar(200),
          razonSocial
        )

        .input(
          "email",
          sql.NVarChar(150),
          email
        )

        .input(
          "telefono",
          sql.VarChar(30),
          telefono
        )

        .query(`
          INSERT INTO
            GestionAPIClientes.Clientes
          (
            TIPO_DOCUMENTO_CLIENTE,
            DOCUMENTO_CLIENTE,

            NOMBRES,
            APELLIDO_PATERNO,
            APELLIDO_MATERNO,

            RAZON_SOCIAL,

            EMAIL,
            TELEFONO,

            ESTADO
          )

          OUTPUT
            INSERTED.ID_CLIENTE

          VALUES
          (
            @tipoDocumento,
            @documento,

            @nombres,
            @apellidoPaterno,
            @apellidoMaterno,

            @razonSocial,

            @email,
            @telefono,

            'ACTIVO'
          )
        `);


    const idCliente =
      Number(
        clienteResult
          .recordset[0]
          .ID_CLIENTE
      );


    // --------------------------------------------------
    // CREAR TOKEN PRIMERO
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
    // CREAR SALDO DEL TOKEN
    // --------------------------------------------------

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
        "creditos",
        sql.Int,
        creditos
      )

      .query(`
        INSERT INTO
          GestionAPIClientes.Saldos
        (
          ID_CLIENTE,
          ID_TOKEN,

          CREDITOS_DISPONIBLES,
          TOTAL_ASIGNADO,
          TOTAL_CONSUMIDO
        )

        VALUES
        (
          @idCliente,
          @idToken,

          @creditos,
          @creditos,
          0
        )
      `);


    // --------------------------------------------------
    // MOVIMIENTO INICIAL
    // --------------------------------------------------

    if (
      creditos > 0
    ) {

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
          "creditos",
          sql.Int,
          creditos
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

            'CARGA',
            @creditos,

            0,
            @creditos,

            'ADMIN',
            'Asignación inicial de créditos'
          )
        `);
    }


    await transaction.commit();


    return {

      idCliente,
      idToken,

      tipoDocumento,
      documento,

      token,

      creditosDisponibles:
        creditos,

      fechaVencimiento:
        fechaVencimientoSql,
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


// ==================================================
// RECARGAR CRÉDITOS DEL TOKEN ACTIVO
// ==================================================

export async function recargarCreditos(
  idCliente,
  cantidad
) {

  idCliente =
    Number(idCliente);


  cantidad =
    Number(cantidad);


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


  if (
    !Number.isInteger(cantidad) ||
    cantidad <= 0
  ) {

    throw crearError(
      "La cantidad de créditos debe ser mayor a 0.",
      400,
      "INVALID_CREDITS"
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
              WITH (
                UPDLOCK,
                HOLDLOCK
              )

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
    // BUSCAR TOKEN ACTIVO
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

        .query(`
          SELECT
            ID_TOKEN,
            FECHA_VENCIMIENTO

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
      tokenResult.recordset.length === 0
    ) {

      throw crearError(
        "El cliente no tiene un token activo.",
        409,
        "ACTIVE_TOKEN_NOT_FOUND"
      );
    }


    if (
      tokenResult.recordset.length > 1
    ) {

      throw crearError(
        "El cliente tiene más de un token activo. No se puede determinar qué token recargar.",
        409,
        "MULTIPLE_ACTIVE_TOKENS"
      );
    }


    const idToken =
      Number(
        tokenResult
          .recordset[0]
          .ID_TOKEN
      );


    // --------------------------------------------------
    // SALDO DEL TOKEN
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
              @idToken
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


    const saldoAntes =
      Number(
        saldoResult
          .recordset[0]
          .CREDITOS_DISPONIBLES
      );


    const saldoDespues =
      saldoAntes +
      cantidad;


    // --------------------------------------------------
    // ACTUALIZAR SALDO
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

        .input(
          "cantidad",
          sql.Int,
          cantidad
        )

        .input(
          "saldoDespues",
          sql.Int,
          saldoDespues
        )

        .query(`
          UPDATE
            GestionAPIClientes.Saldos

          SET
            CREDITOS_DISPONIBLES =
              @saldoDespues,

            TOTAL_ASIGNADO =
              TOTAL_ASIGNADO +
              @cantidad,

            FECHA_ACTUALIZACION =
              SYSDATETIME()

          WHERE
            ID_CLIENTE =
              @idCliente

            AND ID_TOKEN =
              @idToken
        `);


    if (
      updateResult.rowsAffected[0] !== 1
    ) {

      throw crearError(
        "No fue posible actualizar los créditos del token.",
        409,
        "CREDIT_UPDATE_FAILED"
      );
    }


    // --------------------------------------------------
    // MOVIMIENTO
    // --------------------------------------------------

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
        "cantidad",
        sql.Int,
        cantidad
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

        VALUES
        (
          @idCliente,
          @idToken,

          'CARGA',
          @cantidad,

          @saldoAntes,
          @saldoDespues,

          'ADMIN',
          'Recarga de créditos'
        )
      `);


    await transaction.commit();


    return {

      idCliente,
      idToken,

      creditosAgregados:
        cantidad,

      saldoAntes,

      saldoActual:
        saldoDespues,
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


// ==================================================
// LISTAR CLIENTES
// ==================================================

export async function listarClientes({

  page = 1,
  limit = 20,
  search = "",

}) {

  page =
    Number(page);


  limit =
    Number(limit);


  if (
    !Number.isInteger(page) ||
    page < 1
  ) {

    page = 1;
  }


  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {

    limit = 20;
  }


  search =
    String(
      search || ""
    )
      .trim();


  const offset =
    (page - 1) *
    limit;


  const pool =
    await getSqlPool();


  // --------------------------------------------------
  // TOTAL
  // --------------------------------------------------

  const totalResult =
    await pool
      .request()

      .input(
        "search",
        sql.NVarChar(200),
        `%${search}%`
      )

      .query(`
        SELECT
          COUNT(*) AS TOTAL

        FROM
          GestionAPIClientes.Clientes C

        WHERE
          @search = '%%'

          OR C.DOCUMENTO_CLIENTE
            LIKE @search

          OR C.RAZON_SOCIAL
            LIKE @search

          OR C.NOMBRES
            LIKE @search

          OR C.APELLIDO_PATERNO
            LIKE @search

          OR C.APELLIDO_MATERNO
            LIKE @search

          OR C.EMAIL
            LIKE @search
      `);


  const total =
    Number(
      totalResult
        .recordset[0]
        .TOTAL
    );


  // --------------------------------------------------
  // CLIENTES
  // --------------------------------------------------

  const result =
    await pool
      .request()

      .input(
        "search",
        sql.NVarChar(200),
        `%${search}%`
      )

      .input(
        "offset",
        sql.Int,
        offset
      )

      .input(
        "limit",
        sql.Int,
        limit
      )

      .query(`
        SELECT
          C.ID_CLIENTE,

          C.TIPO_DOCUMENTO_CLIENTE,
          C.DOCUMENTO_CLIENTE,

          C.NOMBRES,
          C.APELLIDO_PATERNO,
          C.APELLIDO_MATERNO,

          C.RAZON_SOCIAL,

          C.EMAIL,
          C.TELEFONO,

          C.ESTADO,

          C.FECHA_CREACION,
          C.FECHA_ACTUALIZACION,

          SB.ID_TOKEN
            AS SALDO_ID_TOKEN,

          SB.CREDITOS_DISPONIBLES,
          SB.TOTAL_ASIGNADO,
          SB.TOTAL_CONSUMIDO,

          (
            SELECT
              COUNT(*)

            FROM
              GestionAPIClientes.Tokens T

            WHERE
              T.ID_CLIENTE =
                C.ID_CLIENTE

              AND T.ESTADO =
                'ACTIVO'
          ) AS TOKENS_ACTIVOS

        FROM
          GestionAPIClientes.Clientes C

        OUTER APPLY
        (
          SELECT TOP 1

            S.ID_TOKEN,

            S.CREDITOS_DISPONIBLES,
            S.TOTAL_ASIGNADO,
            S.TOTAL_CONSUMIDO

          FROM
            GestionAPIClientes.Saldos S

          INNER JOIN
            GestionAPIClientes.Tokens TSaldo
              ON TSaldo.ID_TOKEN =
                 S.ID_TOKEN

          WHERE
            S.ID_CLIENTE =
              C.ID_CLIENTE

          ORDER BY

            CASE
              WHEN TSaldo.ESTADO =
                'ACTIVO'
              THEN 0
              ELSE 1
            END,

            S.ID_TOKEN DESC
        ) SB

        WHERE
          @search = '%%'

          OR C.DOCUMENTO_CLIENTE
            LIKE @search

          OR C.RAZON_SOCIAL
            LIKE @search

          OR C.NOMBRES
            LIKE @search

          OR C.APELLIDO_PATERNO
            LIKE @search

          OR C.APELLIDO_MATERNO
            LIKE @search

          OR C.EMAIL
            LIKE @search

        ORDER BY
          C.ID_CLIENTE DESC

        OFFSET
          @offset ROWS

        FETCH NEXT
          @limit ROWS ONLY
      `);


  const clientes =
    result.recordset.map(
      (cliente) => {

        const nombre =
          cliente.RAZON_SOCIAL ||
          [
            cliente.NOMBRES,
            cliente.APELLIDO_PATERNO,
            cliente.APELLIDO_MATERNO,
          ]
            .filter(Boolean)
            .join(" ");


        return {

          idCliente:
            cliente.ID_CLIENTE,

          tipoDocumento:
            cliente
              .TIPO_DOCUMENTO_CLIENTE,

          documento:
            cliente
              .DOCUMENTO_CLIENTE,

          nombre,

          email:
            cliente.EMAIL,

          telefono:
            cliente.TELEFONO,

          estado:
            cliente.ESTADO,

          creditos: {

            idToken:
              cliente
                .SALDO_ID_TOKEN,

            disponibles:
              Number(
                cliente
                  .CREDITOS_DISPONIBLES ||
                0
              ),

            totalAsignado:
              Number(
                cliente
                  .TOTAL_ASIGNADO ||
                0
              ),

            totalConsumido:
              Number(
                cliente
                  .TOTAL_CONSUMIDO ||
                0
              ),
          },

          tokensActivos:
            Number(
              cliente
                .TOKENS_ACTIVOS
            ),

          fechaCreacion:
            cliente
              .FECHA_CREACION,
        };
      }
    );


  return {

    clientes,

    paginacion: {

      page,
      limit,
      total,

      totalPaginas:
        Math.ceil(
          total /
          limit
        ),
    },
  };
}


// ==================================================
// OBTENER DETALLE DE CLIENTE
// ==================================================

export async function obtenerClienteDetalle(

  idCliente,

  {
    pageConsumos = 1,
    pageMovimientos = 1,
  } = {}

) {

  idCliente =
    Number(idCliente);


  pageConsumos =
    Number(
      pageConsumos
    );


  pageMovimientos =
    Number(
      pageMovimientos
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


  const limit =
    10;


  if (
    !Number.isInteger(
      pageConsumos
    ) ||
    pageConsumos < 1
  ) {

    pageConsumos =
      1;
  }


  if (
    !Number.isInteger(
      pageMovimientos
    ) ||
    pageMovimientos < 1
  ) {

    pageMovimientos =
      1;
  }


  const pool =
    await getSqlPool();


  // --------------------------------------------------
  // CLIENTE + SALDO
  // --------------------------------------------------

  const clienteResult =
    await pool
      .request()

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
      )

      .query(`
        SELECT
          C.ID_CLIENTE,

          C.TIPO_DOCUMENTO_CLIENTE,
          C.DOCUMENTO_CLIENTE,

          C.NOMBRES,
          C.APELLIDO_PATERNO,
          C.APELLIDO_MATERNO,

          C.RAZON_SOCIAL,

          C.EMAIL,
          C.TELEFONO,

          C.ESTADO,

          C.FECHA_CREACION,
          C.FECHA_ACTUALIZACION,

          SB.ID_TOKEN
            AS SALDO_ID_TOKEN,

          SB.CREDITOS_DISPONIBLES,
          SB.TOTAL_ASIGNADO,
          SB.TOTAL_CONSUMIDO

        FROM
          GestionAPIClientes.Clientes C

        OUTER APPLY
        (
          SELECT TOP 1

            S.ID_TOKEN,

            S.CREDITOS_DISPONIBLES,
            S.TOTAL_ASIGNADO,
            S.TOTAL_CONSUMIDO

          FROM
            GestionAPIClientes.Saldos S

          INNER JOIN
            GestionAPIClientes.Tokens TSaldo
              ON TSaldo.ID_TOKEN =
                 S.ID_TOKEN

          WHERE
            S.ID_CLIENTE =
              C.ID_CLIENTE

          ORDER BY

            CASE
              WHEN TSaldo.ESTADO =
                'ACTIVO'
              THEN 0
              ELSE 1
            END,

            S.ID_TOKEN DESC
        ) SB

        WHERE
          C.ID_CLIENTE =
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


  const cliente =
    clienteResult
      .recordset[0];


  const nombre =
    cliente.RAZON_SOCIAL ||
    [
      cliente.NOMBRES,
      cliente.APELLIDO_PATERNO,
      cliente.APELLIDO_MATERNO,
    ]
      .filter(Boolean)
      .join(" ");


  // --------------------------------------------------
  // TOKENS + SALDO
  // --------------------------------------------------

  const tokensResult =
    await pool
      .request()

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
      )

      .query(`
        SELECT
          T.ID_TOKEN,
          T.TOKEN_PREFIJO,
          T.ESTADO,

          T.FECHA_CREACION,
          T.FECHA_VENCIMIENTO,
          T.ULTIMO_USO,

          S.CREDITOS_DISPONIBLES,
          S.TOTAL_ASIGNADO,
          S.TOTAL_CONSUMIDO

        FROM
          GestionAPIClientes.Tokens T

        LEFT JOIN
          GestionAPIClientes.Saldos S
            ON S.ID_TOKEN =
               T.ID_TOKEN

        WHERE
          T.ID_CLIENTE =
            @idCliente

        ORDER BY
          T.ID_TOKEN DESC
      `);


  // --------------------------------------------------
  // TOTAL CONSULTAS
  // --------------------------------------------------

  const totalConsumosResult =
    await pool
      .request()

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
      )

      .query(`
        SELECT
          COUNT(*) AS TOTAL

        FROM
          GestionAPIClientes.Consumos

        WHERE
          ID_CLIENTE =
            @idCliente
      `);


  const totalConsumos =
    Number(
      totalConsumosResult
        .recordset[0]
        .TOTAL
    );


  const totalPaginasConsumos =
    Math.ceil(
      totalConsumos /
      limit
    );


  if (
    totalPaginasConsumos > 0 &&
    pageConsumos >
      totalPaginasConsumos
  ) {

    pageConsumos =
      totalPaginasConsumos;
  }


  const offsetConsumos =
    (pageConsumos - 1) *
    limit;


  // --------------------------------------------------
  // CONSULTAS
  // --------------------------------------------------

  const consumosResult =
    await pool
      .request()

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
      )

      .input(
        "offset",
        sql.Int,
        offsetConsumos
      )

      .input(
        "limit",
        sql.Int,
        limit
      )

      .query(`
        SELECT
          ID_CONSUMO,
          ID_TOKEN,
          ID_MOVIMIENTO,

          TIPO_DOCUMENTO_CONSULTADO,
          DOCUMENTO_CONSULTADO,

          CREDITOS_CONSUMIDOS,

          ESTADO,
          HTTP_STATUS,
          MENSAJE,

          IP_ORIGEN,
          DURACION_MS,
          FECHA

        FROM
          GestionAPIClientes.Consumos

        WHERE
          ID_CLIENTE =
            @idCliente

        ORDER BY
          ID_CONSUMO DESC

        OFFSET
          @offset ROWS

        FETCH NEXT
          @limit ROWS ONLY
      `);


  // --------------------------------------------------
  // TOTAL MOVIMIENTOS
  // --------------------------------------------------

  const totalMovimientosResult =
    await pool
      .request()

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
      )

      .query(`
        SELECT
          COUNT(*) AS TOTAL

        FROM
          GestionAPIClientes.Movimientos

        WHERE
          ID_CLIENTE =
            @idCliente
      `);


  const totalMovimientos =
    Number(
      totalMovimientosResult
        .recordset[0]
        .TOTAL
    );


  const totalPaginasMovimientos =
    Math.ceil(
      totalMovimientos /
      limit
    );


  if (
    totalPaginasMovimientos > 0 &&
    pageMovimientos >
      totalPaginasMovimientos
  ) {

    pageMovimientos =
      totalPaginasMovimientos;
  }


  const offsetMovimientos =
    (pageMovimientos - 1) *
    limit;


  // --------------------------------------------------
  // MOVIMIENTOS
  // --------------------------------------------------

  const movimientosResult =
    await pool
      .request()

      .input(
        "idCliente",
        sql.BigInt,
        idCliente
      )

      .input(
        "offset",
        sql.Int,
        offsetMovimientos
      )

      .input(
        "limit",
        sql.Int,
        limit
      )

      .query(`
        SELECT
          ID_MOVIMIENTO,
          ID_TOKEN,

          TIPO,
          CANTIDAD,

          SALDO_ANTES,
          SALDO_DESPUES,

          ORIGEN,
          OBSERVACION,
          FECHA

        FROM
          GestionAPIClientes.Movimientos

        WHERE
          ID_CLIENTE =
            @idCliente

        ORDER BY
          ID_MOVIMIENTO DESC

        OFFSET
          @offset ROWS

        FETCH NEXT
          @limit ROWS ONLY
      `);


  // --------------------------------------------------
  // RESPUESTA
  // --------------------------------------------------

  return {

    cliente: {

      idCliente:
        cliente.ID_CLIENTE,

      tipoDocumento:
        cliente
          .TIPO_DOCUMENTO_CLIENTE,

      documento:
        cliente
          .DOCUMENTO_CLIENTE,

      nombre,

      nombres:
        cliente.NOMBRES,

      apellidoPaterno:
        cliente
          .APELLIDO_PATERNO,

      apellidoMaterno:
        cliente
          .APELLIDO_MATERNO,

      razonSocial:
        cliente
          .RAZON_SOCIAL,

      email:
        cliente.EMAIL,

      telefono:
        cliente.TELEFONO,

      estado:
        cliente.ESTADO,

      fechaCreacion:
        cliente
          .FECHA_CREACION,

      fechaActualizacion:
        cliente
          .FECHA_ACTUALIZACION,
    },


    creditos: {

      idToken:
        cliente
          .SALDO_ID_TOKEN,

      disponibles:
        Number(
          cliente
            .CREDITOS_DISPONIBLES ||
          0
        ),

      totalAsignado:
        Number(
          cliente
            .TOTAL_ASIGNADO ||
          0
        ),

      totalConsumido:
        Number(
          cliente
            .TOTAL_CONSUMIDO ||
          0
        ),
    },


    tokens:
      tokensResult
        .recordset
        .map(
          (token) => ({

            idToken:
              token
                .ID_TOKEN,

            prefijo:
              token
                .TOKEN_PREFIJO,

            estado:
              token
                .ESTADO,

            fechaCreacion:
              token
                .FECHA_CREACION,

            fechaVencimiento:
              token
                .FECHA_VENCIMIENTO,

            ultimoUso:
              token
                .ULTIMO_USO,

            creditos:
              token
                .CREDITOS_DISPONIBLES ===
                null

                ? null

                : {

                    disponibles:
                      Number(
                        token
                          .CREDITOS_DISPONIBLES
                      ),

                    totalAsignado:
                      Number(
                        token
                          .TOTAL_ASIGNADO
                      ),

                    totalConsumido:
                      Number(
                        token
                          .TOTAL_CONSUMIDO
                      ),
                  },
          })
        ),


    consumos:
      consumosResult
        .recordset
        .map(
          (consumo) => ({

            idConsumo:
              consumo
                .ID_CONSUMO,

            idToken:
              consumo
                .ID_TOKEN,

            idMovimiento:
              consumo
                .ID_MOVIMIENTO,

            tipoDocumento:
              consumo
                .TIPO_DOCUMENTO_CONSULTADO,

            documento:
              consumo
                .DOCUMENTO_CONSULTADO,

            creditosConsumidos:
              Number(
                consumo
                  .CREDITOS_CONSUMIDOS ||
                0
              ),

            estado:
              consumo
                .ESTADO,

            httpStatus:
              consumo
                .HTTP_STATUS,

            mensaje:
              consumo
                .MENSAJE,

            ipOrigen:
              consumo
                .IP_ORIGEN,

            duracionMs:
              consumo
                .DURACION_MS,

            fecha:
              consumo
                .FECHA,
          })
        ),


    paginacionConsumos: {

      page:
        pageConsumos,

      limit,

      total:
        totalConsumos,

      totalPaginas:
        totalPaginasConsumos,
    },


    movimientos:
      movimientosResult
        .recordset
        .map(
          (movimiento) => ({

            idMovimiento:
              movimiento
                .ID_MOVIMIENTO,

            idToken:
              movimiento
                .ID_TOKEN,

            tipo:
              movimiento
                .TIPO,

            cantidad:
              movimiento
                .CANTIDAD,

            saldoAntes:
              movimiento
                .SALDO_ANTES,

            saldoDespues:
              movimiento
                .SALDO_DESPUES,

            origen:
              movimiento
                .ORIGEN,

            observacion:
              movimiento
                .OBSERVACION,

            fecha:
              movimiento
                .FECHA,
          })
        ),


    paginacionMovimientos: {

      page:
        pageMovimientos,

      limit,

      total:
        totalMovimientos,

      totalPaginas:
        totalPaginasMovimientos,
    },
  };
}


// ==================================================
// ACTUALIZAR ESTADO CLIENTE
// ==================================================

export async function actualizarEstadoCliente(
  idCliente,
  estado
) {

  idCliente =
    Number(idCliente);


  estado =
    String(
      estado || ""
    )
      .trim()
      .toUpperCase();


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


  const estadosPermitidos = [
    "ACTIVO",
    "BLOQUEADO",
  ];


  if (
    !estadosPermitidos.includes(
      estado
    )
  ) {

    throw crearError(
      "Estado no válido. Use ACTIVO o BLOQUEADO.",
      400,
      "INVALID_CLIENT_STATUS"
    );
  }


  const pool =
    await getSqlPool();


  const clienteResult =
    await pool
      .request()

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


  const estadoAnterior =
    clienteResult
      .recordset[0]
      .ESTADO;


  await pool
    .request()

    .input(
      "idCliente",
      sql.BigInt,
      idCliente
    )

    .input(
      "estado",
      sql.VarChar(20),
      estado
    )

    .query(`
      UPDATE
        GestionAPIClientes.Clientes

      SET
        ESTADO =
          @estado,

        FECHA_ACTUALIZACION =
          SYSDATETIME()

      WHERE
        ID_CLIENTE =
          @idCliente
    `);


  return {

    idCliente,

    estadoAnterior,

    estadoActual:
      estado,
  };
}