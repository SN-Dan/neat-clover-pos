# coding: utf-8
# Original Author: Daniel Stoynev
# Copyright (c) 2025 SNS Software Ltd. All rights reserved.
import logging

import requests

from odoo import http
from odoo.http import request

_logger = logging.getLogger(__name__)

# Mint endpoint next to the WS stack (pos_desktop_mode_aws HttpApi).
NEAT_CLOVER_ONLINE_TOKEN_URL = (
    'https://0ktidz66u4.execute-api.eu-central-1.amazonaws.com/token'
)
_TOKEN_TIMEOUT_SECONDS = 5
_TOKEN_RETRIES = 3


class DesktopWsTokenController(http.Controller):

    @http.route('/pos_clover/desktop_ws/token', type='json', auth='user')
    def desktop_ws_token(self, device_code=None, payment_method_id=None):
        """Mint a short-lived WS access token using the server-side license key."""
        device_code = (device_code or '').strip()
        if not device_code:
            return {'status': 400, 'error': 'device_code required'}

        PaymentMethod = request.env['pos.payment.method'].sudo()
        pm = False
        if payment_method_id:
            pm = PaymentMethod.browse(int(payment_method_id)).exists()
        if not pm:
            pm = PaymentMethod.search([
                ('use_payment_terminal', '=', 'neatclover'),
            ], limit=1)
        if not pm or not pm.neat_clover_desktop_api_key:
            return {'status': 400, 'error': 'license key not configured'}

        payload = {
            'apiKey': pm.neat_clover_desktop_api_key,
            'deviceCode': device_code,
            'version': 'clover-v1',
        }
        last_error = 'token mint failed'
        for attempt in range(1, _TOKEN_RETRIES + 1):
            try:
                response = requests.post(
                    NEAT_CLOVER_ONLINE_TOKEN_URL,
                    json=payload,
                    timeout=_TOKEN_TIMEOUT_SECONDS,
                )
                if response.status_code == 200:
                    data = response.json()
                    access_token = data.get('accessToken')
                    expires_at = data.get('expiresAt')
                    if access_token and expires_at:
                        return {
                            'status': 200,
                            'accessToken': access_token,
                            'expiresAt': expires_at,
                        }
                    last_error = 'invalid mint response'
                else:
                    last_error = 'mint http %s' % response.status_code
                    _logger.warning(
                        'desktop_ws token mint attempt %s failed: %s %s',
                        attempt, response.status_code, response.text[:200],
                    )
            except requests.RequestException as exc:
                last_error = str(exc)
                _logger.warning(
                    'desktop_ws token mint attempt %s error: %s', attempt, exc,
                )

        return {'status': 502, 'error': last_error}
