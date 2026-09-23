import os
import json
import requests

from flask import (
    Flask,
    render_template,
    request,
    redirect,
    url_for,
    make_response,
)

from dotenv import load_dotenv


load_dotenv()


app = Flask(__name__)


BACKEND_URL = os.getenv(
    "BACKEND_URL",
    "http://localhost:4200"
).rstrip("/")


# --------------------------------------------------
# LOGIN
# --------------------------------------------------

@app.route("/", methods=["GET", "POST"])
def login():

    error = None

    # Si ya tiene cookie, comprobar sesión
    token = request.cookies.get(
        "admin_session"
    )

    if (
        request.method == "GET"
        and token
    ):

        try:

            response_backend = requests.get(
                f"{BACKEND_URL}/api/admin/auth/me",
                cookies={
                    "admin_session": token
                },
                timeout=10
            )

            if response_backend.ok:
                return redirect(
                    url_for("dashboard")
                )

        except requests.RequestException:
            pass


    if request.method == "POST":

        usuario = (
            request.form
            .get("usuario", "")
            .strip()
        )

        password = request.form.get(
            "password",
            ""
        )


        if not usuario or not password:

            error = (
                "Ingresa usuario y contraseña."
            )

        else:

            try:

                response_backend = (
                    requests.post(
                        f"{BACKEND_URL}/api/admin/auth/login",
                        json={
                            "usuario": usuario,
                            "password": password,
                        },
                        timeout=10
                    )
                )


                try:
                    resultado = (
                        response_backend.json()
                    )
                except ValueError:
                    resultado = {}


                if response_backend.ok:

                    token = (
                        response_backend.cookies.get(
                            "admin_session"
                        )
                    )


                    if not token:

                        error = (
                            "El backend no devolvió "
                            "la sesión administrativa."
                        )

                    else:

                        response = make_response(
                            redirect(
                                url_for(
                                    "dashboard"
                                )
                            )
                        )


                        response.set_cookie(
                            "admin_session",
                            token,
                            httponly=True,
                            secure=False,
                            samesite="Lax",
                            max_age=(
                                8 * 60 * 60
                            ),
                            path="/"
                        )


                        return response

                else:

                    error = (
                        resultado.get(
                            "error"
                        )
                        or
                        "Usuario o contraseña incorrectos."
                    )


            except requests.RequestException:

                error = (
                    "No se pudo conectar "
                    "con el backend."
                )


    return render_template(
        "login.html",
        error=error
    )


# --------------------------------------------------
# DASHBOARD
# --------------------------------------------------

@app.get("/dashboard")
def dashboard():

    token = request.cookies.get(
        "admin_session"
    )


    if not token:
        return redirect(
            url_for("login")
        )


    try:

        response_backend = requests.get(
            f"{BACKEND_URL}/api/admin/dashboard",
            cookies={
                "admin_session": token
            },
            timeout=10
        )


    except requests.RequestException:

        return render_template(
            "dashboard.html",
            error=(
                "No se pudo conectar "
                "con el backend."
            ),
            data=None
        )


    if response_backend.status_code in (
        401,
        403
    ):

        response = make_response(
            redirect(
                url_for("login")
            )
        )

        response.delete_cookie(
            "admin_session",
            path="/"
        )

        return response


    try:
        resultado = response_backend.json()
    except ValueError:
        resultado = {}


    return render_template(
        "dashboard.html",
        data=resultado.get("data"),
        error=None
    )


# --------------------------------------------------
# LOGOUT
# --------------------------------------------------

@app.post("/logout")
def logout():

    token = request.cookies.get(
        "admin_session"
    )


    if token:

        try:

            requests.post(
                f"{BACKEND_URL}/api/admin/auth/logout",
                cookies={
                    "admin_session": token
                },
                timeout=5
            )

        except requests.RequestException:
            pass


    response = make_response(
        redirect(
            url_for("login")
        )
    )


    response.delete_cookie(
        "admin_session",
        path="/"
    )


    return response


# --------------------------------------------------
# HEALTH
# --------------------------------------------------

@app.get("/health")
def health():

    return {
        "success": True,
        "service": "frontend-python"
    }, 200


# --------------------------------------------------
# CLIENTES
# --------------------------------------------------

