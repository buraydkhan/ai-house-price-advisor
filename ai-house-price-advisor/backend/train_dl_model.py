"""Train a small MLPRegressor (deep learning) model alongside the existing RF model."""
import numpy as np
import pandas as pd
import joblib
from pathlib import Path
from sklearn.neural_network import MLPRegressor
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error, r2_score

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = PROJECT_ROOT / "data" / "raw" / "data.csv"
MODELS_DIR = PROJECT_ROOT / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

print("Loading data...")
df = pd.read_csv(DATA_PATH)

# Drop rows with missing price
df = df.dropna(subset=["price"])

# Preprocess same as RF pipeline
# Drop non-numeric columns
drop_cols = ["date", "street", "country", "price"]
feature_cols = [c for c in df.columns if c not in drop_cols]

# Encode categoricals
label_encoders = joblib.load(MODELS_DIR / "label_encoders.joblib") if (MODELS_DIR / "label_encoders.joblib").exists() else {}

for col in ["city", "statezip", "waterfront", "view", "condition"]:
    if col in df.columns:
        if col in label_encoders:
            le = label_encoders[col]
            df[col] = df[col].astype(str).map(lambda x: x if x in le.classes_ else le.classes_[0])
            df[col] = le.transform(df[col].astype(str))
        else:
            le = LabelEncoder()
            df[col] = le.fit_transform(df[col].astype(str))
            label_encoders[col] = le

# Save label encoders
joblib.dump(label_encoders, MODELS_DIR / "label_encoders.joblib")
print("Label encoders updated.")

# Add imputed flags
df["sqft_basement_imputed"] = (df["sqft_basement"] == 0).astype(int)
df["yr_renovated_imputed"] = (df["yr_renovated"] == 0).astype(int)

# Feature columns matching RF model
feature_names = [
    "bedrooms", "bathrooms", "sqft_living", "sqft_lot", "floors",
    "waterfront", "view", "condition", "sqft_above", "sqft_basement",
    "yr_built", "yr_renovated", "city", "statezip",
    "sqft_basement_imputed", "yr_renovated_imputed",
]

X = df[feature_names].values.astype(float)
y = df["price"].values.astype(float)

# Scale features (important for neural networks)
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# Split
X_train, X_test, y_train, y_test = train_test_split(X_scaled, y, test_size=0.2, random_state=42)

print(f"Training MLPRegressor on {len(X_train)} samples...")
print(f"Architecture: 128 -> 64 -> 32 -> 1 (4 layers, ReLU activation)")

mlp = MLPRegressor(
    hidden_layer_sizes=(128, 64, 32),
    activation="relu",
    solver="adam",
    max_iter=500,
    early_stopping=True,
    validation_fraction=0.1,
    random_state=42,
    verbose=False,
)

mlp.fit(X_train, y_train)

y_pred = mlp.predict(X_test)
mae = mean_absolute_error(y_test, y_pred)
r2 = r2_score(y_test, y_pred)

print(f"Test MAE: ${mae:,.0f}")
print(f"Test R²:  {r2:.4f}")
print(f"Iterations: {mlp.n_iter_}")

# Save model + scaler together
model_data = {
    "model": mlp,
    "scaler": scaler,
    "feature_names": feature_names,
}
joblib.dump(model_data, MODELS_DIR / "dl_model.joblib")
print(f"\nSaved dl_model.joblib to {MODELS_DIR}")
