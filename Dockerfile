# Cloud Run supplies PORT; listen on 0.0.0.0
FROM python:3.12-slim

WORKDIR /app

COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend/ backend/

ENV PYTHONUNBUFFERED=1
ENV PORT=8080
EXPOSE 8080

# GOOGLE_CLOUD_PROJECT is set automatically on Cloud Run; set VERTEX_AI_LOCATION to match deployed region if needed.
CMD exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8080}
