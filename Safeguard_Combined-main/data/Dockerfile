# CMD ["python", "data/scheduler.py"]
FROM python:3.11-slim-bookworm

WORKDIR /app

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app

WORKDIR /app

# Install PostgreSQL client and build tools
RUN rm -f /etc/apt/sources.list.d/debian.sources && \
printf "deb https://deb.debian.org/debian bookworm main contrib non-free non-free-firmware\n\
deb https://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware\n\
deb https://security.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware\n" \
> /etc/apt/sources.list \
    && apt-get -o Acquire::Retries=5 update \
    && apt-get -o Acquire::Retries=5 install -y --fix-missing --no-install-recommends \
    bash \
    ca-certificates \
    curl \
    postgresql-client \
    build-essential \
    gcc \
    g++ \
    python3-dev \
    libc6-dev \
    dos2unix \
  && rm -rf /var/lib/apt/lists/*

# Install Python dependencies that don't need compilation first
RUN pip install --upgrade pip \
  && pip install --no-cache-dir websocket-client requests

# --- Install backend requirements
COPY backend/requirements.txt backend-requirements.txt
RUN pip install --no-cache-dir -r backend-requirements.txt

# --- Install AI requirements
COPY ai/requirements.txt ai-requirements.txt
RUN pip install --no-cache-dir -r ai-requirements.txt

# Playwright
RUN playwright install chromium

COPY . .

RUN dos2unix /app/data/wait-for-db-init.sh && chmod +x /app/data/wait-for-db-init.sh

CMD ["bash", "/app/data/wait-for-db-init.sh"]

