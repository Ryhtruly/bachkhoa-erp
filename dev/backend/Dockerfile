# syntax=docker/dockerfile:1.7

FROM python:3.11-slim-bookworm@sha256:528257d48c1da0dcecc2e725d1ae34498d60c965f1241e39cd6a85a8859bdf84

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    python -m pip install --no-compile -r requirements.txt

COPY src ./src
COPY static ./static

RUN mkdir -p /app/static/contracts

EXPOSE 8080

CMD ["uvicorn", "src.index:app", "--host", "0.0.0.0", "--port", "8080"]
