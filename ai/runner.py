import os
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))

#from forecast.models import ForecastModel
from sentiment.models.coins_and_market_sentiment_analysis import main

#fm = ForecastModel()

sm = main()

# def run_forecast(forecast_input):
#     """
#     forecast_input: whatever shape ForecastModel.predict expects,
#     e.g. a List[float] or DataFrame, etc.
#     """
#     return fm.predict(forecast_input)


def run_sentiment(text: str):
    sm = main()
    return sm