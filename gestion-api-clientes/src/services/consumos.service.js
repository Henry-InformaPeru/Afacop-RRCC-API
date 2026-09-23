import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


export async function registrarConsumo({
  idCliente,
  idToken,
  idMovimiento = null,

  tipoDocumento,
  documento,

  creditosConsumidos,

  estado,
  httpStatus,

  mensaje = null,
  ipOrigen = null,
  duracionMs = null,
}) {

  const pool =
    await getSqlPool();

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

          TIPO_DOCUMENTO_CONSULTADO,
          DOCUMENTO_CONSULTADO,

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

          @tipoDocumento,
          @documento,

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
      result.recordset[0]
        .ID_CONSUMO,
  };
}

// --------------------------------------------------
// LISTAR CONSUMOS PARA ADMINISTRACIÓN
// --------------------------------------------------

export async function listarConsumos({
  page = 1,
  limit = 20,
  search = "",
  estado = "",
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
    String(search || "")
      .trim();

  estado =
    String(estado || "")
      .trim()
      .toUpperCase();

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
    estado = "";
  }

  const offset =
    (page - 1) * limit;


  const pool =
    await getSqlPool();


  // --------------------------------------------------
  // TOTAL DE REGISTROS
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
        "estado",
        sql.VarChar(30),
        estado
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
          )

          AND
          (
            @estado = ''

            OR CO.ESTADO =
               @estado
          )
      `);


  const total =
    Number(
      totalResult
        .recordset[0]
        .TOTAL
    );


  // --------------------------------------------------
  // OBTENER CONSUMOS
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
        "estado",
        sql.VarChar(30),
        estado
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

          CO.TIPO_DOCUMENTO_CONSULTADO,
          CO.DOCUMENTO_CONSULTADO,

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
          )

          AND
          (
            @estado = ''

            OR CO.ESTADO =
               @estado
          )

        ORDER BY
          CO.ID_CONSUMO DESC

        OFFSET
          @offset ROWS

        FETCH NEXT
          @limit ROWS ONLY
      `);


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


          consulta: {
            tipoDocumento:
              registro
                .TIPO_DOCUMENTO_CONSULTADO,

            documento:
              registro
                .DOCUMENTO_CONSULTADO,
          },


          creditosConsumidos:
            Number(
              registro
                .CREDITOS_CONSUMIDOS
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


  return {

    consumos,

    paginacion: {
      page,
      limit,
      total,

      totalPaginas:
        Math.ceil(
          total / limit
        ),
    },
  };
}