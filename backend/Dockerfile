FROM python:3.11-slim-bookworm

# Set working directory
WORKDIR /app


# ============================================================================
# Configure apt and pip proxy settings
# ============================================================================
ARG HTTP_PROXY
ARG HTTPS_PROXY

ENV http_proxy=${HTTP_PROXY} \
    https_proxy=${HTTPS_PROXY} \
    HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY}


# Install system dependencies
RUN rm -f /etc/apt/sources.list.d/debian.sources && \
printf "deb https://deb.debian.org/debian bookworm main contrib non-free non-free-firmware\n\
deb https://deb.debian.org/debian bookworm-updates main contrib non-free non-free-firmware\n\
deb https://security.debian.org/debian-security bookworm-security main contrib non-free non-free-firmware\n" \
> /etc/apt/sources.list
RUN apt-get -o Acquire::Retries=5 update \
    && apt-get -o Acquire::Retries=5 -y --allow-downgrades --allow-change-held-packages install --fix-missing libc6 libc6-dev \
    && apt-get -o Acquire::Retries=5 install -y --fix-missing \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt

# Copy backend code
COPY . .

# Expose port
EXPOSE 8000

# Start command
CMD ["uvicorn", "application.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]


