"""A minimal COBRApy sidecar for the FBA port.

Reads JSON on stdin:
  {"model": "/path/to/model.xml", "objective": "BIOMASS", "reactions": []}
Writes JSON on stdout:
  {"feasible": true, "growth_rate": 0.42, "objective_value": 12.5, "notes": "optimal"}
COBRApy is optional; when it is missing the script returns a clear failure
instead of a fabricated result.
"""

from __future__ import annotations

import json
import sys


def main() -> None:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        print(json.dumps({"feasible": False, "growth_rate": 0, "objective_value": 0, "notes": "invalid input"}))
        return

    try:
        from cobra.io import read_sbml_model
    except Exception:
        print(json.dumps({
            "feasible": False,
            "growth_rate": 0,
            "objective_value": 0,
            "notes": "cobra is not installed",
        }))
        return

    model = read_sbml_model(payload["model"])
    objective = payload.get("objective", "BIOMASS")
    if objective in model.reactions:
        model.objective = objective
    solution = model.optimize()
    growth = 0.0
    if "BIOMASS" in model.reactions:
        growth = float(solution.fluxes.get("BIOMASS", 0.0))
    print(json.dumps({
        "feasible": solution.status == "optimal",
        "growth_rate": growth,
        "objective_value": float(solution.objective_value),
        "notes": solution.status,
    }))


if __name__ == "__main__":
    main()
