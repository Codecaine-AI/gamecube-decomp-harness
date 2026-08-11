#!/usr/bin/env python3
"""Shared feature and model machinery for admission-predictor scripts.

This module intentionally performs no database access or dataset construction.
"""
import os

for var in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(var, "2")

import importlib.util
import itertools
import sys
import warnings
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent


def _load(name, filename):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


pao = _load("pao", "predict-admission-outcomes.py")

from sklearn.compose import ColumnTransformer
from sklearn.feature_selection import SelectFromModel
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import (
    KBinsDiscretizer,
    OneHotEncoder,
    SplineTransformer,
    StandardScaler,
)

warnings.filterwarnings("ignore")  # KBins duplicate-edge + convergence chatter

SEED = pao.SEED
EPS = 1e-9


def add_derived(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    att = np.maximum(1, df["n_prior_attempts"].to_numpy(dtype=float))
    df["prior_win_rate"] = df["n_prior_wins"] / att
    df["prior_improve_rate"] = df["n_prior_improves"] / att
    df["gain_per_attempt"] = df["best_prior_gain"] / att  # NaN when no prior gain
    analog = df["opseq_best_analog"].to_numpy(dtype=float)
    matched = df["opseq_matched_best"].to_numpy(dtype=float)
    df["opseq_ratio"] = np.where(
        np.isfinite(analog) & (np.abs(analog) > EPS) & np.isfinite(matched),
        matched / analog,
        np.nan,
    )
    df["size_x_gap"] = df["log_size"] * df["gap_to_exact"]
    df["gap_x_hist"] = df["gap_to_exact"] * df["has_history"]
    df["near_exact"] = (df["baseline_score"] >= 99.5).astype(int)
    bucket = pd.cut(
        df["baseline_score"],
        [-np.inf, 80.0, 98.0, 99.5, np.inf],
        labels=["lt80", "80_98", "98_995", "ge995"],
    ).astype(str)
    df["baseline_bucket"] = bucket
    df["bucket_hist"] = bucket + "|h" + df["has_history"].astype(int).astype(str)
    return df


BASE_NUM, BASE_CAT = pao.FEATURE_SETS["full"]
DERIVED_NUM = [
    "prior_win_rate",
    "prior_improve_rate",
    "gain_per_attempt",
    "opseq_ratio",
    "size_x_gap",
    "gap_x_hist",
    "near_exact",
]
DERIVED_CAT = ["baseline_bucket", "bucket_hist"]
SHAPE_COLS = ["baseline_score", "log_size"]

GRID_C = [0.03, 0.1, 0.3, 1.0]
GRID_L1 = [0.0, 0.5, 1.0]


def grid(Cs=GRID_C, l1s=GRID_L1, extra=None):
    base = [dict(C=c, l1=l) for c in Cs for l in l1s]
    if not extra:
        return base
    return [dict(b, **e) for b, e in itertools.product(base, extra)]


PROCEDURES = {
    "en_base": dict(
        desc="Elastic-net logistic, base full features (median impute + missing "
        "indicators + scale + one-hot); grid C x l1_ratio by internal 5-fold CV",
        num=BASE_NUM,
        cat=BASE_CAT,
        configs=grid(),
    ),
    "en_derived": dict(
        desc="en_base + derived numerics (prior_win_rate, prior_improve_rate, "
        "gain_per_attempt, opseq_ratio, size_x_gap, gap_x_hist, near_exact) + "
        "baseline_bucket and bucket x has_history categoricals",
        num=BASE_NUM + DERIVED_NUM,
        cat=BASE_CAT + DERIVED_CAT,
        configs=grid(),
    ),
    "en_derived_bins": dict(
        desc="en_derived + quantile-binned one-hot of baseline_score and log_size "
        "(n_bins in {4,8} tuned internally) to shape the non-monotone win relation",
        num=BASE_NUM + DERIVED_NUM,
        cat=BASE_CAT + DERIVED_CAT,
        bin_cols=SHAPE_COLS,
        configs=grid(extra=[dict(n_bins=4), dict(n_bins=8)]),
    ),
    "en_derived_splines": dict(
        desc="en_derived + cubic splines (quantile knots, n_knots in {4,6} tuned "
        "internally) on baseline_score and log_size",
        num=BASE_NUM + DERIVED_NUM,
        cat=BASE_CAT + DERIVED_CAT,
        spline_cols=SHAPE_COLS,
        configs=grid(extra=[dict(n_knots=4), dict(n_knots=6)]),
    ),
    "en_derived_bins_fs": dict(
        desc="en_derived_bins (n_bins=6) with L1 SelectFromModel feature selection "
        "(fs_C in {0.05,0.2,0.8}) before an L2 head (C in {0.1,0.6}), all internal",
        num=BASE_NUM + DERIVED_NUM,
        cat=BASE_CAT + DERIVED_CAT,
        bin_cols=SHAPE_COLS,
        fs=True,
        configs=[
            dict(C=c, l1=0.0, n_bins=6, fs_C=f)
            for c in (0.1, 0.6)
            for f in (0.05, 0.2, 0.8)
        ],
    ),
    "en_derived_bins_aug2527": dict(
        desc="en_derived_bins + training augmented with epoch 25+27 partial-pass "
        "rows at sample_weight 0.5 (never in validation/test)",
        num=BASE_NUM + DERIVED_NUM,
        cat=BASE_CAT + DERIVED_CAT,
        bin_cols=SHAPE_COLS,
        aug=(25, 27),
        configs=grid(extra=[dict(n_bins=4), dict(n_bins=8)]),
    ),
    "en_derived_bins_aug27": dict(
        desc="en_derived_bins + epoch 27 augmentation only at weight 0.5 (epoch 25 "
        "excluded: pause-truncated, no-win labels censored)",
        num=BASE_NUM + DERIVED_NUM,
        cat=BASE_CAT + DERIVED_CAT,
        bin_cols=SHAPE_COLS,
        aug=(27,),
        configs=grid(extra=[dict(n_bins=4), dict(n_bins=8)]),
    ),
    "l2_derived_bins_fixed": dict(
        desc="Plain L2 logistic (C=1, no tuning) with derived features + fixed "
        "6-bin quantile one-hot of baseline_score/log_size — feature engineering "
        "alone, zero hyperparameter search",
        num=BASE_NUM + DERIVED_NUM,
        cat=BASE_CAT + DERIVED_CAT,
        bin_cols=SHAPE_COLS,
        configs=[dict(C=1.0, l1=0.0, n_bins=6)],
    ),
}


def build_pipe(cfg, num, cat, spec):
    transformers = []
    if num:
        transformers.append(
            (
                "num",
                Pipeline(
                    [
                        ("imp", SimpleImputer(strategy="median", add_indicator=True)),
                        ("sc", StandardScaler()),
                    ]
                ),
                num,
            )
        )
    if cat:
        transformers.append(
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), cat)
        )
    if spec.get("bin_cols"):
        transformers.append(
            (
                "bin",
                Pipeline(
                    [
                        ("imp", SimpleImputer(strategy="median")),
                        (
                            "kb",
                            KBinsDiscretizer(
                                n_bins=cfg["n_bins"],
                                encode="onehot-dense",
                                strategy="quantile",
                            ),
                        ),
                    ]
                ),
                spec["bin_cols"],
            )
        )
    if spec.get("spline_cols"):
        transformers.append(
            (
                "spl",
                Pipeline(
                    [
                        ("imp", SimpleImputer(strategy="median")),
                        (
                            "st",
                            SplineTransformer(
                                degree=3, n_knots=cfg["n_knots"], knots="quantile"
                            ),
                        ),
                        ("sc", StandardScaler()),
                    ]
                ),
                spec["spline_cols"],
            )
        )
    steps = [("features", ColumnTransformer(transformers))]
    if spec.get("fs"):
        steps.append(
            (
                "fs",
                SelectFromModel(
                    LogisticRegression(
                        penalty="l1",
                        C=cfg["fs_C"],
                        solver="saga",
                        max_iter=2000,
                        tol=1e-3,
                        random_state=SEED,
                    ),
                    threshold=1e-5,
                ),
            )
        )
    steps.append(
        (
            "clf",
            LogisticRegression(
                penalty="elasticnet",
                solver="saga",
                C=cfg["C"],
                l1_ratio=cfg["l1"],
                max_iter=3000,
                tol=1e-4,
                random_state=SEED,
            ),
        )
    )
    return Pipeline(steps)


