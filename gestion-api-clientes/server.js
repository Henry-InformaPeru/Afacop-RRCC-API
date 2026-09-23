import "dotenv/config";

import app from "./src/app.js";

const PORT =
  Number(process.env.PORT) || 4200;

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Gestion API Clientes ejecutándose en http://localhost:${PORT}`
    );
  }
);