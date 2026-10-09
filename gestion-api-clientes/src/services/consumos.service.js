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
];


// ==================================================
// UTILIDADES ADMIN
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
// REGISTRAR CONSUMO
// ==================================================

export async function registrarConsumo({

  idCliente,
  idToken,
  idMovimiento = null,

  tipoDocumento,
  documento,

  servicio = "RRCC",

  creditosConsumidos,

  estado,
  httpStatus,

  mensaje = null,
  ipOrigen = null,
  duracionMs = null,

}) {

  servicio =
    String(
      servicio || "RRCC"
    )
      .trim()
      .toUpperCase();


  if (
    !SERVICIOS_PERMITIDOS.includes(
      servicio
    )
  ) {

    throw crearError(
      `Servicio de consumo no válido: ${servicio}`,
      400,
      "INVALID_SERVICE"
    );
  }


  const pool =
    await getSqlPool();


  // ================================================
  // OBTENER ID DEL SERVICIO
  // ================================================

  const servicioResult =
    await pool
      .request()

      .input(
        "servicio",
        sql.VarChar(30),
        servicio
      )

      .query(`
        SELECT
          ID_SERVICIO

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
      "El servicio no se encuentra configurado.",
      409,
      "SERVICE_NOT_FOUND"
    );
  }


  const idServicio =
    Number(
      servicioResult
        .recordset[0]
        .ID_SERVICIO
    );


  // ================================================
  // REGISTRAR CONSUMO
  // ================================================

  const result =
    await pool
      .request()

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
        "idMovimiento",
        sql.BigInt,
        idMovimiento
      )

      .input(
        "idServicio",
        sql.BigInt,
        idServicio
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
        "servicio",
        sql.VarChar(30),
        servicio
      )

      .input(
        "creditosConsumidos",
        sql.Int,
        creditosConsumidos
      )

      .input(
        "estado",
        sql.VarChar(30),
        estado
      )

      .input(
        "httpStatus",
        sql.Int,
        httpStatus
      )

      .input(
        "mensaje",
        sql.NVarChar(300),
        mensaje
      )

      .input(
        "ipOrigen",
        sql.VarChar(50),
        ipOrigen
      )

      .input(
        "duracionMs",
        sql.Int,
        duracionMs
      )

      .query(`
        INSERT INTO
          GestionAPIClientes.Consumos
        (
          ID_CLIENTE,
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
          DURACION_MS
        )

        OUTPUT
          INSERTED.ID_CONSUMO

        VALUES
        (
          @idCliente,
          @idToken,
          @idMovimiento,
          @idServicio,

          @tipoDocumento,
          @documento,

          @servicio,

          @creditosConsumidos,

          @estado,
          @httpStatus,
          @mensaje,

          @ipOrigen,
          @duracionMs
        )
      `);


  return {

    idConsumo:
      result
        .recordset[0]
        .ID_CONSUMO,

    idServicio,

    servicio,

  };
}


// ==================================================
// LISTAR CONSUMOS PARA ADMINISTRACIÓN
// ==================================================

export async function listarConsumos(
  {

    page = 1,
    limit = 20,

    search = "",
    estado = "",
    servicio = "",

  },

  adminActual
) {

  const contextoAdmin =
    obtenerContextoAdministrador(
      adminActual
    );


  // --------------------------------------------------
  // NORMALIZAR PAGINACIÓN
  // --------------------------------------------------

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


  // --------------------------------------------------
  // NORMALIZAR FILTROS
  // --------------------------------------------------

  search =
    String(
      search || ""
    )
      .trim();


  estado =
    String(
      estado || ""
    )
      .trim()
      .toUpperCase();


  servicio =
    String(
      servicio || ""
    )
      .trim()
      .toUpperCase();


  // --------------------------------------------------
  // VALIDAR ESTADO
  // --------------------------------------------------

  const estadosPermitidos = [
    "",
    "EXITOSA",
    "SIN_DATOS",
    "ERROR",
  ];


  if (
    !estadosPermitidos.includes(
      estado
    )
  ) {

    estado =
      "";
  }


  // --------------------------------------------------
  // VALIDAR SERVICIO
  // --------------------------------------------------

  const serviciosPermitidos = [
    "",
    "RRCC",
    "SUELDOS",
  ];


  if (
    !serviciosPermitidos.includes(
      servicio
    )
  ) {

    servicio =
      "";
  }


  const offset =
    (page - 1) *
    limit;


  // --------------------------------------------------
  // CONEXIÓN
  // --------------------------------------------------

  const pool =
    await getSqlPool();


  // ==================================================
  // TOTAL DE REGISTROS
  // ==================================================

  const totalResult =
    await pool
      .request()

      .input(
        "search",
        sql.NVarChar(200),
        `%${search}%`
      )

      .input(
        "estado",
        sql.VarChar(30),
        estado
      )

      .input(
        "servicio",
        sql.VarChar(30),
        servicio
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
          GestionAPIClientes.Consumos CO

        INNER JOIN
          GestionAPIClientes.Clientes C

            ON C.ID_CLIENTE =
               CO.ID_CLIENTE

        WHERE
          (
            @esSuperAdmin = 1
            OR C.ID_ADMIN = @idAdmin
          )

          AND
          (
            @search = '%%'

            OR C.RAZON_SOCIAL
              LIKE @search

            OR C.NOMBRES
              LIKE @search

            OR C.APELLIDO_PATERNO
              LIKE @search

            OR C.APELLIDO_MATERNO
              LIKE @search

            OR C.DOCUMENTO_CLIENTE
              LIKE @search

            OR CO.DOCUMENTO_CONSULTADO
              LIKE @search

            OR ISNULL(
              CO.SERVICIO,
              'RRCC'
            )
              LIKE @search
          )

          AND
          (
            @estado = ''

            OR CO.ESTADO =
               @estado
          )

          AND
          (
            @servicio = ''

            OR ISNULL(
              CO.SERVICIO,
              'RRCC'
            ) =
               @servicio
          )
      `);


  const total =
    Number(
      totalResult
        .recordset[0]
        .TOTAL
    );


  // ==================================================
  // OBTENER CONSUMOS
  // ==================================================

  const result =
    await pool
      .request()

      .input(
        "search",
        sql.NVarChar(200),
        `%${search}%`
      )

      .input(
        "estado",
        sql.VarChar(30),
        estado
      )

      .input(
        "servicio",
        sql.VarChar(30),
        servicio
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

          CO.ID_CONSUMO,
          CO.ID_CLIENTE,
          CO.ID_TOKEN,
          CO.ID_MOVIMIENTO,

          C.RAZON_SOCIAL,
          C.NOMBRES,
          C.APELLIDO_PATERNO,
          C.APELLIDO_MATERNO,

          C.TIPO_DOCUMENTO_CLIENTE,
          C.DOCUMENTO_CLIENTE,

          C.ID_ADMIN,

          CO.TIPO_DOCUMENTO_CONSULTADO,
          CO.DOCUMENTO_CONSULTADO,

          ISNULL(
            CO.SERVICIO,
            'RRCC'
          ) AS SERVICIO,

          CO.CREDITOS_CONSUMIDOS,

          CO.ESTADO,
          CO.HTTP_STATUS,
          CO.MENSAJE,

          CO.IP_ORIGEN,
          CO.DURACION_MS,
          CO.FECHA

        FROM
          GestionAPIClientes.Consumos CO

        INNER JOIN
          GestionAPIClientes.Clientes C

            ON C.ID_CLIENTE =
               CO.ID_CLIENTE

        WHERE
          (
            @esSuperAdmin = 1
            OR C.ID_ADMIN = @idAdmin
          )

          AND
          (
            @search = '%%'

            OR C.RAZON_SOCIAL
              LIKE @search

            OR C.NOMBRES
              LIKE @search

            OR C.APELLIDO_PATERNO
              LIKE @search

            OR C.APELLIDO_MATERNO
              LIKE @search

            OR C.DOCUMENTO_CLIENTE
              LIKE @search

            OR CO.DOCUMENTO_CONSULTADO
              LIKE @search

            OR ISNULL(
              CO.SERVICIO,
              'RRCC'
            )
              LIKE @search
          )

          AND
          (
            @estado = ''

            OR CO.ESTADO =
               @estado
          )

          AND
          (
            @servicio = ''

            OR ISNULL(
              CO.SERVICIO,
              'RRCC'
            ) =
               @servicio
          )

        ORDER BY
          CO.ID_CONSUMO DESC

        OFFSET
          @offset ROWS

        FETCH NEXT
          @limit ROWS ONLY
      `);


  // ==================================================
  // MAPEAR RESPUESTA
  // ==================================================

  const consumos =
    result.recordset.map(
      (registro) => {


        const nombreCliente =
          registro.RAZON_SOCIAL ||
          [
            registro.NOMBRES,

            registro.APELLIDO_PATERNO,

            registro.APELLIDO_MATERNO,
          ]
            .filter(Boolean)
            .join(" ");


        return {

          idConsumo:
            registro.ID_CONSUMO,

          idCliente:
            registro.ID_CLIENTE,

          idToken:
            registro.ID_TOKEN,

          idMovimiento:
            registro.ID_MOVIMIENTO,


          // ------------------------------------------
          // CLIENTE
          // ------------------------------------------

          cliente: {

            nombre:
              nombreCliente,

            tipoDocumento:
              registro
                .TIPO_DOCUMENTO_CLIENTE,

            documento:
              registro
                .DOCUMENTO_CLIENTE,
          },


          // ------------------------------------------
          // DOCUMENTO CONSULTADO
          // ------------------------------------------

          consulta: {

            tipoDocumento:
              registro
                .TIPO_DOCUMENTO_CONSULTADO,

            documento:
              registro
                .DOCUMENTO_CONSULTADO,
          },


          // ------------------------------------------
          // SERVICIO
          // ------------------------------------------

          servicio:
            registro.SERVICIO ||
            "RRCC",


          // ------------------------------------------
          // CONSUMO
          // ------------------------------------------

          creditosConsumidos:
            Number(
              registro
                .CREDITOS_CONSUMIDOS ||
              0
            ),

          estado:
            registro.ESTADO,

          httpStatus:
            registro.HTTP_STATUS,

          mensaje:
            registro.MENSAJE,

          ipOrigen:
            registro.IP_ORIGEN,

          duracionMs:
            registro.DURACION_MS,

          fecha:
            registro.FECHA,
        };
      }
    );


  // ==================================================
  // RESPUESTA
  // ==================================================

  return {

    consumos,

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