"""EM Studio — NumPy implementation of Gaussian-mixture EM and Flask API."""
from __future__ import annotations

import argparse
import csv
import io
import math
import time
import uuid
from pathlib import Path

import numpy as np
from flask import Flask, jsonify, request, send_from_directory

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"
DATASETS: dict[str, dict] = {}
SESSIONS: dict[str, "EMRunner"] = {}
COLORS = ["#ef6a4c", "#1f8a70", "#e6ad32", "#5271c4", "#b25f9f", "#3c9aaf", "#8b6f47", "#d4516c"]

app = Flask(__name__, static_folder=str(DIST), static_url_path="")
app.config["MAX_CONTENT_LENGTH"] = 6 * 1024 * 1024


class APIError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.message = message
        self.status = status


@app.errorhandler(APIError)
def api_error(error: APIError):
    return jsonify({"error": error.message}), error.status


@app.get("/favicon.ico")
def favicon():
    return "", 204


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"error": "请求的资源不存在。"}), 404


@app.errorhandler(Exception)
def unexpected_error(error: Exception):
    app.logger.exception("Unhandled server error")
    return jsonify({"error": f"计算服务异常：{str(error)}"}), 500


def logsumexp(a: np.ndarray, axis: int = 1) -> np.ndarray:
    m = np.max(a, axis=axis, keepdims=True)
    return (m + np.log(np.sum(np.exp(a - m), axis=axis, keepdims=True))).squeeze(axis)


def gaussian_log_density(X: np.ndarray, mean: np.ndarray, cov: np.ndarray) -> np.ndarray:
    d = X.shape[1]
    try:
        chol = np.linalg.cholesky(cov)
        solved = np.linalg.solve(chol, (X - mean).T).T
        log_det = 2.0 * np.log(np.diag(chol)).sum()
        return -0.5 * (d * np.log(2 * np.pi) + log_det + np.sum(solved * solved, axis=1))
    except np.linalg.LinAlgError as exc:
        raise APIError("协方差矩阵不可逆，请增大正则化系数或更换初始化方式。") from exc


def validate_config(raw: dict, d: int) -> dict:
    config = {
        "k": int(raw.get("k", 3)),
        "covariance_type": raw.get("covariance_type", "full"),
        "init_method": raw.get("init_method", "kmeans"),
        "max_iter": int(raw.get("max_iter", 100)),
        "tol": float(raw.get("tol", 1e-4)),
        "reg_covar": float(raw.get("reg_covar", 1e-6)),
        "seed": int(raw.get("seed", 42)),
        "n_init": int(raw.get("n_init", 3)),
        "init_iter": int(raw.get("init_iter", 10)),
        "criterion": raw.get("criterion", "absolute"),
        "empty_action": raw.get("empty_action", "reinit"),
        "initial_means": raw.get("initial_means"),
    }
    if not 1 <= config["k"] <= 8:
        raise APIError("混合分量 K 必须在 1–8 之间。")
    if config["covariance_type"] not in {"full", "tied", "diag", "spherical"}:
        raise APIError("不支持的协方差类型。")
    if config["init_method"] not in {"kmeans", "random", "random_resp", "manual"}:
        raise APIError("不支持的初始化方法。")
    if not 1 <= config["max_iter"] <= 300:
        raise APIError("最大迭代次数必须在 1–300 之间。")
    if not 1e-8 <= config["tol"] <= 1:
        raise APIError("收敛阈值必须在 10⁻⁸–1 之间。")
    if not 1e-10 <= config["reg_covar"] <= 1:
        raise APIError("协方差正则化必须在 10⁻¹⁰–1 之间。")
    if not 1 <= config["n_init"] <= 10 or not 1 <= config["init_iter"] <= 30:
        raise APIError("初始化次数或 K-means 迭代数超出范围。")
    if config["init_method"] == "manual":
        means = np.asarray(config["initial_means"], dtype=float)
        if means.shape != (config["k"], d) or not np.isfinite(means).all():
            raise APIError(f"手动质心应为 {config['k']} 行 × {d} 列的有限数值。")
        config["initial_means"] = means
    return config