@app.get("/clientes")
def clientes():

    token = request.cookies.get(
        "admin_session"
    )

    if not token:
        return redirect(
            url_for("login")
        )

    search = (
        request.args
        .get("search", "")
        .strip()
    )

    page = request.args.get(
        "page",
        "1"
    )

    try:

        response_backend = requests.get(
            f"{BACKEND_URL}/api/admin/clientes",
            params={
                "search": search,
                "page": page,
                "limit": 20,
            },
            cookies={
                "admin_session": token
            },
            timeout=10
        )

    except requests.RequestException:

        return render_template(
            "clientes.html",
            clientes=[],
            paginacion=None,
            search=search,
            error=(
                "No se pudo conectar "
                "con el backend."
            )
        )

    if response_backend.status_code in (
        401,
        403
    ):

        response = make_response(
            redirect(
                url_for("login")
            )
        )

        response.delete_cookie(
            "admin_session",
            path="/"
        )

        return response

    try:
        resultado = response_backend.json()
    except ValueError:
        resultado = {}

    if not response_backend.ok:

        return render_template(
            "clientes.html",
            clientes=[],
            paginacion=None,
            search=search,
            error=(
                resultado.get("error")
                or
                "No fue posible obtener los clientes."
            )
        )

    data = resultado.get(
        "data",
        {}
    )

    return render_template(
        "clientes.html",
        clientes=data.get(
            "clientes",
            []
        ),
        paginacion=data.get(
            "paginacion"
        ),
        search=search,
        error=None
    )

    # --------------------------------------------------
# DETALLE DE CLIENTE
# --------------------------------------------------

@app.get("/clientes/<int:id_cliente>")
def cliente_detalle(id_cliente):

    token = request.cookies.get(
        "admin_session"
    )

    if not token:
        return redirect(
            url_for("login")
        )

    try:

        response_backend = requests.get(
            f"{BACKEND_URL}/api/admin/clientes/{id_cliente}",
            cookies={
                "admin_session": token
            },
            timeout=10
        )

    except requests.RequestException:

        return render_template(
            "cliente_detalle.html",
            data=resultado.get("data"),
            error=request.args.get("error"),
            mensaje=request.args.get("mensaje")
        )


    if response_backend.status_code in (
        401,
        403
    ):

        response = make_response(
            redirect(
                url_for("login")
            )
        )

        response.delete_cookie(
            "admin_session",
            path="/"
        )

        return response


    try:
        resultado = response_backend.json()
    except ValueError:
        resultado = {}


    if not response_backend.ok:

        return render_template(
            "cliente_detalle.html",
            data=None,
            error=(
                resultado.get("error")
                or
                "No fue posible obtener el cliente."
            )
        )


    return render_template(
        "cliente_detalle.html",
        data=resultado.get("data"),
        error=None
    )
    
# --------------------------------------------------
# RECARGAR CRÉDITOS
# --------------------------------------------------

@app.post("/clientes/<int:id_cliente>/creditos")
def cliente_recargar_creditos(id_cliente):

    token = request.cookies.get("admin_session")

    if not token:
        return redirect(url_for("login"))

    cantidad = request.form.get(
        "cantidad",
        ""
    ).strip()

    try:
        cantidad = int(cantidad)
    except ValueError:
        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error="La cantidad de créditos no es válida."
            )
        )

    if cantidad <= 0:
        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error="La cantidad debe ser mayor a 0."
            )
        )

    try:

        response_backend = requests.post(
            f"{BACKEND_URL}/api/admin/clientes/{id_cliente}/creditos",
            json={
                "cantidad": cantidad
            },
            cookies={
                "admin_session": token
            },
            timeout=10
        )

        resultado = response_backend.json()

    except requests.RequestException:

        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error="No se pudo conectar con el backend."
            )
        )

    except ValueError:
        resultado = {}

    if not response_backend.ok:

        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error=resultado.get(
                    "error",
                    "No fue posible recargar créditos."
                )
            )
        )

    return redirect(
        url_for(
            "cliente_detalle",
            id_cliente=id_cliente,
            mensaje=f"Se agregaron {cantidad} créditos correctamente."
        )
    )


# --------------------------------------------------
# CAMBIAR ESTADO DEL CLIENTE
# --------------------------------------------------

