import os
import json
import sqlite3
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd
import joblib
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from typing import Union
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Paths – keep everything relative to the project root
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
MODELS_DIR = PROJECT_ROOT / "models"

ML_MODEL_PATH = MODELS_DIR / "ml_model.joblib"
PREPROCESSING_PATH = MODELS_DIR / "preprocessing.joblib"
LABEL_ENCODERS_PATH = MODELS_DIR / "label_encoders.joblib"

# ---------------------------------------------------------------------------
# Load artifacts once at startup
# ---------------------------------------------------------------------------
_ml_model = None
_preprocessing = None
_label_encoders = None


def _load_artifacts():
    global _ml_model, _preprocessing, _label_encoders
    if _ml_model is None:
        _ml_model = joblib.load(ML_MODEL_PATH)
    if _preprocessing is None:
        _preprocessing = joblib.load(PREPROCESSING_PATH)
    if _label_encoders is None:
        _label_encoders = joblib.load(LABEL_ENCODERS_PATH)


_load_artifacts()

# ---------------------------------------------------------------------------
# SQLite database for prediction history
# ---------------------------------------------------------------------------
DB_PATH = PROJECT_ROOT / "prediction_history.sqlite"


def _init_db():
    """Create the predictions table if it doesn't exist."""
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            bedrooms REAL,
            bathrooms REAL,
            sqft_living REAL,
            sqft_lot REAL,
            floors REAL,
            waterfront INTEGER,
            view INTEGER,
            condition INTEGER,
            city INTEGER,
            statezip INTEGER,
            sqft_above REAL,
            sqft_basement REAL,
            yr_built REAL,
            yr_renovated REAL,
            sqft_basement_imputed INTEGER,
            yr_renovated_imputed INTEGER,
            predicted_price REAL,
            price_range_low REAL,
            price_range_high REAL
        )
        """
    )
    conn.commit()
    conn.close()


_init_db()

# ---------------------------------------------------------------------------
# Pydantic models for the API request/response
# ---------------------------------------------------------------------------


class PropertyFeatures(BaseModel):
    bedrooms: float = Field(..., ge=0, description="Number of bedrooms")
    bathrooms: float = Field(..., ge=0, description="Number of bathrooms")
    sqft_living: float = Field(..., ge=0, description="Living area in sq ft")
    sqft_lot: float = Field(..., ge=0, description="Lot area in sq ft")
    floors: float = Field(..., ge=1, description="Number of floors")
    waterfront: float = Field(ge=0, le=1, description="Waterfront flag (0 or 1)")
    view: float = Field(ge=0, le=4, description="View score (0-4)")
    condition: float = Field(ge=1, le=5, description="Condition score (1-5)")
    city: Union[str, float] = Field(..., description="City name (e.g., Seattle) or encoded integer")
    statezip: Union[str, float] = Field(..., description="State/Zip code (e.g., WA 98101) or encoded integer")
    sqft_above: float = Field(..., ge=0, description="Above-grade sq ft")
    sqft_basement: float = Field(..., ge=0, description="Basement sq ft (0 = no basement)")
    yr_built: float = Field(..., ge=1900, le=2025, description="Year built")
    yr_renovated: float = Field(ge=0, le=2025, description="Year renovated (0 = not renovated)")
    sqft_basement_imputed: float = Field(0.0, ge=0, le=1, description="Was basement imputed flag")
    yr_renovated_imputed: float = Field(0.0, ge=0, le=1, description="Was renovation imputed flag")


class PredictionResponse(BaseModel):
    predicted_price: float
    price_range_low: float
    price_range_high: float
    model: str = "RandomForestRegressor"
    confidence: Optional[float] = None


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="AI House Price Predictor & Property Advisor",
    description="""
    Predicts residential property market values based on property features.
    
    Supports:
    - Price prediction with confidence intervals
    - Prediction history tracking
    - Market assessments and comparisons
    
    Trained on Seattle house pricing data (~2,500 transactions).
    """,
    version="1.0.0",
)

app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

# ---------------------------------------------------------------------------
# Helper: apply the same preprocessing used during training
# ---------------------------------------------------------------------------


def preprocess_input(features: dict) -> np.ndarray:
    """Transform raw input dict into model-ready numpy array.

    The RF model was trained with the exact feature order below:
    ['bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors',
     'waterfront', 'view', 'condition', 'sqft_above', 'sqft_basement',
     'yr_built', 'yr_renovated', 'city', 'statezip',
     'sqft_basement_imputed', 'yr_renovated_imputed']
    """
    x = features.copy()

    # Ensure imputed flags are present
    x['sqft_basement_imputed'] = int(x.get('sqft_basement_imputed', 0))
    x['yr_renovated_imputed'] = int(x.get('yr_renovated_imputed', 0))

    # Encode categorical fields in the same way as the training data
    category_map = {
        'waterfront': ['waterfront'],
        'view': ['view'],
        'condition': ['condition'],
        'city': ['city'],
        'statezip': ['statezip'],
    }

    values = []
    for col in ['bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors']:
        values.append(float(x.get(col, 0)))

    for col in ['waterfront', 'view', 'condition']:
        val = x.get(col, 0)
        if col in _label_encoders:
            le = _label_encoders[col]
            try:
                encoded = le.transform([str(val)])[0]
            except (ValueError, TypeError, KeyError):
                # If string transform fails, val might be a pre-encoded integer;
                # use it directly if it's a valid index into the encoder's classes
                try:
                    ival = int(val)
                    if 0 <= ival < len(le.classes_):
                        encoded = ival
                    else:
                        encoded = -1
                except (ValueError, TypeError):
                    encoded = -1
            values.append(float(encoded))
        else:
            values.append(float(int(val) if val is not None else 0))

    for col in ['sqft_above', 'sqft_basement', 'yr_built', 'yr_renovated']:
        values.append(float(x.get(col, 0)))

    for col in ['city', 'statezip']:
        val = x.get(col, 0)
        if col in _label_encoders:
            le = _label_encoders[col]
            try:
                encoded = le.transform([str(val)])[0]
            except (ValueError, TypeError, KeyError):
                # If string transform fails, val might be a pre-encoded integer;
                # use it directly if it's a valid index into the encoder's classes
                try:
                    ival = int(val)
                    if 0 <= ival < len(le.classes_):
                        encoded = ival
                    else:
                        encoded = -1
                except (ValueError, TypeError):
                    encoded = -1
            values.append(float(encoded))
        else:
            values.append(float(int(val) if val is not None else 0))

    values.append(float(x.get('sqft_basement_imputed', 0)))
    values.append(float(x.get('yr_renovated_imputed', 0)))

    return np.array([values], dtype=float)


# ---------------------------------------------------------------------------
# API Routes
# ---------------------------------------------------------------------------


@app.on_event("startup")
def startup():
    _load_artifacts()
    _init_db()


@app.get("/", include_in_schema=False)
def root():
    """Serve the frontend home page for the web app."""
    index_path = FRONTEND_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return {
        "message": "AI House Price Predictor & Property Advisor",
        "status": "online",
        "model": "RandomForestRegressor",
    }


@app.get("/health", include_in_schema=False)
def health_check():
    """Verify the model and preprocessing artifacts are loaded."""
    _load_artifacts()
    return {
        "status": "healthy",
        "model_loaded": _ml_model is not None,
        "features_count": len(_preprocessing['numerical_cols']) if _preprocessing else 0,
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(property_features: PropertyFeatures):
    """
    Predict property price based on features.

    Takes all property characteristics (location, size, rooms, condition, etc.)
    and returns a predicted price with a confidence interval range.
    """
    _load_artifacts()

# Convert Pydantic model to dict
    features = property_features.dict()

    try:
        # Preprocess using the same pipeline as training
        arr = preprocess_input(features)

        feature_names = [
            'bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors',
            'waterfront', 'view', 'condition', 'sqft_above', 'sqft_basement',
            'yr_built', 'yr_renovated', 'city', 'statezip',
            'sqft_basement_imputed', 'yr_renovated_imputed'
        ]
        model_input = pd.DataFrame(arr, columns=feature_names)

        # Model prediction
        predicted_price = float(_ml_model.predict(model_input)[0])

        # Simple confidence interval: ±1.96 * standard deviation from tree variance
        # Since RandomForest doesn't directly give us prediction intervals,
        # we use the standard deviation of tree predictions as uncertainty
        tree_predictions = np.array(
            [tree.predict(model_input.to_numpy())[0] for tree in _ml_model.estimators_]
        )
        std_err = float(np.std(tree_predictions))
        price_range_low = round(predicted_price - 1.96 * std_err, 2)
        price_range_high = round(predicted_price + 1.96 * std_err, 2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}") from e

    # Ensure reasonable bounds
    price_range_low = max(0, price_range_low)
    price_range_high = max(price_range_low + 10000, price_range_high)

    # Store prediction in SQLite history
    # Encode categorical values for integer columns
    city_encoded = int(features["city"]) if isinstance(features["city"], (int, float)) else -1
    statezip_encoded = int(features["statezip"]) if isinstance(features["statezip"], (int, float)) else -1
    
    try:
        conn = sqlite3.connect(str(DB_PATH))
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO predictions (
                bedrooms, bathrooms, sqft_living, sqft_lot, floors,
                waterfront, view, condition, city, statezip,
                sqft_above, sqft_basement, yr_built, yr_renovated,
                sqft_basement_imputed, yr_renovated_imputed,
                predicted_price, price_range_low, price_range_high
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                features["bedrooms"],
                features["bathrooms"],
                features["sqft_living"],
                features["sqft_lot"],
                features["floors"],
                int(features["waterfront"]),
                int(features["view"]),
                int(features["condition"]),
                city_encoded,
                statezip_encoded,
                features["sqft_above"],
                features["sqft_basement"],
                features["yr_built"],
                features["yr_renovated"],
                features["sqft_basement_imputed"],
                features["yr_renovated_imputed"],
                predicted_price,
                price_range_low,
                price_range_high,
            ),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        # History storage failure shouldn't break the prediction
        print(f"Warning: could not save prediction history: {e}")

    return PredictionResponse(
        predicted_price=round(predicted_price, 2),
        price_range_low=round(price_range_low, 2),
        price_range_high=round(price_range_high, 2),
    )


@app.get("/history", include_in_schema=False)
def prediction_history(
    limit: int = 50,
    offset: int = 0,
):
    """
    Retrieve past predictions from the SQLite history database.

    Useful for showing users their prediction history or
    analyzing prediction trends over time.
    """
    conn = sqlite3.connect(str(DB_PATH))
    cur = conn.cursor()

    # Get total count
    cur.execute("SELECT COUNT(*) FROM predictions")
    total = cur.fetchone()[0]

    # Fetch rows with pagination
    cur.execute(
        """
        SELECT id, created_at, bedrooms, bathrooms, sqft_living,
               predicted_price, price_range_low, price_range_high
        FROM predictions
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (limit, offset),
    )
    rows = cur.fetchall()
    conn.close()

    history = []
    for row in rows:
        history.append(
            {
                "id": row[0],
                "created_at": row[1],
                "bedrooms": row[2],
                "bathrooms": row[3],
                "sqft_living": row[4],
                "predicted_price": row[5],
                "price_range_low": row[6],
                "price_range_high": row[7],
            }
        )

    return {"total": total, "limit": limit, "offset": offset, "predictions": history}


