/** @odoo-module */

import { register_payment_method } from "@point_of_sale/app/services/pos_store";
import { PaymentNeatClover } from "@pos_neatclover/app/payment_neatclover";

register_payment_method("neatclover", PaymentNeatClover);

