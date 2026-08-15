import os
import sys

from dotenv import load_dotenv
from pymongo import MongoClient


ALLOWED_ROLES = ["user", "staff", "admin"]
USER_ROLE_VALIDATOR = {
    "$and": [
        {
            "$jsonSchema": {
                "bsonType": "object",
                "required": ["role"],
                "properties": {
                    "role": {"enum": ALLOWED_ROLES},
                },
            },
        },
        {"is_admin": {"$exists": False}},
    ],
}


def main() -> int:
    load_dotenv()
    mongo_url = os.environ.get("MONGO_ADMIN_URL") or os.environ.get("MONGO_URL")
    database_name = os.environ.get("DB_NAME")
    if not mongo_url or not database_name:
        print("MONGO_ADMIN_URL (or MONGO_URL) and DB_NAME are required", file=sys.stderr)
        return 2

    client = MongoClient(mongo_url)
    database = client[database_name]
    users = database.users

    invalid_roles = list(
        users.find(
            {"role": {"$nin": ALLOWED_ROLES}},
            {"_id": 0, "id": 1, "email": 1, "role": 1},
        ).limit(20)
    )
    legacy_flags = list(
        users.find(
            {"is_admin": {"$exists": True}},
            {"_id": 0, "id": 1, "email": 1, "is_admin": 1},
        ).limit(20)
    )
    if invalid_roles or legacy_flags:
        print("Refusing to enable the validator; unsafe user documents exist:", file=sys.stderr)
        for document in invalid_roles + legacy_flags:
            print(document, file=sys.stderr)
        return 1

    if "users" not in database.list_collection_names():
        database.create_collection("users", validator=USER_ROLE_VALIDATOR)
    else:
        database.command(
            {
                "collMod": "users",
                "validator": USER_ROLE_VALIDATOR,
                "validationLevel": "strict",
                "validationAction": "error",
            }
        )

    print("users role validator enabled (strict/error)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())