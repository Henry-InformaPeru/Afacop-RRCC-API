import { Router } from "express";

import {
  evaluarPersona,
} from "../services/rrcc.service.js";

import {
  apiKeyMiddleware,
} from "../middleware/apiKey.js";


const router = Router();

router.get(
  "/evaluar/:dni",
  apiKeyMiddleware,
  async (req, res) => {
    try {
      const dni = String(
        req.params.dni ?? ""
      ).trim();

      const resultado =
        await evaluarPersona(dni);

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