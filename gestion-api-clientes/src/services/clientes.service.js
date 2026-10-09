import crypto from "node:crypto";

import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


// ==================================================
// UTILIDADES
// ==================================================

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
// CREAR CLIENTE
// ==================================================

export async function crearCliente(
  {
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
  },

  adminActual
) {
  const contextoAdmin =
    obtenerContextoAdministrador(
      adminActual
    );

  // ADMIN:
  // El cliente queda automáticamente asignado
  // al administrador que lo crea.
  //
  // SUPERADMIN:
  // Por ahora el cliente queda sin asignar.
  // Más adelante agregaremos el selector
  // de administrador en el panel.

  const idAdminResponsable =
    contextoAdmin.esSuperAdmin
      ? null
      : contextoAdmin.idAdmin;


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

        .input(
          "idAdmin",
          sql.BigInt,
          idAdminResponsable
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

            ID_ADMIN,

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

            @idAdmin,

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
    // CREAR TOKEN
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
// CREAR BOLSAS DE CRÉDITOS
// --------------------------------------------------

// Por compatibilidad temporal:
//
// creditosIniciales se asigna a RRCC.
//
// SUELDOS comienza en 0.
//
// Más adelante el formulario podrá enviar
// créditos iniciales independientes por servicio.

const serviciosResult =
  await new sql.Request(
    transaction
  )

    .query(`
      SELECT
        ID_SERVICIO,
        CODIGO

      FROM
        GestionAPIClientes.Servicios

      WHERE
        CODIGO IN (
          'RRCC',
          'SUELDOS'
        )

        AND ESTADO =
          'ACTIVO'
    `);


const servicioRRCC =
  serviciosResult.recordset.find(
    (servicio) =>
      servicio.CODIGO === "RRCC"
  );


const servicioSueldos =
  serviciosResult.recordset.find(
    (servicio) =>
      servicio.CODIGO === "SUELDOS"
  );


if (
  !servicioRRCC ||
  !servicioSueldos
) {

  throw crearError(
    "Los servicios RRCC y SUELDOS deben estar configurados y activos.",
    500,
    "SERVICES_NOT_CONFIGURED"
  );
}


const idServicioRRCC =
  Number(
    servicioRRCC.ID_SERVICIO
  );


const idServicioSueldos =
  Number(
    servicioSueldos.ID_SERVICIO
  );


// --------------------------------------------------
// BOLSA RRCC
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
    "idServicio",
    sql.BigInt,
    idServicioRRCC
  )

  .input(
    "creditos",
    sql.Int,
    creditos
  )

  .query(`
    INSERT INTO
      GestionAPIClientes.SaldosServicios
    (
      ID_CLIENTE,
      ID_SERVICIO,

      CREDITOS_DISPONIBLES,
      TOTAL_ASIGNADO,
      TOTAL_CONSUMIDO
    )

    VALUES
    (
      @idCliente,
      @idServicio,

      @creditos,
      @creditos,
      0
    )
  `);


// --------------------------------------------------
// BOLSA SUELDOS
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
    "idServicio",
    sql.BigInt,
    idServicioSueldos
  )

  .query(`
    INSERT INTO
      GestionAPIClientes.SaldosServicios
    (
      ID_CLIENTE,
      ID_SERVICIO,

      CREDITOS_DISPONIBLES,
      TOTAL_ASIGNADO,
      TOTAL_CONSUMIDO
    )

    VALUES
    (
      @idCliente,
      @idServicio,

      0,
      0,
      0
    )
  `);


    // --------------------------------------------------
// MOVIMIENTO INICIAL RRCC
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
      "idServicio",
      sql.BigInt,
      idServicioRRCC
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
        ID_SERVICIO,

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
        @idServicio,

        'CARGA',
        @creditos,

        0,
        @creditos,

        'ADMIN',
        'Asignación inicial de créditos para RRCC'
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

      creditosPorServicio: {

        RRCC: {

          disponibles:
            creditos,

          totalAsignado:
            creditos,

          totalConsumido:
            0,

        },

        SUELDOS: {

          disponibles:
            0,

          totalAsignado:
            0,

          totalConsumido:
            0,

        },

      },


      // Compatibilidad temporal con
      // la respuesta anterior.

      creditosDisponibles:
        creditos,


      fechaVencimiento:
        fechaVencimientoSql,

      idAdmin:
        idAdminResponsable,

    };


  } catch (error) {

    try {

      await transaction.rollback();

    } catch {

      // La transacción ya pudo haberse revertido.

    }


    throw error;
  }
}


