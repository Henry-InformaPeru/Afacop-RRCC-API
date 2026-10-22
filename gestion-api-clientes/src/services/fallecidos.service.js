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

  const texto =
    String(valor)
      .trim();

  return texto || null;
}


// ==================================================
// NORMALIZAR FECHA (YYYY-MM-DD)
// ==================================================

function normalizarFecha(
  valor
) {

  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {

    return null;
  }

  if (valor instanceof Date) {

    return valor
      .toISOString()
      .split("T")[0];
  }

  const texto =
    String(valor)
      .trim();

  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) {

    return texto.substring(0, 10);
  }

  return texto || null;
}


// ==================================================
// CONSULTAR FALLECIDOS
// ==================================================

export async function consultarFallecidos({

  tipoDocumento,
  documento,

}) {

  // ==================================================
  // 1. VALIDAR DOCUMENTO
  // ==================================================

  const datos =
    validarDocumento(
      tipoDocumento,
      documento
    );


  // ==================================================
  // 2. EXTRAER DNI PARA BÚSQUEDA
  //
  // Si tipoDocumento es RUC (11 dígitos) y empieza con 10,
  // el DNI corresponde a los 8 dígitos centrales (pos 2 a 10).
  // ==================================================

  let dniBusqueda =
    datos.documento;

  if (
    datos.tipoDocumento === "RUC" &&
    datos.documento.startsWith("10")
  ) {

    dniBusqueda =
      datos.documento.substring(2, 10);
  }


  // ==================================================
  // 3. CONEXIÓN SQL SERVER
  // ==================================================

  const pool =
    await getSqlPool();

  let result;


  try {

    // ==================================================
    // 4. CONSULTAR OPERADOR.FALLECIDOS
    // ==================================================

    result =
      await pool
        .request()
        .input(
          "dni",
          sql.VarChar(30),
          dniBusqueda
        )
        .query(`
          SELECT TOP 1
            DNI,
            APE_PAT,
            APE_MAT,
            PRENOMBRES,
            DERESTRICCION,
            FECHA_NACIMIENTO,
            FECHA_FALLECIMIENTO
          FROM
            Buscador.Operador.Fallecidos
          WHERE
            DNI = @dni
        `);

  } catch (error) {

    console.error(
      "Error consultando Operador.Fallecidos:",
      error
    );

    throw crearError(
      "No se pudo consultar el servicio de fallecidos.",
      500,
      "FALLECIDOS_QUERY_ERROR"
    );
  }


  // ==================================================
  // 5. SIN INFORMACIÓN
  // ==================================================

  if (
    !result.recordset ||
    result.recordset.length === 0
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

      error:
        "No se encontró información de fallecimiento para el documento consultado.",

      code:
        "FALLECIDOS_SIN_DATOS",
    };
  }


  // ==================================================
  // 6. MAPEAR RESPUESTA
  // ==================================================

  const registro =
    result.recordset[0];

  const apellidoPaterno =
    normalizarTexto(
      registro.APE_PAT
    );

  const apellidoMaterno =
    normalizarTexto(
      registro.APE_MAT
    );

  const nombre =
    normalizarTexto(
      registro.PRENOMBRES
    );

  const restriccion =
    normalizarTexto(
      registro.DERESTRICCION
    );

  const fechaNacimiento =
    normalizarFecha(
      registro.FECHA_NACIMIENTO
    );

  const fechaFallecimiento =
    normalizarFecha(
      registro.FECHA_FALLECIMIENTO
    );


  // ==================================================
  // 7. RESPUESTA EXITOSA
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

    data: {
      tipoDocumento:
        datos.tipoDocumento,

      documento:
        datos.documento,

      apellidoPaterno,

      apellidoMaterno,

      nombre,

      restriccion,

      fechaNacimiento,

      fechaFallecimiento,
    },
  };
}
