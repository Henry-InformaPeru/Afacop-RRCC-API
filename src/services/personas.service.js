import {
  getRrccPool,
  sql,
} from "../config/sqlserver.js";

/**
 * Consulta un lote de personas en SQL Server por DNI.
 * @param {string[]} documentos - Lista de números de documento / DNI
 * @returns {Promise<Array<{ DNI: string, PRENOMBRES: string, APE_PAT: string, APE_MAT: string }>>}
 */
export async function buscarPersonasPorLote(documentos) {
  if (!Array.isArray(documentos) || documentos.length === 0) {
    return [];
  }

  // Sanitizar, filtrar vacíos y eliminar duplicados
  const listaLimpia = [
    ...new Set(
      documentos
        .map((doc) => String(doc ?? "").trim())
        .filter((doc) => doc.length > 0)
    ),
  ];

  if (listaLimpia.length === 0) {
    return [];
  }

  // Limitar el tamaño de lote por petición para proteger el rendimiento de la BD
  const MAX_LOTE = 2000;
  if (listaLimpia.length > MAX_LOTE) {
    const error = new Error(
      `El lote no puede exceder los ${MAX_LOTE} documentos por consulta.`
    );
    error.statusCode = 400;
    error.code = "BATCH_SIZE_EXCEEDED";
    throw error;
  }

  const pool = await getRrccPool();
  const request = pool.request();

  // Generar parámetros dinámicos para evitar inyección SQL
  const paramNames = listaLimpia.map((doc, index) => {
    const paramName = `doc${index}`;
    request.input(paramName, sql.VarChar(20), doc);
    return `@${paramName}`;
  });

  const query = `
    SELECT
      DNI,
      PRENOMBRES,
      APE_PAT,
      APE_MAT
    FROM Operador.Personas
    WHERE DNI IN (${paramNames.join(", ")})
  `;

  const result = await request.query(query);

  const personas = (result.recordset || []).map((row) => ({
    DNI: String(row.DNI ?? "").trim(),
    PRENOMBRES: String(row.PRENOMBRES ?? "").trim(),
    APE_PAT: String(row.APE_PAT ?? "").trim(),
    APE_MAT: String(row.APE_MAT ?? "").trim(),
  }));

  return personas;
}
