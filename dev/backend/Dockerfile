FROM python:3.11-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY src ./src
COPY static ./static

RUN mkdir -p /app/static/contracts

EXPOSE 8080

CMD ["uvicorn", "src.index:app", "--host", "0.0.0.0", "--port", "8080"]
