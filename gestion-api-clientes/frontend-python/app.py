import os
import json
import requests

from datetime import datetime

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

# --------------------------------------------------
# FORMATO DE FECHAS PARA LAS VISTAS
# --------------------------------------------------

@app.template_filter("fecha")
def formato_fecha(valor):

    if not valor:
        return "-"

    try:

        # Si Flask ya recibe un datetime
        if isinstance(valor, datetime):
            fecha = valor

        else:

            texto = str(valor).strip()

            # Convierte:
            # 2026-09-24T10:55:52.000Z
            # a un datetime válido para Python.
            if texto.endswith("Z"):
                texto = (
                    texto[:-1]
                    + "+00:00"
                )

            fecha = datetime.fromisoformat(
                texto
            )

        return fecha.strftime(
            "%d/%m/%Y %H:%M:%S"
        )

    except (
        ValueError,
        TypeError
    ):

        # Si llega un formato inesperado,
        # evitamos romper la página.
        return str(valor)

@app.template_filter("periodo")
def formato_periodo(valor):

    if valor is None:
        return "-"

    texto = str(valor).strip()

    if (
        len(texto) != 6
        or
        not texto.isdigit()
    ):
        return texto or "-"

    anio = texto[:4]

    try:
        mes = int(
            texto[4:6]
        )
    except ValueError:
        return texto


    meses = [
        "Enero",
        "Febrero",
        "Marzo",
        "Abril",
        "Mayo",
        "Junio",
        "Julio",
        "Agosto",
        "Septiembre",
        "Octubre",
        "Noviembre",
        "Diciembre",
    ]


    if (
        mes < 1
        or
        mes > 12
    ):
        return texto


    return (
        f"{meses[mes - 1]} "
        f"{anio}"
    )


# --------------------------------------------------
# FORMATO MONEDA
# --------------------------------------------------

@app.template_filter("moneda")
def formato_moneda(valor):

    try:

        numero = float(
            valor or 0
        )

        return (
            f"S/ {numero:,.2f}"
        )

    except (
        TypeError,
        ValueError
    ):

        return "S/ 0.00"

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
        error=error,
        mensaje=request.args.get(
            "mensaje"
        )
    )

# --------------------------------------------------
# ACCESO ADMINISTRATIVO /admin
# --------------------------------------------------

@app.route("/admin", methods=["GET", "POST"])
def admin_login_alias():
    return login()

# ==================================================
# RECUPERAR CONTRASEÑA
# ==================================================

