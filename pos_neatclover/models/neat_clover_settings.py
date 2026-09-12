# Original Author: Daniel Stoynev
# Copyright (c) 2025 SNS Software Ltd. All rights reserved.
# This module extends Odoo's payment framework.
# Odoo is a trademark of Odoo S.A.
import logging
from odoo import fields, models, api, _

_logger = logging.getLogger(__name__)

class NeatCloverSettings(models.Model):
    _name = 'neat.clover.settings'
    _description = 'NEAT Clover User Settings'

    promotion_displayed = fields.Boolean('Promotion Displayed')
    license_key = fields.Text('Activation Code', required=False, readonly=False, store=True)
