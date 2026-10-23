# PayPal REST mock for LOCAL development only (Sanar y Criar). Never deploy it.
FROM python:3.14.7-alpine3.24
RUN pip install --no-cache-dir starlette==1.9.0 uvicorn==0.54.0 httpx==0.28.1
WORKDIR /mock
COPY app.py .
EXPOSE 8099
HEALTHCHECK --interval=10s --timeout=3s --retries=10 CMD wget -qO- http://127.0.0.1:8099/health || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8099"]
