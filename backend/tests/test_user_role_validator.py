import importlib.util
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "enforce_user_role_validator.py"
SPEC = importlib.util.spec_from_file_location("enforce_user_role_validator", SCRIPT_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def test_database_validator_allows_only_known_roles_and_forbids_is_admin():
    clauses = MODULE.USER_ROLE_VALIDATOR["$and"]

    assert clauses[0]["$jsonSchema"]["required"] == ["role"]
    assert clauses[0]["$jsonSchema"]["properties"]["role"]["enum"] == [
        "user",
        "staff",
        "admin",
    ]
    assert clauses[1] == {"is_admin": {"$exists": False}}