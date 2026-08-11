#!/usr/bin/env python3
"""Train the tuned admission predictor on all clean full-board passes and
score the active epoch's admitted targets.

Winning procedures from the 2026-07-13 forward-chained tuning sweeps
(16 candidate procedures across two tracks, all selection internal to
training folds; see admission-predictor-tuned-2026-07-13.md):

  win head   = en_derived_bins_fs   (derived features + quantile bins +
               L1 feature selection -> L2 logistic; internal 5-fold CV)
  match head = en_derived_splines   (derived features + cubic splines on
               baseline_score/log_size -> elastic-net logistic)

The admit cutoff transfers by capture FRACTION, not probability threshold:
mean of the win procedure's forward-fold 95%-capture fractions
(e28 0.9431, e30 0.8486, e32 0.8438 -> 0.8785).

Usage: python3 analysis/scripts/predict-admission-tuned-score.py
Reads the orchestrator DB strictly read-only; writes CSV + stats JSON to
analysis/reports/.
"""
import os

for var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(var, "2")

import importlib.util
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "tuned_lib", HERE / "predict-admission-tuned-lib.py"
)
tx = importlib.util.module_from_spec(spec)
sys.modules["tuned_lib"] = tx
spec.loader.exec_module(tx)  # builds the 4-pass dataset (read-only DB)

pao = sys.modules["pao"]
REPORT_DIR = tx.REPO / "analysis/reports"
STAMP = "2026-07-13"

# Forward-fold 95%-capture fractions of the win procedure (provenance above).
WIN_95_CAPTURE_FRACTIONS = [0.943089430894309, 0.8485981308411215, 0.8438133874239351]

HEADS = {
    "win": ("en_derived_bins_fs", "label_win", roc_auc_score),
    "match": ("en_derived_splines", "label_match", average_precision_score),
}


def main() -> int:
    train = tx.dataset.reset_index(drop=True)  # all 4 clean passes
    frame = pao.build_rows(
        tx.conn, pao.SCORE_EPOCH, tx.epoch_ids[pao.SCORE_EPOCH], tx.outcomes,
        with_labels=False,
    )
    frame = tx.add_derived(frame).reset_index(drop=True)
    print(f"train rows {len(train)}; epoch-{pao.SCORE_EPOCH} targets {len(frame)}")

    chosen = {}
    for head, (proc_name, label, metric) in HEADS.items():
        proc = tx.PROCEDURES[proc_name]
        num, cat = tx.usable_columns(proc, train)
        cfg, internal = tx.select_config(proc, num, cat, train, None, label, metric)
        frame[f"p_{head}"] = tx.fit_score(cfg, num, cat, proc, train, None, frame, label)
        chosen[head] = dict(procedure=proc_name, config=cfg, internal_cv=internal)
        print(f"{head}: {proc_name} cfg={cfg} internal={internal:.4f}")

    admit_fraction = float(np.mean(WIN_95_CAPTURE_FRACTIONS))
    admit_n = int(round(admit_fraction * len(frame)))
    frame = frame.sort_values("p_win", ascending=False).reset_index(drop=True)
    frame["rank_win"] = np.arange(1, len(frame) + 1)
    frame["rank_match"] = (
        frame["p_match"].rank(ascending=False, method="first").astype(int)
    )
    frame["admit_recommended"] = frame["rank_win"] <= admit_n
    threshold = float(frame.loc[admit_n - 1, "p_win"])

    cols = [
        "target_key", "symbol", "unit", "size", "baseline_score",
        "n_prior_wins", "last_outcome", "p_win", "p_match",
        "rank_win", "rank_match", "admit_recommended",
    ]
    csv_path = REPORT_DIR / f"admission-predictor-tuned-epoch34-scores-{STAMP}.csv"
    frame[cols].to_csv(csv_path, index=False)

    stats = dict(
        generated=STAMP,
        session_id=pao.DEFAULT_SESSION,
        train_epochs=pao.CLEAN_EPOCHS,
        score_epoch=pao.SCORE_EPOCH,
        heads=chosen,
        win_95_capture_fractions=WIN_95_CAPTURE_FRACTIONS,
        admit_fraction=admit_fraction,
        admit_recommended=admit_n,
        total_targets=len(frame),
        p_win_threshold_at_cutoff=threshold,
    )
    stats_path = REPORT_DIR / f"admission-predictor-tuned-{STAMP}.stats.json"
    stats_path.write_text(json.dumps(pao.to_jsonable(stats), indent=2, sort_keys=True))
    print(
        f"admit {admit_n} of {len(frame)} "
        f"({admit_fraction:.1%}, p_win >= {threshold:.4f}) -> {csv_path.name}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