@app.route(
    "/admin/recuperar-password",
    methods=["GET", "POST"]
)
def forgot_password():

    error = None
    mensaje = None
    debug_reset_url = None

    email = (
        request.form
        .get("email", "")
        .strip()
    )


    # ----------------------------------------------
    # MOSTRAR FORMULARIO
    # ----------------------------------------------

    if request.method == "GET":

        response = make_response(
            render_template(
                "forgot_password.html",
                error=None,
                mensaje=None,
                email="",
                debug_reset_url=None
            )
        )

        response.headers["Cache-Control"] = (
            "no-store, no-cache, "
            "must-revalidate, private"
        )

        response.headers["Pragma"] = (
            "no-cache"
        )

        return response


    # ----------------------------------------------
    # VALIDACIÓN BÁSICA
    # ----------------------------------------------

    if not email:

        error = (
            "Ingresa tu correo electrónico."
        )

        return render_template(
            "forgot_password.html",
            error=error,
            mensaje=None,
            email=email,
            debug_reset_url=None
        )


    # ----------------------------------------------
    # SOLICITAR RECUPERACIÓN AL BACKEND
    # ----------------------------------------------

    try:

        response_backend = requests.post(

            f"{BACKEND_URL}"
            "/api/admin/auth/forgot-password",

            json={
                "email": email
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
            "forgot_password.html",
            error=(
                "No se pudo conectar "
                "con el servidor."
            ),
            mensaje=None,
            email=email,
            debug_reset_url=None
        )


    # ----------------------------------------------
    # ERROR DEL BACKEND
    # ----------------------------------------------

    if not response_backend.ok:

        return render_template(
            "forgot_password.html",
            error=(
                resultado.get("error")
                or
                "No fue posible procesar "
                "la recuperación."
            ),
            mensaje=None,
            email=email,
            debug_reset_url=None
        )


    # ----------------------------------------------
    # RESPUESTA GENÉRICA
    # ----------------------------------------------

    mensaje = (
        resultado.get("message")
        or
        "Si el correo está registrado, "
        "recibirás un enlace para "
        "restablecer tu contraseña."
    )


    # ----------------------------------------------
    # SOLO DESARROLLO
    #
    # El backend únicamente devuelve esto cuando
    # PASSWORD_RESET_DEBUG=true.
    # ----------------------------------------------

    debug_data = (
        resultado.get("debug")
        or {}
    )

    debug_reset_url = (
        debug_data.get(
            "resetUrl"
        )
    )


    response = make_response(

        render_template(
            "forgot_password.html",
            error=None,
            mensaje=mensaje,
            email=email,
            debug_reset_url=debug_reset_url
        )
    )


    response.headers["Cache-Control"] = (
        "no-store, no-cache, "
        "must-revalidate, private"
    )

    response.headers["Pragma"] = (
        "no-cache"
    )

    return response


# ==================================================
# RESTABLECER CONTRASEÑA
# ==================================================

@app.route(
    "/admin/restablecer-password",
    methods=["GET", "POST"]
)
def reset_password():

    # ==================================================
    # GET
    # ==================================================

    if request.method == "GET":

        token = (
            request.args
            .get("token", "")
            .strip()
        )


        if not token:

            response = make_response(

                render_template(
                    "reset_password.html",
                    token="",
                    token_valido=False,
                    error=(
                        "El enlace de recuperación "
                        "no es válido."
                    )
                )
            )

            response.headers["Cache-Control"] = (
                "no-store, no-cache, "
                "must-revalidate, private"
            )

            response.headers["Pragma"] = (
                "no-cache"
            )

            response.headers["Referrer-Policy"] = (
                "no-referrer"
            )

            return response


        # ------------------------------------------
        # VALIDAR TOKEN CONTRA EL BACKEND
        # ------------------------------------------

        try:

            response_backend = requests.get(

                f"{BACKEND_URL}"
                "/api/admin/auth/"
                "reset-password/validate",

                params={
                    "token": token
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

            response = make_response(

                render_template(
                    "reset_password.html",
                    token="",
                    token_valido=False,
                    error=(
                        "No se pudo validar "
                        "el enlace."
                    )
                )
            )

            response.headers["Cache-Control"] = (
                "no-store, no-cache, "
                "must-revalidate, private"
            )

            response.headers["Pragma"] = (
                "no-cache"
            )

            response.headers["Referrer-Policy"] = (
                "no-referrer"
            )

            return response


        # ------------------------------------------
        # TOKEN INVÁLIDO / EXPIRADO / UTILIZADO
        # ------------------------------------------

        if not response_backend.ok:

            response = make_response(

                render_template(
                    "reset_password.html",
                    token="",
                    token_valido=False,
                    error=(
                        resultado.get("error")
                        or
                        "El enlace no es válido, "
                        "ya fue utilizado o expiró."
                    )
                )
            )

            response.headers["Cache-Control"] = (
                "no-store, no-cache, "
                "must-revalidate, private"
            )

            response.headers["Pragma"] = (
                "no-cache"
            )

            response.headers["Referrer-Policy"] = (
                "no-referrer"
            )

            return response


        # ------------------------------------------
        # TOKEN VÁLIDO
        # ------------------------------------------

        response = make_response(

            render_template(
                "reset_password.html",
                token=token,
                token_valido=True,
                error=None
            )
        )

        response.headers["Cache-Control"] = (
            "no-store, no-cache, "
            "must-revalidate, private"
        )

        response.headers["Pragma"] = (
            "no-cache"
        )

        response.headers["Referrer-Policy"] = (
            "no-referrer"
        )

        return response


    # ==================================================
    # POST
    # ==================================================

    token = (
        request.form
        .get("token", "")
        .strip()
    )

    nueva_password = (
        request.form
        .get("nuevaPassword", "")
    )

    confirmar_password = (
        request.form
        .get("confirmarPassword", "")
    )


    # ----------------------------------------------
    # VALIDACIONES DEL FORMULARIO
    # ----------------------------------------------

    if not token:

        return render_template(
            "reset_password.html",
            token="",
            token_valido=False,
            error=(
                "El enlace de recuperación "
                "no es válido."
            )
        )


    if (
        not nueva_password
        or
        not confirmar_password
    ):

        return render_template(
            "reset_password.html",
            token=token,
            token_valido=True,
            error=(
                "Ingresa y confirma "
                "la nueva contraseña."
            )
        )


    if (
        nueva_password
        !=
        confirmar_password
    ):

        return render_template(
            "reset_password.html",
            token=token,
            token_valido=True,
            error=(
                "Las contraseñas no coinciden."
            )
        )


    if len(nueva_password) < 8:

        return render_template(
            "reset_password.html",
            token=token,
            token_valido=True,
            error=(
                "La contraseña debe tener "
                "al menos 8 caracteres."
            )
        )


    # ----------------------------------------------
    # RESTABLECER CONTRASEÑA
    # ----------------------------------------------

    try:

        response_backend = requests.post(

            f"{BACKEND_URL}"
            "/api/admin/auth/reset-password",

            json={
                "token":
                    token,

                "nuevaPassword":
                    nueva_password,

                "confirmarPassword":
                    confirmar_password
            },

            timeout=15
        )


        try:

            resultado = (
                response_backend.json()
            )

        except ValueError:

            resultado = {}


    except requests.RequestException:

        return render_template(
            "reset_password.html",
            token=token,
            token_valido=True,
            error=(
                "No se pudo conectar "
                "con el servidor."
            )
        )


    # ----------------------------------------------
    # ERROR DEL BACKEND
    # ----------------------------------------------

    if not response_backend.ok:

        codigo = (
            resultado.get("code")
        )


        token_valido = (
            codigo
            not in (
                "INVALID_RESET_TOKEN",
                "RESET_TOKEN_USED",
                "RESET_TOKEN_EXPIRED",
                "RESET_TOKEN_REQUIRED",
            )
        )


        return render_template(
            "reset_password.html",
            token=(
                token
                if token_valido
                else ""
            ),
            token_valido=token_valido,
            error=(
                resultado.get("error")
                or
                "No fue posible restablecer "
                "la contraseña."
            )
        )


    # ----------------------------------------------
    # ÉXITO
    # ----------------------------------------------

    response = make_response(

        redirect(

            url_for(
                "login",

                mensaje=(
                    "Contraseña actualizada "
                    "correctamente. "
                    "Ya puedes iniciar sesión."
                )
            )
        )
    )


    # El backend incrementó SESSION_VERSION.
    # Eliminamos también cualquier cookie admin
    # que pudiera existir en este navegador.

    response.delete_cookie(
        "admin_session",
        path="/"
    )


    return response

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

        # ------------------------------------------
        # DATOS DEL DASHBOARD
        # ------------------------------------------

        response_backend = requests.get(
            f"{BACKEND_URL}/api/admin/dashboard",

            cookies={
                "admin_session": token
            },

            timeout=10
        )


        # ------------------------------------------
        # ADMINISTRADOR ACTUAL
        # ------------------------------------------

        response_admin = requests.get(
            f"{BACKEND_URL}/api/admin/auth/me",

            cookies={
                "admin_session": token
            },

            timeout=10
        )


    except requests.RequestException:

        return render_template(
            "dashboard.html",

            data=None,

            administrador=None,

            error=(
                "No se pudo conectar "
                "con el backend."
            )
        )


    # ----------------------------------------------
    # SESIÓN EXPIRADA / INVALIDADA
    # ----------------------------------------------

    if (
        response_backend.status_code
        in (401, 403)

        or

        response_admin.status_code
        in (401, 403)
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


    # ----------------------------------------------
    # LEER JSON
    # ----------------------------------------------

    try:

        resultado = (
            response_backend.json()
        )

    except ValueError:

        resultado = {}


    try:

        resultado_admin = (
            response_admin.json()
        )

    except ValueError:

        resultado_admin = {}


    # ----------------------------------------------
    # ERROR DASHBOARD
    # ----------------------------------------------

    if not response_backend.ok:

        return render_template(
            "dashboard.html",

            data=None,

            administrador=None,

            error=(
                resultado.get("error")
                or
                "No fue posible obtener "
                "el dashboard."
            )
        )


    # ----------------------------------------------
    # ERROR OBTENIENDO ADMINISTRADOR ACTUAL
    # ----------------------------------------------

    if not response_admin.ok:

        return render_template(
            "dashboard.html",

            data=
                resultado.get(
                    "data"
                ),

            administrador=None,

            error=(
                resultado_admin.get("error")
                or
                "No fue posible obtener "
                "los datos de la sesión."
            )
        )


    # ----------------------------------------------
    # ADMINISTRADOR ACTUAL
    # ----------------------------------------------

    administrador = (
        resultado_admin
        .get("data", {})
        .get("administrador")
    )


    return render_template(
        "dashboard.html",

        data=
            resultado.get(
                "data"
            ),

        administrador=
            administrador,

        error=None
    )

# ==================================================
# ADMINISTRADORES
# SOLO SUPERADMIN
# ==================================================

@app.get("/administradores")
def administradores():

    token = request.cookies.get(
        "admin_session"
    )


    if not token:

        return redirect(
            url_for("login")
        )


    # ----------------------------------------------
    # FILTROS
    # ----------------------------------------------

    search = (
        request.args
        .get("search", "")
        .strip()
    )

    rol = (
        request.args
        .get("rol", "")
        .strip()
        .upper()
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


    # ----------------------------------------------
    # CONSULTAR BACKEND
    # ----------------------------------------------

    try:

        response_backend = requests.get(

            f"{BACKEND_URL}"
            "/api/admin/administradores",

            params={
                "page":
                    page,

                "limit":
                    20,

                "search":
                    search,

                "rol":
                    rol,

                "estado":
                    estado,
            },

            cookies={
                "admin_session":
                    token
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
            "administradores.html",

            administradores=[],

            paginacion={
                "page": 1,
                "total": 0,
                "totalPaginas": 0,
            },

            search=search,
            rol=rol,
            estado=estado,

            error=(
                "No se pudo conectar "
                "con el backend."
            ),

            mensaje=None
        )


    # ----------------------------------------------
    # SESIÓN NO VÁLIDA
    # ----------------------------------------------

    if response_backend.status_code == 401:

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


    # ----------------------------------------------
    # NO ES SUPERADMIN
    # ----------------------------------------------

    if response_backend.status_code == 403:

        return redirect(
            url_for("dashboard")
        )


    # ----------------------------------------------
    # ERROR DEL BACKEND
    # ----------------------------------------------

    if not response_backend.ok:

        return render_template(
            "administradores.html",

            administradores=[],

            paginacion={
                "page": 1,
                "total": 0,
                "totalPaginas": 0,
            },

            search=search,
            rol=rol,
            estado=estado,

            error=(
                resultado.get("error")
                or
                "No fue posible obtener "
                "los administradores."
            ),

            mensaje=None
        )


    data = resultado.get(
        "data",
        {}
    )


    return render_template(

        "administradores.html",

        administradores=
            data.get(
                "administradores",
                []
            ),

        paginacion=
            data.get(
                "paginacion",
                {}
            ),

        search=search,
        rol=rol,
        estado=estado,

        error=
            request.args.get(
                "error"
            ),

        mensaje=
            request.args.get(
                "mensaje"
            )
    )

# ==================================================
# NUEVO ADMINISTRADOR
# SOLO SUPERADMIN
# ==================================================

@app.route(
    "/administradores/nuevo",
    methods=["GET", "POST"]
)
def administrador_nuevo():

    token = request.cookies.get(
        "admin_session"
    )


    if not token:

        return redirect(
            url_for("login")
        )


    # ----------------------------------------------
    # MOSTRAR FORMULARIO
    # ----------------------------------------------

    if request.method == "GET":

        return render_template(
            "administrador_nuevo.html",
            error=None,
            form={}
        )


    # ----------------------------------------------
    # DATOS DEL FORMULARIO
    # ----------------------------------------------

    usuario = (
        request.form
        .get("usuario", "")
        .strip()
        .lower()
    )

    nombre = (
        request.form
        .get("nombre", "")
        .strip()
    )

    email = (
        request.form
        .get("email", "")
        .strip()
        .lower()
    )

    password = request.form.get(
        "password",
        ""
    )

    confirmar_password = (
        request.form.get(
            "confirmarPassword",
            ""
        )
    )

    rol = (
        request.form
        .get("rol", "ADMIN")
        .strip()
        .upper()
    )


    # ----------------------------------------------
    # VALIDACIONES
    # ----------------------------------------------

    if not usuario:

        return render_template(
            "administrador_nuevo.html",
            error="El usuario es obligatorio.",
            form=request.form
        )


    if not nombre:

        return render_template(
            "administrador_nuevo.html",
            error="El nombre es obligatorio.",
            form=request.form
        )


    if not email:

        return render_template(
            "administrador_nuevo.html",
            error="El correo electrónico es obligatorio.",
            form=request.form
        )


    if not password:

        return render_template(
            "administrador_nuevo.html",
            error="La contraseña es obligatoria.",
            form=request.form
        )


    if len(password) < 8:

        return render_template(
            "administrador_nuevo.html",
            error=(
                "La contraseña debe tener "
                "al menos 8 caracteres."
            ),
            form=request.form
        )


    if password != confirmar_password:

        return render_template(
            "administrador_nuevo.html",
            error="Las contraseñas no coinciden.",
            form=request.form
        )


    if rol not in (
        "ADMIN",
        "SUPERADMIN"
    ):

        return render_template(
            "administrador_nuevo.html",
            error="El rol seleccionado no es válido.",
            form=request.form
        )


    # ----------------------------------------------
    # CREAR EN BACKEND
    # ----------------------------------------------

    try:

        response_backend = requests.post(

            f"{BACKEND_URL}"
            "/api/admin/administradores",

            json={
                "usuario":
                    usuario,

                "nombre":
                    nombre,

                "email":
                    email,

                "password":
                    password,

                "rol":
                    rol,
            },

            cookies={
                "admin_session":
                    token
            },

            timeout=15
        )


        try:

            resultado = (
                response_backend.json()
            )

        except ValueError:

            resultado = {}


    except requests.RequestException:

        return render_template(
            "administrador_nuevo.html",
            error=(
                "No se pudo conectar "
                "con el backend."
            ),
            form=request.form
        )


    # ----------------------------------------------
    # SESIÓN EXPIRADA
    # ----------------------------------------------

    if response_backend.status_code == 401:

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


    # ----------------------------------------------
    # NO ES SUPERADMIN
    # ----------------------------------------------

    if response_backend.status_code == 403:

        return redirect(
            url_for("dashboard")
        )


    # ----------------------------------------------
    # ERROR
    # ----------------------------------------------

    if not response_backend.ok:

        return render_template(
            "administrador_nuevo.html",
            error=(
                resultado.get("error")
                or
                "No fue posible crear "
                "el administrador."
            ),
            form=request.form
        )


    # ----------------------------------------------
    # ÉXITO
    # ----------------------------------------------

    return redirect(
        url_for(
            "administradores",
            mensaje=(
                f"Administrador '{usuario}' "
                "creado correctamente."
            )
        )
    )


# ==================================================
# DETALLE ADMINISTRADOR
# SOLO SUPERADMIN
# ==================================================

@app.get(
    "/administradores/<int:id_admin>"
)
def administrador_detalle(
    id_admin
):

    token = request.cookies.get(
        "admin_session"
    )


    if not token:

        return redirect(
            url_for("login")
        )


    try:

        response_backend = requests.get(

            f"{BACKEND_URL}"
            f"/api/admin/administradores/{id_admin}",

            cookies={
                "admin_session":
                    token
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
            "administrador_detalle.html",
            admin=None,
            error=(
                "No se pudo conectar "
                "con el backend."
            ),
            mensaje=None
        )


    # ----------------------------------------------
    # SESIÓN EXPIRADA
    # ----------------------------------------------

    if response_backend.status_code == 401:

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


    # ----------------------------------------------
    # NO ES SUPERADMIN
    # ----------------------------------------------

    if response_backend.status_code == 403:

        return redirect(
            url_for("dashboard")
        )


    # ----------------------------------------------
    # ADMINISTRADOR NO ENCONTRADO
    # ----------------------------------------------

    if response_backend.status_code == 404:

        return redirect(
            url_for(
                "administradores",
                error=(
                    "Administrador no encontrado."
                )
            )
        )


    if not response_backend.ok:

        return render_template(
            "administrador_detalle.html",
            admin=None,
            error=(
                resultado.get("error")
                or
                "No fue posible obtener "
                "el administrador."
            ),
            mensaje=None
        )


    return render_template(

        "administrador_detalle.html",

        admin=
            resultado.get(
                "data",
                {}
            ),

        error=
            request.args.get(
                "error"
            ),

        mensaje=
            request.args.get(
                "mensaje"
            )
    )

    # ==================================================
# EDITAR ADMINISTRADOR
# ==================================================

@app.post(
    "/administradores/<int:id_admin>/editar"
)
def administrador_editar(
    id_admin
):

    token = request.cookies.get(
        "admin_session"
    )


    if not token:

        return redirect(
            url_for("login")
        )


    usuario = (
        request.form
        .get("usuario", "")
        .strip()
        .lower()
    )

    nombre = (
        request.form
        .get("nombre", "")
        .strip()
    )

    email = (
        request.form
        .get("email", "")
        .strip()
        .lower()
    )


    if not usuario:

        return redirect(
            url_for(
                "administrador_detalle",
                id_admin=id_admin,
                error=(
                    "El usuario es obligatorio."
                )
            )
        )


    if not email:

        return redirect(
            url_for(
                "administrador_detalle",
                id_admin=id_admin,
                error=(
                    "El correo electrónico "
                    "es obligatorio."
                )
            )
        )


    try:

        response_backend = requests.patch(

            f"{BACKEND_URL}"
            f"/api/admin/administradores/{id_admin}",

            json={
                "usuario":
                    usuario,

                "nombre":
                    nombre or None,

                "email":
                    email,
            },

            cookies={
                "admin_session":
                    token
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

        return redirect(
            url_for(
                "administrador_detalle",
                id_admin=id_admin,
                error=(
                    "No se pudo conectar "
                    "con el backend."
                )
            )
        )


    if response_backend.status_code == 401:

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


    if response_backend.status_code == 403:

        return redirect(
            url_for("dashboard")
        )


    if not response_backend.ok:

        return redirect(
            url_for(
                "administrador_detalle",
                id_admin=id_admin,
                error=(
                    resultado.get("error")
                    or
                    "No fue posible actualizar "
                    "el administrador."
                )
            )
        )


    return redirect(
        url_for(
            "administrador_detalle",
            id_admin=id_admin,
            mensaje=(
                "Administrador actualizado "
                "correctamente."
            )
        )
    )   

# ==================================================
# CAMBIAR ROL DEL ADMINISTRADOR
# ==================================================

@app.post(
    "/administradores/<int:id_admin>/rol"
)
def administrador_cambiar_rol(
    id_admin
):

    token = request.cookies.get(
        "admin_session"
    )

    if not token:

        return redirect(
            url_for("login")
        )


    rol = (
        request.form
        .get("rol", "")
        .strip()
        .upper()
    )


    if rol not in (
        "ADMIN",
        "SUPERADMIN"
    ):

        return redirect(
            url_for(
                "administrador_detalle",
                id_admin=id_admin,
                error="El rol seleccionado no es válido."
            )
        )


    try:

        response_backend = requests.patch(

            f"{BACKEND_URL}"
            f"/api/admin/administradores/{id_admin}/rol",

            json={
                "rol": rol
            },

            cookies={
                "admin_session": token
            },

            timeout=10
        )


        try:

            resultado = response_backend.json()

        except ValueError:

            resultado = {}


    except requests.RequestException:

        return redirect(
            url_for(
                "administrador_detalle",
                id_admin=id_admin,
                error=(
                    "No se pudo conectar "
                    "con el backend."
                )
            )
        )


    if response_backend.status_code == 401:

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


    if response_backend.status_code == 403:

        return redirect(
            url_for("dashboard")
        )


    if not response_backend.ok:

        return redirect(
            url_for(
                "administrador_detalle",
                id_admin=id_admin,
                error=(
                    resultado.get("error")
                    or
                    "No fue posible cambiar el rol."
                )
            )
        )


    return redirect(
        url_for(
            "administrador_detalle",
            id_admin=id_admin,
            mensaje=(
                f"Rol actualizado a {rol} "
                "correctamente."
            )
        )
    )


# ==================================================
# CAMBIAR ESTADO DEL ADMINISTRADOR
# ==================================================

@app.post(
    "/administradores/<int:id_admin>/estado"
)
def administrador_cambiar_estado(
    id_admin
):

    token = request.cookies.get(
        "admin_session"
    )

    if not token:

        return redirect(
            url_for("login")
        )


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
                "administrador_detalle",
                id_admin=id_admin,
                error="El estado no es válido."
            )
        )


    try:

        response_backend = requests.patch(

            f"{BACKEND_URL}"
            f"/api/admin/administradores/{id_admin}/estado",

            json={
                "estado": estado
            },

            cookies={
                "admin_session": token
            },

            timeout=10
        )


        try:

            resultado = response_backend.json()

        except ValueError:

            resultado = {}


    except requests.RequestException:

        return redirect(
            url_for(
                "administrador_detalle",
                id_admin=id_admin,
                error=(
                    "No se pudo conectar "
                    "con el backend."
                )
            )
        )


    if response_backend.status_code == 401:

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


    if response_backend.status_code == 403:

        return redirect(
            url_for("dashboard")
        )


    if not response_backend.ok:

        return redirect(
            url_for(
                "administrador_detalle",
                id_admin=id_admin,
                error=(
                    resultado.get("error")
                    or
                    "No fue posible cambiar "
                    "el estado."
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
            "administrador_detalle",
            id_admin=id_admin,
            mensaje=(
                f"Administrador {texto_estado} "
                "correctamente."
            )
        )
    )


# ==================================================
# CERRAR TODAS LAS SESIONES
# ==================================================

@app.post(
    "/administradores/<int:id_admin>/cerrar-sesiones"
)
def administrador_cerrar_sesiones(
    id_admin
):

    token = request.cookies.get(
        "admin_session"
    )

    if not token:

        return redirect(
            url_for("login")
        )


    try:

        response_backend = requests.post(

            f"{BACKEND_URL}"
            f"/api/admin/administradores/"
            f"{id_admin}/cerrar-sesiones",

            json={},

            cookies={
                "admin_session": token
            },

            timeout=10
        )


        try:

            resultado = response_backend.json()

        except ValueError:

            resultado = {}


    except requests.RequestException:

        return redirect(
            url_for(
                "administrador_detalle",
                id_admin=id_admin,
                error=(
                    "No se pudo conectar "
                    "con el backend."
                )
            )
        )


    if response_backend.status_code == 401:

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


    if response_backend.status_code == 403:

        return redirect(
            url_for("dashboard")
        )


    if not response_backend.ok:

        return redirect(
            url_for(
                "administrador_detalle",
                id_admin=id_admin,
                error=(
                    resultado.get("error")
                    or
                    "No fue posible cerrar "
                    "las sesiones."
                )
            )
        )


    return redirect(
        url_for(
            "administrador_detalle",
            id_admin=id_admin,
            mensaje=(
                "Todas las sesiones del "
                "administrador fueron invalidadas."
            )
        )
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


    # ----------------------------------------------
    # PÁGINA DE CONSULTAS
    # ----------------------------------------------

    try:

        page_consultas = int(
            request.args.get(
                "page_consultas",
                1
            )
        )

    except ValueError:

        page_consultas = 1


    if page_consultas < 1:
        page_consultas = 1


    # ----------------------------------------------
    # PÁGINA DE MOVIMIENTOS
    # ----------------------------------------------

    try:

        page_movimientos = int(
            request.args.get(
                "page_movimientos",
                1
            )
        )

    except ValueError:

        page_movimientos = 1


    if page_movimientos < 1:
        page_movimientos = 1


    try:

        # ==========================================
        # CLIENTE
        # ==========================================

        response_backend = requests.get(

            f"{BACKEND_URL}"
            f"/api/admin/clientes/{id_cliente}",

            params={
                "pageConsumos":
                    page_consultas,

                "pageMovimientos":
                    page_movimientos,
            },

            cookies={
                "admin_session":
                    token
            },

            timeout=10
        )


        # ==========================================
        # ADMINISTRADOR ACTUAL
        # ==========================================

        response_admin = requests.get(

            f"{BACKEND_URL}"
            "/api/admin/auth/me",

            cookies={
                "admin_session":
                    token
            },

            timeout=10
        )


    except requests.RequestException:

        return render_template(
            "cliente_detalle.html",

            data=None,

            administrador_actual=None,

            administradores_asignables=[],

            error=(
                "No se pudo conectar "
                "con el backend."
            ),

            mensaje=None
        )


    # ==============================================
    # SESIÓN EXPIRADA
    # ==============================================

    if (
        response_backend.status_code == 401
        or
        response_admin.status_code == 401
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


    # ==============================================
    # LEER RESPUESTAS
    # ==============================================

    try:

        resultado = response_backend.json()

    except ValueError:

        resultado = {}


    try:

        resultado_admin = response_admin.json()

    except ValueError:

        resultado_admin = {}


    # ==============================================
    # ERROR OBTENIENDO CLIENTE
    # ==============================================

    if not response_backend.ok:

        return render_template(
            "cliente_detalle.html",

            data=None,

            administrador_actual=None,

            administradores_asignables=[],

            error=(
                resultado.get("error")
                or
                "No fue posible obtener "
                "el cliente."
            ),

            mensaje=None
        )


    # ==============================================
    # ERROR OBTENIENDO SESIÓN ADMIN
    # ==============================================

    if not response_admin.ok:

        return render_template(
            "cliente_detalle.html",

            data=
                resultado.get(
                    "data"
                ),

            administrador_actual=None,

            administradores_asignables=[],

            error=(
                resultado_admin.get("error")
                or
                "No fue posible obtener "
                "los datos del administrador."
            ),

            mensaje=None
        )


    # ==============================================
    # ADMINISTRADOR ACTUAL
    # ==============================================

    administrador_actual = (
        resultado_admin
        .get("data", {})
        .get("administrador")
        or {}
    )


    administradores_asignables = []


    # ==============================================
    # SI ES SUPERADMIN:
    # OBTENER ADMINS ACTIVOS PARA EL SELECT
    # ==============================================

    if (
        administrador_actual.get("rol")
        ==
        "SUPERADMIN"
    ):

        try:

            response_administradores = (
                requests.get(

                    f"{BACKEND_URL}"
                    "/api/admin/administradores",

                    params={
                        "page": 1,
                        "limit": 100,
                        "rol": "ADMIN",
                        "estado": "ACTIVO",
                    },

                    cookies={
                        "admin_session":
                            token
                    },

                    timeout=10
                )
            )


            if (
                response_administradores
                .status_code
                == 401
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


            if response_administradores.ok:

                try:

                    resultado_administradores = (
                        response_administradores
                        .json()
                    )

                except ValueError:

                    resultado_administradores = {}


                administradores_asignables = (
                    resultado_administradores
                    .get("data", {})
                    .get(
                        "administradores",
                        []
                    )
                )


        except requests.RequestException:

            # El detalle del cliente puede seguir
            # mostrándose aunque falle el combo.
            administradores_asignables = []


    # ==============================================
    # RENDER
    # ==============================================

    return render_template(
        "cliente_detalle.html",

        data=
            resultado.get(
                "data"
            ),

        administrador_actual=
            administrador_actual,

        administradores_asignables=
            administradores_asignables,

        error=
            request.args.get(
                "error"
            ),

        mensaje=
            request.args.get(
                "mensaje"
            )
    )


# ==================================================
# ASIGNAR / REASIGNAR ADMINISTRADOR AL CLIENTE
# SOLO SUPERADMIN
# ==================================================

@app.post(
    "/clientes/<int:id_cliente>/administrador"
)
def cliente_asignar_administrador(
    id_cliente
):

    token = request.cookies.get(
        "admin_session"
    )


    if not token:

        return redirect(
            url_for("login")
        )


    # ----------------------------------------------
    # ADMIN SELECCIONADO
    # ----------------------------------------------

    id_admin = (
        request.form
        .get("idAdmin", "")
        .strip()
    )


    # Sin asignar
    if (
        not id_admin
        or
        id_admin.lower() == "null"
    ):

        id_admin_payload = None

    else:

        try:

            id_admin_payload = int(
                id_admin
            )

        except ValueError:

            return redirect(
                url_for(
                    "cliente_detalle",

                    id_cliente=
                        id_cliente,

                    error=(
                        "El administrador "
                        "seleccionado no es válido."
                    )
                )
            )


        if id_admin_payload <= 0:

            return redirect(
                url_for(
                    "cliente_detalle",

                    id_cliente=
                        id_cliente,

                    error=(
                        "El administrador "
                        "seleccionado no es válido."
                    )
                )
            )


    # ----------------------------------------------
    # ACTUALIZAR EN BACKEND
    # ----------------------------------------------

    try:

        response_backend = requests.patch(

            f"{BACKEND_URL}"
            f"/api/admin/clientes/"
            f"{id_cliente}/admin",

            json={
                "idAdmin":
                    id_admin_payload
            },

            cookies={
                "admin_session":
                    token
            },

            timeout=10
        )


        try:

            resultado = response_backend.json()

        except ValueError:

            resultado = {}


    except requests.RequestException:

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    "No se pudo conectar "
                    "con el backend."
                )
            )
        )


    # ----------------------------------------------
    # SESIÓN EXPIRADA
    # ----------------------------------------------

    if (
        response_backend.status_code
        == 401
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


    # ----------------------------------------------
    # NO ES SUPERADMIN
    # ----------------------------------------------

    if (
        response_backend.status_code
        == 403
    ):

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    resultado.get("error")
                    or
                    "No tiene permisos "
                    "para asignar clientes."
                )
            )
        )


    # ----------------------------------------------
    # ERROR
    # ----------------------------------------------

    if not response_backend.ok:

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    resultado.get("error")
                    or
                    "No fue posible asignar "
                    "el administrador."
                )
            )
        )


    # ----------------------------------------------
    # ÉXITO
    # ----------------------------------------------

    data = (
        resultado.get(
            "data",
            {}
        )
    )


    administrador = (
        data.get(
            "administrador"
        )
    )


    if administrador:

        nombre_admin = (
            administrador.get("nombre")
            or
            administrador.get("usuario")
            or
            "Administrador"
        )

        mensaje = (
            "Cliente asignado a "
            f"{nombre_admin} correctamente."
        )

    else:

        mensaje = (
            "El cliente quedó "
            "sin administrador asignado."
        )


    return redirect(
        url_for(
            "cliente_detalle",

            id_cliente=
                id_cliente,

            mensaje=
                mensaje
        )
    )    

# --------------------------------------------------
# RECARGAR CRÉDITOS POR SERVICIO
# --------------------------------------------------

@app.post("/clientes/<int:id_cliente>/creditos")
def cliente_recargar_creditos(id_cliente):

    token = request.cookies.get(
        "admin_session"
    )

    if not token:
        return redirect(
            url_for("login")
        )

    # --------------------------------------------------
    # SERVICIO
    # --------------------------------------------------

    servicio = (
        request.form
        .get(
            "servicio",
            ""
        )
        .strip()
        .upper()
    )

    if servicio not in (
        "RRCC",
        "SUELDOS",
        "FALLECIDOS",
        "TELEFONOS"
    ):
        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error="El servicio seleccionado no es válido."
            )
        )

    # --------------------------------------------------
    # CANTIDAD
    # --------------------------------------------------

    cantidad = (
        request.form
        .get(
            "cantidad",
            ""
        )
        .strip()
    )

    try:
        cantidad = int(cantidad)

    except (
        ValueError,
        TypeError
    ):
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

    # --------------------------------------------------
    # RECARGAR EN BACKEND
    # --------------------------------------------------

    try:
        response_backend = requests.post(
            f"{BACKEND_URL}/api/admin/clientes/{id_cliente}/creditos",

            json={
                "cantidad": cantidad,
                "servicio": servicio
            },

            cookies={
                "admin_session": token
            },

            timeout=10
        )

    except requests.RequestException:
        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error="No se pudo conectar con el backend."
            )
        )

    # --------------------------------------------------
    # RESPUESTA DEL BACKEND
    # --------------------------------------------------

    try:
        resultado = response_backend.json()

    except ValueError:
        resultado = {}

    # --------------------------------------------------
    # SESIÓN INVÁLIDA
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
    # ERROR
    # --------------------------------------------------

    if not response_backend.ok:
        return redirect(
            url_for(
                "cliente_detalle",
                id_cliente=id_cliente,
                error=(
                    resultado.get("error")
                    or
                    "No fue posible recargar créditos."
                )
            )
        )

    # --------------------------------------------------
    # ÉXITO
    # --------------------------------------------------

    return redirect(
        url_for(
            "cliente_detalle",
            id_cliente=id_cliente,
            mensaje=(
                f"Se agregaron {cantidad} créditos "
                f"al servicio {servicio} correctamente."
            )
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

# ==================================================
# GENERAR CREDENCIAL API COMERCIAL
# ==================================================

@app.post(
    "/clientes/<int:id_cliente>/api-credencial"
)
def cliente_generar_api_credencial(
    id_cliente
):

    token = request.cookies.get(
        "admin_session"
    )

    if not token:

        return redirect(
            url_for(
                "login"
            )
        )


    # ----------------------------------------------
    # SOLICITAR CREDENCIAL AL BACKEND
    # ----------------------------------------------

    try:

        response_backend = requests.post(

            f"{BACKEND_URL}"
            f"/api/admin/clientes/"
            f"{id_cliente}/api-credencial",

            json={},

            cookies={
                "admin_session":
                    token
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

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    "No se pudo conectar "
                    "con el backend."
                )
            )
        )


    # ----------------------------------------------
    # SESIÓN EXPIRADA
    # ----------------------------------------------

    if (
        response_backend.status_code
        == 401
    ):

        response = make_response(
            redirect(
                url_for(
                    "login"
                )
            )
        )

        response.delete_cookie(
            "admin_session",
            path="/"
        )

        return response


    # ----------------------------------------------
    # SIN PERMISOS
    # ----------------------------------------------

    if (
        response_backend.status_code
        == 403
    ):

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    resultado.get(
                        "error"
                    )
                    or
                    "No tiene permisos para "
                    "generar esta credencial."
                )
            )
        )


    # ----------------------------------------------
    # ERROR
    # ----------------------------------------------

    if not response_backend.ok:

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    resultado.get(
                        "error"
                    )
                    or
                    "No fue posible generar "
                    "la credencial API."
                )
            )
        )


    # ----------------------------------------------
    # CREDENCIAL GENERADA
    # ----------------------------------------------

    data = (
        resultado.get(
            "data",
            {}
        )
    )


    client_id = (
        data.get(
            "clientId"
        )
    )

    client_secret = (
        data.get(
            "clientSecret"
        )
    )


    # El CLIENT_SECRET solamente se muestra
    # en esta respuesta.
    response = make_response(

        render_template(

            "api_credencial_generada.html",

            id_cliente=
                id_cliente,

            client_id=
                client_id,

            client_secret=
                client_secret,

            accion=
                "generada"
        )
    )


    # ----------------------------------------------
    # SEGURIDAD
    # ----------------------------------------------

    response.headers[
        "Cache-Control"
    ] = (
        "no-store, no-cache, "
        "must-revalidate, private"
    )

    response.headers[
        "Pragma"
    ] = (
        "no-cache"
    )

    response.headers[
        "Expires"
    ] = (
        "0"
    )

    response.headers[
        "Referrer-Policy"
    ] = (
        "no-referrer"
    )


    return response



