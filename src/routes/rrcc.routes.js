import { Router } from "express";

import {
  evaluarPersona,
} from "../services/rrcc.service.js";

import {
  apiKeyMiddleware,
} from "../middleware/apiKey.js";

const router = Router();

router.get(
  "/evaluar/:documento",
  apiKeyMiddleware,
  async (req, res) => {
    try {
      const documento = String(
        req.params.documento ?? ""
      ).trim();

      const resultado =
        await evaluarPersona(documento);

      return res.status(200).json({
        data: resultado,
      });

    } catch (error) {
      console.error(
        "Error evaluando RRCC:",
        error
      );

      return res
        .status(
          error.statusCode || 500
        )
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