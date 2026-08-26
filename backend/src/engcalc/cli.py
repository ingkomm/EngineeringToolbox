from __future__ import annotations

import argparse
import json
from pathlib import Path

from engcalc.engine import evaluate_project
from engcalc.models import ProjectDocument


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate an Engineering Toolbox project JSON")
    parser.add_argument("project", type=Path, help="Path to project JSON")
    parser.add_argument(
        "--dirty",
        nargs="*",
        default=None,
        help="Optional dirty object ids for incremental evaluation",
    )
    args = parser.parse_args()
    document = ProjectDocument.model_validate_json(args.project.read_text(encoding="utf-8"))
    result = evaluate_project(document, args.dirty)
    print(json.dumps(result.model_dump(), indent=2))
    if result.errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
