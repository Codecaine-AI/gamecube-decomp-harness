#!/usr/bin/env python3
"""tuneA: linear models + feature engineering for the admission predictor.

Forward-chained protocol (non-negotiable):
  F1 train {26} -> test 28; F2 train {26,28} -> test 30; F3 train {26,28,30} -> test 32.
All hyperparameter/config selection happens inside the fold's training data via
stratified 5-fold CV (augmentation rows, when used, join every internal fit but
are never validated on). Each procedure touches the forward test epoch once.
"""
import os

for var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(var, "2")

import importlib.util
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import average_precision_score, roc_auc_score

REPO = Path("/Users/Ford/Github Repos/oss/gamecube-decomp-harness")
SCRATCH = Path(os.environ.get("TUNE_SCRATCH", "/tmp/admission-tuning-scratch"))
HERE = Path(__file__).resolve().parent


def _load(name, filename):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


common = _load("predict_admission_common", "predict-admission-common.py")
pao = sys.modules["pao"]
SEED = common.SEED
EPS = common.EPS
add_derived = common.add_derived
BASE_NUM = common.BASE_NUM
BASE_CAT = common.BASE_CAT
DERIVED_NUM = common.DERIVED_NUM
DERIVED_CAT = common.DERIVED_CAT
SHAPE_COLS = common.SHAPE_COLS
GRID_C = common.GRID_C
GRID_L1 = common.GRID_L1
grid = common.grid
PROCEDURES = common.PROCEDURES
build_pipe = common.build_pipe
usable_columns = common.usable_columns
feature_cols = common.feature_cols
fit_score = common.fit_score
select_config = common.select_config

np.random.seed(SEED)
FOLDS = [(28, [26]), (30, [26, 28]), (32, [26, 28, 30])]
AUG_EPOCHS = [25, 27]

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------
conn = pao.open_db_readonly(REPO / "projects/melee/state/orchestrator.sqlite")
epoch_ids = pao.load_epoch_ids(conn, pao.DEFAULT_SESSION)
outcomes = {o: pao.load_epoch_outcomes(conn, o, epoch_ids[o]) for o in pao.HISTORY_EPOCHS}
dataset = pd.concat(
    [pao.build_rows(conn, o, epoch_ids[o], outcomes, with_labels=True) for o in pao.CLEAN_EPOCHS],
    ignore_index=True,
)
rec = pao.reconcile_dataset(dataset, outcomes)
assert not rec["problems"], rec["problems"]

aug_all = pd.concat(
    [pao.build_rows(conn, o, epoch_ids[o], outcomes, with_labels=True) for o in AUG_EPOCHS],
    ignore_index=True,
)
print(
    f"clean dataset {len(dataset)} rows; aug rows: "
    + ", ".join(
        f"e{o}={int((aug_all.epoch == o).sum())} "
        f"(win rate {aug_all.loc[aug_all.epoch == o, 'label_win'].mean():.2f})"
        for o in AUG_EPOCHS
    )
)

dataset = add_derived(dataset)
aug_all = add_derived(aug_all)

# ---------------------------------------------------------------------------
# Model machinery
# ---------------------------------------------------------------------------
def head_metrics(labels, scores, head):
    auc = pao.safe_auc(labels, scores)
    cap = pao.capture_stats(scores, labels)
    out = {
        "roc_auc": auc["roc_auc"],
        "pr_auc": auc["pr_auc"],
        "capture_at_30pct": cap["capture_at_fraction"]["30pct"],
    }
    if head == "win":
        out["capture_at_50pct"] = cap["capture_at_fraction"]["50pct"]
        for q in ("90", "95"):
            ns = cap["n_star"][q]
            out[f"n_star_{q}"] = {"count": ns["count"], "fraction": ns["fraction"]}
    return out


def eval_procedure(name, spec):
    t0 = time.time()
    result = {"description": spec["desc"], "folds": {}}
    for test_ep, train_eps in FOLDS:
        train = dataset[dataset["epoch"].isin(train_eps)].reset_index(drop=True)
        test = dataset[dataset["epoch"] == test_ep].reset_index(drop=True)
        aug_eps = [e for e in spec.get("aug", ()) if e < test_ep]
        aug = (
            aug_all[aug_all["epoch"].isin(aug_eps)].reset_index(drop=True)
            if aug_eps
            else None
        )
        fit_ref = pd.concat([train, aug], ignore_index=True) if aug is not None else train
        num, cat = usable_columns(spec, fit_ref)
        fold = {"train_epochs": train_eps, "aug_epochs": aug_eps, "n_features": {}}
        for label, head, metric in (
            ("label_win", "win", roc_auc_score),
            ("label_match", "match", average_precision_score),
        ):
            cfg, internal = select_config(spec, num, cat, train, aug, label, metric)
            if aug is not None:
                fit_df = pd.concat([train, aug], ignore_index=True)
                w = np.concatenate([np.ones(len(train)), 0.5 * np.ones(len(aug))])
            else:
                fit_df, w = train, None
            scores = fit_score(cfg, num, cat, spec, fit_df, w, test, label)
            fold[head] = head_metrics(test[label].to_numpy(), scores, head)
            fold[head]["chosen_config"] = cfg
            fold[head]["internal_cv_score"] = internal
        result["folds"][str(test_ep)] = fold
    result["mean"] = {
        "win_roc_auc": float(
            np.mean([result["folds"][str(e)]["win"]["roc_auc"] for e, _ in FOLDS])
        ),
        "match_pr_auc": float(
            np.mean([result["folds"][str(e)]["match"]["pr_auc"] for e, _ in FOLDS])
        ),
        "win_n_star_95_count": float(
            np.mean(
                [result["folds"][str(e)]["win"]["n_star_95"]["count"] for e, _ in FOLDS]
            )
        ),
    }
    result["runtime_sec"] = round(time.time() - t0, 1)
    return result


