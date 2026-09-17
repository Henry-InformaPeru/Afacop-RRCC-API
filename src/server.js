import "dotenv/config";
import app from "./app.js";

const PORT =
  Number(process.env.PORT) || 4100;

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `RRCC-API ejecutándose en http://localhost:${PORT}`
  );
});