// ==================================================
// RECARGAR CRÉDITOS POR SERVICIO
// ==================================================

export async function recargarCreditos(

  idCliente,

  cantidad,

  servicio = "RRCC",

  adminActual

) {

  const contextoAdmin =
    obtenerContextoAdministrador(
      adminActual
    );


  idCliente =
    Number(
      idCliente
    );


  cantidad =
    Number(
      cantidad
    );


  servicio =
    String(
      servicio || "RRCC"
    )
      .trim()
      .toUpperCase();


  // ================================================
  // VALIDACIONES
  // ================================================

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


  if (
    !Number.isInteger(
      cantidad
    ) ||
    cantidad <= 0
  ) {

    throw crearError(
      "La cantidad de créditos debe ser mayor a 0.",
      400,
      "INVALID_CREDITS"
    );
  }


  if (
    ![
      "RRCC",
      "SUELDOS",
    ].includes(
      servicio
    )
  ) {

    throw crearError(
      "El servicio indicado no es válido.",
      400,
      "INVALID_SERVICE"
    );
  }


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


    // ================================================
    // 1. VALIDAR CLIENTE
    // ================================================

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
      clienteResult.recordset.length === 0
    ) {

      throw crearError(
        "Cliente no encontrado.",
        404,
        "CLIENT_NOT_FOUND"
      );
    }


    // ================================================
    // 2. OBTENER TOKEN ACTIVO
    // Solo para trazabilidad del movimiento.
    // El saldo NO pertenece al token.
    // ================================================

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
            ID_TOKEN

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
        "El cliente tiene más de un token activo.",
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


    // ================================================
    // 3. OBTENER SERVICIO
    // ================================================

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
            NOMBRE

          FROM
            GestionAPIClientes.Servicios

          WHERE
            CODIGO =
              @servicio

            AND ESTADO =
              'ACTIVO'
        `);


    if (
      servicioResult.recordset.length === 0
    ) {

      throw crearError(
        "El servicio indicado no está disponible.",
        409,
        "SERVICE_NOT_AVAILABLE"
      );
    }


    const idServicio =
      Number(
        servicioResult
          .recordset[0]
          .ID_SERVICIO
      );


    // ================================================
    // 4. BLOQUEAR BOLSA
    // ================================================

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
        `El cliente no tiene configurada la bolsa ${servicio}.`,
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


    const saldoDespues =
      saldoAntes +
      cantidad;


    // ================================================
    // 5. RECARGAR BOLSA
    // ================================================

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

        .input(
          "cantidad",
          sql.Int,
          cantidad
        )

        .query(`
          UPDATE
            GestionAPIClientes.SaldosServicios

          SET
            CREDITOS_DISPONIBLES =
              CREDITOS_DISPONIBLES +
              @cantidad,

            TOTAL_ASIGNADO =
              TOTAL_ASIGNADO +
              @cantidad,

            FECHA_ACTUALIZACION =
              SYSDATETIME()

          WHERE
            ID_CLIENTE =
              @idCliente

            AND ID_SERVICIO =
              @idServicio
        `);


    if (
      updateResult.rowsAffected[0] !== 1
    ) {

      throw crearError(
        "No fue posible actualizar la bolsa de créditos.",
        409,
        "SERVICE_CREDIT_UPDATE_FAILED"
      );
    }


    // ================================================
    // 6. REGISTRAR MOVIMIENTO
    // ================================================

    const observacion =
      `Recarga de créditos para ${servicio}`;


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

        VALUES
        (
          @idCliente,
          @idToken,
          @idServicio,

          'CARGA',
          @cantidad,

          @saldoAntes,
          @saldoDespues,

          'ADMIN',
          @observacion
        )
      `);


    await transaction.commit();


    return {

      idCliente,

      idToken,

      idServicio,

      servicio,

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

      // La transacción pudo haberse revertido.

    }


    throw error;
  }
}