def eval_reference():
    """Reproduce the shipped plain-logreg forward baseline (pao.fit_predict)."""
    result = {
        "description": "REFERENCE: shipped plain L2 logreg (pao.fit_predict, "
        "Platt-calibrated, full features, per-fold constant drop) — the given bar",
        "folds": {},
    }
    full_num, full_cat = pao.FEATURE_SETS["full"]
    for test_ep, train_eps in FOLDS:
        train = dataset[dataset["epoch"].isin(train_eps)]
        test = dataset[dataset["epoch"] == test_ep]
        usable_num = [c for c in full_num if train[c].nunique(dropna=True) >= 2]
        usable_cat = [c for c in full_cat if train[c].nunique(dropna=True) >= 1]
        pao.FEATURE_SETS["fwd"] = (usable_num, usable_cat)
        fold = {"train_epochs": train_eps}
        for label, head in (("label_win", "win"), ("label_match", "match")):
            scores = pao.fit_predict("logreg", "fwd", train, test, label)
            fold[head] = head_metrics(test[label].to_numpy(), scores, head)
        result["folds"][str(test_ep)] = fold
    return result


def base_results():
    return {
        "protocol": {
            "folds": [[t, tr] for t, tr in FOLDS],
            "internal_selection": "stratified 5-fold CV on the fold's clean training "
            "rows (metric: ROC AUC for win head, PR AUC for match head); augmentation "
            "rows weighted 0.5 join internal fits, never validation; test epoch "
            "touched once per procedure",
            "seed": SEED,
        },
        "bar": {
            "hgb_full_forward": {
                "win_roc": [0.605, 0.686, 0.693],
                "match_roc": [0.696, 0.678, 0.731],
            },
            "plain_logreg_forward": {
                "win_roc": [0.573, 0.727, 0.717],
                "match_roc": [0.709, 0.763, 0.631],
            },
        },
        "procedures": {},
    }


def checkpoint(name, res):
    path = SCRATCH / f"tuneA_partial_{name}.json"
    path.write_text(pao.json_dumps(res) + "\n")
    print(f"  checkpointed {path.name}", flush=True)


def merge():
    results = base_results()
    for name in ["ref_logreg_full", *PROCEDURES]:
        path = SCRATCH / f"tuneA_partial_{name}.json"
        if not path.exists():
            print(f"MISSING checkpoint: {name}")
            continue
        results["procedures"][name] = json.loads(path.read_text())
    out_path = SCRATCH / "tuneA_results.json"
    out_path.write_text(pao.json_dumps(results) + "\n")
    print(f"wrote {out_path}")
    print(f"\n{'procedure':<26}{'win ROC (28/30/32)':<24}{'match PR (28/30/32)':<24}"
          f"{'N*95 (28/30/32)':<20}")
    for name, res in results["procedures"].items():
        wr = "/".join(f"{res['folds'][str(e)]['win']['roc_auc']:.3f}" for e, _ in FOLDS)
        mp = "/".join(f"{res['folds'][str(e)]['match']['pr_auc']:.3f}" for e, _ in FOLDS)
        ns = "/".join(
            str(res["folds"][str(e)]["win"]["n_star_95"]["count"]) for e, _ in FOLDS
        )
        print(f"{name:<26}{wr:<24}{mp:<24}{ns:<20}")


def main():
    args = sys.argv[1:]
    if args == ["--merge"]:
        merge()
        return
    todo = args or ["ref_logreg_full", *PROCEDURES]
    for name in todo:
        if name == "ref_logreg_full":
            print("running reference ...", flush=True)
            checkpoint(name, eval_reference())
            continue
        spec = PROCEDURES[name]
        print(f"running {name} ({len(spec['configs'])} configs) ...", flush=True)
        res = eval_procedure(name, spec)
        m = res["mean"]
        print(
            f"  -> mean win ROC {m['win_roc_auc']:.3f}  match PR {m['match_pr_auc']:.3f} "
            f" mean N*95 {m['win_n_star_95_count']:.0f}  [{res['runtime_sec']}s]",
            flush=True,
        )
        checkpoint(name, res)


if __name__ == "__main__":
    main()
