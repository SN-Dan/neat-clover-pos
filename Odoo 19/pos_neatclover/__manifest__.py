# -*- coding: utf-8 -*-
# Original Author: Daniel Stoynev
# Copyright (c) 2025 SNS Software Ltd. All rights reserved.
# This module extends Odoo's payment framework.
# Odoo is a trademark of Odoo S.A.
{
    'name': 'POS Clover',
    'version': '1.4',
    'category': 'Point of Sale',
    'sequence': 6,
    'summary': 'Clover PoS Payment Terminal Official Integration',
    'description': 'Pay using Odoo and Clover - Any Place, Any Time',
    'author': 'SNS Software LTD',
    'maintainer': 'SNS Software LTD',
    'data': [
        'security/ir.model.access.csv',
        'views/pos_payment_method_views.xml',
        'views/sale_order_views.xml',
        'views/account_move_views.xml',
        'views/clover_terminal_payment_templates.xml',
        'wizard/clover_terminal_wizard_views.xml',
    ],
    'external_dependencies': {
        'python': ['cryptography']
    },
    'depends': ['point_of_sale', 'sale', 'account'],
    'qweb': [],
    'images': ['static/description/main.gif'],
    'assets': {
        'web.assets_backend': [
            'pos_neatclover/static/src/css/clover_terminal_wizard.css',
        ],
        'point_of_sale._assets_pos': [
            'pos_neatclover/static/**/*',
        ]
    },
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