// ==================================================
// LISTAR CLIENTES
// ==================================================

export async function listarClientes(
  {

    page = 1,

    limit = 20,

    search = "",

  },

  adminActual
) {

  const contextoAdmin =
    obtenerContextoAdministrador(
      adminActual
    );


  page =
    Number(
      page
    );


  limit =
    Number(
      limit
    );


  if (
    !Number.isInteger(page) ||
    page < 1
  ) {

    page =
      1;
  }


  if (
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {

    limit =
      20;
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
          COUNT(*) AS TOTAL

        FROM
          GestionAPIClientes.Clientes C

        WHERE
          (
            @esSuperAdmin = 1
            OR C.ID_ADMIN = @idAdmin
          )

          AND
          (
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
          )
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

          C.ID_ADMIN,

          A.USUARIO
            AS ADMIN_USUARIO,

          A.NOMBRE
            AS ADMIN_NOMBRE,

          A.ROL
            AS ADMIN_ROL,

          C.FECHA_CREACION,
          C.FECHA_ACTUALIZACION,

         ISNULL(
            SB.CREDITOS_DISPONIBLES,
            0
          ) AS CREDITOS_DISPONIBLES,

          ISNULL(
            SB.TOTAL_ASIGNADO,
            0
          ) AS TOTAL_ASIGNADO,

          ISNULL(
            SB.TOTAL_CONSUMIDO,
            0
          ) AS TOTAL_CONSUMIDO,

          ISNULL(
            SB.RRCC_DISPONIBLES,
            0
          ) AS RRCC_DISPONIBLES,

          ISNULL(
            SB.RRCC_ASIGNADO,
            0
          ) AS RRCC_ASIGNADO,

          ISNULL(
            SB.RRCC_CONSUMIDO,
            0
          ) AS RRCC_CONSUMIDO,

          ISNULL(
            SB.SUELDOS_DISPONIBLES,
            0
          ) AS SUELDOS_DISPONIBLES,

          ISNULL(
            SB.SUELDOS_ASIGNADO,
            0
          ) AS SUELDOS_ASIGNADO,

          ISNULL(
            SB.SUELDOS_CONSUMIDO,
            0
          ) AS SUELDOS_CONSUMIDO,

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

        LEFT JOIN
          GestionAPIClientes.Administradores A

            ON A.ID_ADMIN =
               C.ID_ADMIN


       OUTER APPLY
        (
          SELECT

            SUM(
              SS.CREDITOS_DISPONIBLES
            ) AS CREDITOS_DISPONIBLES,

            SUM(
              SS.TOTAL_ASIGNADO
            ) AS TOTAL_ASIGNADO,

            SUM(
              SS.TOTAL_CONSUMIDO
            ) AS TOTAL_CONSUMIDO,


            MAX(
              CASE
                WHEN S.CODIGO = 'RRCC'
                  THEN SS.CREDITOS_DISPONIBLES
                ELSE 0
              END
            ) AS RRCC_DISPONIBLES,

            MAX(
              CASE
                WHEN S.CODIGO = 'RRCC'
                  THEN SS.TOTAL_ASIGNADO
                ELSE 0
              END
            ) AS RRCC_ASIGNADO,

            MAX(
              CASE
                WHEN S.CODIGO = 'RRCC'
                  THEN SS.TOTAL_CONSUMIDO
                ELSE 0
              END
            ) AS RRCC_CONSUMIDO,


            MAX(
              CASE
                WHEN S.CODIGO = 'SUELDOS'
                  THEN SS.CREDITOS_DISPONIBLES
                ELSE 0
              END
            ) AS SUELDOS_DISPONIBLES,

            MAX(
              CASE
                WHEN S.CODIGO = 'SUELDOS'
                  THEN SS.TOTAL_ASIGNADO
                ELSE 0
              END
            ) AS SUELDOS_ASIGNADO,

            MAX(
              CASE
                WHEN S.CODIGO = 'SUELDOS'
                  THEN SS.TOTAL_CONSUMIDO
                ELSE 0
              END
            ) AS SUELDOS_CONSUMIDO

          FROM
            GestionAPIClientes.SaldosServicios SS

          INNER JOIN
            GestionAPIClientes.Servicios S
              ON S.ID_SERVICIO =
                SS.ID_SERVICIO

          WHERE
            SS.ID_CLIENTE =
              C.ID_CLIENTE

        ) SB


        WHERE
          (
            @esSuperAdmin = 1
            OR C.ID_ADMIN = @idAdmin
          )

          AND
          (
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
          )

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


          administrador:
            cliente.ID_ADMIN
              ? {

                  idAdmin:
                    cliente.ID_ADMIN,

                  usuario:
                    cliente.ADMIN_USUARIO,

                  nombre:
                    cliente.ADMIN_NOMBRE,

                  rol:
                    cliente.ADMIN_ROL,

                }
              : null,


          creditos: {

            disponibles:
              Number(
                cliente.CREDITOS_DISPONIBLES ||
                0
              ),

            totalAsignado:
              Number(
                cliente.TOTAL_ASIGNADO ||
                0
              ),

            totalConsumido:
              Number(
                cliente.TOTAL_CONSUMIDO ||
                0
              ),

          },


          creditosPorServicio: {

            RRCC: {

              disponibles:
                Number(
                  cliente.RRCC_DISPONIBLES ||
                  0
                ),

              totalAsignado:
                Number(
                  cliente.RRCC_ASIGNADO ||
                  0
                ),

              totalConsumido:
                Number(
                  cliente.RRCC_CONSUMIDO ||
                  0
                ),

            },


            SUELDOS: {

              disponibles:
                Number(
                  cliente.SUELDOS_DISPONIBLES ||
                  0
                ),

              totalAsignado:
                Number(
                  cliente.SUELDOS_ASIGNADO ||
                  0
                ),

              totalConsumido:
                Number(
                  cliente.SUELDOS_CONSUMIDO ||
                  0
                ),

            },

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

  } = {},

  adminActual
) {

  const contextoAdmin =
    obtenerContextoAdministrador(
      adminActual
    );


  idCliente =
    Number(
      idCliente
    );


  pageConsumos =
    Number(
      pageConsumos
    );


  pageMovimientos =
    Number(
      pageMovimientos
    );


  // ==================================================
  // VALIDAR CLIENTE
  // ==================================================

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
  // PAGINACIÓN
  // ==================================================

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


  // ==================================================
 // CLIENTE + PROPIEDAD
  // ==================================================

  const clienteResult =
    await pool
      .request()

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

          C.ID_ADMIN,

          A.USUARIO
            AS ADMIN_USUARIO,

          A.NOMBRE
            AS ADMIN_NOMBRE,

          A.ROL
            AS ADMIN_ROL,

          C.FECHA_CREACION,

          C.FECHA_ACTUALIZACION

        FROM
          GestionAPIClientes.Clientes C

        LEFT JOIN
          GestionAPIClientes.Administradores A

            ON A.ID_ADMIN =
               C.ID_ADMIN


        WHERE
          C.ID_CLIENTE =
            @idCliente

          AND
          (
            @esSuperAdmin = 1
            OR C.ID_ADMIN = @idAdmin
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
// BOLSAS DE CRÉDITOS POR SERVICIO
// ==================================================

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
        SS.ID_SERVICIO,

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


const creditosPorServicio = {};


let totalDisponible = 0;
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


  creditosPorServicio[codigo] =
    bolsa;


  totalDisponible +=
    bolsa.disponibles;

  totalAsignado +=
    bolsa.totalAsignado;

  totalConsumido +=
    bolsa.totalConsumido;
}

  const nombre =
    cliente.RAZON_SOCIAL ||
    [
      cliente.NOMBRES,

      cliente.APELLIDO_PATERNO,

      cliente.APELLIDO_MATERNO,
    ]
      .filter(Boolean)
      .join(" ");


  // ==================================================
  // TOKENS
  // ==================================================

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

        T.ULTIMO_USO

      FROM
        GestionAPIClientes.Tokens T

      WHERE
        T.ID_CLIENTE =
          @idCliente

      ORDER BY
        T.ID_TOKEN DESC
    `);

    // ==================================================
// CREDENCIAL API COMERCIAL
// ==================================================

const apiCredencialResult =
  await pool
    .request()

    .input(
      "idCliente",
      sql.BigInt,
      idCliente
    )

    .query(`
      SELECT
        ID_CREDENCIAL,
        ID_CLIENTE,
        CLIENT_ID,
        ESTADO,
        FECHA_CREACION,
        FECHA_ACTUALIZACION,
        ULTIMO_USO,
        FECHA_REVOCACION

      FROM
        GestionAPIClientes.ApiCredenciales

      WHERE
        ID_CLIENTE =
          @idCliente
    `);


  // ==================================================
  // TOTAL DE CONSUMOS
  // ==================================================

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


  // ==================================================
  // CONSUMOS PAGINADOS
  // ==================================================

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

        ID_SERVICIO,

        TIPO_DOCUMENTO_CONSULTADO,

        DOCUMENTO_CONSULTADO,

        SERVICIO,

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


  // ==================================================
  // TOTAL DE MOVIMIENTOS
  // ==================================================

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


  // ==================================================
  // MOVIMIENTOS PAGINADOS
  // ==================================================

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

        M.ID_MOVIMIENTO,

        M.ID_TOKEN,

        M.ID_SERVICIO,

        S.CODIGO
          AS SERVICIO,

        M.TIPO,

        M.CANTIDAD,

        M.SALDO_ANTES,

        M.SALDO_DESPUES,

        M.ORIGEN,

        M.OBSERVACION,

        M.FECHA

      FROM
        GestionAPIClientes.Movimientos M

      LEFT JOIN
        GestionAPIClientes.Servicios S

          ON S.ID_SERVICIO =
             M.ID_SERVICIO

      WHERE
        M.ID_CLIENTE =
          @idCliente

      ORDER BY
        M.ID_MOVIMIENTO DESC

      OFFSET
        @offset ROWS

      FETCH NEXT
        @limit ROWS ONLY
    `);


  // ==================================================
  // RESPUESTA
  // ==================================================

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
        cliente.APELLIDO_PATERNO,

      apellidoMaterno:
        cliente.APELLIDO_MATERNO,

      razonSocial:
        cliente.RAZON_SOCIAL,

      email:
        cliente.EMAIL,

      telefono:
        cliente.TELEFONO,

      estado:
        cliente.ESTADO,


      administrador:
        cliente.ID_ADMIN
          ? {

              idAdmin:
                cliente.ID_ADMIN,

              usuario:
                cliente.ADMIN_USUARIO,

              nombre:
                cliente.ADMIN_NOMBRE,

              rol:
                cliente.ADMIN_ROL,

            }
          : null,


      fechaCreacion:
        cliente.FECHA_CREACION,

      fechaActualizacion:
        cliente.FECHA_ACTUALIZACION,
    },


    // --------------------------------------------------
// CRÉDITOS
// --------------------------------------------------

creditos: {

  disponibles:
    totalDisponible,

  totalAsignado:
    totalAsignado,

  totalConsumido:
    totalConsumido,

},


// --------------------------------------------------
// CRÉDITOS POR SERVICIO
// --------------------------------------------------

creditosPorServicio,

// --------------------------------------------------
// CREDENCIAL API COMERCIAL
// --------------------------------------------------

apiCredencial:
  apiCredencialResult.recordset.length > 0

    ? {

        idCredencial:
          Number(
            apiCredencialResult
              .recordset[0]
              .ID_CREDENCIAL
          ),

        clientId:
          apiCredencialResult
            .recordset[0]
            .CLIENT_ID,

        estado:
          apiCredencialResult
            .recordset[0]
            .ESTADO,

        fechaCreacion:
          apiCredencialResult
            .recordset[0]
            .FECHA_CREACION,

        fechaActualizacion:
          apiCredencialResult
            .recordset[0]
            .FECHA_ACTUALIZACION,

        ultimoUso:
          apiCredencialResult
            .recordset[0]
            .ULTIMO_USO,

        fechaRevocacion:
          apiCredencialResult
            .recordset[0]
            .FECHA_REVOCACION,

      }

    : null,

  // --------------------------------------------------
  // TOKENS
  // --------------------------------------------------

tokens:
  tokensResult.recordset.map(
    (token) => ({

      idToken:
        token.ID_TOKEN,

      prefijo:
        token.TOKEN_PREFIJO,

      estado:
        token.ESTADO,

      fechaCreacion:
        token.FECHA_CREACION,

      fechaVencimiento:
        token.FECHA_VENCIMIENTO,

      ultimoUso:
        token.ULTIMO_USO,

    })
  ),

    // --------------------------------------------------
    // CONSUMOS
    // --------------------------------------------------

    consumos:
      consumosResult.recordset.map(
        (consumo) => ({

          idConsumo:
            consumo.ID_CONSUMO,

          idToken:
            consumo.ID_TOKEN,

          idMovimiento:
            consumo.ID_MOVIMIENTO,

          idServicio:
            consumo.ID_SERVICIO,

          tipoDocumento:
            consumo
              .TIPO_DOCUMENTO_CONSULTADO,

          documento:
            consumo
              .DOCUMENTO_CONSULTADO,

          servicio:
            consumo.SERVICIO ||
            "RRCC",

          creditosConsumidos:
            Number(
              consumo
                .CREDITOS_CONSUMIDOS ||
              0
            ),

          estado:
            consumo.ESTADO,

          httpStatus:
            consumo.HTTP_STATUS,

          mensaje:
            consumo.MENSAJE,

          ipOrigen:
            consumo.IP_ORIGEN,

          duracionMs:
            consumo.DURACION_MS,

          fecha:
            consumo.FECHA,

        })
      ),


    // --------------------------------------------------
    // PAGINACIÓN CONSUMOS
    // --------------------------------------------------

    paginacionConsumos: {

      page:
        pageConsumos,

      limit,

      total:
        totalConsumos,

      totalPaginas:
        totalPaginasConsumos,
    },


    // --------------------------------------------------
    // MOVIMIENTOS
    // --------------------------------------------------

    movimientos:
      movimientosResult.recordset.map(
        (movimiento) => ({

          idMovimiento:
            movimiento.ID_MOVIMIENTO,

          idToken:
            movimiento.ID_TOKEN,

          idServicio:
            movimiento.ID_SERVICIO,

          servicio:
            movimiento.SERVICIO,

          tipo:
            movimiento.TIPO,

          cantidad:
            movimiento.CANTIDAD,

          saldoAntes:
            movimiento.SALDO_ANTES,

          saldoDespues:
            movimiento.SALDO_DESPUES,

          origen:
            movimiento.ORIGEN,

          observacion:
            movimiento.OBSERVACION,

          fecha:
            movimiento.FECHA,

        })
      ),


    // --------------------------------------------------
    // PAGINACIÓN MOVIMIENTOS
    // --------------------------------------------------

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
  estado,
  adminActual
) {

  const contextoAdmin =
    obtenerContextoAdministrador(
      adminActual
    );


  idCliente =
    Number(
      idCliente
    );


  estado =
    String(
      estado || ""
    )
      .trim()
      .toUpperCase();


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


  // --------------------------------------------------
  // VALIDAR CLIENTE Y PROPIEDAD
  // --------------------------------------------------

  const clienteResult =
    await pool
      .request()

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


  const estadoAnterior =
    clienteResult
      .recordset[0]
      .ESTADO;


  // --------------------------------------------------
  // ACTUALIZAR ESTADO
  // --------------------------------------------------

  const updateResult =
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

          AND
          (
            @esSuperAdmin = 1
            OR ID_ADMIN = @idAdmin
          )
      `);


  if (
    updateResult.rowsAffected[0] !==
    1
  ) {

    throw crearError(
      "No fue posible actualizar el estado del cliente.",
      409,
      "CLIENT_STATUS_UPDATE_FAILED"
    );
  }


  return {

    idCliente,

    estadoAnterior,

    estadoActual:
      estado,
  };
}

// ==================================================
// ASIGNAR / REASIGNAR ADMINISTRADOR A CLIENTE
// SOLO SUPERADMIN
// ==================================================

export async function asignarAdministradorCliente(
  idCliente,
  idAdmin
) {

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


  // --------------------------------------------------
  // PERMITIR NULL PARA DEJAR CLIENTE SIN ASIGNAR
  // --------------------------------------------------

  let idAdminDestino =
    null;


  if (
    idAdmin !== null &&
    idAdmin !== undefined &&
    idAdmin !== ""
  ) {

    idAdminDestino =
      Number(
        idAdmin
      );


    if (
      !Number.isInteger(
        idAdminDestino
      ) ||
      idAdminDestino <= 0
    ) {

      throw crearError(
        "El administrador no es válido.",
        400,
        "INVALID_ADMIN"
      );
    }
  }


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
            ID_ADMIN,
            ESTADO,

            TIPO_DOCUMENTO_CLIENTE,
            DOCUMENTO_CLIENTE,

            NOMBRES,
            APELLIDO_PATERNO,
            APELLIDO_MATERNO,

            RAZON_SOCIAL

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


    const idAdminAnterior =
      cliente.ID_ADMIN === null
        ? null
        : Number(
            cliente.ID_ADMIN
          );


    // --------------------------------------------------
    // VALIDAR ADMINISTRADOR DESTINO
    // --------------------------------------------------

    let administradorDestino =
      null;


    if (
      idAdminDestino !== null
    ) {

      const adminResult =
        await new sql.Request(
          transaction
        )

          .input(
            "idAdmin",
            sql.BigInt,
            idAdminDestino
          )

          .query(`
            SELECT
              ID_ADMIN,
              USUARIO,
              NOMBRE,
              EMAIL,
              ROL,
              ESTADO

            FROM
              GestionAPIClientes.Administradores
                WITH (
                  UPDLOCK,
                  HOLDLOCK
                )

            WHERE
              ID_ADMIN =
                @idAdmin
          `);


      if (
        adminResult.recordset.length ===
        0
      ) {

        throw crearError(
          "Administrador no encontrado.",
          404,
          "ADMIN_NOT_FOUND"
        );
      }


      administradorDestino =
        adminResult.recordset[0];


      // --------------------------------------------------
      // SOLO SE PUEDEN ASIGNAR ADMIN NORMALES
      // --------------------------------------------------

      if (
        administradorDestino.ROL !==
        "ADMIN"
      ) {

        throw crearError(
          "El cliente solo puede ser asignado a un administrador con rol ADMIN.",
          400,
          "CLIENT_ADMIN_ROLE_REQUIRED"
        );
      }


      // --------------------------------------------------
      // SOLO ADMINISTRADORES ACTIVOS
      // --------------------------------------------------

      if (
        administradorDestino.ESTADO !==
        "ACTIVO"
      ) {

        throw crearError(
          "No puede asignar el cliente a un administrador bloqueado.",
          409,
          "ADMIN_NOT_ACTIVE"
        );
      }
    }


    // --------------------------------------------------
    // ACTUALIZAR CLIENTE
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
          "idAdmin",
          sql.BigInt,
          idAdminDestino
        )

        .query(`
          UPDATE
            GestionAPIClientes.Clientes

          SET
            ID_ADMIN =
              @idAdmin,

            FECHA_ACTUALIZACION =
              SYSDATETIME()

          OUTPUT
            INSERTED.ID_CLIENTE,
            INSERTED.ID_ADMIN,
            INSERTED.FECHA_ACTUALIZACION

          WHERE
            ID_CLIENTE =
              @idCliente
        `);


    if (
      updateResult.recordset.length ===
      0
    ) {

      throw crearError(
        "No fue posible actualizar el administrador del cliente.",
        409,
        "CLIENT_ADMIN_UPDATE_FAILED"
      );
    }


    await transaction.commit();


    const nombreCliente =
      cliente.RAZON_SOCIAL ||
      [
        cliente.NOMBRES,
        cliente.APELLIDO_PATERNO,
        cliente.APELLIDO_MATERNO,
      ]
        .filter(Boolean)
        .join(" ");


    return {

      idCliente,

      nombreCliente,

      idAdminAnterior,

      idAdminActual:
        idAdminDestino,

      administrador:
        administradorDestino
          ? {

              idAdmin:
                administradorDestino.ID_ADMIN,

              usuario:
                administradorDestino.USUARIO,

              nombre:
                administradorDestino.NOMBRE,

              email:
                administradorDestino.EMAIL,

              rol:
                administradorDestino.ROL,

              estado:
                administradorDestino.ESTADO,
            }
          : null,

      fechaActualizacion:
        updateResult
          .recordset[0]
          .FECHA_ACTUALIZACION,
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