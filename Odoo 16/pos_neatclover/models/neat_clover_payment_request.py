# -*- coding: utf-8 -*-
# Original Author: Daniel Stoynev
# Copyright (c) 2025 SNS Software Ltd. All rights reserved.
# This module extends Odoo's payment framework.
# Odoo is a trademark of Odoo S.A.
import logging
from odoo import api, fields, models, _

_logger = logging.getLogger(__name__)

_OPEN_PREAUTH_STATUSES = ('authorized', 'processed_authorized')
_CAPTURE_SUCCESS_STATUSES = (
    'done', 'resent_done', 'processed_done', 'processed_resent_done',
)


class NeatCloverPaymentRequest(models.Model):
    _name = 'neat.clover.payment.request'
    _description = 'NEAT Clover Payment Request'
    _rec_name = 'preauth_label'

    _sql_constraints = [
        ('transaction_id_unique', 'unique(transaction_id)', 'Transaction ID must be unique.'),
    ]

    terminal_id = fields.Text('Terminal Id', required=True, readonly=False, store=True)
    order_id = fields.Text('Order Id', required=True, readonly=False, store=True)
    user_id = fields.Integer('User Id', required=True, readonly=False, store=True)
    refunded_order_line_id = fields.Integer('Refunded Order Line Id', required=False, readonly=False, store=True)
    is_document_payment = fields.Boolean('Quotation/Invoice Payment', default=False)
    request_type = fields.Selection(
        selection=[
            ('sale', 'Sale'),
            ('preauth', 'Pre-Authorization'),
            ('capture', 'Capture'),
            ('void_preauth', 'Void Pre-Authorization'),
        ],
        string='Request Type',
        default='sale',
        required=True,
        readonly=False,
        store=True,
    )
    parent_request_id = fields.Many2one(
        'neat.clover.payment.request',
        string='Parent Pre-Authorization',
        required=False,
        readonly=False,
        store=True,
        ondelete='set null',
        index=True,
    )
    partner_id = fields.Many2one(
        'res.partner',
        string='Customer',
        required=False,
        readonly=False,
        store=True,
        index=True,
    )
    preauth_label = fields.Char(
        string='Pre-Auth Reference',
        required=False,
        readonly=False,
        store=True,
        index=True,
    )
    start_date = fields.Datetime('Start Date', required=True, readonly=False, store=True)
    amount = fields.Integer('Amount', required=True, readonly=False, store=True, digits=(19, 0))
    amount_display = fields.Float(
        string='Amount',
        compute='_compute_amount_display',
        digits=(16, 2),
    )
    refunded_amt = fields.Integer('Refunded', required=True, readonly=False, store=True, digits=(19, 0))
    uncommited_refunded_amt = fields.Integer('Uncommited Refunded', required=True, readonly=False, store=True, digits=(19, 0))
    status = fields.Text('Status', required=True, readonly=False, store=True)
    transaction_id = fields.Text('Transaction Id', required=True, readonly=False, store=True)
    card_type = fields.Text('Card Type', required=False, readonly=False, store=True)
    cardholder_name = fields.Text('Cardholder Name', required=False, readonly=False, store=True)
    uti = fields.Text('UTI', required=False, readonly=False, store=True)
    rrn = fields.Text('RRN', required=False, readonly=False, store=True)

    @api.depends('amount')
    def _compute_amount_display(self):
        for rec in self:
            rec.amount_display = (rec.amount or 0) / 100.0

    def get_captured_cents(self):
        self.ensure_one()
        captures = self.env['neat.clover.payment.request'].sudo().search([
            ('parent_request_id', '=', self.id),
            ('request_type', '=', 'capture'),
            ('status', 'in', _CAPTURE_SUCCESS_STATUSES),
            ('amount', '>', 0),
        ])
        return sum(captures.mapped('amount'))

    def get_remaining_cents(self):
        self.ensure_one()
        return max(self.amount - self.get_captured_cents(), 0)

    @api.model
    def get_open_preauth_requests(self, terminal_id=None, partner_id=None):
        domain = [
            ('request_type', '=', 'preauth'),
            ('status', 'in', _OPEN_PREAUTH_STATUSES),
            ('amount', '>', 0),
        ]
        if terminal_id:
            domain.append(('terminal_id', '=', terminal_id))
        if partner_id:
            domain.append(('partner_id', '=', partner_id))
        candidates = self.sudo().search(domain, order='start_date asc')
        return candidates.filtered(lambda r: r.get_remaining_cents() > 0)

    @api.model
    def is_preauth_label_taken(self, label, exclude_id=None):
        label = (label or '').strip()
        if not label:
            return False
        domain = [
            ('request_type', '=', 'preauth'),
            ('status', 'in', _OPEN_PREAUTH_STATUSES),
            ('preauth_label', '=ilike', label),
        ]
        if exclude_id:
            domain.append(('id', '!=', exclude_id))
        for rec in self.sudo().search(domain):
            if rec.get_remaining_cents() > 0 and (rec.preauth_label or '').strip().lower() == label.lower():
                return True
        return False

    @api.model
    def suggest_preauth_label(self, base_label):
        base = (base_label or '').strip()
        if not base:
            return ''
        if not self.is_preauth_label_taken(base):
            return base
        suffix = 2
        while suffix < 1000:
            candidate = '%s-%s' % (base, suffix)
            if not self.is_preauth_label_taken(candidate):
                return candidate
            suffix += 1
        return '%s-%s' % (base, fields.Datetime.now())

    def to_open_preauth_dict(self):
        self.ensure_one()
        captured = self.get_captured_cents()
        remaining = max(self.amount - captured, 0)
        return {
            'id': self.id,
            'transaction_id': self.transaction_id,
            'preauth_label': self.preauth_label or self.transaction_id,
            'terminal_id': self.terminal_id,
            'partner_id': self.partner_id.id if self.partner_id else False,
            'amount': float(self.amount) / 100.0,
            'captured_amount': float(captured) / 100.0,
            'remaining_amount': float(remaining) / 100.0,
            'uti': self.uti,
            'card_type': self.card_type,
            'start_date': fields.Datetime.to_string(self.start_date) if self.start_date else False,
        }

    def name_get(self):
        result = []
        for rec in self:
            if rec.request_type == 'preauth':
                amount = (rec.amount or 0) / 100.0
                label = rec.preauth_label or rec.transaction_id or rec.id
                card = rec.card_type or _('Card')
                terminal = rec.terminal_id or ''
                name = _('%(label)s — %(amount).2f (%(card)s) [%(terminal)s]') % {
                    'label': label,
                    'amount': amount,
                    'card': card,
                    'terminal': terminal,
                }
            else:
                name = rec.transaction_id or str(rec.id)
            result.append((rec.id, name))
        return result

    def mark_as_deleted(self):
        """Close an open pre-auth in Odoo without contacting the terminal."""
        self.ensure_one()
        if self.request_type != 'preauth':
            return False
        if self.status not in _OPEN_PREAUTH_STATUSES:
            return False
        self.write({'status': 'processed_voided'})
        return True
