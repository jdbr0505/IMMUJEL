"""Alerta diaria de solicitudes de asesoria pendientes hace mas de 7 dias.

Uso: python scripts/dashboard_alertas.py
Requiere variables de entorno (nunca hardcodeadas):
  DASHBOARD_RO_DATABASE_URL  - cadena de conexion Postgres del rol dashboard_ro
  ALERTA_SMTP_HOST           - ej. smtp.gmail.com
  ALERTA_SMTP_PORT           - ej. 587
  ALERTA_SMTP_USER           - cuenta que envia el correo
  ALERTA_SMTP_PASSWORD       - contrasena de aplicacion (no la contrasena normal de la cuenta)
  ALERTA_DESTINATARIOS       - correos separados por coma, ej. "coord@immujel.org,otra@immujel.org"
"""

import os
import smtplib
import sys
from email.mime.text import MIMEText

import psycopg2

DIAS_LIMITE = 7

QUERY = """
    select id, parroquia, tipo_asesoria, creado_en::date
    from solicitudes
    where estado = 'pendiente'
      and creado_en < now() - interval '%s days'
    order by creado_en asc
""" % DIAS_LIMITE


def obtener_pendientes(database_url):
    with psycopg2.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(QUERY)
            return cur.fetchall()


def construir_mensaje(pendientes):
    lineas = [f"{len(pendientes)} solicitud(es) pendientes hace mas de {DIAS_LIMITE} dias:\n"]
    for id_, parroquia, tipo, fecha in pendientes:
        parroquia = parroquia or "(anonima)"
        tipo = tipo or "sin tipo"
        lineas.append(f"- {fecha} | {parroquia} | {tipo} | id {id_}")
    return "\n".join(lineas)


def enviar_correo(asunto, cuerpo):
    host = os.environ["ALERTA_SMTP_HOST"]
    port = int(os.environ["ALERTA_SMTP_PORT"])
    usuario = os.environ["ALERTA_SMTP_USER"]
    password = os.environ["ALERTA_SMTP_PASSWORD"]
    destinatarios = [d.strip() for d in os.environ["ALERTA_DESTINATARIOS"].split(",") if d.strip()]

    msg = MIMEText(cuerpo)
    msg["Subject"] = asunto
    msg["From"] = usuario
    msg["To"] = ", ".join(destinatarios)

    with smtplib.SMTP(host, port) as server:
        server.starttls()
        server.login(usuario, password)
        server.sendmail(usuario, destinatarios, msg.as_string())


def main():
    database_url = os.environ["DASHBOARD_RO_DATABASE_URL"]
    pendientes = obtener_pendientes(database_url)

    if not pendientes:
        print("Sin solicitudes vencidas, no se envia correo.")
        return

    cuerpo = construir_mensaje(pendientes)
    print(cuerpo)
    enviar_correo(f"IMMUJEL: {len(pendientes)} solicitud(es) pendientes vencidas", cuerpo)
    print("Correo de alerta enviado.")


if __name__ == "__main__":
    try:
        main()
    except KeyError as e:
        print(f"Falta la variable de entorno {e}. Revisa el encabezado del script.", file=sys.stderr)
        sys.exit(1)