@app.post("/clientes/<int:id_cliente>/estado")
def cliente_estado(id_cliente):

    token = request.cookies.get("admin_session")

    if not token:
        return redirect(url_for("login"))

    estado = (
        request.form
        .get("estado", "")
        .strip()
        .upper()
    )

    if estado not in (
        "ACTIVO",
        "BLOQUEADO"
    ):
        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error="Estado no válido."
            )
        )

    try:

        response_backend = requests.patch(
            f"{BACKEND_URL}/api/admin/clientes/{id_cliente}/estado",
            json={
                "estado": estado
            },
            cookies={
                "admin_session": token
            },
            timeout=10
        )

        resultado = response_backend.json()

    except requests.RequestException:

        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error="No se pudo conectar con el backend."
            )
        )

    except ValueError:
        resultado = {}

    if not response_backend.ok:

        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error=resultado.get(
                    "error",
                    "No fue posible actualizar el cliente."
                )
            )
        )

    texto_estado = (
        "activado"
        if estado == "ACTIVO"
        else "bloqueado"
    )

    return redirect(
        url_for(
            "cliente_detalle",
            id_cliente=id_cliente,
            mensaje=f"Cliente {texto_estado} correctamente."
        )
    )


# --------------------------------------------------
# REGENERAR TOKEN
# --------------------------------------------------

@app.post("/clientes/<int:id_cliente>/token/regenerar")
def cliente_regenerar_token(id_cliente):

    token = request.cookies.get("admin_session")

    if not token:
        return redirect(url_for("login"))

    try:

        response_backend = requests.post(
            f"{BACKEND_URL}/api/admin/clientes/{id_cliente}/tokens/regenerar",
            json={},
            cookies={
                "admin_session": token
            },
            timeout=10
        )

        resultado = response_backend.json()

    except requests.RequestException:

        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error="No se pudo conectar con el backend."
            )
        )

    except ValueError:
        resultado = {}

    if not response_backend.ok:

        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error=resultado.get(
                    "error",
                    "No fue posible regenerar el token."
                )
            )
        )

    data = resultado.get(
        "data",
        {}
    )

    response = make_response(
        render_template(
            "token_generado.html",
            id_cliente=id_cliente,
            token=data.get("token"),
            id_token=data.get("idToken")
        )
    )

    # Evita que una página con el token quede cacheada.
    response.headers["Cache-Control"] = (
        "no-store, no-cache, must-revalidate, private"
    )

    return response

# --------------------------------------------------
# NUEVO CLIENTE
# --------------------------------------------------

