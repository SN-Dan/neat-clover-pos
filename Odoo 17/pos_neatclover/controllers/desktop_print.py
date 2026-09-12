# coding: utf-8
# Original Author: Daniel Stoynev
# Copyright (c) 2025 SNS Software Ltd. All rights reserved.
import base64
import json
import logging
import re
import uuid
from datetime import datetime, timedelta

from odoo import fields, http
from odoo.http import request

_logger = logging.getLogger(__name__)

_PRINT_ID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)
_PRINT_TTL_SECONDS = 60 * 60
_ATTACHMENT_NAME_PREFIX = 'neat_clover_desktop_print_'


def _decode_image_payload(image):
    if not image or not isinstance(image, str):
        return None
    raw = image
    if ',' in image and image.strip().lower().startswith('data:'):
        raw = image.split(',', 1)[1]
    try:
        return base64.b64decode(raw)
    except Exception:
        return None


def _attachment_name(print_id):
    return '%s%s' % (_ATTACHMENT_NAME_PREFIX, print_id)


def _cleanup_old_prints(Attachment):
    cutoff = fields.Datetime.to_string(
        datetime.utcnow() - timedelta(seconds=_PRINT_TTL_SECONDS)
    )
    old = Attachment.search([
        ('name', '=like', _ATTACHMENT_NAME_PREFIX + '%'),
        ('create_date', '<', cutoff),
    ])
    if old:
        old.unlink()


class PosCloverDesktopPrintController(http.Controller):

    @http.route('/pos_clover/desktop_print/upload', type='json', auth='user', methods=['POST'])
    def desktop_print_upload(self, image=None, **kwargs):
        decoded = _decode_image_payload(image)
        if decoded is None:
            return {'status': 400, 'error': 'invalid_image'}

        Attachment = request.env['ir.attachment'].sudo()
        _cleanup_old_prints(Attachment)

        print_id = str(uuid.uuid4())
        Attachment.create({
            'name': _attachment_name(print_id),
            'type': 'binary',
            'mimetype': 'image/jpeg',
            'datas': base64.b64encode(decoded),
            'res_model': False,
            'res_id': 0,
            'public': False,
        })

        return {'status': 200, 'data': {'print_id': print_id}}

    @http.route('/pos_clover/desktop_print/fetch', type='http', auth='public', methods=['POST'], csrf=False, cors='*')
    def desktop_print_fetch(self):
        try:
            body = json.loads(http.request.httprequest.data or b'{}')
        except Exception:
            return json.dumps({'status': 400, 'error': 'invalid_json'})

        api_key = (body.get('api_key') or '').strip()
        print_id = (body.get('print_id') or '').strip()
        if not api_key or not print_id or not _PRINT_ID_RE.match(print_id):
            return json.dumps({'status': 400, 'error': 'invalid_params'})

        payment_method = http.request.env['pos.payment.method'].sudo().search([
            ('use_payment_terminal', '=', 'neatclover'),
            ('neat_clover_desktop_api_key', '=', api_key),
        ], limit=1)
        if not payment_method:
            return json.dumps({'status': 401, 'error': 'unauthorized'})

        Attachment = http.request.env['ir.attachment'].sudo()
        attachment = Attachment.search([
            ('name', '=', _attachment_name(print_id)),
        ], limit=1)
        if not attachment:
            return json.dumps({'status': 404, 'error': 'not_found'})

        datas = attachment.datas
        try:
            attachment.unlink()
        except Exception:
            _logger.exception('Failed to delete desktop print attachment %s', print_id)

        if not datas:
            return json.dumps({'status': 404, 'error': 'not_found'})

        if isinstance(datas, bytes):
            datas = datas.decode('ascii')

        return json.dumps({
            'status': 200,
            'data': {'image': 'data:image/jpeg;base64,' + datas},
        })
