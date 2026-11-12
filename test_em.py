"""Numerical and API regression checks for the EM teaching system."""
import io
import unittest

import numpy as np

from server import DATASETS, EMRunner, app, generate_dataset, validate_config


class EMNumericalTests(unittest.TestCase):
    def setUp(self):
        rng = np.random.default_rng(7)
        self.raw = np.vstack([
            rng.normal([-2.0, -1.0], 0.45, (70, 2)),
            rng.normal([2.0, 1.0], 0.55, (70, 2)),
        ])

    def test_all_covariance_types_monotonic(self):
        for kind in ("full", "tied", "diag", "spherical"):
            with self.subTest(kind=kind):
                config = validate_config({"k": 2, "covariance_type": kind, "seed": 7}, 2)
                transform = {"offset": np.zeros(2), "scale": np.ones(2), "method": "none"}
                runner = EMRunner(self.raw, self.raw, ["x", "y"], transform, config)
                values = [runner.ll]
                for _ in range(20):
                    runner.step()
                    values.append(runner.ll)
                self.assertTrue(np.all(np.diff(values) >= -1e-8), values)
                self.assertAlmostEqual(sum(runner.weights), 1.0, places=8)
                self.assertTrue(np.all(runner.resp.sum(axis=1) - 1 < 1e-8))

    def test_empty_component_is_reinitialized_with_nonzero_weight(self):
        config = validate_config({"k": 3, "empty_action": "reinit"}, 2)
        transform = {"offset": np.zeros(2), "scale": np.ones(2), "method": "none"}
        runner = EMRunner(self.raw, self.raw, ["x", "y"], transform, config)
        responsibilities = np.zeros((len(self.raw), 3))
        responsibilities[:, 0] = 1.0
        weights, _, _ = runner._m_step(responsibilities)
        self.assertAlmostEqual(float(weights.sum()), 1.0, places=8)
        self.assertTrue(np.all(weights[1:] > 0))

    def test_standardized_parameters_transform_back(self):
        offset = self.raw.mean(axis=0)
        scale = self.raw.std(axis=0)
        X = (self.raw - offset) / scale
        config = validate_config({"k": 2, "max_iter": 50}, 2)
        runner = EMRunner(X, self.raw, ["x", "y"], {"offset": offset, "scale": scale, "method": "zscore"}, config)
        while not runner.converged:
            runner.step()
        means = np.asarray(runner.frame()["means"])
        self.assertTrue(np.all(means[:, 0] > -4) and np.all(means[:, 0] < 4))


class APITests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        self.dataset = generate_dataset({"preset": "three_blobs", "samples": 120, "seed": 4})

    def payload(self):
        return {"dataset_id": self.dataset["id"], "features": ["X₁", "X₂"], "preprocess": "zscore", "config": {"k": 3, "n_init": 2, "max_iter": 60}}

    def test_init_and_step(self):
        response = self.client.post("/api/em/init", json=self.payload())
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertEqual(body["frame"]["iteration"], 0)
        stepped = self.client.post("/api/em/step", json={"session_id": body["session_id"]})
        self.assertEqual(stepped.status_code, 200)
        self.assertEqual(stepped.get_json()["frame"]["iteration"], 1)

    def test_run_and_sweep(self):
        response = self.client.post("/api/em/run", json=self.payload())
        self.assertEqual(response.status_code, 200)
        body = response.get_json()
        self.assertTrue(body["frame"]["converged"])
        self.assertIn("bic", body["metrics"])
        sweep = self.client.post("/api/em/sweep", json={**self.payload(), "max_k": 3})
        self.assertEqual(sweep.status_code, 200)
        self.assertEqual(len(sweep.get_json()["results"]), 3)

    def test_csv_upload_autodetect(self):
        content = "name,a,b,note\n" + "\n".join(f"p{i},{i},{i % 4},ok" for i in range(20))
        response = self.client.post("/api/dataset/upload", data={"file": (io.BytesIO(content.encode()), "demo.csv")}, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["columns"], ["a", "b"])
        self.assertEqual(response.get_json()["rows"], 20)


if __name__ == "__main__":
    unittest.main(verbosity=2)