@app.route(
    "/clientes/nuevo",
    methods=["GET", "POST"]
)
def cliente_nuevo():

    token = request.cookies.get(
        "admin_session"
    )

    if not token:
        return redirect(
            url_for("login")
        )


    if request.method == "GET":

        return render_template(
            "cliente_nuevo.html",
            error=None,
            form={}
        )


    # --------------------------------------------------
    # DATOS DEL FORMULARIO
    # --------------------------------------------------

    tipo_documento = (
        request.form
        .get("tipoDocumento", "")
        .strip()
        .upper()
    )

    documento = (
        request.form
        .get("documento", "")
        .strip()
    )

    razon_social = (
        request.form
        .get("razonSocial", "")
        .strip()
    )

    nombres = (
        request.form
        .get("nombres", "")
        .strip()
    )

    apellido_paterno = (
        request.form
        .get("apellidoPaterno", "")
        .strip()
    )

    apellido_materno = (
        request.form
        .get("apellidoMaterno", "")
        .strip()
    )

    email = (
        request.form
        .get("email", "")
        .strip()
    )

    telefono = (
        request.form
        .get("telefono", "")
        .strip()
    )

    creditos = (
        request.form
        .get("creditosIniciales", "0")
        .strip()
    )

    fecha_vencimiento = (
        request.form
        .get("fechaVencimiento", "")
        .strip()
    )


    # --------------------------------------------------
    # CRÉDITOS
    # --------------------------------------------------

    try:
        creditos = int(creditos)
    except ValueError:
        creditos = -1


    if creditos < 0:

        return render_template(
            "cliente_nuevo.html",
            error=(
                "Los créditos iniciales "
                "no son válidos."
            ),
            form=request.form
        )


    # --------------------------------------------------
    # BODY PARA NODE
    # --------------------------------------------------

    payload = {
        "tipoDocumento":
            tipo_documento,

        "documento":
            documento,

        "razonSocial":
            razon_social or None,

        "nombres":
            nombres or None,

        "apellidoPaterno":
            apellido_paterno or None,

        "apellidoMaterno":
            apellido_materno or None,

        "email":
            email or None,

        "telefono":
            telefono or None,

        "creditosIniciales":
            creditos,

        "fechaVencimiento":
            fecha_vencimiento or None,
    }


    try:

        response_backend = requests.post(
            f"{BACKEND_URL}/api/admin/clientes",

            json=payload,

            cookies={
                "admin_session": token
            },

            timeout=10
        )


        try:
            resultado = (
                response_backend.json()
            )
        except ValueError:
            resultado = {}


    except requests.RequestException:

        return render_template(
            "cliente_nuevo.html",

            error=(
                "No se pudo conectar "
                "con el backend."
            ),

            form=request.form
        )


    # --------------------------------------------------
    # SESIÓN EXPIRADA
    # --------------------------------------------------

    if response_backend.status_code in (
        401,
        403
    ):

        response = make_response(
            redirect(
                url_for("login")
            )
        )

        response.delete_cookie(
            "admin_session",
            path="/"
        )

        return response


    # --------------------------------------------------
    # ERROR DEL BACKEND
    # --------------------------------------------------

    if not response_backend.ok:

        return render_template(
            "cliente_nuevo.html",

            error=(
                resultado.get("error")
                or
                "No fue posible crear el cliente."
            ),

            form=request.form
        )


    # --------------------------------------------------
    # CLIENTE CREADO
    # --------------------------------------------------

    data = resultado.get(
        "data",
        {}
    )


    response = make_response(
        render_template(
            "cliente_creado.html",
            data=data
        )
    )

    response.headers["Cache-Control"] = (
        "no-store, no-cache, "
        "must-revalidate, private"
    )

    return response

# --------------------------------------------------
# CONSUMOS
# --------------------------------------------------

@app.route("/consumos")
def consumos():

    token = request.cookies.get(
        "admin_session"
    )

    if not token:
        return redirect(
            url_for("login")
        )


    search = (
        request.args
        .get("search", "")
        .strip()
    )

    estado = (
        request.args
        .get("estado", "")
        .strip()
        .upper()
    )


    try:
        page = int(
            request.args.get(
                "page",
                1
            )
        )
    except ValueError:
        page = 1


    if page < 1:
        page = 1


    try:

        response_backend = requests.get(
            f"{BACKEND_URL}/api/admin/consumos",

            params={
                "page": page,
                "limit": 20,
                "search": search,
                "estado": estado,
            },

            cookies={
                "admin_session": token
            },

            timeout=10
        )


        try:
            resultado = (
                response_backend.json()
            )
        except ValueError:
            resultado = {}


    except requests.RequestException:

        return render_template(
            "consumos.html",

            consumos=[],

            paginacion={
                "page": 1,
                "total": 0,
                "totalPaginas": 0,
            },

            search=search,
            estado=estado,

            error=(
                "No se pudo conectar "
                "con el backend."
            )
        )


    # --------------------------------------------------
    # SESIÓN EXPIRADA
    # --------------------------------------------------

    if response_backend.status_code in (
        401,
        403
    ):

        response = make_response(
            redirect(
                url_for("login")
            )
        )

        response.delete_cookie(
            "admin_session",
            path="/"
        )

        return response


    # --------------------------------------------------
    # ERROR DEL BACKEND
    # --------------------------------------------------

    if not response_backend.ok:

        return render_template(
            "consumos.html",

            consumos=[],

            paginacion={
                "page": 1,
                "total": 0,
                "totalPaginas": 0,
            },

            search=search,
            estado=estado,

            error=(
                resultado.get("error")
                or
                "No fue posible obtener los consumos."
            )
        )


    data = (
        resultado.get(
            "data",
            {}
        )
    )


    return render_template(
        "consumos.html",

        consumos=
            data.get(
                "consumos",
                []
            ),

        paginacion=
            data.get(
                "paginacion",
                {}
            ),

        search=search,
        estado=estado,
        error=None
    )

# ==================================================
# PORTAL DEL CLIENTE
# ==================================================


