import logging
from apscheduler.schedulers.background import BackgroundScheduler  # type: ignore
import subprocess
import time
import os
import sys
from datetime import datetime, timezone

# -------------------------------------------------
# Logging
# -------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


critical_job_completed = False


def _run(cmd: list[str], cwd: str | None = None) -> subprocess.CompletedProcess:

    result = subprocess.run(
        cmd,
        check=True,
        capture_output=True,
        text=True,
        cwd=cwd or os.getcwd(),
    )
    if result.stdout:
        logger.info("[%s stdout]\n%s", cmd[-1], result.stdout.strip())
    if result.stderr:
        logger.debug("[%s stderr]\n%s", cmd[-1], result.stderr.strip())
    return result


def run_script(script_path: str, max_retries: int = 3, retry_delay: int = 60) -> bool:

    for attempt in range(1, max_retries + 1):
        try:
            logger.info("Running script: %s (attempt %d/%d)", script_path, attempt, max_retries)
            _run([sys.executable, script_path])
            logger.info("%s completed successfully", script_path)
            return True
        except subprocess.CalledProcessError as e:
            logger.error("%s failed with exit code %s (attempt %d/%d)", script_path, e.returncode, attempt, max_retries)
            if e.stdout:
                logger.error("[%s stdout]\n%s", script_path, e.stdout.strip())
            if e.stderr:
                logger.error("[%s stderr]\n%s", script_path, e.stderr.strip())
        except Exception as e:
            logger.error("Unexpected error running %s: %s (attempt %d/%d)", script_path, str(e), attempt, max_retries)

        if attempt < max_retries:
            logger.info("Retrying %s in %d seconds...", script_path, retry_delay)
            time.sleep(retry_delay)
        else:
            logger.error("%s failed after %d attempts. Giving up.", script_path, max_retries)
            return False

    return False


def run_update_crypto_critical() -> bool:

    global critical_job_completed
    logger.info("Running critical update_crypto job...")

    ok = run_script("data/update_crypto.py", max_retries=5, retry_delay=60)
    critical_job_completed = ok
    if ok:
        logger.info("Critical update_crypto.py completed successfully")
    else:
        logger.error("Critical update_crypto.py failed after retries.")
    return ok


def main():
    global critical_job_completed
    logger.info("Starting scheduler...")
    time.sleep(60)


    startup_jobs = [
        ("data/news_ingestion.py", "News ingestion"),
        ("data/reddit_ingest.py", "Reddit ingest"),
        ("data/RedditScrapper.py", "Reddit scraper"),
        ("data/update_crypto.py", "Critical update_crypto job"),
        ("data/binance_historic_ingestion.py", "Binance historic ingestion"),
        ("data/binance_ingestion.py", "Binance ingestion"),
        ("data/coinGecko_ingestion.py", "CoinGecko ingestion"),
        ("data/CryptoPanic_CoinCompare.py", "CryptoPanic CoinCompare"),
        ("data/youTubeScrapper.py", "YouTube scraper"),
        ("data/telegramScrapper.py", "Telegram scraper"),        
        ("ai/forecasting/src/multicoin_run_pipeline.py", "Multicoin run pipeline"),
        ("ai/sentiment/src/coins_and_market_sentiment_analysis.py", "Sentiment analysis"),
        ("backend/database/scripts/data_archival.py", "Data archival"),
    ]

    logger.info("=== STARTING UPSEQUENCE EXECUTION ===")
    logger.info("Executing %d jobs in specified order...", len(startup_jobs))

    for i, (script_path, job_name) in enumerate(startup_jobs, 1):
        logger.info("[%d/%d] Starting %s...", i, len(startup_jobs), job_name)
        if script_path == "data/update_crypto.py":
            if not run_update_crypto_critical():
                logger.error("Critical %s failed. Stopping startup sequence.", job_name)
                return
        else:
            if not run_script(script_path):
                logger.warning("%s failed during startup, but continuing with next job...", job_name)
        logger.info("[%d/%d] Completed %s", i, len(startup_jobs), job_name)

    logger.info("=== STARTUP SEQUENCE COMPLETED SUCCESSFULLY ===")
    logger.info("Starting scheduled jobs...")
    critical_job_completed = True


    scheduler = BackgroundScheduler(
        timezone=timezone.utc,               
        job_defaults={
            "coalesce": True,                
            "max_instances": 1,             
            "misfire_grace_time": 300,      
        },
    )

    # Every week
    scheduler.add_job(
        run_update_crypto_critical,
        trigger="cron",
        day_of_week="mon",
        hour=0,
        minute=0,
        id="update_cryptos_weekly",
        jitter=10,  
    )

    # Everyday Binance_historic_ingestion&data archival
    scheduler.add_job(
        lambda: run_script("data/binance_historic_ingestion.py"),
        trigger="cron",
        hour=0,
        minute=10,
        id="binance_historic_ingestion_daily",
        jitter=10,
    )
    scheduler.add_job(
        lambda: run_script("backend/database/scripts/data_archival.py"),
        trigger="cron",
        hour=0,
        minute=10,
        id="data_archival_daily",
        jitter=20,  
    )

    # Everyday pull Reddit
    scheduler.add_job(
        lambda: run_script("data/reddit_ingest.py"),
        trigger="cron",
        hour=0,
        minute=10,
        id="reddit_ingest_daily",
        jitter=30,
    )

    # Continuous tasks
    scheduler.add_job(
        lambda: run_script("data/binance_ingestion.py"),
        "interval",
        seconds=60,
        id="binance_ingestion_interval",
    )
    scheduler.add_job(
        lambda: run_script("data/coinGecko_ingestion.py"),
        "interval",
        minutes=5,
        id="coinGecko_ingestion_interval",
    )
    scheduler.add_job(
        lambda: run_script("data/news_ingestion.py"),
        "interval",
        minutes=60,
        id="news_ingestion_interval",
    )
    scheduler.add_job(
        lambda: run_script("data/youTubeScrapper.py"),
        "interval",
        hours=1,
        id="youTubeScrapper_interval",
    )
    scheduler.add_job(
        lambda: run_script("data/telegramScrapper.py"),
        "interval",
        hours=1,
        id="telegramScrapper_interval",
    )
    scheduler.add_job(
        lambda: run_script("data/RedditScrapper.py"),
        "interval",
        hours=1,
        id="RedditScrapper_interval",
    )
    scheduler.add_job(
        lambda: run_script("ai/forecasting/src/multicoin_run_pipeline.py"),
        "interval",
        hours=1,
        id="multicoin_run_pipeline_interval",
    )
    scheduler.add_job(
        lambda: run_script("ai/sentiment/src/coins_and_market_sentiment_analysis.py"),
        "interval",
        hours=1,
        id="coins_and_market_sentiment_analysis_interval",
    )
    scheduler.add_job(
        lambda: run_script("data/CryptoPanic_CoinCompare.py"),
        "interval",
        hours=12,
        id="CryptoPanic_CoinCompare_interval",
    )

    scheduler.start()
    logger.info("Scheduler started. Press Ctrl+C to exit.")

    try:
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
        logger.info("Scheduler stopped.")


if __name__ == "__main__":
    main()
