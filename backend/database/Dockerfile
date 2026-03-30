FROM python:3.11-slim

WORKDIR /app

# Install dependencies
RUN pip install psycopg2-binary python-dotenv

COPY . .

CMD ["python", "scripts/run_create.py"]