# --------------------------------------------------
# INGRESO AL PORTAL
# --------------------------------------------------

@app.route(
    "/portal",
    methods=["GET", "POST"]
)
def portal_login():

    # Si ya tiene sesión del portal,
    # comprobar que todavía sea válida.
    token_actual = request.cookies.get(
        "portal_token"
    )

    if (
        request.method == "GET"
        and token_actual
    ):

        try:

            response_backend = requests.get(
                f"{BACKEND_URL}/api/cliente/cuenta",

                headers={
                    "Authorization":
                        f"Bearer {token_actual}"
                },

                timeout=10
            )

            if response_backend.ok:

                return redirect(
                    url_for(
                        "portal_cuenta"
                    )
                )

        except requests.RequestException:
            pass


    # --------------------------------------------------
    # MOSTRAR LOGIN
    # --------------------------------------------------

    if request.method == "GET":

        return render_template(
            "portal_login.html",
            error=None
        )


    # --------------------------------------------------
    # RECIBIR TOKEN
    # --------------------------------------------------

    token = (
        request.form
        .get("token", "")
        .strip()
    )


    if not token:

        return render_template(
            "portal_login.html",
            error=(
                "Ingresa tu token de acceso."
            )
        )


    # Validación básica para evitar llamadas
    # innecesarias al backend.

    if not token.startswith(
        "rrcc_live_"
    ):

        return render_template(
            "portal_login.html",
            error=(
                "El token ingresado "
                "no tiene un formato válido."
            )
        )


    # --------------------------------------------------
    # VALIDAR CONTRA EL BACKEND
    # --------------------------------------------------

    try:

        response_backend = requests.get(
            f"{BACKEND_URL}/api/cliente/cuenta",

            headers={
                "Authorization":
                    f"Bearer {token}"
            },

            timeout=10
        )


        try:
            resultado = (
                response_backend.json()
            )
        except ValueError:
            resultado = {}


    except requests.RequestException:

        return render_template(
            "portal_login.html",

            error=(
                "No se pudo conectar "
                "con el servidor."
            )
        )


    # --------------------------------------------------
    # TOKEN INVÁLIDO / BLOQUEADO / REVOCADO
    # --------------------------------------------------

    if not response_backend.ok:

        return render_template(
            "portal_login.html",

            error=(
                resultado.get("error")
                or
                "El token no es válido o "
                "no se encuentra activo."
            )
        )


    # --------------------------------------------------
    # CREAR SESIÓN DEL PORTAL
    # --------------------------------------------------

    response = make_response(
        redirect(
            url_for(
                "portal_cuenta"
            )
        )
    )


    response.set_cookie(
        "portal_token",
        token,

        httponly=True,

        secure=(
            os.getenv(
                "NODE_ENV",
                "development"
            )
            == "production"
        ),

        samesite="Lax",

        max_age=
            8 * 60 * 60,

        path="/"
    )


    return response


# --------------------------------------------------
# CUENTA DEL CLIENTE
# --------------------------------------------------

@app.route(
    "/portal/cuenta"
)
def portal_cuenta():

    token = request.cookies.get(
        "portal_token"
    )


    if not token:

        return redirect(
            url_for(
                "portal_login"
            )
        )


    try:

        response_backend = requests.get(
            f"{BACKEND_URL}/api/cliente/cuenta",

            headers={
                "Authorization":
                    f"Bearer {token}"
            },

            timeout=10
        )


        try:

            resultado = (
                response_backend.json()
            )

        except ValueError:

            resultado = {}


    except requests.RequestException:

        return render_template(
            "portal_cuenta.html",

            cuenta=None,

            error=(
                "No se pudo conectar "
                "con el servidor."
            ),

            consulta_json=None,

            consulta_form={}
        )


    # --------------------------------------------------
    # TOKEN VENCIDO / REVOCADO / CLIENTE BLOQUEADO
    # --------------------------------------------------

    if response_backend.status_code in (
        401,
        403
    ):

        response = make_response(
            redirect(
                url_for(
                    "portal_login"
                )
            )
        )

        response.delete_cookie(
            "portal_token",
            path="/"
        )

        return response


    # --------------------------------------------------
    # ERROR OBTENIENDO CUENTA
    # --------------------------------------------------

    if not response_backend.ok:

        return render_template(
            "portal_cuenta.html",

            cuenta=None,

            error=(
                resultado.get("error")
                or
                "No fue posible obtener la cuenta."
            ),

            consulta_json=None,

            consulta_form={}
        )


    # --------------------------------------------------
    # CUENTA CORRECTA
    # --------------------------------------------------

    return render_template(
        "portal_cuenta.html",

        cuenta=
            resultado.get(
                "data",
                {}
            ),

        error=None,

        consulta_json=None,

        consulta_form={}
    )

