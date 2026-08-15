#!/usr/bin/env python3
"""Fit and persist the tuned admission-predictor scoring heads.

The training dataset is rebuilt from the clean full-board passes using the
read-only orchestrator database.  Hyperparameter selection matches
``predict-admission-tuned-score.py`` but imports only the dataset-free common
model machinery, so importing this module never triggers a tuning sweep.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = Path(__file__).resolve().parents[2]


def _load(name: str, filename: str):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


common = _load("predict_admission_common", "predict-admission-common.py")
pao = sys.modules["pao"]

import joblib
import numpy as np
import pandas as pd
import sklearn
from sklearn.metrics import average_precision_score, roc_auc_score


STAMP = "2026-07-13"
DEFAULT_OUT = ROOT / "analysis/models" / f"admission-predictor-{STAMP}"
HEADS = {
    "win": ("en_derived_bins_fs", "label_win", roc_auc_score),
    "match": ("en_derived_splines", "label_match", average_precision_score),
}
SELECTION_METRICS = {
    "win": "roc_auc",
    "match": "average_precision",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", type=Path, default=pao.DEFAULT_DB)
    parser.add_argument("--run", default=pao.DEFAULT_RUN)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    np.random.seed(pao.SEED)

    print(f"loading training data for clean epochs {pao.CLEAN_EPOCHS}")
    conn = pao.open_db_readonly(args.db)
    try:
        epoch_ids = pao.load_epoch_ids(conn, args.run)
        outcomes = {
            ordinal: pao.load_epoch_outcomes(conn, ordinal, epoch_ids[ordinal])
            for ordinal in pao.HISTORY_EPOCHS
        }
        train = pd.concat(
            [
                pao.build_rows(
                    conn,
                    ordinal,
                    epoch_ids[ordinal],
                    outcomes,
                    with_labels=True,
                )
                for ordinal in pao.CLEAN_EPOCHS
            ],
            ignore_index=True,
        )
    finally:
        conn.close()

    reconciliation = pao.reconcile_dataset(train, outcomes)
    assert not reconciliation["problems"], reconciliation["problems"]
    train = common.add_derived(train).reset_index(drop=True)
    print(f"training rows: {len(train)}")

    args.out.mkdir(parents=True, exist_ok=True)
    head_metadata: dict[str, dict] = {}
    for head, (procedure_name, label, metric) in HEADS.items():
        procedure = common.PROCEDURES[procedure_name]
        numeric, categorical = common.usable_columns(procedure, train)
        print(
            f"selecting {head} head: {procedure_name} "
            f"({len(procedure['configs'])} configs)"
        )
        config, internal_cv = common.select_config(
            procedure,
            numeric,
            categorical,
            train,
            None,
            label,
            metric,
        )
        pipe, feature_cols = common.fit_pipe(
            config,
            numeric,
            categorical,
            procedure,
            train,
            None,
            label,
        )
        model_path = args.out / f"{head}.joblib"
        joblib.dump(pipe, model_path)
        head_metadata[head] = {
            "procedure": procedure_name,
            "label": label,
            "selection_metric": SELECTION_METRICS[head],
            "config": config,
            "internal_cv": float(internal_cv),
            "numeric": list(numeric),
            "categorical": list(categorical),
            "feature_cols": list(feature_cols),
        }
        print(
            f"{head}: config={config} internal_cv={internal_cv:.6f}; "
            f"wrote {model_path}"
        )

    metadata = {
        "stamp": STAMP,
        "generated_at": pao.utc_now(),
        "seed": pao.SEED,
        "run_id": args.run,
        "db": str(args.db),
        "train_rows": len(train),
        "clean_epochs": list(pao.CLEAN_EPOCHS),
        "history_epochs": list(pao.HISTORY_EPOCHS),
        "versions": {
            "sklearn": sklearn.__version__,
            "joblib": joblib.__version__,
            "numpy": np.__version__,
            "pandas": pd.__version__,
        },
        "heads": head_metadata,
    }
    metadata_path = args.out / "meta.json"
    metadata_path.write_text(
        json.dumps(pao.to_jsonable(metadata), indent=2, sort_keys=True) + "\n"
    )
    print(f"wrote {metadata_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