# ==================================================
# REGENERAR CLIENT_SECRET
# ==================================================

@app.post(
    "/clientes/<int:id_cliente>"
    "/api-credencial/regenerar"
)
def cliente_regenerar_api_secret(
    id_cliente
):

    token = request.cookies.get(
        "admin_session"
    )

    if not token:

        return redirect(
            url_for(
                "login"
            )
        )


    # ----------------------------------------------
    # REGENERAR EN BACKEND
    # ----------------------------------------------

    try:

        response_backend = requests.post(

            f"{BACKEND_URL}"
            f"/api/admin/clientes/"
            f"{id_cliente}"
            "/api-credencial/regenerar",

            json={},

            cookies={
                "admin_session":
                    token
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

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    "No se pudo conectar "
                    "con el backend."
                )
            )
        )


    # ----------------------------------------------
    # SESIÓN EXPIRADA
    # ----------------------------------------------

    if (
        response_backend.status_code
        == 401
    ):

        response = make_response(
            redirect(
                url_for(
                    "login"
                )
            )
        )

        response.delete_cookie(
            "admin_session",
            path="/"
        )

        return response


    # ----------------------------------------------
    # SIN PERMISOS
    # ----------------------------------------------

    if (
        response_backend.status_code
        == 403
    ):

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    resultado.get(
                        "error"
                    )
                    or
                    "No tiene permisos para "
                    "regenerar esta credencial."
                )
            )
        )


    # ----------------------------------------------
    # ERROR
    # ----------------------------------------------

    if not response_backend.ok:

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    resultado.get(
                        "error"
                    )
                    or
                    "No fue posible regenerar "
                    "el CLIENT_SECRET."
                )
            )
        )


    # ----------------------------------------------
    # NUEVO SECRET
    # ----------------------------------------------

    data = (
        resultado.get(
            "data",
            {}
        )
    )


    client_id = (
        data.get(
            "clientId"
        )
    )

    client_secret = (
        data.get(
            "clientSecret"
        )
    )


    response = make_response(

        render_template(

            "api_credencial_generada.html",

            id_cliente=
                id_cliente,

            client_id=
                client_id,

            client_secret=
                client_secret,

            accion=
                "regenerada"
        )
    )


    # ----------------------------------------------
    # SEGURIDAD
    # ----------------------------------------------

    response.headers[
        "Cache-Control"
    ] = (
        "no-store, no-cache, "
        "must-revalidate, private"
    )

    response.headers[
        "Pragma"
    ] = (
        "no-cache"
    )

    response.headers[
        "Expires"
    ] = (
        "0"
    )

    response.headers[
        "Referrer-Policy"
    ] = (
        "no-referrer"
    )


    return response