# --------------------------------------------------
# CERRAR SESIÓN DEL CLIENTE
# --------------------------------------------------

@app.route(
    "/portal/logout",
    methods=["POST"]
)
def portal_logout():

    response = make_response(
        redirect(
            url_for(
                "portal_login"
            )
        )
    )


    response.delete_cookie(
        "portal_token",
        path="/"
    )


    return response

# --------------------------------------------------
# CONSULTA RRCC DESDE EL PORTAL
# --------------------------------------------------

@app.route(
    "/portal/consulta",
    methods=["POST"]
)
def portal_consulta():

    token = request.cookies.get(
        "portal_token"
    )


    if not token:

        return redirect(
            url_for(
                "portal_login"
            )
        )


    tipo_documento = (
        request.form
        .get(
            "tipoDocumento",
            ""
        )
        .strip()
        .upper()
    )


    documento = (
        request.form
        .get(
            "documento",
            ""
        )
        .strip()
    )


    # --------------------------------------------------
    # VALIDACIÓN BÁSICA
    # --------------------------------------------------

    if not tipo_documento or not documento:

        return redirect(
            url_for(
                "portal_cuenta"
            )
        )


    # --------------------------------------------------
    # REALIZAR CONSULTA
    # --------------------------------------------------

    try:

        response_backend = requests.post(
            f"{BACKEND_URL}/api/cliente/consulta",

            json={
                "tipoDocumento":
                    tipo_documento,

                "documento":
                    documento,
            },

            headers={
                "Authorization":
                    f"Bearer {token}"
            },

            timeout=30
        )


        try:

            resultado_backend = (
                response_backend.json()
            )

        except ValueError:

            resultado_backend = {
                "success": False,
                "error":
                    "El servidor devolvió "
                    "una respuesta no válida."
            }


    except requests.RequestException:

        response_backend = None

        resultado_backend = {
            "success": False,
            "error":
                "No se pudo conectar "
                "con el servidor."
        }


    # --------------------------------------------------
    # TOKEN INVÁLIDO / REVOCADO / CLIENTE BLOQUEADO
    # --------------------------------------------------

    if (
        response_backend is not None
        and
        response_backend.status_code
        in (401, 403)
    ):

        response = make_response(
            redirect(
                url_for(
                    "portal_login"
                )
            )
        )

        response.delete_cookie(
            "portal_token",
            path="/"
        )

        return response


    # --------------------------------------------------
    # OBTENER CUENTA ACTUALIZADA
    # --------------------------------------------------

    cuenta = None


    try:

        response_cuenta = requests.get(
            f"{BACKEND_URL}/api/cliente/cuenta",

            headers={
                "Authorization":
                    f"Bearer {token}"
            },

            timeout=10
        )


        if response_cuenta.ok:

            datos_cuenta = (
                response_cuenta.json()
            )

            cuenta = (
                datos_cuenta.get(
                    "data",
                    {}
                )
            )


    except (
        requests.RequestException,
        ValueError
    ):

        cuenta = None


    # --------------------------------------------------
    # CONVERTIR RESPUESTA COMPLETA A JSON
    # --------------------------------------------------

    consulta_json = json.dumps(
        resultado_backend,
        ensure_ascii=False,
        indent=2
    )


    # --------------------------------------------------
    # MOSTRAR RESPUESTA
    # --------------------------------------------------

    return render_template(
        "portal_cuenta.html",

        cuenta=cuenta,

        error=None,

        consulta_json=
            consulta_json,

        consulta_form={
            "tipoDocumento":
                tipo_documento,

            "documento":
                documento,
        }
    )
# --------------------------------------------------
# EJECUCIÓN
# --------------------------------------------------

if __name__ == "__main__":

    port = int(
        os.getenv(
            "FLASK_PORT",
            "5000"
        )
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )