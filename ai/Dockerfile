FROM python:3.11-slim-bookworm

WORKDIR /app

RUN rm -f /etc/apt/sources.list.d/debian.sources && \
printf "deb https://deb.debian.org/debian bookworm main contrib non-free non-free-firmware\n\
deb https://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware\n\
deb https://security.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware\n" \
> /etc/apt/sources.list && \
    apt-get -o Acquire::Retries=5 update && \
    apt-get -o Acquire::Retries=5 -y --allow-downgrades --allow-change-held-packages install --fix-missing libc6 libc6-dev && \
    apt-get -o Acquire::Retries=5 install -y --fix-missing --no-install-recommends \
      build-essential \
      gcc \
      libpq-dev \
      wget \
    && rm -rf /var/lib/apt/lists/*

COPY ai/requirements.txt .

RUN pip install --upgrade pip setuptools wheel && \
    pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["bash", "ai/forecasting/src/wait-for-db-init-ai.sh"]


