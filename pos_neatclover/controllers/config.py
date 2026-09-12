# Original Author: Daniel Stoynev
# Copyright (c) 2025 SNS Software Ltd. All rights reserved.
# This module extends Odoo's payment framework.
# Odoo is a trademark of Odoo S.A.
import secrets
import string
from datetime import datetime, timedelta

timeout_delta = timedelta(minutes=4, seconds=0)
TRANSACTION_ID_LENGTH = 13
TRANSACTION_ID_ALPHABET = string.ascii_uppercase + string.digits
TRANSACTION_ID_RANDOM_LENGTH = 7


def _encode_base36(value):
    alphabet = string.digits + string.ascii_uppercase
    if value == 0:
        return alphabet[0]
    encoded = []
    while value:
        value, remainder = divmod(value, 36)
        encoded.append(alphabet[remainder])
    return ''.join(reversed(encoded))


def generate_transaction_id(timestamp=None):
    """Build a 13-char ID: UTC second timestamp (base36) + random suffix."""
    ts = int((timestamp or datetime.utcnow()).timestamp())
    timestamp_part = _encode_base36(ts)
    random_length = TRANSACTION_ID_LENGTH - len(timestamp_part)
    if random_length < TRANSACTION_ID_RANDOM_LENGTH:
        timestamp_part = timestamp_part[-(TRANSACTION_ID_LENGTH - TRANSACTION_ID_RANDOM_LENGTH):]
        random_length = TRANSACTION_ID_RANDOM_LENGTH
    random_part = ''.join(
        secrets.choice(TRANSACTION_ID_ALPHABET) for _ in range(random_length)
    )
    return (timestamp_part + random_part).upper()
