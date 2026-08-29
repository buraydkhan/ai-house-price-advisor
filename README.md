This project implements a full-stack AI system for house price prediction using the Random Forest Regressor model. The system takes property characteristics (location, size, rooms, condition, etc.) and returns a predicted price with a confidence interval range.

Prerequisites
Python 3.10+
pip install fastapi uvicorn
Setup
Clone the repository
Install dependencies: pip install fastapi uvicorn
Ensure the dataset is at ai-house-price-advisor/data/raw/data.csv
Run the server
cd ai-house-price-advisor
uvicorn backend.main:app --host 0.0.0.0 --port 8000
Then visit http://localhost:8000 in your web browser.
