"""TypeScript ↔ Python parity of the numerical kernels (golden vectors from scripts/export_kernels.ts)."""
import json
import math
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from seedtwin import kernels as K  # noqa: E402

GOLD = json.loads((Path(__file__).parent / "golden_kernels.json").read_text())
P = GOLD["params"]
TOL = 1e-9


def close(a, b):
    return math.isclose(a, b, rel_tol=TOL, abs_tol=1e-30)


def test_params_match_ledger():
    led = K.load_params()
    assert set(led) == set(P)
    assert all(close(led[k], P[k]) for k in P)


@pytest.mark.parametrize("row", GOLD["dAir"])
def test_d_air(row):
    assert close(K.d_air(P, row["gas"], row["T"], row["P"]), row["value"])


@pytest.mark.parametrize("row", GOLD["nuAir"])
def test_nu_air(row):
    assert close(K.nu_air(P, row["T"], row["P"]), row["value"])


@pytest.mark.parametrize("row", GOLD["sherwood"])
def test_sherwood(row):
    assert close(K.sherwood(P, row["re"], row["sc"]), row["value"])


@pytest.mark.parametrize("row", GOLD["waterFilm"])
def test_water_film(row):
    got = K.water_film(P, row["g"], row["L"], row["wet1"], row["wet0"], row["film1"], row["film0"])
    assert all(close(got[k], row["value"][k]) for k in ("wetted", "filmUm", "bond"))


def test_profiles():
    c = GOLD["cylinderDrop"][0]
    assert close(K.cylinder_drop(c["q"], c["R"], c["r"], c["D"], c["H"]), c["value"])
    s = GOLD["slabDrop"][0]
    assert close(K.slab_drop(s["q"], s["h"], s["x"], s["D"], s["H"]), s["value"])


def test_seed_shape():
    got = K.seed_shape(490, 290)
    assert close(got["dEq_m"], GOLD["seedShape"]["dEq_m"]) and close(got["area_m2"], GOLD["seedShape"]["area_m2"])


@pytest.mark.parametrize("row", GOLD["transport"])
def test_transport(row):
    shape = K.seed_shape(490, 290)
    got = K.transport(P, shape, row["T"], row["P"], row["u"], row["wetted"], row["film"], row["testa"])
    for gas in K.GASES:
        assert close(got["gOut"][gas], row["value"]["gOut"][gas])
        assert close(got["exposedPerArea"][gas], row["value"]["exposedPerArea"][gas])
    assert close(got["sh"], row["value"]["sh"])


def test_dormant_fixed_point():
    got = K.dormant_fixed_point(P)
    ref = GOLD["dormantFixedPoint"]
    assert all(math.isclose(got[k], ref[k], rel_tol=1e-6) for k in ("aba", "ga", "integ"))


def test_wall_stress_and_relax():
    # closed-form checks that do not depend on the TS side
    assert close(K.wall_stress(0.5, 4 / 3 * math.pi * 1000, 0.4), 0.5 * 10 / 0.8)
    assert close(K.relax(10, 0, 20, 1e-3, 0, 1e9), 20)
    assert close(K.relax(10, 2, 0, 0, 0, 3), 16)
