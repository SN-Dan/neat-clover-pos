# -*- coding: utf-8 -*-
from decimal import Decimal

from odoo import _, models
from odoo.exceptions import ValidationError


class CloverDocumentPayment(models.AbstractModel):
    _name = 'clover.document.payment'
    _description = 'Clover Sales/Invoice Terminal Payment Helpers'

    _TERMINAL_DONE_STATUSES = ('done', 'refunded', 'resent_done', 'resent_refunded')
    _TERMINAL_FAILED_STATUSES = ('failed', 'cancelled')

    @staticmethod
    def ensure_single_document(records, document_label):
        if not records:
            raise ValidationError(_('No record selected.'))
        if len(records) != 1:
            raise ValidationError(_('Please select exactly one %s.') % document_label)
        return records[0]

    @staticmethod
    def order_id_for_sale_order(sale_order):
        return 'so-%s' % sale_order.id

    @staticmethod
    def order_id_for_invoice(invoice):
        return 'inv-%s' % invoice.id

    @staticmethod
    def parse_document_order_id(order_id):
        if not order_id:
            return False, False
        if order_id.startswith('so-'):
            try:
                return 'sale.order', int(order_id[3:])
            except ValueError:
                return False, False
        if order_id.startswith('inv-'):
            try:
                return 'account.move', int(order_id[4:])
            except ValueError:
                return False, False
        return False, False

    @staticmethod
    def is_quotation_or_invoice_request(payment_request):
        if not payment_request.is_document_payment:
            return False
        model_name, _record_id = CloverDocumentPayment.parse_document_order_id(payment_request.order_id)
        return bool(model_name)

    def get_terminal_paid_cents(self, order_id):
        requests = self.env['neat.clover.payment.request'].sudo().search([
            ('order_id', '=', order_id),
            ('is_document_payment', '=', True),
            ('status', 'like', 'processed_done'),
            ('amount', '>', 0),
        ])
        return sum(max(payment.amount - payment.refunded_amt, 0) for payment in requests)

    def get_terminal_refundable_amount(self, order_id, terminal_id=None):
        domain = [
            ('order_id', '=', order_id),
            ('is_document_payment', '=', True),
            ('status', 'like', 'processed_done'),
            ('amount', '>', 0),
        ]
        if terminal_id:
            domain.append(('terminal_id', '=', terminal_id))
        paid_requests = self.env['neat.clover.payment.request'].sudo().search(domain)
        cents = sum(max(payment.amount - payment.refunded_amt, 0) for payment in paid_requests)
        return float(Decimal(cents) / Decimal('100'))

    def get_refund_payment_method_for_order(self, order_id):
        paid_requests = self.env['neat.clover.payment.request'].sudo().search([
            ('order_id', '=', order_id),
            ('is_document_payment', '=', True),
            ('status', 'like', 'processed_done'),
            ('amount', '>', 0),
        ], order='start_date asc')
        for paid_request in paid_requests:
            if self.get_terminal_refundable_amount(order_id, paid_request.terminal_id) > 0:
                payment_method = self._payment_method_for_terminal(paid_request.terminal_id)
                if payment_method:
                    return payment_method
        return False

    def get_locked_payment_method_for_order(self, order_id):
        paid_requests = self.env['neat.clover.payment.request'].sudo().search([
            ('order_id', '=', order_id),
            ('is_document_payment', '=', True),
            ('status', 'like', 'processed_done'),
            ('amount', '>', 0),
        ], order='start_date asc')
        for paid_request in paid_requests:
            if paid_request.amount - paid_request.refunded_amt > 0:
                return self._payment_method_for_terminal(paid_request.terminal_id)
        return False

    def commit_refunds_for_order_id(self, order_id, terminal_id=None):
        domain = [
            ('status', 'like', 'processed_%'),
            ('order_id', '=', order_id),
            ('amount', '>=', 0),
        ]
        if terminal_id:
            domain.append(('terminal_id', '=', terminal_id))
        paid_payments = self.env['neat.clover.payment.request'].sudo().search(domain)
        for payment in paid_payments:
            payment.write({'refunded_amt': payment.uncommited_refunded_amt})

    def _payment_method_for_terminal(self, terminal_id):
        return self.env['pos.payment.method'].sudo().search([
            ('neat_clover_terminal_device_code', '=', terminal_id),
        ], limit=1)

    def _user_name_for_payment_request(self, payment_request):
        user = self.env['res.users'].browse(payment_request.user_id).exists()
        return user.name if user else _('System')

    def _mark_wizards_done(self, transaction_id):
        for model_name in ('clover.terminal.payment.wizard', 'clover.terminal.refund.wizard'):
            wizards = self.env[model_name].sudo().search([
                ('transaction_id', '=', transaction_id),
                ('state', '=', 'processing'),
            ])
            if wizards:
                wizards.write({'state': 'done'})

    def finalize_document_payment_request(self, payment_request, payment_method=None):
        payment_request.ensure_one()
        if not self.is_quotation_or_invoice_request(payment_request):
            return False
        if payment_request.status.startswith('processed_'):
            return True
        if payment_request.status not in self._TERMINAL_DONE_STATUSES:
            return False

        if payment_request.amount < 0:
            self.commit_refunds_for_order_id(
                payment_request.order_id,
                terminal_id=payment_request.terminal_id,
            )

        if not payment_method:
            payment_method = self._payment_method_for_terminal(payment_request.terminal_id)

        self.register_document_payment(payment_request, payment_method)
        payment_request.write({'status': 'processed_' + payment_request.status})
        self._mark_wizards_done(payment_request.transaction_id)
        return True

    def get_document_payment_status(self, payment_request):
        payment_request.ensure_one()
        is_refund = payment_request.amount < 0
        if payment_request.status.startswith('processed_'):
            if is_refund:
                message = _('Refund completed successfully. You may close this window.')
            else:
                message = _('Payment completed successfully. You may close this window.')
            return {
                'state': 'done',
                'success': True,
                'is_refund': is_refund,
                'message': message,
            }
        if payment_request.status in self._TERMINAL_FAILED_STATUSES:
            if is_refund:
                message = _('The refund was declined or cancelled on the terminal.')
            else:
                message = _('The payment was declined or cancelled on the terminal.')
            return {
                'state': 'error',
                'success': False,
                'is_refund': is_refund,
                'message': message,
            }
        if payment_request.status in self._TERMINAL_DONE_STATUSES:
            return {
                'state': 'processing',
                'success': False,
                'is_refund': is_refund,
                'message': _('Confirming with Odoo...'),
            }
        if is_refund:
            message = _('Waiting for the refund on the Clover terminal...')
        else:
            message = _('Waiting for payment on the Clover terminal...')
        return {
            'state': 'waiting',
            'success': False,
            'is_refund': is_refund,
            'message': message,
        }

    def register_document_payment(self, payment_request, payment_method):
        order_id = payment_request.order_id
        model_name, record_id = self.parse_document_order_id(order_id)
        if not model_name:
            return

        user_name = self._user_name_for_payment_request(payment_request)
        amount = float(Decimal(payment_request.amount) / Decimal('100'))
        if model_name == 'sale.order':
            order = self.env['sale.order'].browse(record_id).exists()
            if not order:
                return
            if amount > 0:
                self._register_sale_order_payment(order, amount, payment_request.transaction_id, user_name)
            elif amount < 0:
                self._register_sale_order_refund(order, abs(amount), payment_request.transaction_id, user_name)
        elif model_name == 'account.move':
            invoice = self.env['account.move'].browse(record_id).exists()
            if not invoice:
                return
            if amount > 0:
                self._register_invoice_payment(invoice, amount, payment_request.transaction_id, payment_method, user_name)
            elif amount < 0:
                self._register_invoice_refund(invoice, abs(amount), payment_request.transaction_id, user_name)

    def _register_sale_order_payment(self, order, amount, transaction_id, user_name):
        currency = order.currency_id
        amount_str = f'{amount:.2f} {currency.name}'
        order.message_post(
            body=_(
                'Clover terminal payment of %(amount)s completed by %(user)s.'
                ' Transaction: %(transaction)s.'
            ) % {
                'amount': amount_str,
                'user': user_name,
                'transaction': transaction_id,
            },
            message_type='comment',
            subtype_xmlid='mail.mt_note',
        )
        order_id = self.order_id_for_sale_order(order)
        paid_cents = self.get_terminal_paid_cents(order_id)
        current_cents = int(Decimal(str(amount)) * Decimal('100'))
        paid_amount = float(Decimal(paid_cents + current_cents) / Decimal('100'))
        if order.state in ('draft', 'sent') and currency.compare_amounts(paid_amount, order.amount_total) >= 0:
            order.action_confirm()

    def _register_sale_order_refund(self, order, amount, transaction_id, user_name):
        amount_str = f'{amount:.2f} {order.currency_id.name}'
        order.message_post(
            body=_(
                'Clover refund of %(amount)s completed by %(user)s.'
                ' Transaction: %(transaction)s.'
            ) % {
                'amount': amount_str,
                'user': user_name,
                'transaction': transaction_id,
            },
            message_type='comment',
            subtype_xmlid='mail.mt_note',
        )

    def _register_invoice_payment(self, invoice, amount, transaction_id, payment_method, user_name):
        journal = payment_method.journal_id if payment_method else False
        wizard_ctx = {
            'active_model': 'account.move',
            'active_ids': invoice.ids,
            'active_id': invoice.id,
        }
        wizard_vals = {'amount': amount, 'group_payment': True}
        if journal:
            wizard_vals['journal_id'] = journal.id
        register_wizard = self.env['account.payment.register'].sudo().with_context(**wizard_ctx).create(wizard_vals)
        register_wizard._create_payments()
        amount_str = f'{amount:.2f} {invoice.currency_id.name}'
        invoice.message_post(
            body=_(
                'Clover terminal payment of %(amount)s completed by %(user)s.'
                ' Transaction: %(transaction)s.'
            ) % {
                'amount': amount_str,
                'user': user_name,
                'transaction': transaction_id,
            },
            message_type='comment',
            subtype_xmlid='mail.mt_note',
        )

    def _register_invoice_refund(self, invoice, amount, transaction_id, user_name):
        amount_str = f'{amount:.2f} {invoice.currency_id.name}'
        invoice.message_post(
            body=_(
                'Clover refund of %(amount)s completed by %(user)s.'
                ' Transaction: %(transaction)s.'
            ) % {
                'amount': amount_str,
                'user': user_name,
                'transaction': transaction_id,
            },
            message_type='comment',
            subtype_xmlid='mail.mt_note',
        )

    @staticmethod
    def check_sale_order(order):
        if order.state not in ('draft', 'sent'):
            raise ValidationError(_('Clover terminal payment is only available for quotations (Draft or Quotation sent).'))

    @staticmethod
    def check_invoice(invoice):
        if not invoice.is_invoice(include_receipts=False) or invoice.state != 'posted':
            raise ValidationError(_('Clover terminal payment is only available for posted customer invoices.'))
        if invoice.payment_state == 'paid':
            raise ValidationError(_('This invoice is already paid.'))
