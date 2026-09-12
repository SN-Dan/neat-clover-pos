# -*- coding: utf-8 -*-
# Original Author: Daniel Stoynev
# Copyright (c) 2025 SNS Software Ltd. All rights reserved.
# This module extends Odoo's payment framework.
# Odoo is a trademark of Odoo S.A.
{
    'name': 'PoS Terminal Payment Integration Clover',
    'version': '1.4',
    'category': 'Point of Sale',
    'sequence': 6,
    'summary': 'Clover PoS Payment Terminal Official Integration',
    'description': 'Pay using Odoo and Clover - Any Place, Any Time',
    'website': 'https://www.sns-software.com',
    'author': 'SNS Software LTD',
    'maintainer': 'SNS Software LTD',
    'data': [
        'security/ir.model.access.csv',
        'views/pos_payment_method_views.xml',
    ],
    'external_dependencies': {
        'python': ['cryptography']
    },
    'depends': ['point_of_sale'],
    'qweb': [],
    'images': ['static/description/main.gif'],
    'assets': {
        'point_of_sale.assets': [
            'pos_neatclover/static/**/*',
        ]
    },
    'installable': True,
    'application': True,
    'auto_install': False,
    'license': 'LGPL-3',
}