# ---------------------------------------------------------------------------
# Example/test endpoint
# ---------------------------------------------------------------------------


@app.post("/test-predict", include_in_schema=False)
def test_predict():
    """Quick test with a sample property to verify the API works."""
    _load_artifacts()

    # Example: 3-bedroom, 2-bath, 2000 sqft living, no waterfront, view=2, good condition
    features = {
        "bedrooms": 3.0,
        "bathrooms": 2.0,
        "sqft_living": 2000.0,
        "sqft_lot": 5000.0,
        "floors": 1.0,
        "waterfront": 0.0,
        "view": 2.0,
        "condition": 4.0,
        "city": 15,  # Example encoded value
        "statezip": 10,  # Example encoded value
        "sqft_above": 1800.0,
        "sqft_basement": 200.0,
        "yr_built": 1995.0,
        "yr_renovated": 0.0,
        "sqft_basement_imputed": 1,
        "yr_renovated_imputed": 1,
    }

    arr = preprocess_input(features)
    feature_names = [
        'bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors',
        'waterfront', 'view', 'condition', 'sqft_above', 'sqft_basement',
        'yr_built', 'yr_renovated', 'city', 'statezip',
        'sqft_basement_imputed', 'yr_renovated_imputed'
    ]
    model_input = pd.DataFrame(arr, columns=feature_names)
    predicted_price = float(_ml_model.predict(model_input)[0])
    tree_predictions = np.array([tree.predict(model_input)[0] for tree in _ml_model.estimators_])
    std_err = float(np.std(tree_predictions))
    price_range_low = round(predicted_price - 1.96 * std_err, 2)
    price_range_high = round(predicted_price + 1.96 * std_err, 2)

    return {
        "input_features": features,
        "predicted_price": round(predicted_price, 2),
        "price_range": [price_range_low, price_range_high],
        "model": "RandomForestRegressor",
    }
