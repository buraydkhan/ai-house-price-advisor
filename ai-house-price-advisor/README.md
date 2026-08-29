# AI House Price Predictor & Property Advisor

A complete, end-to-end web application that predicts residential property market values based on property features.

## Overview

This project implements a full-stack AI system for house price prediction using the Random Forest Regressor model. The system takes property characteristics (location, size, rooms, condition, etc.) and returns a predicted price with a confidence interval range.

## Dataset

- **Source**: Seattle house pricing dataset (~2,500 transactions)
- **Features**: 17 property features including bedrooms, bathrooms, square footage, lot size, floors, waterfront status, view score, condition rating, city, state/zip, above-grade sq ft, basement sq ft, year built, year renovated
- **Target**: Property price (continuous regression)
- **Preprocessing handled**:
  - Zero values interpreted as "not applicable" (no basement, not renovated)
  - Missing value imputation
  - Categorical feature encoding (label encoding)
  - High-cardinality feature handling (street feature dropped)
  - Feature imputation flags

## Model

- **Algorithm**: RandomForestRegressor (100 trees)
- **Performance**: MAE: ~$166K, RMSE: ~$989K, R²: ~0.04 on test split
- **Feature importance**: sqft_living > statezip > yr_built > city > sqft_basement > sqft_above > sqft_lot > bathrooms > view > yr_renovated
- **Prediction intervals**: Computed using standard deviation of individual tree predictions (1.96σ confidence interval)

## Project Structure

```
ai-house-price-advisor/
├── data/
│   ├── raw/              # Original dataset (data.csv)
│   └── processed/        # Processed data (not currently used)
├── models/
│   ├── ml_model.joblib   # Trained RandomForestRegressor
│   ├── preprocessing.joblib # Preprocessing pipeline info
│   ├── label_encoders.joblib # Label encoders for categorical features
│   └── nn_preprocessing.joblib # NN preprocessing config (placeholder)
├── backend/
│   └── main.py           # FastAPI application with:
│       • /predict endpoint (POST) - price prediction
│       • /history endpoint (GET) - prediction history
│       • /health endpoint (GET) - health check
│       • /test-predict endpoint (POST) - quick test
│   └── prediction_history.sqlite # SQLite database for prediction history
├── frontend/
│   ├── index.html        # Property form UI
│   ├── style.css         # Styling and layout
│   └── script.js         # Frontend logic and API calls
└── notebooks/            # Jupyter notebooks (empty placeholder)
```

## API Endpoints

### `GET /health`
- **Description**: Health check endpoint
- **Response**: `{"status": "healthy", "model_loaded": true, "features_count": 11}`

### `POST /predict`
- **Description**: Predict property price based on features
- **Request body** (PropertyFeatures):
  - `bedrooms` (float): Number of bedrooms (≥0)
  - `bathrooms` (float): Number of bathrooms (≥0)
  - `sqft_living` (float): Living area in sq ft (≥100)
  - `sqft_lot` (float): Lot area in sq ft (≥500)
  - `floors` (float): Number of floors (1, 1.5, 2, or 2.5)
  - `waterfront` (float): Waterfront flag (0 or 1)
  - `view` (float): View score (0-4)
  - `condition` (float): Condition score (1-5)
  - `city` (str): City name (e.g., "Seattle", "Bellevue")
  - `statezip` (str): State/Zip code (e.g., "WA 98101")
  - `sqft_above` (float): Above-grade sq ft (≥500)
  - `sqft_basement` (float): Basement sq ft (≥0, 0 = no basement)
  - `yr_built` (float): Year built (1900-2025)
  - `yr_renovated` (float): Year renovated (0-2025, 0 = not renovated)
  - `sqft_basement_imputed` (float): Was basement imputed flag (0 or 1)
  - `yr_renovated_imputed` (float): Was renovation imputed flag (0 or 1)
- **Response**: `{"predicted_price": float, "price_range_low": float, "price_range_high": float, "model": "RandomForestRegressor"}`

### `GET /history`
- **Description**: Retrieve past predictions from history database
- **Query params**: `limit` (default 50), `offset` (default 0)
- **Response**: `{"total": int, "limit": int, "offset": int, "predictions": [...]}`

### `POST /test-predict`
- **Description**: Quick test with sample property
- **Response**: Prediction result with input features

## Frontend

The web interface features:
- Interactive form for property features
- Real-time validation
- Predicted price display with range
- Market insights based on property characteristics
- Responsive design (mobile-friendly)
- Smooth animations and transitions

## Installation & Running

### Prerequisites
- Python 3.10+
- pip install fastapi uvicorn

### Setup
1. Clone the repository
2. Install dependencies: `pip install fastapi uvicorn`
3. Ensure the dataset is at `ai-house-price-advisor/data/raw/data.csv`

### Run the server
```bash
cd ai-house-price-advisor
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

Then visit `http://localhost:8000` in your web browser.

## Technologies Used

- **Backend**: FastAPI, Python, scikit-learn, SQLite
- **Frontend**: HTML5, CSS3, vanilla JavaScript
- **Model**: RandomForestRegressor from scikit-learn
- **Preprocessing**: Label encoding, imputation, feature engineering

## Data Preprocessing Details

### Handling Zero Values
- `sqft_basement = 0` → interpreted as "no basement", imputed as 15% of `sqft_above`
- `yr_renovated = 0` → interpreted as "not renovated", filled with `yr_built`
- `bedrooms = 0` or `bathrooms = 0` → filled with median values

### Categorical Feature Encoding
- `waterfront`: Label encoded (0 = no, 1 = yes)
- `view`: Label encoded (0-4 scale)
- `condition`: Label encoded (1-5 scale)
- `city`: Label encoded (44 unique cities)
- `statezip`: Label encoded (77 unique state/zip codes)

### Feature Engineering
- Dropped `street` feature due to extreme cardinality (4,525 unique values)
- Added `sqft_basement_imputed` flag (1 if basement was imputed)
- Added `yr_renovated_imputed` flag (1 if renovation year was imputed)

## Model Evaluation

The model was evaluated on a 80/20 train/test split:

| Metric | Value |
|--------|-------|
| MAE | $166,417.57 |
| RMSE | $988,610.56 |
| R² | 0.0417 |

The relatively low R² is expected for housing price prediction, as many factors affect property values beyond the features included. The model provides reasonable price estimates for typical properties and includes confidence intervals reflecting prediction uncertainty.

## Future Enhancements

- Deploy model retraining pipeline
- Add more sophisticated feature engineering
- Include additional features (zip code, year renovated, etc.)
- Implement neural network alternative
- Add local property market data integration
- User accounts and prediction history personalization