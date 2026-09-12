# -*- coding: utf-8 -*-
import logging

_logger = logging.getLogger(__name__)


def migrate(cr, version):
    cr.execute("DELETE FROM neat_clover_payment_request")
    _logger.info("pos_neatclover: cleared all neat.clover.payment.request records")
