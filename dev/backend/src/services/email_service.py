import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import requests

logger = logging.getLogger(__name__)

EMAIL_PROVIDER = os.getenv("EMAIL_PROVIDER", "mailgun")
MAILGUN_API_KEY = os.getenv("MAILGUN_API_KEY")
MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN")
GMAIL_ADDRESS = os.getenv("GMAIL_ADDRESS")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
EMAIL_FROM = os.getenv("EMAIL_FROM", "Bach Khoa ERP <no-reply@example.com>")


class EmailSendError(RuntimeError):
    pass


def send_email(to: str, subject: str, html: str) -> None:
    if EMAIL_PROVIDER == "mailgun":
        _send_via_mailgun(to, subject, html)
    elif EMAIL_PROVIDER == "gmail_smtp":
        _send_via_gmail_smtp(to, subject, html)
    else:
        raise EmailSendError(f"EMAIL_PROVIDER không được hỗ trợ: {EMAIL_PROVIDER}")


def _send_via_mailgun(to: str, subject: str, html: str) -> None:
    if not MAILGUN_API_KEY or not MAILGUN_DOMAIN:
        raise EmailSendError("MAILGUN_API_KEY hoặc MAILGUN_DOMAIN chưa được cấu hình.")

    try:
        response = requests.post(
            f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages",
            auth=("api", MAILGUN_API_KEY),
            data={"from": EMAIL_FROM, "to": to, "subject": subject, "html": html},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Mailgun send failed for %s: %s", to, exc)
        raise EmailSendError("Không thể gửi email qua Mailgun.") from exc


def _send_via_gmail_smtp(to: str, subject: str, html: str) -> None:
    if not GMAIL_ADDRESS or not GMAIL_APP_PASSWORD:
        raise EmailSendError("GMAIL_ADDRESS hoặc GMAIL_APP_PASSWORD chưa được cấu hình.")

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = EMAIL_FROM
    message["To"] = to
    message.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10) as server:
            server.login(GMAIL_ADDRESS, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_ADDRESS, [to], message.as_string())
    except smtplib.SMTPException as exc:
        logger.warning("Gmail SMTP send failed for %s: %s", to, exc)
        raise EmailSendError("Không thể gửi email qua Gmail SMTP.") from exc