# ==================================================
# CAMBIAR ESTADO CREDENCIAL API
# ==================================================

@app.post(
    "/clientes/<int:id_cliente>"
    "/api-credencial/estado"
)
def cliente_estado_api_credencial(
    id_cliente
):

    token = request.cookies.get(
        "admin_session"
    )

    if not token:

        return redirect(
            url_for(
                "login"
            )
        )


    # ----------------------------------------------
    # ESTADO
    # ----------------------------------------------

    estado = (
        request.form
        .get(
            "estado",
            ""
        )
        .strip()
        .upper()
    )


    if estado not in (
        "ACTIVO",
        "BLOQUEADO",
        "REVOCADO"
    ):

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    "El estado de la credencial "
                    "no es válido."
                )
            )
        )


    # ----------------------------------------------
    # ACTUALIZAR EN BACKEND
    # ----------------------------------------------

    try:

        response_backend = requests.patch(

            f"{BACKEND_URL}"
            f"/api/admin/clientes/"
            f"{id_cliente}"
            "/api-credencial/estado",

            json={
                "estado":
                    estado
            },

            cookies={
                "admin_session":
                    token
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

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    "No se pudo conectar "
                    "con el backend."
                )
            )
        )


    # ----------------------------------------------
    # SESIÓN EXPIRADA
    # ----------------------------------------------

    if (
        response_backend.status_code
        == 401
    ):

        response = make_response(
            redirect(
                url_for(
                    "login"
                )
            )
        )

        response.delete_cookie(
            "admin_session",
            path="/"
        )

        return response


    # ----------------------------------------------
    # SIN PERMISOS
    # ----------------------------------------------

    if (
        response_backend.status_code
        == 403
    ):

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    resultado.get(
                        "error"
                    )
                    or
                    "No tiene permisos para "
                    "modificar esta credencial."
                )
            )
        )


    # ----------------------------------------------
    # ERROR
    # ----------------------------------------------

    if not response_backend.ok:

        return redirect(
            url_for(
                "cliente_detalle",

                id_cliente=
                    id_cliente,

                error=(
                    resultado.get(
                        "error"
                    )
                    or
                    "No fue posible actualizar "
                    "la credencial API."
                )
            )
        )


    # ----------------------------------------------
    # ÉXITO
    # ----------------------------------------------

    textos = {

        "ACTIVO":
            "activada",

        "BLOQUEADO":
            "bloqueada",

        "REVOCADO":
            "revocada",

    }


    return redirect(
        url_for(
            "cliente_detalle",

            id_cliente=
                id_cliente,

            mensaje=(
                "Credencial API "
                f"{textos[estado]} "
                "correctamente."
            )
        )
    )

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


    # --------------------------------------------------
    # FILTROS
    # --------------------------------------------------

    search = (
        request.args
        .get(
            "search",
            ""
        )
        .strip()
    )


    estado = (
        request.args
        .get(
            "estado",
            ""
        )
        .strip()
        .upper()
    )


    servicio = (
        request.args
        .get(
            "servicio",
            ""
        )
        .strip()
        .upper()
    )


    # --------------------------------------------------
    # VALIDAR SERVICIO
    # --------------------------------------------------

    if servicio not in (
        "",
        "RRCC",
        "SUELDOS",
        "FALLECIDOS",
        "TELEFONOS",
    ):

        servicio = ""


    # --------------------------------------------------
    # PAGINACIÓN
    # --------------------------------------------------

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


    # --------------------------------------------------
    # CONSULTAR BACKEND
    # --------------------------------------------------

    try:

        response_backend = requests.get(

            f"{BACKEND_URL}/api/admin/consumos",

            params={
                "page":
                    page,

                "limit":
                    20,

                "search":
                    search,

                "estado":
                    estado,

                "servicio":
                    servicio,
            },

            cookies={
                "admin_session":
                    token
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

            search=
                search,

            estado=
                estado,

            servicio=
                servicio,

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
                url_for(
                    "login"
                )
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

            search=
                search,

            estado=
                estado,

            servicio=
                servicio,

            error=(
                resultado.get(
                    "error"
                )
                or
                "No fue posible obtener "
                "los consumos."
            )
        )


    # --------------------------------------------------
    # RESPUESTA
    # --------------------------------------------------

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

        search=
            search,

        estado=
            estado,

        servicio=
            servicio,

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

            consulta_form={},

            sueldos_json=None,

            sueldos_form={},

            fallecidos_json=None,

            fallecidos_form={},

            telefonos_json=None,

            telefonos_form={}
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

            consulta_form={},

            sueldos_json=None,

            sueldos_form={},

            fallecidos_json=None,

            fallecidos_form={},

            telefonos_json=None,

            telefonos_form={}
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

        consulta_form={},

        sueldos_json=None,

        sueldos_form={},

        fallecidos_json=None,

        fallecidos_form={},

        telefonos_json=None,

        telefonos_form={}
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

    # --------------------------------------------------
    # VALIDAR SESIÓN
    # --------------------------------------------------

    if not token:

        return redirect(
            url_for(
                "portal_login"
            )
        )

    # --------------------------------------------------
    # DATOS DEL FORMULARIO
    # --------------------------------------------------

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

    if (
        not tipo_documento
        or
        not documento
    ):

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
        },

        sueldos_json=None,

        sueldos_form={},

        fallecidos_json=None,

        fallecidos_form={},

        telefonos_json=None,

        telefonos_form={}
    )

