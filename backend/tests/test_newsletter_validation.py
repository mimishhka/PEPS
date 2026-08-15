import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import NewsletterSubscribeIn


def test_newsletter_subscription_requires_explicit_consent():
    payload = NewsletterSubscribeIn(email="reader@example.com", consent=True)

    assert payload.consent is True

    with pytest.raises(ValidationError):
        NewsletterSubscribeIn(email="reader@example.com")

    with pytest.raises(ValidationError):
        NewsletterSubscribeIn(email="reader@example.com", consent=False)