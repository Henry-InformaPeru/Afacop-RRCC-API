import {
  getSqlPool,
  sql,
} from "../config/sqlserver.js";


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
// NORMALIZAR NÚMERO
// ==================================================

function normalizarNumero(
  valor
) {

  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {

    return 0;
  }

  const num =
    Number(valor);

  return Number.isFinite(num)
    ? num
    : 0;
}


// ==================================================
// VALIDAR DOCUMENTO
// ==================================================

export function validarDocumento(
  tipoDocumento,
  documento
) {

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

  // Compatibilidad con alias
  if (
    tipoDocumento === "CARNET DE EXTRANJERIA" ||
    tipoDocumento === "CARNET DE EXTRANJERÍA" ||
    tipoDocumento === "CARNET_EXTRANJERIA" ||
    tipoDocumento === "CARNET_DE_EXTRANJERIA"
  ) {
    tipoDocumento = "CE";
  }

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
    tipoDocumento ===
      "PASAPORTE" &&
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

  return {
    tipoDocumento,
    documento,
  };
}


// ==================================================
// CONSULTAR RRCC
//
// Devuelve la información limpia agrupada en el
// arreglo periodos (ordenado del más actual al más antiguo),
// sin repetir el mes más reciente en la raíz.
// ==================================================

export async function consultarRRCC({

  tipoDocumento,
  documento,

}) {

  const datos =
    validarDocumento(
      tipoDocumento,
      documento
    );

  const pool =
    await getSqlPool();

  let califResult;
  let deudaResult;
  let lineasResult;

  try {

    const docParam =
      datos.documento;

    // 1. Calificaciones por periodo
    califResult =
      await pool
        .request()
        .input(
          "doc",
          sql.VarChar(20),
          docParam
        )
        .query(`
          SELECT
            PERIODO,
            CODIGOSBS,
            NOR,
            CPP,
            DEF,
            DUD,
            PER,
            REPORTAN,
            APE_PAT,
            APE_MAT,
            PRI_NOMBRE,
            SEG_NOMBRE,
            FECHA_CARGA
          FROM Buscador.[RRCC].[Calificacion]
          WHERE DOCUMENTO = @doc
          ORDER BY PERIODO DESC, FECHA_CARGA DESC
        `);

    // 2. Deudas por periodo
    deudaResult =
      await pool
        .request()
        .input(
          "doc",
          sql.VarChar(20),
          docParam
        )
        .query(`
          SELECT
            PERIODO,
            CODIGOSBS,
            RAZONSOCIAL,
            CODIGOEMPRESA,
            ENTIDAD,
            TIPO_DEUDA,
            DIAS,
            CALIFICACION,
            SALDO,
            FECHA_CARGA
          FROM Buscador.[RRCC].[Deuda]
          WHERE DOCUMENTO = @doc
          ORDER BY PERIODO DESC, ENTIDAD, TIPO_DEUDA
        `);

    // 3. Líneas de crédito por periodo
    lineasResult =
      await pool
        .request()
        .input(
          "doc",
          sql.VarChar(20),
          docParam
        )
        .query(`
          SELECT
            PERIODO,
            CODIGOSBS,
            RAZONSOCIAL,
            CODIGOEMPRESA,
            ENTIDAD,
            TIPO,
            LINEA_CREDITO,
            LINEA_NO_UTILIZADA,
            LINEA_UTILIZADA,
            FECHA_CARGA
          FROM Buscador.[RRCC].[LineasCredito]
          WHERE DOCUMENTO = @doc
          ORDER BY PERIODO DESC, ENTIDAD
        `);

  } catch (error) {

    console.error(
      "Error consultando RRCC en SQL Server:",
      error
    );

    throw crearError(
      "No se pudo consultar el servicio RRCC.",
      500,
      "RRCC_QUERY_ERROR"
    );
  }

  const calificaciones =
    califResult.recordset;

  const deudas =
    deudaResult.recordset;

  const lineas =
    lineasResult.recordset;

  // Si no se encontró ningún dato en ninguna de las 3 tablas
  if (
    calificaciones.length === 0 &&
    deudas.length === 0 &&
    lineas.length === 0
  ) {

    return {
      status: 404,
      ok: false,
      tipoDocumento: datos.tipoDocumento,
      documento: datos.documento,
      data: {
        error:
          "No se encontró información crediticia para el documento consultado.",
        code:
          "RRCC_CLIENT_NOT_FOUND",
      },
    };
  }

  // Determinar Nombre / Razón Social y Código SBS
  const c0 = calificaciones[0];
  const d0 = deudas[0];
  const l0 = lineas[0];

  const codigoSbs =
    c0?.CODIGOSBS ||
    d0?.CODIGOSBS ||
    l0?.CODIGOSBS ||
    "";

  let nombreFinal = "";

  const esRuc =
    datos.tipoDocumento === "RUC" ||
    datos.documento.length === 11;

  if (esRuc) {
    // Para RUC / Empresas: Razón Social íntegra sin alteración
    nombreFinal =
      c0?.APE_PAT ||
      d0?.RAZONSOCIAL ||
      l0?.RAZONSOCIAL ||
      "";
  } else {
    // Para Personas Naturales: [APE_PAT] [APE_MAT] [PRI_NOMBRE] [SEG_NOMBRE]
    if (c0) {
      nombreFinal = [
        c0.APE_PAT,
        c0.APE_MAT,
        c0.PRI_NOMBRE,
        c0.SEG_NOMBRE,
      ]
        .filter(Boolean)
        .map(s => String(s).trim())
        .filter(Boolean)
        .join(" ");
    } else {
      nombreFinal =
        d0?.RAZONSOCIAL ||
        l0?.RAZONSOCIAL ||
        "";
    }
  }

  // Agrupar todos los periodos presentes ordenados de más reciente a más antiguo
  const periodosSet = new Set();

  calificaciones.forEach(
    r => r.PERIODO && periodosSet.add(String(r.PERIODO).trim())
  );

  deudas.forEach(
    r => r.PERIODO && periodosSet.add(String(r.PERIODO).trim())
  );

  lineas.forEach(
    r => r.PERIODO && periodosSet.add(String(r.PERIODO).trim())
  );

  const periodosOrdenados =
    Array.from(periodosSet).sort((a, b) => b.localeCompare(a));

  const periodos = periodosOrdenados.map((periodo) => {

    const c = calificaciones.find(
      r => String(r.PERIODO).trim() === periodo
    );

    const rating = c
      ? {
          NOR: Number(c.NOR ?? 0),
          CPP: Number(c.CPP ?? 0),
          DEF: Number(c.DEF ?? 0),
          DUD: Number(c.DUD ?? 0),
          PER: Number(c.PER ?? 0),
          reportan: Number(String(c.REPORTAN ?? "0").trim()) || 0,
        }
      : null;

    const deudasPeriodo = deudas
      .filter(d => String(d.PERIODO).trim() === periodo)
      .map(d => ({
        entidad: normalizarTexto(d.ENTIDAD),
        tipoDeuda: normalizarTexto(d.TIPO_DEUDA),
        calificacion: normalizarTexto(d.CALIFICACION),
        saldo: normalizarNumero(d.SALDO),
        dias: normalizarNumero(d.DIAS),
      }));

    const lineasPeriodo = lineas
      .filter(l => String(l.PERIODO).trim() === periodo)
      .map(l => {
        const lineaCredito = normalizarNumero(l.LINEA_CREDITO);
        const lineaUtilizada = normalizarNumero(l.LINEA_UTILIZADA);
        const lineaNoUtilizada = normalizarNumero(l.LINEA_NO_UTILIZADA);

        const porcentajeUtilizado =
          lineaCredito > 0
            ? (lineaUtilizada / lineaCredito) * 100
            : 0;

        const porcentajeNoUtilizado =
          lineaCredito > 0
            ? (lineaNoUtilizada / lineaCredito) * 100
            : 0;

        return {
          entidad: normalizarTexto(l.ENTIDAD),
          tipo: normalizarTexto(l.TIPO),
          lineaCredito,
          lineaUtilizada,
          lineaNoUtilizada,
          porcentajeUtilizado: Number(porcentajeUtilizado.toFixed(2)),
          porcentajeNoUtilizado: Number(porcentajeNoUtilizado.toFixed(2)),
        };
      });

    return {
      periodo,
      fechaCarga: c?.FECHA_CARGA ?? null,
      rating,
      deudas: deudasPeriodo,
      lineas: lineasPeriodo,
    };
  });

  return {
    status: 200,
    ok: true,
    tipoDocumento: datos.tipoDocumento,
    documento: datos.documento,
    data: {
      documento: datos.documento,
      tipoDocumento: datos.tipoDocumento,
      codigoSbs: normalizarTexto(codigoSbs),
      nombre: normalizarTexto(nombreFinal),
      periodos,
    },
  };
}
