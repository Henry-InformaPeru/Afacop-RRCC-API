import { Router } from "express";
import { buscarPersonasPorLote } from "../services/personas.service.js";
import { apiKeyMiddleware } from "../middleware/apiKey.js";

const router = Router();

router.post(
  "/buscar-lote",
  apiKeyMiddleware,
  async (req, res) => {
    try {
      const { documentos } = req.body || {};

      if (!documentos || !Array.isArray(documentos)) {
        return res.status(400).json({
          error: "El cuerpo de la petición debe contener un array 'documentos'.",
          code: "INVALID_BODY",
        });
      }

      const resultado = await buscarPersonasPorLote(documentos);

      return res.status(200).json({
        data: resultado,
      });
    } catch (error) {
      console.error("Error buscando personas por lote:", error);

      return res
        .status(error.statusCode || 500)
        .json({
          error:
            error.statusCode
              ? error.message
              : "Error interno del servidor.",
          code:
            error.code ||
            "INTERNAL_ERROR",
        });
    }
  }
);

export default router;
