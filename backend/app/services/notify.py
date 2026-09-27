"""E-mail notifications.

If SMTP settings are empty the message is only logged, so the app works out of
the box in development. Fill APP_SMTP_* in .env to send real mail.
"""
import logging
import smtplib
from email.message import EmailMessage

from ..config import settings

log = logging.getLogger("notify")


def send_email(to: str | list[str], subject: str, body: str) -> None:
    recipients = [to] if isinstance(to, str) else to
    recipients = [r for r in recipients if r]
    if not recipients:
        return
    if not settings.smtp_host:
        log.info("E-MAIL (not sent, SMTP not configured) to=%s subject=%s\n%s", recipients, subject, body)
        return
    msg = EmailMessage()
    msg["From"] = settings.smtp_from or settings.company_email
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as s:
            s.starttls()
            if settings.smtp_user:
                s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
    except Exception:  # never let a mail failure break an order
        log.exception("Failed to send e-mail to %s", recipients)


def notify_sales(subject: str, body: str) -> None:
    send_email(settings.company_email, subject, body)