def covariance_count(k: int, d: int, kind: str) -> int:
    if kind == "full":
        return k * d * (d + 1) // 2
    if kind == "tied":
        return d * (d + 1) // 2
    if kind == "diag":
        return k * d
    return k


def silhouette_score(X: np.ndarray, labels: np.ndarray, seed: int) -> float | None:
    if len(np.unique(labels)) < 2:
        return None
    rng = np.random.default_rng(seed)
    if len(X) > 500:
        idx = np.sort(rng.choice(len(X), 500, replace=False))
        X, labels = X[idx], labels[idx]
    distances = np.sqrt(np.maximum(((X[:, None, :] - X[None, :, :]) ** 2).sum(axis=2), 0))
    scores = []
    for i in range(len(X)):
        same = labels == labels[i]
        same[i] = False
        a = distances[i, same].mean() if same.any() else 0.0
        b = min(distances[i, labels == label].mean() for label in np.unique(labels) if label != labels[i])
        scores.append((b - a) / max(a, b, 1e-12))
    return float(np.mean(scores))


class EMRunner:
    def __init__(self, X: np.ndarray, raw_X: np.ndarray, features: list[str], transform: dict, config: dict):
        self.X = X
        self.raw_X = raw_X
        self.features = features
        self.transform = transform
        self.config = config
        self.n, self.d = X.shape
        self.k = config["k"]
        self.rng = np.random.default_rng(config["seed"])
        self.iteration = 0
        self.converged = False
        self.stop_reason = ""
        self.started = time.perf_counter()
        self.weights, self.means, self.covs = self._initialize()
        self.resp, self.ll = self._e_step()
        self.delta = None
        self.frames = [self.frame(light=True)]

    def _global_cov(self) -> np.ndarray:
        return np.cov(self.X.T).reshape(self.d, self.d) + np.eye(self.d) * max(self.config["reg_covar"], 1e-6)

    def _initialize(self):
        k, d = self.k, self.d
        method = self.config["init_method"]
        if method == "manual":
            raw_means = np.asarray(self.config["initial_means"], dtype=float)
            means = (raw_means - self.transform["offset"]) / self.transform["scale"]
            return np.full(k, 1 / k), means, np.repeat(self._global_cov()[None, :, :], k, axis=0)
        if method == "random_resp":
            resp = self.rng.dirichlet(np.ones(k), size=self.n)
            weights, means, covs = self._m_step(resp)
            return weights, means, covs
        if method == "random":
            idx = self.rng.choice(self.n, k, replace=k > self.n)
            means = self.X[idx].copy()
            return np.full(k, 1 / k), means, np.repeat(self._global_cov()[None, :, :], k, axis=0)
        # K-means++ seeding, followed by configurable Lloyd iterations.
        centers = np.empty((k, d))
        centers[0] = self.X[self.rng.integers(self.n)]
        closest = ((self.X - centers[0]) ** 2).sum(axis=1)
        for j in range(1, k):
            total = closest.sum()
            probs = closest / total if total > 1e-12 else np.full(self.n, 1 / self.n)
            centers[j] = self.X[self.rng.choice(self.n, p=probs)]
            closest = np.minimum(closest, ((self.X - centers[j]) ** 2).sum(axis=1))
        labels = np.zeros(self.n, dtype=int)
        for _ in range(self.config["init_iter"]):
            distances = ((self.X[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
            new_labels = distances.argmin(axis=1)
            if np.array_equal(new_labels, labels):
                labels = new_labels
                break
            labels = new_labels
            for j in range(k):
                if np.any(labels == j):
                    centers[j] = self.X[labels == j].mean(axis=0)
                else:
                    centers[j] = self.X[self.rng.integers(self.n)]
        hard_resp = np.eye(k)[labels]
        return self._m_step(hard_resp)

    def _e_step(self):
        logs = np.column_stack([
            np.log(max(self.weights[j], 1e-15)) + gaussian_log_density(self.X, self.means[j], self.covs[j])
            for j in range(self.k)
        ])
        norms = logsumexp(logs, axis=1)
        return np.exp(logs - norms[:, None]), float(norms.mean())

    def _m_step(self, resp: np.ndarray):
        nk = resp.sum(axis=0)
        global_cov = self._global_cov()
        old_means = getattr(self, "means", None)
        weights = np.maximum(nk / self.n, 1e-12)
        means = np.zeros((self.k, self.d))
        covs = np.zeros((self.k, self.d, self.d))
        for j in range(self.k):
            if nk[j] < 1e-8:
                if self.config["empty_action"] == "reinit" or old_means is None:
                    means[j] = self.X[self.rng.integers(self.n)]
                    # A non-vanishing prior weight lets the re-seeded component compete again.
                    weights[j] = max(1.0 / self.n, 1e-6)
                else:
                    means[j] = old_means[j]
                covs[j] = global_cov
                continue
            means[j] = (resp[:, j] @ self.X) / nk[j]
            diff = self.X - means[j]
            cov = (diff * resp[:, j, None]).T @ diff / nk[j]
            covs[j] = cov + np.eye(self.d) * self.config["reg_covar"]
        kind = self.config["covariance_type"]
        if kind == "tied":
            tied = np.average(covs, axis=0, weights=np.maximum(nk, 1e-12))
            tied += np.eye(self.d) * self.config["reg_covar"]
            covs = np.repeat(tied[None, :, :], self.k, axis=0)
        elif kind == "diag":
            covs = np.array([np.diag(np.diag(cov)) for cov in covs])
        elif kind == "spherical":
            covs = np.array([np.eye(self.d) * (np.trace(cov) / self.d + self.config["reg_covar"]) for cov in covs])
        weights /= weights.sum()
        return weights, means, covs

    def step(self):
        if self.converged:
            return
        previous = self.ll
        self.weights, self.means, self.covs = self._m_step(self.resp)
        self.resp, self.ll = self._e_step()
        self.iteration += 1
        self.delta = self.ll - previous
        threshold = abs(self.delta) / (abs(previous) + 1e-12) if self.config["criterion"] == "relative" else abs(self.delta)
        if threshold <= self.config["tol"]:
            self.converged = True
            self.stop_reason = "达到收敛阈值"
        elif self.iteration >= self.config["max_iter"]:
            self.converged = True
            self.stop_reason = "达到最大迭代次数"
        self.frames.append(self.frame(light=True))

    def _display_params(self):
        scale = self.transform["scale"]
        offset = self.transform["offset"]
        means = self.means * scale + offset
        covs = self.covs * (scale[:, None] * scale[None, :])[None, :, :]
        return means, covs

    def frame(self, light: bool = False):
        means, covs = self._display_params()
        result = {
            "iteration": self.iteration,
            "log_likelihood": self.ll,
            "delta": self.delta,
            "weights": self.weights.tolist(),
            "means": means.tolist(),
            "covariances": covs.tolist(),
            "labels": self.resp.argmax(axis=1).astype(int).tolist(),
            "converged": self.converged,
            "stop_reason": self.stop_reason,
        }
        if not light:
            result["responsibilities"] = self.resp.tolist()
        return result

    def metrics(self):
        n, d, k = self.n, self.d, self.k
        p = (k - 1) + k * d + covariance_count(k, d, self.config["covariance_type"])
        total_ll = n * self.ll
        aic = 2 * p - 2 * total_ll
        bic = math.log(n) * p - 2 * total_ll
        entropy = float(-np.sum(self.resp * np.log(np.maximum(self.resp, 1e-15))))
        return {
            "aic": float(aic),
            "bic": float(bic),
            "icl": float(bic + 2 * entropy),
            "entropy": entropy / n,
            "silhouette": silhouette_score(self.X, self.resp.argmax(axis=1), self.config["seed"]),
            "parameters": int(p),
            "runtime_ms": round((time.perf_counter() - self.started) * 1000, 1),
        }


def dataset_summary(dataset: dict):
    X = dataset["matrix"]
    return {
        "id": dataset["id"],
        "name": dataset["name"],
        "source": dataset["source"],
        "columns": dataset["columns"],
        "points": X.tolist(),
        "rows": len(X),
        "dropped_rows": dataset.get("dropped_rows", 0),
        "true_labels": dataset.get("true_labels"),
        "preview": X[:6].tolist(),
        "stats": [
            {"name": name, "mean": float(X[:, i].mean()), "std": float(X[:, i].std()), "min": float(X[:, i].min()), "max": float(X[:, i].max())}
            for i, name in enumerate(dataset["columns"])
        ],
    }


def generate_dataset(payload: dict):
    preset = payload.get("preset", "three_blobs")
    n = int(payload.get("samples", 360))
    seed = int(payload.get("seed", 42))
    separation = float(payload.get("separation", 1.0))
    noise = float(payload.get("noise", 1.0))
    if not 30 <= n <= 1500:
        raise APIError("样本量需在 30–1500 之间。")
    rng = np.random.default_rng(seed)
    definitions = {
        "three_blobs": (
            "三簇椭圆 · 2D", ["X₁", "X₂"],
            np.array([[-2.8, -1.4], [2.6, -0.5], [0.2, 2.8]]),
            [np.array([[0.65, 0.42], [0.42, 0.85]]), np.array([[0.8, -0.35], [-0.35, 0.55]]), np.array([[0.5, 0.1], [0.1, 0.65]])],
            [0.34, 0.33, 0.33],
        ),
        "overlap": (
            "重叠双峰 · 2D", ["X₁", "X₂"],
            np.array([[-1.25, 0.0], [1.25, 0.25]]),
            [np.array([[1.0, 0.25], [0.25, 0.7]]), np.array([[0.9, -0.2], [-0.2, 0.8]])],
            [0.5, 0.5],
        ),
        "anisotropic": (
            "各向异性 · 2D", ["X₁", "X₂"],
            np.array([[-2.7, -1.0], [2.3, 1.0], [0.0, 2.5]]),
            [np.array([[1.5, 1.15], [1.15, 1.0]]), np.array([[0.35, -0.15], [-0.15, 0.18]]), np.array([[0.75, -0.55], [-0.55, 0.65]])],
            [0.4, 0.3, 0.3],
        ),
        "unbalanced": (
            "不均衡样本 · 2D", ["X₁", "X₂"],
            np.array([[-2.5, -0.8], [2.0, 0.0], [0.0, 2.7]]),
            [np.eye(2) * 0.65, np.eye(2) * 0.45, np.eye(2) * 0.3],
            [0.7, 0.2, 0.1],
        ),
        "one_dimensional": (
            "一维双峰 · 1D", ["X"],
            np.array([[-2.0], [2.0]]),
            [np.array([[0.55]]), np.array([[0.8]])],
            [0.45, 0.55],
        ),
    }
    if preset not in definitions:
        raise APIError("未知的数据集预设。")
    name, columns, centers, covs, proportions = definitions[preset]
    centers = centers * separation
    counts = rng.multinomial(n, proportions)
    chunks, labels = [], []
    for j, count in enumerate(counts):
        chunks.append(rng.multivariate_normal(centers[j], covs[j] * noise * noise, count))
        labels.extend([j] * count)
    X = np.vstack(chunks)
    order = rng.permutation(n)
    dataset_id = uuid.uuid4().hex
    dataset = {"id": dataset_id, "name": name, "source": "built-in", "columns": columns, "matrix": X[order], "true_labels": np.asarray(labels)[order].tolist()}
    DATASETS[dataset_id] = dataset
    return dataset_summary(dataset)


def parse_upload(file):
    raw = file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("gb18030")
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise APIError("CSV 第一行必须是字段名。")
    rows = list(reader)
    if len(rows) < 10:
        raise APIError("数据集至少需要 10 行记录。")
    numeric_columns = []
    for column in reader.fieldnames:
        values = [row.get(column, "").strip() for row in rows if row.get(column, "").strip()]
        if not values:
            continue
        valid = 0
        for value in values:
            try:
                valid += int(math.isfinite(float(value)))
            except ValueError:
                pass
        if valid / len(values) >= 0.8:
            numeric_columns.append(column)
    if not numeric_columns:
        raise APIError("未识别到数值字段，请上传带表头的 CSV 文件。")
    clean = []
    for row in rows:
        try:
            values = [float(row[column]) for column in numeric_columns]
            if np.isfinite(values).all():
                clean.append(values)
        except (ValueError, TypeError):
            continue
    if len(clean) < 10:
        raise APIError("完整数值记录不足 10 行，请检查缺失值与字段格式。")
    if len(clean) > 1500:
        rng = np.random.default_rng(42)
        clean = np.asarray(clean)[np.sort(rng.choice(len(clean), 1500, replace=False))].tolist()
    dataset_id = uuid.uuid4().hex
    dataset = {
        "id": dataset_id, "name": file.filename or "上传数据.csv", "source": "upload",
        "columns": numeric_columns, "matrix": np.asarray(clean, dtype=float),
        "dropped_rows": len(rows) - len(clean),
    }
    DATASETS[dataset_id] = dataset
    return dataset_summary(dataset)


def prepare_run(payload: dict):
    dataset = DATASETS.get(payload.get("dataset_id", ""))
    if dataset is None:
        raise APIError("数据集不存在或服务已重启，请重新选择数据。", 404)
    features = payload.get("features") or dataset["columns"][:2]
    if not features or len(features) > 8 or any(f not in dataset["columns"] for f in features):
        raise APIError("请选择 1–8 个有效的建模特征。")
    indices = [dataset["columns"].index(f) for f in features]
    raw_X = dataset["matrix"][:, indices].copy()
    method = payload.get("preprocess", "none")
    if method == "zscore":
        offset = raw_X.mean(axis=0)
        scale = raw_X.std(axis=0)
        scale[scale < 1e-12] = 1.0
    elif method == "minmax":
        offset = raw_X.min(axis=0)
        scale = raw_X.max(axis=0) - offset
        scale[scale < 1e-12] = 1.0
    elif method == "none":
        offset = np.zeros(raw_X.shape[1])
        scale = np.ones(raw_X.shape[1])
    else:
        raise APIError("不支持的标准化方式。")
    X = (raw_X - offset) / scale
    config = validate_config(payload.get("config", {}), raw_X.shape[1])
    return raw_X, X, features, {"offset": offset, "scale": scale, "method": method}, config


def run_single(raw_X, X, features, transform, config, seed_offset=0):
    local_config = dict(config)
    local_config["seed"] = config["seed"] + seed_offset
    runner = EMRunner(X, raw_X, features, transform, local_config)
    while not runner.converged:
        runner.step()
    return runner


def response_for_run(runner: EMRunner, config: dict, features: list[str], raw_X: np.ndarray, restarts: int = 1):
    return {
        "session_id": uuid.uuid4().hex,
        "config": {**config, "initial_means": np.asarray(config.get("initial_means")).tolist() if config.get("initial_means") is not None and not isinstance(config.get("initial_means"), np.ndarray) else (config["initial_means"].tolist() if isinstance(config.get("initial_means"), np.ndarray) else None)},
        "features": features,
        "points": raw_X.tolist(),
        "colors": COLORS[:runner.k],
        "frames": runner.frames,
        "frame": runner.frame(),
        "metrics": runner.metrics(),
        "restarts": restarts,
        "preprocess": runner.transform["method"],
    }


@app.get("/api/health")
def health():
    return jsonify({"status": "ok", "engine": "NumPy", "algorithm": "Gaussian Mixture EM"})


@app.get("/api/presets")
def presets():
    return jsonify([
        {"id": "three_blobs", "name": "三簇椭圆", "description": "不同方向与协方差，适合观察完整协方差 EM", "dimensions": 2, "clusters": 3},
        {"id": "overlap", "name": "重叠双峰", "description": "高重叠区域，适合观察软分配与局部最优", "dimensions": 2, "clusters": 2},
        {"id": "anisotropic", "name": "各向异性", "description": "拉长且旋转的簇，对比协方差约束", "dimensions": 2, "clusters": 3},
        {"id": "unbalanced", "name": "不均衡样本", "description": "70% / 20% / 10%，观察小分量稳定性", "dimensions": 2, "clusters": 3},
        {"id": "one_dimensional", "name": "一维双峰", "description": "在数轴上拆解两个高斯分布", "dimensions": 1, "clusters": 2},
    ])


@app.post("/api/dataset/generate")
def dataset_generate():
    return jsonify(generate_dataset(request.get_json(force=True) or {}))


@app.post("/api/dataset/upload")
def dataset_upload():
    file = request.files.get("file")
    if file is None or not file.filename:
        raise APIError("请选择一个 CSV 文件。")
    if not file.filename.lower().endswith(".csv"):
        raise APIError("当前支持带表头的 CSV 文件。")
    return jsonify(parse_upload(file))


@app.post("/api/em/init")
def em_init():
    payload = request.get_json(force=True) or {}
    raw_X, X, features, transform, config = prepare_run(payload)
    runner = EMRunner(X, raw_X, features, transform, config)
    response = response_for_run(runner, config, features, raw_X)
    SESSIONS[response["session_id"]] = runner
    return jsonify(response)


@app.post("/api/em/step")
def em_step():
    payload = request.get_json(force=True) or {}
    runner = SESSIONS.get(payload.get("session_id", ""))
    if runner is None:
        raise APIError("实验会话已失效，请重新初始化。", 404)
    runner.step()
    return jsonify({"frame": runner.frame(), "metrics": runner.metrics()})


@app.post("/api/em/run")
def em_run():
    payload = request.get_json(force=True) or {}
    raw_X, X, features, transform, config = prepare_run(payload)
    best = None
    for restart in range(config["n_init"]):
        candidate = run_single(raw_X, X, features, transform, config, restart * 997)
        if best is None or candidate.ll > best.ll:
            best = candidate
    response = response_for_run(best, config, features, raw_X, config["n_init"])
    SESSIONS[response["session_id"]] = best
    return jsonify(response)


@app.post("/api/em/sweep")
def em_sweep():
    payload = request.get_json(force=True) or {}
    raw_X, X, features, transform, config = prepare_run(payload)
    max_k = min(int(payload.get("max_k", 6)), 8)
    results = []
    for k in range(1, max_k + 1):
        local = dict(config)
        local["k"] = k
        local["init_method"] = "kmeans" if local["init_method"] == "manual" else local["init_method"]
        best = None
        for restart in range(min(config["n_init"], 3)):
            candidate = run_single(raw_X, X, features, transform, local, restart * 997)
            if best is None or candidate.ll > best.ll:
                best = candidate
        metrics = best.metrics()
        results.append({"k": k, "log_likelihood": best.ll, "aic": metrics["aic"], "bic": metrics["bic"], "iterations": best.iteration})
    return jsonify({"results": results})


@app.get("/", defaults={"path": "index.html"})
@app.get("/<path:path>")
def static_files(path: str):
    target = DIST / path
    if path != "index.html" and target.is_file():
        return send_from_directory(DIST, path)
    if not (DIST / "index.html").exists():
        return "前端尚未构建，请先运行 npm run build。", 503
    return send_from_directory(DIST, "index.html")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=7100)
    args, _ = parser.parse_known_args()
    app.run(host=args.host, port=args.port, debug=False, threaded=True)
