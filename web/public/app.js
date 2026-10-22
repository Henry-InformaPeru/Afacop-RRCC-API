const inputDni =
  document.getElementById("dni");

const btnConsultar =
  document.getElementById(
    "btnConsultar"
  );

const resultado =
  document.getElementById(
    "resultado"
  );


async function consultar() {

  const dni =
    inputDni.value.trim();


  if (!/^\d{8}$/.test(dni)) {

    resultado.textContent =
      JSON.stringify(
        {
          error:
            "El DNI debe contener exactamente 8 dígitos.",
          code:
            "INVALID_DNI",
        },
        null,
        2
      );

    return;
  }


  btnConsultar.disabled = true;

  resultado.textContent =
    "Consultando...";


  try {

    const response =
      await fetch(
        "/api/consulta",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              dni,
            }),
        }
      );


    const data =
      await response.json();


    resultado.textContent =
      JSON.stringify(
        data,
        null,
        2
      );

  } catch (error) {

    resultado.textContent =
      JSON.stringify(
        {
          error:
            "No se pudo realizar la consulta.",
          code:
            "CONNECTION_ERROR",
        },
        null,
        2
      );

  } finally {

    btnConsultar.disabled = false;

  }

}


btnConsultar.addEventListener(
  "click",
  consultar
);


inputDni.addEventListener(
  "keydown",
  event => {

    if (event.key === "Enter") {
      consultar();
    }

  }
);


// Solo permite números

inputDni.addEventListener(
  "input",
  () => {

    inputDni.value =
      inputDni.value.replace(
        /\D/g,
        ""
      );

  }
);