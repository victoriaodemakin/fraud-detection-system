"""
Trains the machine learning classification layer described in section 3.6.3
of the paper: a logistic regression model and a decision tree classifier,
combined by averaging predicted probabilities, evaluated individually and
in combination per the metrics in section 3.7.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import imblearn
import pandas as pd
import sklearn
from imblearn.over_sampling import SMOTE
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
)
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.tree import DecisionTreeClassifier

DATA_PATH = Path(__file__).parent / "data" / "creditcard.csv"
MODEL_DIR = Path(__file__).parent / "model"
MODEL_DIR.mkdir(exist_ok=True)

RANDOM_STATE = 42


def false_positive_rate(y_true, y_pred):
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    return fp / (fp + tn) if (fp + tn) > 0 else 0.0


def evaluate(name, y_true, y_pred):
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()
    metrics = {
        "precision": round(precision_score(y_true, y_pred, zero_division=0), 4),
        "recall": round(recall_score(y_true, y_pred, zero_division=0), 4),
        "f1_score": round(f1_score(y_true, y_pred, zero_division=0), 4),
        "false_positive_rate": round(false_positive_rate(y_true, y_pred), 4),
        "confusion_matrix": {
            "true_negative": int(tn),
            "false_positive": int(fp),
            "false_negative": int(fn),
            "true_positive": int(tp),
        },
    }
    print(f"\n--- {name} ---")
    for k, v in metrics.items():
        if k != "confusion_matrix":
            print(f"  {k}: {v}")
    print(f"  confusion_matrix: {metrics['confusion_matrix']}")
    return metrics


def main():
    print("Loading dataset...")
    df = pd.read_csv(DATA_PATH)
    raw_rows = len(df)

    # --- 3.4.i Data Cleaning ---
    missing = df.isnull().sum().sum()
    duplicates = df.duplicated().sum()
    print(f"Missing values: {missing}, duplicate rows: {duplicates}")
    df = df.drop_duplicates()

    feature_cols = ["Time"] + [f"V{i}" for i in range(1, 29)] + ["Amount"]
    X = df[feature_cols].copy()
    y = df["Class"]

    # --- Train-Test Split (before scaling and SMOTE, so the test set stays real and untouched) ---
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, stratify=y, random_state=RANDOM_STATE
    )
    print(f"Train size: {len(X_train)}  Test size: {len(X_test)}  Fraud rate (train): {y_train.mean():.5f}")

    # --- Feature Scaling: standardize Amount and Time, fitted on the TRAINING data only ---
    scaler = StandardScaler()
    X_train[["Time", "Amount"]] = scaler.fit_transform(X_train[["Time", "Amount"]])
    X_test[["Time", "Amount"]] = scaler.transform(X_test[["Time", "Amount"]])

    # --- 3.4.iii Class Imbalance Correction: SMOTE on training data only ---
    smote = SMOTE(random_state=RANDOM_STATE)
    X_train_bal, y_train_bal = smote.fit_resample(X_train, y_train)
    print(f"After SMOTE: {len(X_train_bal)} rows, fraud rate: {y_train_bal.mean():.5f}")

    # --- 3.5.3 Logistic Regression ---
    logreg = LogisticRegression(max_iter=1000, random_state=RANDOM_STATE)
    logreg.fit(X_train_bal, y_train_bal)
    logreg_proba = logreg.predict_proba(X_test)[:, 1]
    logreg_pred = (logreg_proba >= 0.5).astype(int)

    # --- 3.5.3 Decision Tree Classifier (depth-limited + pruned to reduce overfitting) ---
    tree = DecisionTreeClassifier(
        max_depth=8,
        min_samples_leaf=20,
        ccp_alpha=0.0001,
        random_state=RANDOM_STATE,
    )
    tree.fit(X_train_bal, y_train_bal)
    tree_proba = tree.predict_proba(X_test)[:, 1]
    tree_pred = (tree_proba >= 0.5).astype(int)

    # --- 3.5.3 Model Combination: average predicted probabilities ---
    combined_proba = (logreg_proba + tree_proba) / 2
    combined_pred = (combined_proba >= 0.5).astype(int)

    # --- 3.7 Evaluation Metrics, per layer and combined ---
    results = {
        "logistic_regression": evaluate("Logistic Regression", y_test, logreg_pred),
        "decision_tree": evaluate("Decision Tree", y_test, tree_pred),
        "hybrid_combined": evaluate("Hybrid (combined ML layer)", y_test, combined_pred),
        "test_set_size": int(len(y_test)),
        "test_set_fraud_count": int(y_test.sum()),
    }

    (MODEL_DIR / "metrics.json").write_text(json.dumps(results, indent=2))
    joblib.dump(logreg, MODEL_DIR / "logreg.pkl")
    joblib.dump(tree, MODEL_DIR / "tree.pkl")
    joblib.dump(scaler, MODEL_DIR / "scaler.pkl")

    # --- Predictions for the whole held-out test set, used by the backend evaluation
    # runner to compare the rule-based, ML and hybrid detectors on the same transactions ---
    pd.DataFrame(
        {
            "y": y_test.values.astype(int),
            "p_lr": np.round(logreg_proba, 4),
            "p_dt": np.round(tree_proba, 4),
            "p_ml": np.round(combined_proba, 4),
        }
    ).to_csv(MODEL_DIR / "test_predictions.csv", index=False)

    # --- Training information (reproducibility record shown on the analyst dashboard) ---
    info = {
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "random_state": RANDOM_STATE,
        "dataset_rows_raw": int(raw_rows),
        "duplicates_removed": int(duplicates),
        "dataset_rows_used": int(len(df)),
        "train_rows": int(len(X_train)),
        "train_rows_after_smote": int(len(X_train_bal)),
        "test_rows": int(len(X_test)),
        "test_fraud": int(y_test.sum()),
        "scaler": "StandardScaler fitted on the training set only (Time, Amount)",
        "logistic_regression": {"max_iter": 1000, "C": 1.0, "penalty": "l2"},
        "decision_tree": {"max_depth": 8, "min_samples_leaf": 20, "ccp_alpha": 0.0001, "criterion": "gini"},
        "smote": {"k_neighbors": 5},
        "library_versions": {
            "scikit-learn": sklearn.__version__,
            "imbalanced-learn": imblearn.__version__,
            "pandas": pd.__version__,
            "numpy": np.__version__,
        },
    }
    (MODEL_DIR / "training_info.json").write_text(json.dumps(info, indent=2))

    # --- Sample pool for the live app: real held-out transactions (with their real PCA
    # features). V1-V28 cannot be typed by a user, so the app attaches one of these to a
    # transaction. "profile" is the ground-truth class exposed as a demo control:
    # typical (legitimate) or anomalous (fraudulent). ---
    test_df = X_test.copy()
    test_df["Class"] = y_test.values
    fraud_samples = test_df[test_df["Class"] == 1].sample(n=40, random_state=RANDOM_STATE)
    legit_samples = test_df[test_df["Class"] == 0].sample(n=160, random_state=RANDOM_STATE)
    samples = pd.concat([fraud_samples, legit_samples]).sample(frac=1, random_state=RANDOM_STATE)
    samples = samples.reset_index(drop=True)
    samples.insert(0, "sample_id", [f"S{idx+1:03d}" for idx in samples.index])
    samples["profile"] = np.where(samples["Class"] == 1, "anomalous", "typical")

    # Amount/Time were standardized for model training; also store human-readable
    # (unscaled) amount so the frontend can display something meaningful.
    unscaled = scaler.inverse_transform(samples[["Time", "Amount"]])
    samples["display_amount"] = np.round(unscaled[:, 1], 2)
    samples["display_time_seconds"] = np.round(unscaled[:, 0], 0)

    samples.to_json(MODEL_DIR / "samples.json", orient="records", indent=2)

    print(f"\nSaved models, metrics, test predictions and {len(samples)} sample transactions to {MODEL_DIR}")


if __name__ == "__main__":
    main()
