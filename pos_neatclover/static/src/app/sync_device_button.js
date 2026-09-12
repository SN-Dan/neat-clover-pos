/** @odoo-module */

import { Component } from "@odoo/owl";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { usePos } from "@point_of_sale/app/store/pos_hook";

function hasNeatCloverDesktopSync(pos) {
    const device = window.navigator.userAgent;
    const isMobile = device.includes("Android") || window.isNeatPOSAndroidApp;
    if (isMobile) {
        return false;
    }
    const methods = (pos && pos.payment_methods) || [];
    return methods.some(
        (pm) => pm.use_payment_terminal === "neatclover" && pm.neat_clover_is_desktop_mode
    );
}

export class SyncDeviceButton extends Component {
    static template = "pos_neatclover.SyncDeviceButton";

    setup() {
        this.pos = usePos();
    }

    click() {
        if (window.displaySyncModal) {
            window.displaySyncModal();
        }
    }
}

ProductScreen.addControlButton({
    component: SyncDeviceButton,
    condition: function () {
        return hasNeatCloverDesktopSync(this.pos);
    },
});