# --------------------------------------------------
# CONSULTA SUELDOS DESDE EL PORTAL
# --------------------------------------------------

@app.route(
    "/portal/sueldos",
    methods=["POST"]
)
def portal_sueldos():

    token = request.cookies.get(
        "portal_token"
    )

    # --------------------------------------------------
    # VALIDAR SESIÓN
    # --------------------------------------------------

    if not token:

        return redirect(
            url_for(
                "portal_login"
            )
        )

    # --------------------------------------------------
    # DATOS DEL FORMULARIO
    # --------------------------------------------------

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

    if (
        not tipo_documento
        or
        not documento
    ):

        return redirect(
            url_for(
                "portal_cuenta"
            )
        )

    # --------------------------------------------------
    # REALIZAR CONSULTA DE SUELDOS
    # --------------------------------------------------

    try:

        response_backend = requests.post(
            f"{BACKEND_URL}/api/cliente/sueldos",

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
                    "una respuesta no válida.",
                "code":
                    "INVALID_RESPONSE"
            }

    except requests.RequestException:

        response_backend = None

        resultado_backend = {
            "success": False,
            "error":
                "No se pudo conectar "
                "con el servidor.",
            "code":
                "CONNECTION_ERROR"
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
    #
    # Después de consultar Sueldos ya se descontó
    # el crédito, por eso actualizamos los saldos.
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

    sueldos_json = json.dumps(
        resultado_backend,
        ensure_ascii=False,
        indent=2
    )

    # --------------------------------------------------
    # MOSTRAR PORTAL
    # --------------------------------------------------

    return render_template(
        "portal_cuenta.html",

        cuenta=cuenta,

        error=None,

        # RRCC
        consulta_json=None,
        consulta_form={},

        # SUELDOS
        sueldos_json=
            sueldos_json,

        sueldos_form={
            "tipoDocumento":
                tipo_documento,

            "documento":
                documento,
        },

        # FALLECIDOS
        fallecidos_json=None,
        fallecidos_form={},

        # TELEFONOS
        telefonos_json=None,
        telefonos_form={}
    )

# --------------------------------------------------
# CONSULTA FALLECIDOS DESDE EL PORTAL
# --------------------------------------------------

@app.route(
    "/portal/fallecidos",
    methods=["POST"]
)
def portal_fallecidos():

    token = request.cookies.get(
        "portal_token"
    )

    # --------------------------------------------------
    # VALIDAR SESIÓN
    # --------------------------------------------------

    if not token:

        return redirect(
            url_for(
                "portal_login"
            )
        )

    # --------------------------------------------------
    # DATOS DEL FORMULARIO
    # --------------------------------------------------

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

    if (
        not tipo_documento
        or
        not documento
    ):

        return redirect(
            url_for(
                "portal_cuenta"
            )
        )

    # --------------------------------------------------
    # REALIZAR CONSULTA DE FALLECIDOS
    # --------------------------------------------------

    try:

        response_backend = requests.post(
            f"{BACKEND_URL}/api/cliente/fallecidos",

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
                    "una respuesta no válida.",
                "code":
                    "INVALID_RESPONSE"
            }

    except requests.RequestException:

        response_backend = None

        resultado_backend = {
            "success": False,
            "error":
                "No se pudo conectar "
                "con el servidor.",
            "code":
                "CONNECTION_ERROR"
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

    fallecidos_json = json.dumps(
        resultado_backend,
        ensure_ascii=False,
        indent=2
    )

    # --------------------------------------------------
    # MOSTRAR PORTAL
    # --------------------------------------------------

    return render_template(
        "portal_cuenta.html",

        cuenta=cuenta,

        error=None,

        # RRCC
        consulta_json=None,
        consulta_form={},

        # SUELDOS
        sueldos_json=None,
        sueldos_form={},

        # FALLECIDOS
        fallecidos_json=
            fallecidos_json,

        fallecidos_form={
            "tipoDocumento":
                tipo_documento,

            "documento":
                documento,
        },

        # TELEFONOS
        telefonos_json=None,
        telefonos_form={}
    )

# --------------------------------------------------
# CONSULTA TELÉFONOS DESDE EL PORTAL
# --------------------------------------------------

@app.route(
    "/portal/telefonos",
    methods=["POST"]
)
def portal_telefonos():

    token = request.cookies.get(
        "portal_token"
    )

    # --------------------------------------------------
    # VALIDAR SESIÓN
    # --------------------------------------------------

    if not token:

        return redirect(
            url_for(
                "portal_login"
            )
        )

    # --------------------------------------------------
    # DATOS DEL FORMULARIO
    # --------------------------------------------------

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

    if (
        not tipo_documento
        or
        not documento
    ):

        return redirect(
            url_for(
                "portal_cuenta"
            )
        )

    # --------------------------------------------------
    # REALIZAR CONSULTA DE TELÉFONOS
    # --------------------------------------------------

    try:

        response_backend = requests.post(
            f"{BACKEND_URL}/api/cliente/telefonos",

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
                    "una respuesta no válida.",
                "code":
                    "INVALID_RESPONSE"
            }

    except requests.RequestException:

        response_backend = None

        resultado_backend = {
            "success": False,
            "error":
                "No se pudo conectar "
                "con el servidor.",
            "code":
                "CONNECTION_ERROR"
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

    telefonos_json = json.dumps(
        resultado_backend,
        ensure_ascii=False,
        indent=2
    )

    # --------------------------------------------------
    # MOSTRAR PORTAL
    # --------------------------------------------------

    return render_template(
        "portal_cuenta.html",

        cuenta=cuenta,

        error=None,

        # RRCC
        consulta_json=None,
        consulta_form={},

        # SUELDOS
        sueldos_json=None,
        sueldos_form={},

        # FALLECIDOS
        fallecidos_json=None,
        fallecidos_form={},

        # TELEFONOS
        telefonos_json=
            telefonos_json,

        telefonos_form={
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
            "5001"
        )
    )

    app.run(
        host="0.0.0.0",
        port=port,
        debug=False
    )
