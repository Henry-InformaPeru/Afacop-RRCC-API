import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";

import {
  validarDocumento,
} from "./consulta.service.js";


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
// NORMALIZAR TEXTO
// ==================================================

function normalizarTexto(
  valor
) {

  if (
    valor === null ||
    valor === undefined
  ) {

    return null;
  }


  return String(valor)
    .trim();
}


// ==================================================
// NORMALIZAR NÚMERO
//
// IMPORTANTE:
// NULL se mantiene como NULL.
// No lo convertimos a 0.
// ==================================================

function normalizarNumero(
  valor
) {

  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {

    return null;
  }


  const numero =
    Number(valor);


  return Number.isFinite(numero)
    ? numero
    : null;
}


// ==================================================
// MAPEAR REGISTRO DE SUELDOS
// ==================================================

function mapearRegistro(
  registro,
  tipoDocumento,
  fechaConsulta
) {

  return {

    periodo:
      normalizarTexto(
        registro.PERIODO
      ),

    tipoDocumento:
      normalizarTexto(
        tipoDocumento
      ),

    documento:
      normalizarTexto(
        registro.DOCUMENTO
      ),

    nombres:
      normalizarTexto(
        registro.APENOM
      ),

    ruc:
      normalizarTexto(
        registro.RUC
      ),

    empresa:
      normalizarTexto(
        registro.EMPRESA
      ),

    rangoSueldo:
      normalizarTexto(
        registro.RANGO_SUELDO
      ),

    nivelIngreso:
      normalizarTexto(
        registro.NIVEL_INGRESO
      ),

    sueldo:
      normalizarNumero(
        registro.SUELDO
      ),

    fechaConsulta:
      fechaConsulta,

  };
}


// ==================================================
// CONSULTAR SUELDOS
// ==================================================

export async function consultarSueldos({

  tipoDocumento,
  documento,

}) {

  // ==================================================
  // 1. VALIDAR DOCUMENTO
  //
  // Reutilizamos exactamente las mismas reglas de:
  //
  // DNI
  // RUC
  // CE
  // PASAPORTE
  // ==================================================

  const datos =
    validarDocumento(
      tipoDocumento,
      documento
    );


  // ==================================================
  // 2. CONEXIÓN SQL SERVER
  // ==================================================

  const pool =
    await getSqlPool();


  let result;


  try {

    // ==================================================
    // 3. CONSULTAR OPERADOR.SUELDOS
    //
    // Por ahora buscamos por DOCUMENTO.
    //
    // No usamos TIPODOC como filtro hasta que
    // negocio confirme la equivalencia completa
    // de códigos 03, 06, 08, 09, etc.
    //
    // Importante:
    // utilizamos igualdad directa y no LTRIM/RTRIM
    // sobre la columna para permitir que SQL Server
    // pueda aprovechar un índice en DOCUMENTO.
    // ==================================================

    result =
  await pool
    .request()

    .input(
      "documento",
      sql.VarChar(30),
      datos.documento
    )

    .query(`
      SELECT
        PERIODO,
        DOCUMENTO,
        APENOM,
        RUC,
        EMPRESA,
        RANGO_SUELDO,
        NIVEL_INGRESO,
        SUELDO

      FROM
        Buscador.Operador.Sueldos

      WHERE
        DOCUMENTO =
          @documento

      ORDER BY
        PERIODO DESC,
        FECHA_CARGA DESC,
        ID DESC
    `);


  } catch (error) {

    console.error(
      "Error consultando Operador.Sueldos:",
      error
    );


    throw crearError(
      "No se pudo consultar el servicio de sueldos.",
      500,
      "SUELDOS_QUERY_ERROR"
    );
  }


  // ==================================================
  // 4. MAPEAR RESULTADOS
  // ==================================================

  const fechaConsulta =
  new Date().toISOString();


    const registros =
    result.recordset.map(
        (registro) =>
        mapearRegistro(
            registro,
            datos.tipoDocumento,
            fechaConsulta
        )
    );


  // ==================================================
  // 5. SIN INFORMACIÓN
  // ==================================================

  if (
    registros.length === 0
  ) {

    return {

      status:
        404,

      ok:
        false,

      tipoDocumento:
        datos.tipoDocumento,

      documento:
        datos.documento,

      data: {

        error:
          "No se encontró información de sueldos para el documento consultado.",

        code:
          "SUELDOS_SIN_DATOS",

      },
    };
  }


  // ==================================================
  // 6. RESPUESTA EXITOSA
  // ==================================================

    return {

    status:
        200,

    ok:
        true,

    tipoDocumento:
        datos.tipoDocumento,

    documento:
        datos.documento,

    data:
        registros,
    };
}