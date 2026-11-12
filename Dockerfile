# Build the React interface with the locked Node.js dependencies.
FROM node:22-bookworm-slim AS frontend
WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY postcss.config.js tailwind.config.js components.json eslint.config.js ./
COPY src ./src
RUN npm run build

# Run Flask and the built interface from one small Python image.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=10000
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY server.py ./
COPY --from=frontend /build/dist ./dist

EXPOSE 10000

# EM sessions live in process memory, so keep exactly one worker.
CMD ["sh", "-c", "gunicorn --bind 0.0.0.0:${PORT:-10000} --workers 1 --threads 8 --timeout 180 server:app"]