def usable_columns(spec, fit_frame):
    num = [c for c in spec["num"] if fit_frame[c].nunique(dropna=True) >= 2]
    cat = [c for c in spec["cat"] if fit_frame[c].nunique(dropna=True) >= 2]
    return num, cat


def feature_cols(num, cat, spec):
    cols = list(num) + list(cat)
    for key in ("bin_cols", "spline_cols"):
        for c in spec.get(key) or []:
            if c not in cols:
                cols.append(c)
    return cols


def fit_score(cfg, num, cat, spec, fit_df, weights, eval_df, label):
    pipe = build_pipe(cfg, num, cat, spec)
    cols = feature_cols(num, cat, spec)
    kwargs = {}
    if weights is not None:
        kwargs["clf__sample_weight"] = weights
    pipe.fit(fit_df[cols], fit_df[label].to_numpy(), **kwargs)
    return pipe.predict_proba(eval_df[cols])[:, 1]


def fit_pipe(cfg, num, cat, spec, fit_df, weights, label):
    """Like fit_score but returns the fitted pipeline (for persistence)."""
    pipe = build_pipe(cfg, num, cat, spec)
    cols = feature_cols(num, cat, spec)
    kwargs = {}
    if weights is not None:
        kwargs["clf__sample_weight"] = weights
    pipe.fit(fit_df[cols], fit_df[label].to_numpy(), **kwargs)
    return pipe, cols


def select_config(spec, num, cat, train, aug, label, metric):
    """Internal 5-fold stratified CV on the fold's clean training rows only.
    Augmentation rows (weight 0.5) join every internal fit but never validation."""
    if len(spec["configs"]) == 1:
        return spec["configs"][0], None
    y = train[label].to_numpy()
    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=SEED)
    splits = list(skf.split(train, y))
    best_cfg, best_score = None, -np.inf
    for cfg in spec["configs"]:
        vals = []
        for tr_idx, va_idx in splits:
            tr_df = train.iloc[tr_idx]
            va_df = train.iloc[va_idx]
            if aug is not None and len(aug):
                fit_df = pd.concat([tr_df, aug], ignore_index=True)
                w = np.concatenate([np.ones(len(tr_df)), 0.5 * np.ones(len(aug))])
            else:
                fit_df, w = tr_df, None
            p = fit_score(cfg, num, cat, spec, fit_df, w, va_df, label)
            vals.append(metric(va_df[label].to_numpy(), p))
        mean = float(np.mean(vals))
        if mean > best_score:
            best_cfg, best_score = cfg, mean
    return best_cfg, best_score
