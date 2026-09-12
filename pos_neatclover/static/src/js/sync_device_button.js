odoo.define('pos_neatclover.SyncDeviceButton', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const Registries = require('point_of_sale.Registries');
    const { useListener } = require('@web/core/utils/hooks');

    function hasNeatCloverDesktopSync(pos) {
        const device = window.navigator.userAgent;
        const isMobile = device.includes('Android') || window.isNeatPOSAndroidApp;
        if (isMobile) {
            return false;
        }
        const methods = (pos && pos.payment_methods) || [];
        return methods.some(function (pm) {
            return pm.use_payment_terminal === 'neatclover' && pm.neat_clover_is_desktop_mode;
        });
    }

    class SyncDeviceButton extends PosComponent {
        setup() {
            super.setup();
            useListener('click', this.onClick);
        }
        onClick() {
            if (window.displaySyncModal) {
                window.displaySyncModal();
            }
        }
    }
    SyncDeviceButton.template = 'pos_neatclover.SyncDeviceButton';

    ProductScreen.addControlButton({
        component: SyncDeviceButton,
        condition: function () {
            return hasNeatCloverDesktopSync(this.env.pos);
        },
    });

    Registries.Component.add(SyncDeviceButton);
    return SyncDeviceButton;
});
