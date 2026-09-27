"""
FastAPI service exposing the machine learning classification layer
(section 3.6.2 of the paper). The rule-based screening layer lives in the
ASP.NET backend; this service only handles the ML side and returns the
logistic regression / decision tree / combined probabilities for a
transaction, plus the held-out test predictions used by the backend's
evaluation runner.
"""
import json
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

MODEL_DIR = Path(__file__).parent / "model"

app = FastAPI(title="Fraud Detection ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logreg = joblib.load(MODEL_DIR / "logreg.pkl")
tree = joblib.load(MODEL_DIR / "tree.pkl")
metrics = json.loads((MODEL_DIR / "metrics.json").read_text())
training_info = json.loads((MODEL_DIR / "training_info.json").read_text())
samples = json.loads((MODEL_DIR / "samples.json").read_text())
samples_by_id = {s["sample_id"]: s for s in samples}
test_predictions = pd.read_csv(MODEL_DIR / "test_predictions.csv")

# Fixed, deterministic for this dataset (Time, V1-V28, Amount).
feature_cols = ["Time"] + [f"V{i}" for i in range(1, 29)] + ["Amount"]


# Demo control. Real fraud rows come in two kinds: those the ML layer recognises ("anomalous",
# combined probability >= 0.5) and those it misses ("subtle"). Legitimate rows are "typical".
# The split is derived from the trained models, so it stays correct if the models are retrained.
def _combined(sample):
    X = pd.DataFrame([{col: sample[col] for col in feature_cols}], columns=feature_cols)
    return (float(logreg.predict_proba(X)[0, 1]) + float(tree.predict_proba(X)[0, 1])) / 2


for _s in samples:
    if _s["Class"] == 1:
        _s["profile"] = "anomalous" if _combined(_s) >= 0.5 else "subtle"
    else:
        _s["profile"] = "typical"


class PredictRequest(BaseModel):
    sample_id: str


@app.get("/health")
def health():
    return {"status": "ok", "samples": len(samples), "test_rows": int(len(test_predictions))}


@app.get("/samples")
def list_samples():
    """Sample transactions the backend can attach to a screened transaction.

    "profile" is the ground-truth class of the real dataset row, exposed only
    as a demo control: typical (legitimate), anomalous (fraud the ML layer recognises) or
    subtle (fraud the ML layer misses).
    """
    return [
        {
            "sample_id": s["sample_id"],
            "profile": s["profile"],
            "amount": s["display_amount"],
            "time_seconds": s["display_time_seconds"],
        }
        for s in samples
    ]


@app.get("/metrics")
def get_metrics():
    return metrics


@app.get("/training-info")
def get_training_info():
    return training_info


@app.get("/test-predictions")
def get_test_predictions():
    """Predictions for the whole held-out test set (label and the three probabilities)."""
    return {
        "y": test_predictions["y"].tolist(),
        "p_lr": test_predictions["p_lr"].tolist(),
        "p_dt": test_predictions["p_dt"].tolist(),
        "p_ml": test_predictions["p_ml"].tolist(),
    }


@app.post("/predict")
def predict(req: PredictRequest):
    sample = samples_by_id.get(req.sample_id)
    if sample is None:
        raise HTTPException(status_code=404, detail=f"Unknown sample_id: {req.sample_id}")

    # The ML layer always evaluates the sample's own real, recorded feature
    # values (including its real dataset-native amount). This is independent
    # of the Naira amount the user enters for the rule layer, since the two
    # are not interchangeable.
    row = {col: sample[col] for col in feature_cols}
    X = pd.DataFrame([row], columns=feature_cols)

    logreg_proba = float(logreg.predict_proba(X)[0, 1])
    tree_proba = float(tree.predict_proba(X)[0, 1])
    combined_proba = (logreg_proba + tree_proba) / 2

    return {
        "sample_id": req.sample_id,
        "profile": sample["profile"],
        "logistic_regression_probability": round(logreg_proba, 4),
        "decision_tree_probability": round(tree_proba, 4),
        "combined_ml_probability": round(combined_proba, 4),
        "dataset_amount": sample["display_amount"],
    }
