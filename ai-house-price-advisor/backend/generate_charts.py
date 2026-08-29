"""Generate static chart images for the frontend using matplotlib."""
import os
import numpy as np
import pandas as pd
import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = PROJECT_ROOT / "data" / "raw" / "data.csv"
MODELS_DIR = PROJECT_ROOT / "models"
CHARTS_DIR = PROJECT_ROOT / "frontend" / "charts"

CHARTS_DIR.mkdir(parents=True, exist_ok=True)

plt.rcParams.update({
    "figure.facecolor": "white",
    "axes.facecolor": "#f8faff",
    "axes.edgecolor": "#c0c8d8",
    "axes.grid": True,
    "grid.alpha": 0.3,
    "font.family": "sans-serif",
    "font.size": 9,
    "axes.titlesize": 11,
    "axes.labelsize": 9,
    "xtick.labelsize": 8,
    "ytick.labelsize": 8,
    "figure.dpi": 120,
})

COLORS = {
    "bar": "#4f46e5",
    "bar2": "#14b8a6",
    "scatter": "#ec4899",
    "accent": "#fbbf24",
    "grid": "#e2e8f0",
}

df = pd.read_csv(DATA_PATH)
model = joblib.load(MODELS_DIR / "ml_model.joblib")

# --- Chart 1: Feature Importance ---
feature_names = [
    'bedrooms', 'bathrooms', 'sqft_living', 'sqft_lot', 'floors',
    'waterfront', 'view', 'condition', 'sqft_above', 'sqft_basement',
    'yr_built', 'yr_renovated', 'city', 'statezip',
    'sqft_basement_imputed', 'yr_renovated_imputed'
]
importances = model.feature_importances_
idx = np.argsort(importances)

fig, ax = plt.subplots(figsize=(5.5, 3.2))
ax.barh(np.array(feature_names)[idx], importances[idx], color=COLORS["bar"], height=0.6, edgecolor="none")
ax.set_xlabel("Importance")
ax.set_title("Feature Importance (Random Forest)")
ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"{x*100:.0f}%"))
plt.tight_layout()
fig.savefig(CHARTS_DIR / "importance.png", bbox_inches="tight")
plt.close(fig)
print("  [ok] importance.png")

# --- Chart 2: Price Distribution ---
price_bins = [0, 200000, 400000, 600000, 800000, 1000000, 1500000, 2000000, float("inf")]
price_labels = ["0-200K", "200-400K", "400-600K", "600-800K", "800K-1M", "1-1.5M", "1.5-2M", "2M+"]
df["price_bucket"] = pd.cut(df["price"], bins=price_bins, labels=price_labels)
counts = df["price_bucket"].value_counts().reindex(price_labels, fill_value=0)

fig, ax = plt.subplots(figsize=(5.5, 3.2))
bars = ax.bar(price_labels, counts.values, color=COLORS["bar"], width=0.65, edgecolor="none")
ax.set_ylabel("Properties")
ax.set_title("Price Distribution")
ax.tick_params(axis="x", rotation=35)
plt.tight_layout()
fig.savefig(CHARTS_DIR / "price_dist.png", bbox_inches="tight")
plt.close(fig)
print("  [ok] price_dist.png")

# --- Chart 3: Average Price by City ---
city_avg = df.groupby("city")["price"].agg(["mean", "count"]).sort_values("mean", ascending=True).tail(12)

fig, ax = plt.subplots(figsize=(5.5, 3.2))
bars = ax.barh(city_avg.index, city_avg["mean"], color=COLORS["bar2"], height=0.6, edgecolor="none")
ax.set_xlabel("Avg Price ($)")
ax.set_title("Average Price by City")
ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"${x/1000:.0f}K"))
plt.tight_layout()
fig.savefig(CHARTS_DIR / "city_prices.png", bbox_inches="tight")
plt.close(fig)
print("  [ok] city_prices.png")

# --- Chart 4: Price vs Sqft Living ---
sample = df[["sqft_living", "price"]].dropna().sample(min(300, len(df)), random_state=42)

fig, ax = plt.subplots(figsize=(5.5, 3.2))
ax.scatter(sample["sqft_living"], sample["price"], s=14, alpha=0.45, color=COLORS["scatter"], edgecolors="none")
ax.set_xlabel("Living Area (sqft)")
ax.set_ylabel("Price ($)")
ax.set_title("Price vs Living Area")
ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"${x/1000:.0f}K"))
plt.tight_layout()
fig.savefig(CHARTS_DIR / "scatter.png", bbox_inches="tight")
plt.close(fig)
print("  [ok] scatter.png")

# --- Summary stats as a small table image ---
summary = {
    "Median Price": f"${df['price'].median():,.0f}",
    "Mean Price": f"${df['price'].mean():,.0f}",
    "Total Records": f"{len(df):,}",
    "Max Price": f"${df['price'].max():,.0f}",
}

fig, ax = plt.subplots(figsize=(5.5, 1.0))
ax.axis("off")
table = ax.table(
    cellText=[list(summary.values())],
    colLabels=list(summary.keys()),
    loc="center",
    cellLoc="center",
)
table.auto_set_font_size(False)
table.set_fontsize(9)
table.scale(1, 1.5)
for (row, col), cell in table.get_celld().items():
    if row == 0:
        cell.set_facecolor("#4f46e5")
        cell.set_text_props(color="white", fontweight="bold")
    else:
        cell.set_facecolor("#f0f4ff")
plt.tight_layout()
fig.savefig(CHARTS_DIR / "summary.png", bbox_inches="tight", dpi=120)
plt.close(fig)
print("  [ok] summary.png")

print(f"\nAll charts saved to {CHARTS_DIR}")
